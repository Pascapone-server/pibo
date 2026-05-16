import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { PiboDataStore } from "../dist/data/pibo-store.js";
import { applyPiboDataSchema } from "../dist/data/schema.js";
import { BestEffortTelemetryService } from "../dist/data/telemetry.js";

function tempStore() {
	return new PiboDataStore(":memory:", { payloadRootDir: mkdtempSync(join(tmpdir(), "pibo-telemetry-payloads-")) });
}

test("telemetry schema migration is idempotent and additive", () => {
	const db = new DatabaseSync(":memory:");
	applyPiboDataSchema(db);
	applyPiboDataSchema(db);

	const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
	for (const table of [
		"telemetry_turns",
		"telemetry_phases",
		"telemetry_provider_requests",
		"telemetry_provider_events",
		"telemetry_tool_calls",
	]) {
		assert.equal(tables.has(table), true, `missing table ${table}`);
	}
	for (const index of [
		"idx_telemetry_turns_session_updated",
		"idx_telemetry_phases_turn_started",
		"idx_telemetry_provider_requests_turn",
		"idx_telemetry_provider_events_request_sequence",
		"idx_telemetry_tool_calls_provider_request",
	]) {
		assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = ?").get(index).count, 1, `missing index ${index}`);
	}
	db.close();
});

test("telemetry store upserts correlated turns and phases", () => {
	const store = tempStore();
	try {
		const turn = store.telemetry.upsertTurn({
			turnId: "turn_test_1",
			piboSessionId: "ps_test_1",
			rootSessionId: "ps_root",
			roomId: "room_test_1",
			inputEventId: "input_1",
			eventId: "evt_1",
			eventStreamId: 10,
			payloadRef: "payload_1",
			runId: "run_1",
			source: "user",
			status: "queued",
			queuedAt: "2026-05-16T00:00:00.000Z",
			queuedBehind: 2,
			queueDepth: 3,
			metadata: { safe: true },
		});
		assert.equal(turn.piboSessionId, "ps_test_1");
		assert.equal(turn.payloadRef, "payload_1");
		assert.deepEqual(turn.metadata, { safe: true });

		const updated = store.telemetry.upsertTurn({
			turnId: "turn_test_1",
			piboSessionId: "ps_test_1",
			status: "running",
			startedAt: "2026-05-16T00:00:01.000Z",
			lastProgressAt: "2026-05-16T00:00:02.000Z",
			currentPhase: "provider_stream",
		});
		assert.equal(updated.status, "running");
		assert.equal(updated.payloadRef, "payload_1");
		assert.deepEqual(updated.metadata, { safe: true });

		const phase = store.telemetry.upsertPhase({
			phaseId: "phase_test_1",
			turnId: "turn_test_1",
			piboSessionId: "ps_test_1",
			name: "provider_stream",
			startedAt: "2026-05-16T00:00:01.000Z",
			providerRequestId: "pr_test_1",
			counters: { rawEvents: 1 },
		});
		assert.equal(phase.status, "open");
		assert.equal(phase.providerRequestId, "pr_test_1");
		assert.deepEqual(phase.counters, { rawEvents: 1 });

		const finished = store.telemetry.finishPhase("phase_test_1", {
			endedAt: "2026-05-16T00:00:03.000Z",
		});
		assert.equal(finished?.status, "ok");
		assert.equal(finished?.durationMs, 2000);
	} finally {
		store.close();
	}
});

test("telemetry store records provider request counters and provider event metadata", () => {
	const store = tempStore();
	try {
		store.telemetry.upsertProviderRequest({
			providerRequestId: "pr_test_1",
			piboSessionId: "ps_test_1",
			roomId: "room_test_1",
			turnId: "turn_test_1",
			phaseId: "phase_test_1",
			provider: "openai",
			api: "responses",
			model: "gpt-test",
			transport: "sse",
			status: "streaming",
			startedAt: "2026-05-16T00:00:00.000Z",
			firstByteAt: "2026-05-16T00:00:01.000Z",
			upstreamResponseId: "resp_test",
		});

		const firstEvent = store.telemetry.appendProviderEventSummary({
			rawEventId: "raw_1",
			providerRequestId: "pr_test_1",
			piboSessionId: "ps_test_1",
			turnId: "turn_test_1",
			sequence: 1,
			receivedAt: "2026-05-16T00:00:02.000Z",
			eventType: "response.output_item.added",
			byteSize: 128,
			parseStatus: "ok",
			normalizedType: "tool_call:start",
			itemId: "item_1",
			toolCallId: "call_1",
			safeFields: { itemType: "function_call" },
		});
		assert.equal(firstEvent.safeFields.itemType, "function_call");

		store.telemetry.appendProviderEventSummary({
			rawEventId: "raw_2",
			providerRequestId: "pr_test_1",
			sequence: 2,
			receivedAt: "2026-05-16T00:00:03.000Z",
			eventType: "response.unknown",
			byteSize: 64,
			parseStatus: "unknown_type",
		});

		const provider = store.telemetry.getProviderRequest("pr_test_1");
		assert.equal(provider?.rawEventCount, 2);
		assert.equal(provider?.normalizedEventCount, 1);
		assert.equal(provider?.unknownEventCount, 1);
		assert.equal(provider?.bytesReceived, 192);
		assert.deepEqual(provider?.eventTypeCounts, {
			"response.output_item.added": 1,
			"response.unknown": 1,
		});
		assert.deepEqual(store.telemetry.listProviderEvents("pr_test_1", { afterSequence: 1 }).map((event) => event.rawEventId), ["raw_2"]);

		const completed = store.telemetry.upsertProviderRequest({
			providerRequestId: "pr_test_1",
			piboSessionId: "ps_test_1",
			turnId: "turn_test_1",
			provider: "openai",
			api: "responses",
			model: "gpt-test",
			status: "completed",
			completedAt: "2026-05-16T00:00:04.000Z",
		});
		assert.equal(completed.rawEventCount, 2);
		assert.equal(completed.status, "completed");
	} finally {
		store.close();
	}
});

test("telemetry tool-call rows track argument progress without storing argument bodies", () => {
	const store = tempStore();
	try {
		const partial = store.telemetry.upsertToolCall({
			toolCallId: "call_1",
			piboSessionId: "ps_test_1",
			turnId: "turn_test_1",
			providerRequestId: "pr_test_1",
			providerItemId: "item_1",
			outputIndex: 0,
			toolName: "bash",
			status: "args_partial",
			argsStartedAt: "2026-05-16T00:00:01.000Z",
			firstDeltaAt: "2026-05-16T00:00:02.000Z",
			lastDeltaAt: "2026-05-16T00:00:03.000Z",
			argsBytes: 42,
			parseStatus: "partial",
			safeArgKeys: ["command"],
		});
		assert.equal(partial.argsBytes, 42);
		assert.deepEqual(partial.safeArgKeys, ["command"]);
		assert.equal(partial.payloadRef, undefined);

		const executing = store.telemetry.upsertToolCall({
			toolCallId: "call_1",
			piboSessionId: "ps_test_1",
			turnId: "turn_test_1",
			toolName: "bash",
			status: "executing",
			executionStartedAt: "2026-05-16T00:00:04.000Z",
		});
		assert.equal(executing.argsBytes, 42);
		assert.deepEqual(executing.safeArgKeys, ["command"]);
		assert.equal(executing.executionStartedAt, "2026-05-16T00:00:04.000Z");
	} finally {
		store.close();
	}
});

test("best-effort telemetry service swallows unavailable-store write failures", () => {
	const errors = [];
	const service = new BestEffortTelemetryService(undefined, (error) => errors.push(error));
	assert.equal(service.upsertTurn({ turnId: "turn_missing", piboSessionId: "ps_missing" }), undefined);
	assert.equal(errors.length, 0);

	const throwingService = new BestEffortTelemetryService({
		upsertTurn() {
			throw new Error("store unavailable");
		},
	}, (error) => errors.push(error));
	assert.equal(throwingService.upsertTurn({ turnId: "turn_error", piboSessionId: "ps_error" }), undefined);
	assert.equal(errors.length, 1);
});

test("telemetry preview reads are disabled by default", () => {
	const store = tempStore();
	try {
		assert.deepEqual(store.telemetry.getPayloadPreview("preview_1"), {
			status: "disabled",
			reason: "preview_capture_disabled",
			captureMode: "disabled",
			message: "Telemetry payload previews are disabled in V1; summaries store metadata and links only.",
		});
	} finally {
		store.close();
	}
});
