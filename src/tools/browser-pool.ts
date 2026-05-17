import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export type BrowserPoolLifecycleState = "empty" | "ready" | "leased" | "stale" | "dirty";

export type BrowserPoolMutationKind = "acquire" | "release" | "reap";

export interface BrowserPoolState {
	workerId: string;
	poolId: string;
	maxBrowserProcesses: number;
	pid?: number;
	processGroupId?: number;
	cdpPort?: number;
	cdpUrl?: string;
	userDataDir?: string;
	activeLeaseId?: string;
	owner?: string;
	lastUsedAt?: string;
	idleExpiresAt?: string;
	state: BrowserPoolLifecycleState;
	lastError?: string;
}

export interface BrowserPoolIdentity {
	workerId: string;
	poolId: string;
	maxBrowserProcesses?: number;
}

export interface BrowserPoolPaths {
	statePath: string;
	lockPath: string;
}

export interface BrowserPoolLockOptions {
	timeoutMs?: number;
	pollIntervalMs?: number;
	staleMs?: number;
	owner?: string;
}

export interface BrowserPoolStateLoadOptions extends BrowserPoolIdentity {
	onMissing?: "empty" | "throw";
	onMalformed?: "empty" | "throw";
}

const DEFAULT_MAX_BROWSER_PROCESSES = 1;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_LOCK_POLL_INTERVAL_MS = 50;
const DEFAULT_LOCK_STALE_MS = 10 * 60_000;

export class BrowserPoolLockTimeoutError extends Error {
	constructor(lockPath: string, timeoutMs: number) {
		super(`Timed out acquiring browser pool lock ${lockPath} after ${timeoutMs}ms`);
		this.name = "BrowserPoolLockTimeoutError";
	}
}

export class BrowserPoolStateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BrowserPoolStateError";
	}
}

export function createEmptyBrowserPoolState(identity: BrowserPoolIdentity): BrowserPoolState {
	return {
		workerId: identity.workerId,
		poolId: identity.poolId,
		maxBrowserProcesses: identity.maxBrowserProcesses ?? DEFAULT_MAX_BROWSER_PROCESSES,
		state: "empty",
	};
}

export function browserPoolPaths(rootDir: string, identity: BrowserPoolIdentity): BrowserPoolPaths {
	const safeWorkerId = safePathSegment(identity.workerId);
	const safePoolId = safePathSegment(identity.poolId);
	const base = join(rootDir, "browser-pools", safeWorkerId, safePoolId);
	return {
		statePath: join(base, "state.json"),
		lockPath: join(base, "state.lock"),
	};
}

export async function loadBrowserPoolState(statePath: string, options: BrowserPoolStateLoadOptions): Promise<BrowserPoolState> {
	let raw: string;
	try {
		raw = await readFile(statePath, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT" && (options.onMissing ?? "empty") === "empty") {
			return createEmptyBrowserPoolState(options);
		}
		throw error;
	}

	try {
		return normalizeBrowserPoolState(JSON.parse(raw), options);
	} catch (error) {
		const stateError = toBrowserPoolStateError(error);
		if ((options.onMalformed ?? "throw") === "empty") {
			return {
				...createEmptyBrowserPoolState(options),
				state: "dirty",
				lastError: stateError.message,
			};
		}
		throw stateError;
	}
}

export async function saveBrowserPoolState(statePath: string, state: BrowserPoolState): Promise<void> {
	const normalized = normalizeBrowserPoolState(state, state);
	await mkdir(dirname(statePath), { recursive: true });
	const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
	await rename(temporaryPath, statePath);
}

export async function withBrowserPoolLock<T>(lockPath: string, options: BrowserPoolLockOptions, run: () => Promise<T>): Promise<T> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
	const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_LOCK_POLL_INTERVAL_MS;
	const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
	const owner = options.owner ?? `${process.pid}`;
	const startedAt = Date.now();

	while (true) {
		try {
			await mkdir(dirname(lockPath), { recursive: true });
			const handle = await open(lockPath, "wx");
			try {
				await handle.writeFile(JSON.stringify({ owner, pid: process.pid, createdAt: new Date().toISOString() }), "utf8");
			} finally {
				await handle.close();
			}
			break;
		} catch (error) {
			if (!isNodeError(error) || error.code !== "EEXIST") throw error;
			await removeStaleLock(lockPath, staleMs);
			if (Date.now() - startedAt >= timeoutMs) throw new BrowserPoolLockTimeoutError(lockPath, timeoutMs);
			await delay(Math.min(pollIntervalMs, Math.max(1, timeoutMs - (Date.now() - startedAt))));
		}
	}

	try {
		return await run();
	} finally {
		await rm(lockPath, { force: true });
	}
}

export async function mutateBrowserPoolState<T>(
	paths: BrowserPoolPaths,
	identity: BrowserPoolStateLoadOptions,
	kind: BrowserPoolMutationKind,
	mutation: (state: BrowserPoolState) => Promise<{ state: BrowserPoolState; result: T }>,
	lockOptions: BrowserPoolLockOptions = {},
): Promise<T> {
	return withBrowserPoolLock(paths.lockPath, { ...lockOptions, owner: lockOptions.owner ?? kind }, async () => {
		const current = await loadBrowserPoolState(paths.statePath, identity);
		const next = await mutation(current);
		await saveBrowserPoolState(paths.statePath, next.state);
		return next.result;
	});
}

export function normalizeBrowserPoolState(value: unknown, identity: BrowserPoolIdentity): BrowserPoolState {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new BrowserPoolStateError("Browser pool state must be a JSON object");
	const record = value as Record<string, unknown>;
	const workerId = readRequiredString(record, "workerId");
	const poolId = readRequiredString(record, "poolId");
	if (workerId !== identity.workerId) throw new BrowserPoolStateError(`Browser pool state worker id mismatch: expected ${identity.workerId}, got ${workerId}`);
	if (poolId !== identity.poolId) throw new BrowserPoolStateError(`Browser pool state pool id mismatch: expected ${identity.poolId}, got ${poolId}`);
	const state = readLifecycleState(record.state);
	const maxBrowserProcesses = readPositiveInteger(record.maxBrowserProcesses, "maxBrowserProcesses");
	return stripUndefined({
		workerId,
		poolId,
		maxBrowserProcesses,
		pid: readOptionalPositiveInteger(record.pid, "pid"),
		processGroupId: readOptionalPositiveInteger(record.processGroupId, "processGroupId"),
		cdpPort: readOptionalPositiveInteger(record.cdpPort, "cdpPort"),
		cdpUrl: readOptionalString(record.cdpUrl, "cdpUrl"),
		userDataDir: readOptionalString(record.userDataDir, "userDataDir"),
		activeLeaseId: readOptionalString(record.activeLeaseId, "activeLeaseId"),
		owner: readOptionalString(record.owner, "owner"),
		lastUsedAt: readOptionalString(record.lastUsedAt, "lastUsedAt"),
		idleExpiresAt: readOptionalString(record.idleExpiresAt, "idleExpiresAt"),
		state,
		lastError: readOptionalString(record.lastError, "lastError"),
	});
}

async function removeStaleLock(lockPath: string, staleMs: number): Promise<void> {
	if (staleMs <= 0) return;
	try {
		const raw = await readFile(lockPath, "utf8");
		const parsed = JSON.parse(raw) as { createdAt?: unknown };
		if (typeof parsed.createdAt !== "string") return;
		const createdAt = Date.parse(parsed.createdAt);
		if (Number.isNaN(createdAt)) return;
		if (Date.now() - createdAt > staleMs) await rm(lockPath, { force: true });
	} catch {
		// A corrupt or concurrently removed lock should not make acquisition unsafe.
	}
}

function safePathSegment(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function stripUndefined<T extends Record<string, unknown>>(record: T): T {
	return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	if (typeof value !== "string" || value.length === 0) throw new BrowserPoolStateError(`Browser pool state field ${key} must be a non-empty string`);
	return value;
}

function readOptionalString(value: unknown, key: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.length === 0) throw new BrowserPoolStateError(`Browser pool state field ${key} must be a non-empty string when present`);
	return value;
}

function readPositiveInteger(value: unknown, key: string): number {
	if (!Number.isInteger(value) || typeof value !== "number" || value < 1) throw new BrowserPoolStateError(`Browser pool state field ${key} must be a positive integer`);
	return value;
}

function readOptionalPositiveInteger(value: unknown, key: string): number | undefined {
	if (value === undefined) return undefined;
	return readPositiveInteger(value, key);
}

function readLifecycleState(value: unknown): BrowserPoolLifecycleState {
	if (value === "empty" || value === "ready" || value === "leased" || value === "stale" || value === "dirty") return value;
	throw new BrowserPoolStateError("Browser pool state field state is invalid");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function toBrowserPoolStateError(error: unknown): BrowserPoolStateError {
	if (error instanceof BrowserPoolStateError) return error;
	return new BrowserPoolStateError(error instanceof Error ? error.message : String(error));
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
