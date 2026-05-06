import assert from "node:assert/strict";
import test from "node:test";
import { createPiboSignalRegistry } from "../dist/signals/registry.js";

function session(id, parentId) {
	return {
		id,
		piSessionId: `pi-${id}`,
		channel: "test",
		kind: parentId ? "subagent" : "runtime",
		profile: "test-profile",
		parentId,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

test("signal registry aggregates a three-level active descendant", () => {
	const registry = createPiboSignalRegistry();
	registry.project({ type: "session_created", session: session("root") });
	registry.project({ type: "session_created", session: session("child", "root") });
	registry.project({ type: "session_created", session: session("grandchild", "child") });
	registry.project({ type: "session_processing_changed", piboSessionId: "grandchild", processing: true, queuedMessages: 0 });

	const snapshot = registry.snapshotTree("root");
	assert.equal(snapshot.sessions.root.localStatus, "idle");
	assert.equal(snapshot.sessions.root.isTreeActive, true);
	assert.equal(snapshot.sessions.root.hasActiveDescendant, true);
	assert.equal(snapshot.sessions.child.hasActiveDescendant, true);
	assert.equal(snapshot.sessions.grandchild.isLocalActive, true);
});

test("yielded run keeps session tree active after message finishes", () => {
	const registry = createPiboSignalRegistry();
	registry.project({ type: "session_created", session: session("root") });
	registry.project({ type: "pibo_output", event: { type: "message_started", piboSessionId: "root", eventId: "m1", text: "hi" } });
	registry.project({ type: "pibo_output", event: { type: "message_finished", piboSessionId: "root", eventId: "m1" } });
	registry.project({ type: "session_processing_changed", piboSessionId: "root", processing: false, queuedMessages: 0 });
	registry.project({
		type: "run_changed",
		run: {
			runId: "run_1",
			kind: "tool",
			ownerPiboSessionId: "root",
			status: "running",
			completionPolicy: "tracked",
			consumed: false,
			toolName: "bash",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	});

	let snapshot = registry.snapshotTree("root");
	assert.equal(snapshot.sessions.root.localStatus, "running");
	assert.equal(snapshot.sessions.root.isTreeActive, true);
	assert.equal(snapshot.sessions.root.activeRuns.length, 1);

	registry.project({
		type: "run_changed",
		run: {
			runId: "run_1",
			kind: "tool",
			ownerPiboSessionId: "root",
			status: "completed",
			completionPolicy: "tracked",
			consumed: false,
			toolName: "bash",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedAt: new Date().toISOString(),
		},
	});
	snapshot = registry.snapshotTree("root");
	assert.equal(snapshot.sessions.root.isTreeActive, false);
});

test("patch versions are monotonic per root", () => {
	const registry = createPiboSignalRegistry();
	const first = registry.project({ type: "session_created", session: session("root") });
	const second = registry.project({ type: "queue_changed", piboSessionId: "root", queuedMessages: 1 });
	assert.equal(first?.fromVersion, 0);
	assert.equal(first?.toVersion, 1);
	assert.equal(second?.fromVersion, 1);
	assert.equal(second?.toVersion, 2);
});
