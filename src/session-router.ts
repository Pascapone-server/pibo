import type { AgentSessionRuntime } from "@mariozechner/pi-coding-agent";
import {
	createDefaultPiboProfile,
	InitialSessionContext,
	type InitialSessionContextOptions,
} from "./profiles.js";
import { createPiboRuntime, type PiboRuntimeOptions } from "./runtime.js";

export type PiboEventSource = "user" | "ui" | "service" | "actor";

export type PiboMessageEvent = {
	type: "message";
	sessionKey: string;
	text: string;
	source?: PiboEventSource;
	id?: string;
};

export type PiboExecutionAction = "status" | "session_id" | "clear_queue" | "abort" | "dispose";

export type PiboExecutionEvent = {
	type: "execution";
	sessionKey: string;
	action: PiboExecutionAction;
	id?: string;
};

export type PiboInputEvent = PiboMessageEvent | PiboExecutionEvent;

export type PiboSessionStatus = {
	sessionKey: string;
	queuedMessages: number;
	processing: boolean;
	streaming: boolean;
	activeTools: string[];
	cwd: string;
	disposed: boolean;
};

export type PiboOutputEvent =
	| { type: "message_queued"; sessionKey: string; eventId?: string; queuedMessages: number }
	| { type: "message_started"; sessionKey: string; eventId?: string }
	| { type: "message_finished"; sessionKey: string; eventId?: string }
	| { type: "execution_result"; sessionKey: string; eventId?: string; action: PiboExecutionAction; result: unknown }
	| { type: "session_error"; sessionKey: string; eventId?: string; error: string }
	| { type: "pi_event"; sessionKey: string; event: unknown };

export type PiboEventListener = (event: PiboOutputEvent) => void;

export type PiboSessionRouterOptions = Omit<PiboRuntimeOptions, "profile"> & {
	profile?: InitialSessionContext;
	forwardPiEvents?: boolean;
};

function profileForSession(baseProfile: InitialSessionContext, sessionKey: string): InitialSessionContext {
	const options: InitialSessionContextOptions = {
		profileName: baseProfile.profileName,
		sessionId: sessionKey,
		skills: baseProfile.skills,
		tools: baseProfile.tools,
		contextFiles: baseProfile.contextFiles,
		builtinTools: baseProfile.builtinTools,
	};

	return new InitialSessionContext(options);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function promptSource(source: PiboEventSource | undefined): "interactive" | "rpc" {
	return source === "user" || source === "ui" ? "interactive" : "rpc";
}

class RoutedSession {
	private readonly queue: PiboMessageEvent[] = [];
	private processing = false;
	private disposed = false;
	private unsubscribe?: () => void;

	constructor(
		private readonly sessionKey: string,
		private readonly runtime: AgentSessionRuntime,
		private readonly emit: PiboEventListener,
		forwardPiEvents: boolean,
	) {
		if (forwardPiEvents) {
			this.unsubscribe = this.runtime.session.subscribe((event) => {
				this.emit({ type: "pi_event", sessionKey: this.sessionKey, event });
			});
		}
	}

	enqueueMessage(event: PiboMessageEvent): PiboOutputEvent {
		this.assertActive();
		this.queue.push(event);

		const output: PiboOutputEvent = {
			type: "message_queued",
			sessionKey: this.sessionKey,
			eventId: event.id,
			queuedMessages: this.queue.length,
		};
		this.emit(output);
		void this.drain();
		return output;
	}

	async executeAction(event: PiboExecutionEvent): Promise<PiboOutputEvent> {
		this.assertActive();

		const result = await this.runAction(event.action);
		const output: PiboOutputEvent = {
			type: "execution_result",
			sessionKey: this.sessionKey,
			eventId: event.id,
			action: event.action,
			result,
		};
		this.emit(output);
		return output;
	}

	getStatus(): PiboSessionStatus {
		return {
			sessionKey: this.sessionKey,
			queuedMessages: this.queue.length,
			processing: this.processing,
			streaming: this.runtime.session.isStreaming,
			activeTools: this.runtime.session.getActiveToolNames(),
			cwd: this.runtime.cwd,
			disposed: this.disposed,
		};
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;

		this.queue.length = 0;
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.disposed = true;
		await this.runtime.dispose();
	}

	private async drain(): Promise<void> {
		if (this.processing || this.disposed) return;

		this.processing = true;
		try {
			while (this.queue.length > 0 && !this.disposed) {
				const event = this.queue.shift()!;
				this.emit({ type: "message_started", sessionKey: this.sessionKey, eventId: event.id });

				try {
					await this.runtime.session.prompt(event.text, { source: promptSource(event.source) });
					this.emit({ type: "message_finished", sessionKey: this.sessionKey, eventId: event.id });
				} catch (error) {
					this.emit({
						type: "session_error",
						sessionKey: this.sessionKey,
						eventId: event.id,
						error: errorMessage(error),
					});
				}
			}
		} finally {
			this.processing = false;
		}
	}

	private async runAction(action: PiboExecutionAction): Promise<unknown> {
		switch (action) {
			case "status":
				return this.getStatus();
			case "session_id":
				return { sessionKey: this.sessionKey };
			case "clear_queue": {
				const cleared = this.queue.length;
				this.queue.length = 0;
				return { cleared };
			}
			case "abort":
				await this.runtime.session.abort();
				return { aborted: true };
			case "dispose":
				await this.dispose();
				return { disposed: true };
		}
	}

	private assertActive(): void {
		if (this.disposed) {
			throw new Error(`Session "${this.sessionKey}" has been disposed`);
		}
	}
}

export class PiboSessionRouter {
	private readonly sessions = new Map<string, RoutedSession>();
	private readonly pendingSessions = new Map<string, Promise<RoutedSession>>();
	private readonly listeners = new Set<PiboEventListener>();
	private readonly baseProfile: InitialSessionContext;

	constructor(private readonly options: PiboSessionRouterOptions = {}) {
		this.baseProfile = options.profile ?? createDefaultPiboProfile();
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
		}
		return output;
	}

	getSessionKeys(): string[] {
		return [...this.sessions.keys()];
	}

	async disposeAll(): Promise<void> {
		const sessions = [...this.sessions.values()];
		this.sessions.clear();
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
		const runtime = await createPiboRuntime({
			cwd: this.options.cwd,
			persistSession: this.options.persistSession,
			profile: profileForSession(this.baseProfile, sessionKey),
		});
		const session = new RoutedSession(sessionKey, runtime, this.emitOutput, this.options.forwardPiEvents ?? false);
		this.sessions.set(sessionKey, session);
		return session;
	}

	private readonly emitOutput = (event: PiboOutputEvent): void => {
		for (const listener of this.listeners) {
			listener(event);
		}
	};
}
