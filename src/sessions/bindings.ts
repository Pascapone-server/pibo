import { randomUUID } from "node:crypto";

export type PiboSessionBinding = {
	sessionKey: string;
	sessionId: string;
	parentSessionKey?: string;
	parentSessionId?: string;
	channel: string;
	externalId: string;
	originalProfile: string;
	currentProfile?: string;
	workspace?: string;
	createdAt: string;
	updatedAt: string;
};

export type ResolveSessionBindingInput = {
	channel: string;
	externalId: string;
	defaultProfile: string;
	sessionKey?: string;
	sessionId?: string;
	parentSessionKey?: string;
	parentSessionId?: string;
	workspace?: string;
};

export type PiboSessionBindingStore = {
	get(sessionKey: string): PiboSessionBinding | undefined;
	list?(): PiboSessionBinding[];
	resolve(input: ResolveSessionBindingInput): PiboSessionBinding;
	close?(): void;
};

export function createPiboSessionId(): string {
	return randomUUID();
}

export function createSessionBinding(input: ResolveSessionBindingInput, now = new Date().toISOString()): PiboSessionBinding {
	return {
		sessionKey: input.sessionKey ?? createDefaultSessionKey(input),
		sessionId: input.sessionId ?? createPiboSessionId(),
		parentSessionKey: input.parentSessionKey,
		parentSessionId: input.parentSessionId,
		channel: input.channel,
		externalId: input.externalId,
		originalProfile: input.defaultProfile,
		workspace: input.workspace,
		createdAt: now,
		updatedAt: now,
	};
}

export function createDefaultSessionKey(input: Pick<ResolveSessionBindingInput, "channel" | "externalId">): string {
	return `${input.channel}:${input.externalId}`;
}

export class InMemorySessionBindingStore implements PiboSessionBindingStore {
	private readonly bySessionKey = new Map<string, PiboSessionBinding>();
	private readonly byChannelExternalId = new Map<string, PiboSessionBinding>();

	get(sessionKey: string): PiboSessionBinding | undefined {
		return this.bySessionKey.get(sessionKey);
	}

	list(): PiboSessionBinding[] {
		return [...this.bySessionKey.values()];
	}

	resolve(input: ResolveSessionBindingInput): PiboSessionBinding {
		const channelExternalId = createDefaultSessionKey(input);
		const existing = this.byChannelExternalId.get(channelExternalId);
		if (existing) return existing;

		const binding = createSessionBinding(input);
		this.bySessionKey.set(binding.sessionKey, binding);
		this.byChannelExternalId.set(channelExternalId, binding);
		return binding;
	}
}
