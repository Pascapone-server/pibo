import {
	InitialSessionContext,
	type InitialSessionContextOptions,
	type SubagentProfile,
} from "./profiles.js";
import { createDefaultPiboPluginRegistry } from "../plugins/builtin.js";
import type { PiboPluginRegistry } from "../plugins/registry.js";
import { createPiboRuntime, type PiboRuntimeOptions } from "./runtime.js";
import type { PiboSessionBindingStore } from "../sessions/bindings.js";
import { RoutedSession } from "./routed-session.js";
import type {
	PiboAssistantMessageEvent,
	PiboEventListener,
	PiboInputEvent,
	PiboMessageEvent,
	PiboOutputEvent,
} from "./events.js";
import {
	createSubagentSessionKey,
	getSubagentSessionDepth,
	type PiboSubagentRunResult,
	type PiboSubagentRunner,
} from "../subagents/tool.js";
import { randomUUID } from "node:crypto";

export type {
	PiboEventListener,
	PiboEventSource,
	PiboExecutionAction,
	PiboExecutionEvent,
	PiboInputEvent,
	PiboMessageEvent,
	PiboOutputEvent,
	PiboSessionStatus,
} from "./events.js";

export type PiboSessionRouterOptions = Omit<PiboRuntimeOptions, "profile" | "subagentRunner"> & {
	profile?: InitialSessionContext;
	pluginRegistry?: PiboPluginRegistry;
	bindingStore?: PiboSessionBindingStore;
	forwardPiEvents?: boolean;
};

function profileForSession(
	baseProfile: InitialSessionContext,
	sessionKey: string,
	parentSessionId?: string,
): InitialSessionContext {
	const options: InitialSessionContextOptions = {
		profileName: baseProfile.profileName,
		sessionId: sessionKey,
		parentSessionId,
		skills: baseProfile.skills,
		tools: baseProfile.tools,
		subagents: baseProfile.subagents,
		contextFiles: baseProfile.contextFiles,
		builtinTools: baseProfile.builtinTools,
	};

	return new InitialSessionContext(options);
}

export class PiboSessionRouter {
	private readonly sessions = new Map<string, RoutedSession>();
	private readonly pendingSessions = new Map<string, Promise<RoutedSession>>();
	private readonly listeners = new Set<PiboEventListener>();
	private readonly baseProfile: InitialSessionContext;
	private readonly pluginRegistry: PiboPluginRegistry;
	private readonly bindingStore?: PiboSessionBindingStore;
	private readonly sessionProfileOverrides = new Map<string, string>();
	private readonly sessionParentIds = new Map<string, string>();

	constructor(private readonly options: PiboSessionRouterOptions = {}) {
		this.pluginRegistry = options.pluginRegistry ?? createDefaultPiboPluginRegistry();
		this.bindingStore = options.bindingStore;
		this.baseProfile = options.profile ?? this.pluginRegistry.createProfile("pibo-minimal");
	}

	subscribe(listener: PiboEventListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async emit(event: PiboInputEvent): Promise<PiboOutputEvent> {
		const session = await this.getOrCreateSession(event.sessionKey);

		if (event.type === "message") {
			return session.enqueueMessage(event);
		}

		const output = await session.executeAction(event);
		if (event.action === "dispose") {
			this.sessions.delete(event.sessionKey);
			this.sessionProfileOverrides.delete(event.sessionKey);
			this.sessionParentIds.delete(event.sessionKey);
		}
		return output;
	}

	getSessionKeys(): string[] {
		return [...this.sessions.keys()];
	}

	async emitMessageAndWaitForReply(
		event: PiboMessageEvent,
		timeoutMs = 120000,
	): Promise<PiboAssistantMessageEvent> {
		const eventWithId: PiboMessageEvent = { ...event, id: event.id ?? randomUUID() };

		return await new Promise<PiboAssistantMessageEvent>((resolve, reject) => {
			let settled = false;
			const unsubscribe = this.subscribe((output) => {
				if (
					output.sessionKey !== eventWithId.sessionKey ||
					!("eventId" in output) ||
					output.eventId !== eventWithId.id
				) {
					return;
				}
				if (output.type === "assistant_message") {
					finish(output);
				} else if (output.type === "session_error") {
					finish(new Error(output.error));
				}
			});
			const timeout = setTimeout(() => {
				finish(new Error(`Timed out waiting for assistant reply from session "${eventWithId.sessionKey}"`));
			}, timeoutMs);

			const finish = (result: PiboAssistantMessageEvent | Error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				unsubscribe();
				if (result instanceof Error) {
					reject(result);
				} else {
					resolve(result);
				}
			};

			this.emit(eventWithId).catch(finish);
		});
	}

	async disposeAll(): Promise<void> {
		const sessions = [...this.sessions.values()];
		this.sessions.clear();
		this.sessionProfileOverrides.clear();
		this.sessionParentIds.clear();
		await Promise.all(sessions.map((session) => session.dispose()));
	}

	private async getOrCreateSession(sessionKey: string): Promise<RoutedSession> {
		const existing = this.sessions.get(sessionKey);
		if (existing) return existing;

		const pending = this.pendingSessions.get(sessionKey);
		if (pending) return pending;

		const created = this.createRoutedSession(sessionKey);
		this.pendingSessions.set(sessionKey, created);
		try {
			return await created;
		} finally {
			this.pendingSessions.delete(sessionKey);
		}
	}

	private async createRoutedSession(sessionKey: string): Promise<RoutedSession> {
		const profile = this.getProfileForSession(sessionKey);
		const runtime = await createPiboRuntime({
			cwd: this.options.cwd,
			persistSession: this.options.persistSession,
			profile: profileForSession(profile, sessionKey, this.sessionParentIds.get(sessionKey)),
			subagentRunner: this.createSubagentRunner(sessionKey),
		});
		const session = new RoutedSession(
			sessionKey,
			runtime,
			this.emitOutput,
			this.pluginRegistry,
			this.options.forwardPiEvents ?? false,
		);
		this.sessions.set(sessionKey, session);
		return session;
	}

	private getProfileForSession(sessionKey: string): InitialSessionContext {
		const binding = this.bindingStore?.get(sessionKey);
		const profileName = binding?.currentProfile ?? binding?.originalProfile;
		if (!profileName) {
			const override = this.sessionProfileOverrides.get(sessionKey);
			if (!override) return this.baseProfile;
			return this.pluginRegistry.createProfile(override);
		}
		return this.pluginRegistry.createProfile(profileName);
	}

	private createSubagentRunner(parentSessionKey: string): PiboSubagentRunner {
		return {
			runSubagent: async ({ subagent, message, threadKey, mode }): Promise<PiboSubagentRunResult> => {
				this.assertSubagentDepth(parentSessionKey, subagent);
				const sessionKey = createSubagentSessionKey(parentSessionKey, subagent.name, threadKey);
				const targetProfile = this.resolveSubagentBinding(sessionKey, subagent);
				this.sessionParentIds.set(sessionKey, parentSessionKey);
				if (!this.bindingStore) {
					this.sessionProfileOverrides.set(sessionKey, targetProfile);
				}

				const event: PiboMessageEvent = {
					type: "message",
					sessionKey,
					text: message,
					source: "actor",
					id: randomUUID(),
				};

				if (mode === "async") {
					await this.emit(event);
					return { mode, sessionKey, eventId: event.id! };
				}

				const reply = await this.emitMessageAndWaitForReply(event, subagent.timeoutMs);
				return { mode, sessionKey, eventId: event.id!, reply };
			},
		};
	}

	private assertSubagentDepth(parentSessionKey: string, subagent: SubagentProfile): void {
		const maxDepth = subagent.maxDepth ?? 3;
		if (getSubagentSessionDepth(parentSessionKey) >= maxDepth) {
			throw new Error(
				`Subagent "${subagent.name}" exceeded max depth ${maxDepth} from session "${parentSessionKey}"`,
			);
		}
	}

	private resolveSubagentBinding(sessionKey: string, subagent: SubagentProfile): string {
		const targetProfile = this.pluginRegistry.resolveProfileName(subagent.targetProfile);
		const existing = this.bindingStore?.get(sessionKey);
		if (existing) {
			const existingProfile = existing.currentProfile ?? existing.originalProfile;
			if (existingProfile !== targetProfile) {
				throw new Error(
					`Subagent session "${sessionKey}" is already bound to profile "${existingProfile}", not "${targetProfile}"`,
				);
			}
			return targetProfile;
		}

		this.bindingStore?.resolve({
			channel: "subagent",
			externalId: sessionKey,
			sessionKey,
			defaultProfile: targetProfile,
		});
		return targetProfile;
	}

	private readonly emitOutput = (event: PiboOutputEvent): void => {
		this.pluginRegistry.notifyEvent(event);
		for (const listener of this.listeners) {
			listener(event);
		}
	};
}
