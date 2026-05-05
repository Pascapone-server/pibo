import assert from "node:assert/strict";
import test from "node:test";
import { OutputCompactor } from "../dist/apps/chat/output-compactor.js";
import { isLiveOnlyOutputEvent, isPersistableOutputEvent } from "../dist/apps/chat/output-event-policy.js";
import { ChatEventLog } from "../dist/apps/chat/event-log.js";
import { ChatWebReadModel } from "../dist/apps/chat/read-model.js";

const liveOnlyTypes = ["assistant_delta", "thinking_delta", "tool_execution_updated"];

test("output event policy classifies live-only deltas", () => {
	for (const type of liveOnlyTypes) {
		const event = minimalEvent(type);
		assert.equal(isLiveOnlyOutputEvent(event), true);
		assert.equal(isPersistableOutputEvent(event), false);
	}
	assert.equal(isPersistableOutputEvent({ type: "assistant_message", piboSessionId: "ps_1", eventId: "turn", text: "done" }), true);
});

test("output compactor keeps assistant deltas live-only and persists one final message", () => {
	const compactor = new OutputCompactor();
	assert.deepEqual(
		compactor.compact({ type: "assistant_delta", piboSessionId: "ps_1", eventId: "turn", text: "hel" }).persistedEvents,
		[],
	);
	assert.deepEqual(compactor.snapshotsForSession("ps_1").map((event) => event.text), ["hel"]);
	const result = compactor.compact({ type: "assistant_message", piboSessionId: "ps_1", eventId: "turn", text: "" });
	assert.deepEqual(result.persistedEvents, [{ type: "assistant_message", piboSessionId: "ps_1", eventId: "turn", text: "hel" }]);
	assert.deepEqual(compactor.snapshotsForSession("ps_1"), []);
});

test("output compactor flushes unfinished assistant and thinking buffers at turn boundary", () => {
	const compactor = new OutputCompactor();
	compactor.compact({ type: "assistant_delta", piboSessionId: "ps_1", eventId: "turn", text: "answer" });
	compactor.compact({ type: "thinking_started", piboSessionId: "ps_1", eventId: "turn", thinkingIndex: 0 });
	compactor.compact({ type: "thinking_delta", piboSessionId: "ps_1", eventId: "turn", thinkingIndex: 0, text: "reason" });
	const result = compactor.compact({ type: "message_finished", piboSessionId: "ps_1", eventId: "turn" });
	assert.deepEqual(result.persistedEvents.map((event) => event.type), ["assistant_message", "thinking_finished", "message_finished"]);
	assert.equal(result.persistedEvents[0].text, "answer");
	assert.equal(result.persistedEvents[1].text, "reason");
});

test("chat durable stores defensively ignore live-only deltas", () => {
	const log = new ChatEventLog(":memory:");
	const readModel = new ChatWebReadModel(":memory:");
	for (const type of liveOnlyTypes) {
		const event = minimalEvent(type);
		assert.equal(log.appendOutputEvent(event), undefined);
		assert.equal(readModel.recordEvent(event), undefined);
	}
	assert.deepEqual(log.countEventsByType({ eventTypes: liveOnlyTypes }), []);
	assert.deepEqual(readModel.countEventsByType({ eventTypes: liveOnlyTypes }), []);
	log.close();
	readModel.close();
});

function minimalEvent(type) {
	if (type === "assistant_delta") return { type, piboSessionId: "ps_1", eventId: "turn", text: "x" };
	if (type === "thinking_delta") return { type, piboSessionId: "ps_1", eventId: "turn", text: "x" };
	return { type, piboSessionId: "ps_1", eventId: "turn", toolCallId: "tool", toolName: "read", args: {}, partialResult: "x" };
}
