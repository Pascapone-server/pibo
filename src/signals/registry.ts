import { errorFromNode, isActiveSignalStatus, isTerminalSignalStatus, phaseForStatus, strongestStatus } from "./aggregate.js";
import { createDefaultSignalProducers } from "./projector.js";
import type {
	ChildSessionSignalSummary,
	PiboSessionSignalSnapshot,
	PiboSignalInput,
	PiboSignalListener,
	PiboSignalMutation,
	PiboSignalNode,
	PiboSignalPatch,
	PiboSignalProducer,
	PiboSignalProjectorContext,
	PiboSignalRegistry,
	PiboSignalRegistryDiagnostics,
	PiboSignalRegistryPruneOptions,
	PiboSignalSnapshot,
	RunSignalSummary,
	ToolCallSignalSummary,
} from "./types.js";

function now(): string { return new Date().toISOString(); }

export type InMemoryPiboSignalRegistryOptions = {
	terminalSuccessTtlMs?: number;
	terminalErrorTtlMs?: number;
};

const DEFAULT_TERMINAL_SUCCESS_TTL_MS = 60_000;
const DEFAULT_TERMINAL_ERROR_TTL_MS = 10 * 60_000;

function shallowEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export class InMemoryPiboSignalRegistry implements PiboSignalRegistry {
	private readonly nodesById = new Map<string, PiboSignalNode>();
	private readonly nodeIdsBySessionId = new Map<string, Set<string>>();
	private readonly childSessionIdsByParentId = new Map<string, Set<string>>();
	private readonly parentSessionIdByChildId = new Map<string, string>();
	private readonly rootSessionIdBySessionId = new Map<string, string>();
	private readonly versionByRootId = new Map<string, number>();
	private readonly sessionSnapshotById = new Map<string, PiboSessionSignalSnapshot>();
	private readonly queuedMessagesBySessionId = new Map<string, number>();
	private readonly subscribersByRootId = new Map<string, Set<PiboSignalListener>>();
	private readonly producers: PiboSignalProducer[] = createDefaultSignalProducers();

	constructor(private readonly options: InMemoryPiboSignalRegistryOptions = {}) {}

	registerProducer(producer: PiboSignalProducer): void {
		this.producers.push(producer);
	}

	pruneTerminalNodes(options: PiboSignalRegistryPruneOptions = {}): number {
		const nowMs = options.nowMs ?? Date.now();
		const successTtlMs = options.terminalSuccessTtlMs ?? this.options.terminalSuccessTtlMs ?? DEFAULT_TERMINAL_SUCCESS_TTL_MS;
		const errorTtlMs = options.terminalErrorTtlMs ?? this.options.terminalErrorTtlMs ?? DEFAULT_TERMINAL_ERROR_TTL_MS;
		let pruned = 0;
		for (const node of [...this.nodesById.values()]) {
			if (node.kind === "session" || isActiveSignalStatus(node.status)) continue;
			const completedMs = Date.parse(node.completedAt ?? node.updatedAt);
			if (!Number.isFinite(completedMs)) continue;
			const ttlMs = node.status === "error" ? errorTtlMs : successTtlMs;
			if (nowMs - completedMs < ttlMs) continue;
			if (this.project({ type: "signal_node_pruned", nodeId: node.id })) pruned += 1;
		}
		return pruned;
	}

	diagnostics(options: { stuckActiveMs?: number; nowMs?: number } = {}): PiboSignalRegistryDiagnostics {
		const nowMs = options.nowMs ?? Date.now();
		const thresholdMs = options.stuckActiveMs ?? 10 * 60_000;
		const subscribersByRootId = Object.fromEntries([...this.subscribersByRootId].map(([rootId, listeners]) => [rootId, listeners.size]));
		return {
			nodeCount: this.nodesById.size,
			sessionCount: this.rootSessionIdBySessionId.size,
			rootCount: this.versionByRootId.size,
			subscriberCount: [...this.subscribersByRootId.values()].reduce((sum, listeners) => sum + listeners.size, 0),
			subscribersByRootId,
			stuckActiveNodes: [...this.nodesById.values()].filter((node) => isActiveSignalStatus(node.status) && nowMs - Date.parse(node.startedAt ?? node.createdAt) >= thresholdMs),
		};
	}

	project(input: PiboSignalInput): PiboSignalPatch | undefined {
		const mutations = this.producers.flatMap((producer) => producer.accepts(input) ? producer.project(input, this.context()) : []);
		if (mutations.length === 0) return undefined;

		const changedSessionIds = new Set<string>();
		const upserts: PiboSignalNode[] = [];
		const removes: string[] = [];
		for (const mutation of mutations) this.applyMutation(mutation, changedSessionIds, upserts, removes);
		if (changedSessionIds.size === 0 && upserts.length === 0 && removes.length === 0) return undefined;

		const affectedRoots = new Set<string>();
		for (const sessionId of changedSessionIds) affectedRoots.add(this.getSessionRoot(sessionId));
		for (const node of upserts) affectedRoots.add(node.rootPiboSessionId);
		const patches: PiboSignalPatch[] = [];
		for (const rootId of affectedRoots) {
			const before = this.versionByRootId.get(rootId) ?? 0;
			const changedSnapshots = this.recomputeAncestors([...changedSessionIds].filter((id) => this.getSessionRoot(id) === rootId), before + 1);
			const patch: PiboSignalPatch = {
				type: "signal_patch",
				rootPiboSessionId: rootId,
				fromVersion: before,
				toVersion: before + 1,
				generatedAt: now(),
				upserts: upserts.filter((node) => node.rootPiboSessionId === rootId),
				removes: removes.filter((id) => this.removedNodeBelongsToRoot(id, rootId, upserts)),
				sessionSnapshots: changedSnapshots,
			};
			this.versionByRootId.set(rootId, patch.toVersion);
			this.notify(rootId, patch);
			patches.push(patch);
		}
		return patches[0];
	}

	snapshotSession(piboSessionId: string): PiboSignalSnapshot {
		this.ensureSession(piboSessionId);
		const rootId = this.getSessionRoot(piboSessionId);
		const session = this.sessionSnapshotById.get(piboSessionId) ?? this.computeSessionSnapshot(piboSessionId, this.versionByRootId.get(rootId) ?? 0);
		const nodes = Object.fromEntries([...this.nodesForSession(piboSessionId)].map((node) => [node.id, node]));
		return { rootPiboSessionId: rootId, version: this.versionByRootId.get(rootId) ?? 0, generatedAt: now(), sessions: { [piboSessionId]: session }, nodes };
	}

	snapshotTree(rootPiboSessionId: string): PiboSignalSnapshot {
		const rootId = this.getSessionRoot(rootPiboSessionId);
		this.ensureSession(rootId);
		const sessionIds = this.collectSessionTree(rootId);
		const sessions: Record<string, PiboSessionSignalSnapshot> = {};
		const nodes: Record<string, PiboSignalNode> = {};
		const version = this.versionByRootId.get(rootId) ?? 0;
		for (const sessionId of sessionIds) {
			sessions[sessionId] = this.sessionSnapshotById.get(sessionId) ?? this.computeSessionSnapshot(sessionId, version);
			for (const node of this.nodesForSession(sessionId)) nodes[node.id] = node;
		}
		return { rootPiboSessionId: rootId, version, generatedAt: now(), sessions, nodes };
	}

	subscribe(rootPiboSessionId: string, listener: PiboSignalListener): () => void {
		const rootId = this.getSessionRoot(rootPiboSessionId);
		const listeners = this.subscribersByRootId.get(rootId) ?? new Set<PiboSignalListener>();
		listeners.add(listener);
		this.subscribersByRootId.set(rootId, listeners);
		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) this.subscribersByRootId.delete(rootId);
		};
	}

	private context(): PiboSignalProjectorContext {
		return { now, getNode: (id) => this.nodesById.get(id), getSessionRoot: (id) => this.getSessionRoot(id), getSessionParent: (id) => this.parentSessionIdByChildId.get(id) };
	}

	private applyMutation(mutation: PiboSignalMutation, changedSessionIds: Set<string>, upserts: PiboSignalNode[], removes: string[]): void {
		if (mutation.type === "set_session_queue") {
			this.queuedMessagesBySessionId.set(mutation.piboSessionId, mutation.queuedMessages);
			this.ensureSession(mutation.piboSessionId);
			changedSessionIds.add(mutation.piboSessionId);
			return;
		}
		if (mutation.type === "remove_node") {
			const existing = this.nodesById.get(mutation.nodeId);
			if (existing?.piboSessionId) changedSessionIds.add(existing.piboSessionId);
			this.nodesById.delete(mutation.nodeId);
			if (existing?.piboSessionId) this.nodeIdsBySessionId.get(existing.piboSessionId)?.delete(mutation.nodeId);
			removes.push(mutation.nodeId);
			return;
		}
		if (mutation.type === "link_parent") {
			const existing = this.nodesById.get(mutation.nodeId);
			if (!existing) return;
			this.nodesById.set(existing.id, { ...existing, parentNodeId: mutation.parentNodeId, updatedAt: now() });
			if (existing.piboSessionId) changedSessionIds.add(existing.piboSessionId);
			return;
		}
		const incoming = mutation.type === "upsert_node"
			? mutation.node
			: this.patchExistingNode(mutation.nodeId, mutation.patch);
		if (!incoming) return;
		const existing = this.nodesById.get(incoming.id);
		const merged = existing ? { ...existing, ...incoming, metadata: incoming.metadata ?? existing.metadata } : incoming;
		if (shallowEqual(existing, merged)) return;
		this.nodesById.set(merged.id, merged);
		if (merged.piboSessionId) {
			this.ensureSession(merged.piboSessionId, merged.kind === "session" ? merged.parentPiboSessionId : undefined, merged.rootPiboSessionId);
			const ids = this.nodeIdsBySessionId.get(merged.piboSessionId) ?? new Set<string>();
			ids.add(merged.id);
			this.nodeIdsBySessionId.set(merged.piboSessionId, ids);
			changedSessionIds.add(merged.piboSessionId);
		}
		if (merged.kind === "session" && merged.piboSessionId) this.ensureSession(merged.piboSessionId, merged.parentPiboSessionId, merged.rootPiboSessionId);
		if (merged.childPiboSessionId && merged.piboSessionId) this.ensureSession(merged.childPiboSessionId, merged.piboSessionId, this.getSessionRoot(merged.piboSessionId));
		upserts.push(merged);
	}

	private patchExistingNode(nodeId: string, patch: Partial<PiboSignalNode>): PiboSignalNode | undefined {
		const existing = this.nodesById.get(nodeId);
		if (!existing) return undefined;
		return { ...existing, ...patch, id: existing.id, updatedAt: now() };
	}

	private ensureSession(piboSessionId: string, parentPiboSessionId?: string, rootPiboSessionId?: string): void {
		if (parentPiboSessionId) {
			this.parentSessionIdByChildId.set(piboSessionId, parentPiboSessionId);
			const children = this.childSessionIdsByParentId.get(parentPiboSessionId) ?? new Set<string>();
			children.add(piboSessionId);
			this.childSessionIdsByParentId.set(parentPiboSessionId, children);
		}
		const rootId = rootPiboSessionId ?? (parentPiboSessionId ? this.getSessionRoot(parentPiboSessionId) : piboSessionId);
		this.rootSessionIdBySessionId.set(piboSessionId, rootId);
		if (!this.versionByRootId.has(rootId)) this.versionByRootId.set(rootId, 0);
		if (!this.nodesById.has(`session:${piboSessionId}`)) {
			const timestamp = now();
			const sessionNode: PiboSignalNode = { id: `session:${piboSessionId}`, kind: "session", status: "idle", rootPiboSessionId: rootId, piboSessionId, parentPiboSessionId, createdAt: timestamp, updatedAt: timestamp };
			this.nodesById.set(sessionNode.id, sessionNode);
			this.nodeIdsBySessionId.set(piboSessionId, new Set([sessionNode.id]));
		}
	}

	private getSessionRoot(piboSessionId: string): string {
		const known = this.rootSessionIdBySessionId.get(piboSessionId);
		if (known) return known;
		const parent = this.parentSessionIdByChildId.get(piboSessionId);
		return parent ? this.getSessionRoot(parent) : piboSessionId;
	}

	private nodesForSession(piboSessionId: string): PiboSignalNode[] {
		return [...(this.nodeIdsBySessionId.get(piboSessionId) ?? [])].flatMap((id) => {
			const node = this.nodesById.get(id);
			return node ? [node] : [];
		});
	}

	private collectSessionTree(rootId: string): string[] {
		const output = [rootId];
		for (const child of this.childSessionIdsByParentId.get(rootId) ?? []) output.push(...this.collectSessionTree(child));
		return output;
	}

	private recomputeAncestors(sessionIds: string[], version: number): PiboSessionSignalSnapshot[] {
		const toRecompute = new Set<string>();
		for (const sessionId of sessionIds) {
			let current: string | undefined = sessionId;
			while (current) {
				toRecompute.add(current);
				current = this.parentSessionIdByChildId.get(current);
			}
		}
		const ordered = [...toRecompute].sort((a, b) => this.depth(b) - this.depth(a));
		const changed: PiboSessionSignalSnapshot[] = [];
		for (const sessionId of ordered) {
			const snapshot = this.computeSessionSnapshot(sessionId, version);
			if (!shallowEqual(this.sessionSnapshotById.get(sessionId), snapshot)) {
				this.sessionSnapshotById.set(sessionId, snapshot);
				changed.push(snapshot);
			}
		}
		return changed;
	}

	private depth(sessionId: string): number {
		let depth = 0;
		let current = this.parentSessionIdByChildId.get(sessionId);
		while (current) { depth += 1; current = this.parentSessionIdByChildId.get(current); }
		return depth;
	}

	private computeSessionSnapshot(piboSessionId: string, version: number): PiboSessionSignalSnapshot {
		this.ensureSession(piboSessionId);
		const rootPiboSessionId = this.getSessionRoot(piboSessionId);
		const nodes = this.nodesForSession(piboSessionId);
		const activeLocalNodes = nodes.filter((node) => node.kind !== "session" && node.kind !== "queue" && isActiveSignalStatus(node.status));
		const sessionNode = this.nodesById.get(`session:${piboSessionId}`);
		const queueNode = this.nodesById.get(`queue:${piboSessionId}`);
		const queuedMessages = this.queuedMessagesBySessionId.get(piboSessionId) ?? Number(queueNode?.metadata?.queuedMessages ?? 0);
		const localStatuses = [...activeLocalNodes.map((node) => node.status)];
		if (queuedMessages > 0) localStatuses.push("queued");
		if (sessionNode && isActiveSignalStatus(sessionNode.status)) localStatuses.push(sessionNode.status);
		const localStatus = sessionNode && (sessionNode.status === "unknown" || isTerminalSignalStatus(sessionNode.status))
			? sessionNode.status
			: strongestStatus(localStatuses);
		const childSnapshots = [...(this.childSessionIdsByParentId.get(piboSessionId) ?? [])].map((id) => this.sessionSnapshotById.get(id) ?? this.computeSessionSnapshot(id, version));
		const aggregateStatus = strongestStatus([localStatus, ...childSnapshots.map((snapshot) => snapshot.aggregateStatus)]);
		const activeToolCalls: ToolCallSignalSummary[] = nodes.filter((node) => node.kind === "tool_call" && isActiveSignalStatus(node.status)).map((node) => ({ nodeId: node.id, toolCallId: typeof node.metadata?.toolCallId === "string" ? node.metadata.toolCallId : undefined, toolName: typeof node.metadata?.toolName === "string" ? node.metadata.toolName : undefined, status: node.status, startedAt: node.startedAt, updatedAt: node.updatedAt }));
		const activeRuns: RunSignalSummary[] = nodes.filter((node) => node.kind === "yielded_run" && isActiveSignalStatus(node.status)).map((node) => ({ nodeId: node.id, runId: String(node.metadata?.runId ?? node.id.replace(/^run:/, "")), toolName: typeof node.metadata?.toolName === "string" ? node.metadata.toolName : undefined, status: node.status, completionPolicy: typeof node.metadata?.completionPolicy === "string" ? node.metadata.completionPolicy : undefined, consumed: typeof node.metadata?.consumed === "boolean" ? node.metadata.consumed : undefined, startedAt: node.startedAt, updatedAt: node.updatedAt }));
		const activeChildren: ChildSessionSignalSummary[] = childSnapshots.filter((snapshot) => snapshot.isTreeActive).map((snapshot) => ({ nodeId: `session:${snapshot.piboSessionId}`, piboSessionId: snapshot.piboSessionId, status: snapshot.aggregateStatus, isTreeActive: snapshot.isTreeActive, hasError: snapshot.hasError || snapshot.hasErrorDescendant, updatedAt: snapshot.updatedAt }));
		const localErrors = nodes.flatMap((node) => errorFromNode(node) ?? []);
		const childErrors = childSnapshots.flatMap((snapshot) => snapshot.errors);
		const isLocalActive = isActiveSignalStatus(localStatus);
		const hasActiveDescendant = childSnapshots.some((snapshot) => snapshot.isTreeActive);
		return {
			piboSessionId,
			parentPiboSessionId: this.parentSessionIdByChildId.get(piboSessionId),
			rootPiboSessionId,
			version,
			updatedAt: now(),
			localStatus,
			aggregateStatus,
			phase: phaseForStatus(aggregateStatus, nodes),
			queuedMessages,
			currentMessageId: activeLocalNodes.find((node) => node.kind === "message")?.id,
			currentTurnId: activeLocalNodes.find((node) => node.kind === "turn")?.id,
			isLocalActive,
			hasActiveDescendant,
			isTreeActive: isLocalActive || hasActiveDescendant,
			isSettled: !(isLocalActive || hasActiveDescendant) && aggregateStatus !== "blocked" && aggregateStatus !== "paused",
			hasError: localErrors.length > 0 || localStatus === "error",
			hasErrorDescendant: childSnapshots.some((snapshot) => snapshot.hasError || snapshot.hasErrorDescendant),
			hasBlockedDescendant: childSnapshots.some((snapshot) => snapshot.aggregateStatus === "blocked" || snapshot.hasBlockedDescendant),
			activeToolCalls,
			activeRuns,
			activeChildren,
			errors: [...localErrors, ...childErrors],
		};
	}

	private removedNodeBelongsToRoot(_id: string, _rootId: string, _upserts: PiboSignalNode[]): boolean {
		// Remove patches are already scoped by affected root. This method exists so the
		// patch construction keeps the same shape if per-root removal metadata is added later.
		return true;
	}

	private notify(rootId: string, patch: PiboSignalPatch): void {
		for (const listener of this.subscribersByRootId.get(rootId) ?? []) queueMicrotask(() => listener(patch));
	}
}

export function createPiboSignalRegistry(options?: InMemoryPiboSignalRegistryOptions): PiboSignalRegistry {
	return new InMemoryPiboSignalRegistry(options);
}
