import assert from "node:assert/strict";
import { applyTraceLiveEvents } from "../../../../src/apps/chat-ui/src/traceLiveReducer.ts";

let seq = 1;
const events = applyTraceLiveEvents({
	currentEvents: [],
	piboSessionId: "ps_delta",
	nextSequence: () => seq++,
	now: () => "2026-05-20T00:00:00.000Z",
	streamEvents: [
		{ type: "TEXT_MESSAGE_CONTENT", piboSessionId: "ps_delta", messageId: "turn-1:assistant:0", runId: "turn-1", delta: "Hello", streamFrameId: "42:0", streamId: 42, streamFrameIndex: 0 },
		{ type: "TEXT_MESSAGE_CONTENT", piboSessionId: "ps_delta", messageId: "turn-1:assistant:0", runId: "turn-1", delta: " world", streamFrameId: "42:1", streamId: 42, streamFrameIndex: 1 },
		{ type: "TEXT_MESSAGE_CONTENT", piboSessionId: "ps_delta", messageId: "turn-1:assistant:0", runId: "turn-1", delta: "!", streamFrameId: "42:2", streamId: 42, streamFrameIndex: 2 },
		{ type: "TEXT_MESSAGE_CONTENT", piboSessionId: "ps_delta", messageId: "turn-1:assistant:0", runId: "turn-1", delta: " duplicate", streamFrameId: "42:2", streamId: 42, streamFrameIndex: 2 },
	],
});

const deltas = events.filter((event) => event.type === "assistant_delta");
assert.equal(deltas.length, 3, "same-stream text deltas with different frame indexes must be preserved");
assert.deepEqual(deltas.map((event) => event.payload.text), ["Hello", " world", "!"]);
assert.deepEqual(deltas.map((event) => event.id), ["stream:42:0:assistant_delta", "stream:42:1:assistant_delta", "stream:42:2:assistant_delta"]);
assert.deepEqual(deltas.map((event) => event.streamFrameIndex), [0, 1, 2]);
console.log(JSON.stringify({ passed: true, deltaCount: deltas.length, text: deltas.map((event) => event.payload.text).join("") }));
