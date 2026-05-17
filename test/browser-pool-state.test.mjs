import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	BrowserPoolLockTimeoutError,
	BrowserPoolStateError,
	browserPoolPaths,
	createEmptyBrowserPoolState,
	loadBrowserPoolState,
	mutateBrowserPoolState,
	saveBrowserPoolState,
	withBrowserPoolLock,
} from "../dist/tools/browser-pool.js";

async function withTempDir(run) {
	const dir = await mkdtemp(join(tmpdir(), "pibo-browser-pool-"));
	try {
		return await run(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

const identity = { workerId: "worker-a", poolId: "default", maxBrowserProcesses: 1 };

test("browser pool state writes and reads a complete round trip", async () => {
	await withTempDir(async (dir) => {
		const paths = browserPoolPaths(dir, identity);
		const state = {
			...createEmptyBrowserPoolState(identity),
			pid: 1234,
			processGroupId: 1234,
			cdpPort: 4831,
			cdpUrl: "http://127.0.0.1:4831",
			userDataDir: join(dir, "profile"),
			activeLeaseId: "lease-1",
			owner: "user:test",
			lastUsedAt: "2026-05-17T00:00:00.000Z",
			idleExpiresAt: "2026-05-17T00:05:00.000Z",
			state: "leased",
		};

		await saveBrowserPoolState(paths.statePath, state);
		assert.deepEqual(await loadBrowserPoolState(paths.statePath, identity), state);
	});
});

test("browser pool state initializes an empty pool for missing state", async () => {
	await withTempDir(async (dir) => {
		const paths = browserPoolPaths(dir, identity);
		assert.deepEqual(await loadBrowserPoolState(paths.statePath, identity), createEmptyBrowserPoolState(identity));
		await assert.rejects(
			loadBrowserPoolState(paths.statePath, { ...identity, onMissing: "throw" }),
			(error) => error && error.code === "ENOENT",
		);
	});
});

test("browser pool state fails safely or throws for malformed state by context", async () => {
	await withTempDir(async (dir) => {
		const paths = browserPoolPaths(dir, identity);
		await mkdir(join(dir, "browser-pools", identity.workerId, identity.poolId), { recursive: true });
		await writeFile(paths.statePath, "{not-json", "utf8");

		await assert.rejects(loadBrowserPoolState(paths.statePath, identity), BrowserPoolStateError);
		const dirty = await loadBrowserPoolState(paths.statePath, { ...identity, onMalformed: "empty" });
		assert.equal(dirty.state, "dirty");
		assert.match(dirty.lastError, /JSON|Expected|property name/i);
	});
});

test("browser pool lock serializes a successful mutation", async () => {
	await withTempDir(async (dir) => {
		const paths = browserPoolPaths(dir, identity);
		const result = await mutateBrowserPoolState(paths, identity, "acquire", async (state) => ({
			state: { ...state, state: "ready", pid: 42, cdpPort: 4831, cdpUrl: "http://127.0.0.1:4831" },
			result: "ok",
		}), { timeoutMs: 200 });

		assert.equal(result, "ok");
		const saved = await loadBrowserPoolState(paths.statePath, identity);
		assert.equal(saved.state, "ready");
		assert.equal(saved.pid, 42);
		await assert.rejects(readFile(paths.lockPath, "utf8"), (error) => error && error.code === "ENOENT");
	});
});

test("browser pool lock times out when another mutation holds it", async () => {
	await withTempDir(async (dir) => {
		const paths = browserPoolPaths(dir, identity);
		const releaseHeldLock = withBrowserPoolLock(paths.lockPath, { timeoutMs: 200, owner: "holder" }, async () => {
			await new Promise((resolve) => setTimeout(resolve, 150));
		});

		await assert.rejects(
			withBrowserPoolLock(paths.lockPath, { timeoutMs: 25, pollIntervalMs: 5, staleMs: 0, owner: "waiter" }, async () => undefined),
			BrowserPoolLockTimeoutError,
		);
		await releaseHeldLock;
	});
});

test("browser pool lock supports release and reap mutation kinds", async () => {
	await withTempDir(async (dir) => {
		const paths = browserPoolPaths(dir, identity);
		await mutateBrowserPoolState(paths, identity, "release", async (state) => ({ state: { ...state, state: "empty" }, result: undefined }));
		await mutateBrowserPoolState(paths, identity, "reap", async (state) => ({ state: { ...state, state: "dirty", lastError: "manual reap failed" }, result: undefined }));
		const saved = await loadBrowserPoolState(paths.statePath, identity);
		assert.equal(saved.state, "dirty");
		assert.equal(saved.lastError, "manual reap failed");
	});
});
