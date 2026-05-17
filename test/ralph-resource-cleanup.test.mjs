import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PiboRalphService } from "../dist/ralph/service.js";
import { PiboRalphStore } from "../dist/ralph/store.js";
import { PROMISE_COMPLETE_STOP_TOKEN, createBuiltInRalphStopConditions } from "../dist/ralph/stopping.js";
import { createPiboSession } from "../dist/sessions/store.js";

function createControlledContext() {
	const listeners = new Set();
	let sessionCounter = 0;
	let pendingMessage;
	let messageResolve;
	const waitForMessage = () => pendingMessage ? Promise.resolve(pendingMessage) : new Promise((resolve) => { messageResolve = resolve; });
	return {
		context: {
			async emit(event) {
				if (event.type === "message") {
					pendingMessage = event;
					messageResolve?.(event);
					messageResolve = undefined;
				}
				return { type: "execution_result", piboSessionId: event.piboSessionId, eventId: event.id ?? "evt", action: "test", result: {} };
			},
			subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
			createSession(input) { sessionCounter += 1; return createPiboSession({ ...input, id: `ps_ralph_cleanup_${sessionCounter}` }); },
			getSession() { return undefined; },
			findSessions() { return []; },
			getGatewayActions() { return []; },
			getWebApps() { return []; },
			getRalphStopConditionDefinitions() { return createBuiltInRalphStopConditions(); },
		},
		async waitForMessage() { return await waitForMessage(); },
		finish(text) {
			if (!pendingMessage) throw new Error("No pending Ralph message");
			for (const listener of listeners) {
				listener({ type: "assistant_message", piboSessionId: pendingMessage.piboSessionId, eventId: pendingMessage.id, text });
				listener({ type: "message_finished", piboSessionId: pendingMessage.piboSessionId, eventId: pendingMessage.id });
			}
		},
	};
}

function createSuccessfulRelease(recorder) {
	return async (paths, identity, options = {}) => {
		recorder.push({ paths, identity, leaseId: options.leaseId, lockOwner: options.lockOptions?.owner });
		return {
			released: true,
			cleanupStatus: "success",
			closedTargets: 1,
			state: { workerId: identity.workerId, poolId: identity.poolId, maxBrowserProcesses: 1, activeLeaseCount: 0, state: "ready", cleanupStatus: "success" },
		};
	};
}

async function runRalphOnce({ resources, maxIterations, finalAnswer = "done", releaseBrowserPoolLease, beforeFinish } = {}) {
	const dir = await mkdtemp(join(tmpdir(), "pibo-ralph-resource-cleanup-"));
	const store = new PiboRalphStore({ path: ":memory:" });
	const controlled = createControlledContext();
	const service = new PiboRalphService({
		store,
		context: controlled.context,
		dataStorePath: join(dir, "data.sqlite"),
		dataPayloadRootDir: join(dir, "payloads"),
		runTimeoutMs: 5_000,
		resourceCleanup: { browserPoolRootDir: join(dir, "pool"), releaseBrowserPoolLease },
	});
	try {
		const job = store.createJob({ ownerScope: "user:a", target: { kind: "personal", principalId: "user:a" }, profile: "codex", prompt: "work", enabled: true, maxIterations, resources });
		const reserved = store.reserveRun("user:a", job.id);
		assert.ok(reserved);
		const executing = service.executeReserved(reserved.job, reserved.run);
		await controlled.waitForMessage();
		await beforeFinish?.({ store, service, job, reserved });
		controlled.finish(finalAnswer);
		await executing;
		return { job: store.getJob(job.id), run: store.listRuns({ ownerScope: "user:a", jobId: job.id })[0] };
	} finally {
		service.stop();
		await rm(dir, { recursive: true, force: true });
	}
}

test("Ralph service releases browser leases after ok run completion", async () => {
	const releases = [];
	const result = await runRalphOnce({
		resources: { workerId: "worker-a", browserLeaseIds: ["lease-a"], cleanupState: "active" },
		releaseBrowserPoolLease: createSuccessfulRelease(releases),
	});

	assert.equal(releases.length, 1);
	assert.equal(releases[0].identity.workerId, "worker-a");
	assert.equal(releases[0].leaseId, "lease-a");
	assert.equal(releases[0].lockOwner, `ralph:${result.run.id}`);
	assert.equal(result.run.status, "ok");
	assert.equal(result.run.resources.cleanupState, "released");
	assert.equal(result.run.resources.workerId, "worker-a");
	assert.deepEqual(result.run.resources.browserLeaseIds, ["lease-a"]);
	assert.equal(result.job.resources.cleanupState, "released");
});

test("Ralph service releases browser leases on promise-complete terminal outcome", async () => {
	const releases = [];
	const result = await runRalphOnce({
		resources: { workerId: "worker-promise", browserLeaseIds: ["lease-promise"], cleanupState: "active" },
		finalAnswer: `done\n${PROMISE_COMPLETE_STOP_TOKEN}`,
		releaseBrowserPoolLease: createSuccessfulRelease(releases),
	});

	assert.equal(releases.length, 1);
	assert.equal(result.job.enabled, false);
	assert.equal(result.job.state.lastStopEvaluation.reason, "promise-complete");
	assert.equal(result.run.reason, "promise-complete");
	assert.equal(result.job.resources.cleanupState, "released");
});

test("Ralph service releases browser leases on max-iteration terminal outcome", async () => {
	const releases = [];
	const result = await runRalphOnce({
		resources: { workerId: "worker-max", browserLeaseIds: ["lease-max"], cleanupState: "active" },
		maxIterations: 1,
		releaseBrowserPoolLease: createSuccessfulRelease(releases),
	});

	assert.equal(releases.length, 1);
	assert.equal(result.job.enabled, false);
	assert.equal(result.job.state.lastStopEvaluation.reason, "max-iterations");
	assert.equal(result.run.reason, "max-iterations");
	assert.equal(result.job.resources.cleanupState, "released");
});

test("Ralph stop request disables future runs and still cleans up after the active run", async () => {
	const releases = [];
	const result = await runRalphOnce({
		resources: { workerId: "worker-stop", browserLeaseIds: ["lease-stop"], cleanupState: "active" },
		releaseBrowserPoolLease: createSuccessfulRelease(releases),
		beforeFinish: async ({ store, job }) => {
			const stopped = store.requestStop("user:a", job.id);
			assert.equal(stopped.enabled, false);
		},
	});

	assert.equal(releases.length, 1);
	assert.equal(result.job.enabled, false);
	assert.equal(result.job.resources.cleanupState, "released");
	assert.equal(result.run.resources.cleanupState, "released");
});

test("Ralph resource cleanup failure marks run and job metadata dirty", async () => {
	const result = await runRalphOnce({
		resources: { workerId: "worker-dirty", browserLeaseIds: ["lease-dirty"], cleanupState: "active" },
		releaseBrowserPoolLease: async (_paths, identity) => ({
			released: true,
			cleanupStatus: "failed",
			closedTargets: 0,
			lastError: "CDP cleanup failed",
			state: { workerId: identity.workerId, poolId: identity.poolId, maxBrowserProcesses: 1, state: "dirty", cleanupStatus: "failed", lastError: "CDP cleanup failed" },
		}),
	});

	assert.equal(result.run.status, "ok");
	assert.equal(result.run.resources.cleanupState, "dirty");
	assert.equal(result.run.resources.dirtyReason, "CDP cleanup failed");
	assert.equal(result.job.resources.cleanupState, "dirty");
	assert.equal(result.job.resources.dirtyReason, "CDP cleanup failed");
});

test("Ralph resource cleanup preserves retained worker metadata without browser leases", async () => {
	const releases = [];
	const retainedUntil = "2026-05-18T00:00:00.000Z";
	const result = await runRalphOnce({
		resources: { workerId: "worker-retained", cleanupState: "retained", retainedUntil },
		releaseBrowserPoolLease: createSuccessfulRelease(releases),
	});

	assert.equal(releases.length, 0);
	assert.deepEqual(result.job.resources, { workerId: "worker-retained", cleanupState: "retained", retainedUntil });
	assert.deepEqual(result.run.resources, { workerId: "worker-retained", cleanupState: "retained", retainedUntil });
});
