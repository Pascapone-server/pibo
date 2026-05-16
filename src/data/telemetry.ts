import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { PiboJsonObject } from "../core/events.js";

export type TelemetryRetentionClass = "live" | "diagnostic" | "provider_event" | "payload_preview" | "incident";
export type TelemetryTurnSource = "user" | "ui" | "rpc" | "system";
export type TelemetryTurnStatus = "queued" | "running" | "ok" | "error" | "aborted" | "timeout";
export type TelemetryPhaseStatus = "open" | "ok" | "error" | "aborted" | "timeout";
export type TelemetryProviderRequestStatus = "started" | "headers" | "streaming" | "completed" | "error" | "aborted" | "timeout";
export type TelemetryProviderTransport = "sse" | "websocket" | "auto" | "unknown";
export type TelemetryCaptureMode = "metadata_only" | "bounded_preview" | "disabled";
export type TelemetryProviderEventParseStatus = "ok" | "invalid_json" | "ignored" | "unknown_type";
export type TelemetryToolCallStatus = "args_started" | "args_partial" | "args_complete" | "executing" | "ok" | "error" | "aborted" | "timeout";
export type TelemetryToolArgsParseStatus = "empty" | "partial" | "valid" | "invalid" | "complete";

export type TelemetryPreviewUnavailableResult = {
	status: "unavailable" | "disabled";
	reason: "preview_capture_disabled" | "preview_not_found" | "telemetry_unavailable";
	captureMode: TelemetryCaptureMode;
	message: string;
};

export type StoredTelemetryTurn = {
	turnId: string;
	piboSessionId: string;
	rootSessionId?: string;
	roomId?: string;
	inputEventId?: string;
	eventId?: string;
	eventStreamId?: number;
	payloadRef?: string;
	runId?: string;
	source: TelemetryTurnSource;
	status: TelemetryTurnStatus;
	currentPhase?: string;
	queuedAt: string;
	startedAt?: string;
	completedAt?: string;
	lastProgressAt?: string;
	queuedBehind?: number;
	queueDepth?: number;
	summary?: string;
	retentionClass: TelemetryRetentionClass;
	createdAt: string;
	updatedAt: string;
	metadata: PiboJsonObject;
};

export type TelemetryTurnUpsertInput = {
	turnId?: string;
	piboSessionId: string;
	rootSessionId?: string;
	roomId?: string;
	inputEventId?: string;
	eventId?: string;
	eventStreamId?: number;
	payloadRef?: string;
	runId?: string;
	source?: TelemetryTurnSource;
	status?: TelemetryTurnStatus;
	currentPhase?: string;
	queuedAt?: string;
	startedAt?: string;
	completedAt?: string;
	lastProgressAt?: string;
	queuedBehind?: number;
	queueDepth?: number;
	summary?: string;
	retentionClass?: TelemetryRetentionClass;
	createdAt?: string;
	updatedAt?: string;
	metadata?: PiboJsonObject;
};

export type StoredTelemetryPhase = {
	phaseId: string;
	turnId: string;
	piboSessionId: string;
	rootSessionId?: string;
	roomId?: string;
	name: TelemetryPhaseName;
	status: TelemetryPhaseStatus;
	startedAt: string;
	endedAt?: string;
	lastProgressAt?: string;
	durationMs?: number;
	providerRequestId?: string;
	toolCallId?: string;
	eventStreamId?: number;
	eventId?: string;
	payloadRef?: string;
	runId?: string;
	counters: PiboJsonObject;
	summary?: string;
	retentionClass: TelemetryRetentionClass;
	createdAt: string;
	updatedAt: string;
};

export type TelemetryPhaseName =
	| "queued"
	| "message_started"
	| "prompt_build"
	| "provider_request"
	| "provider_stream"
	| "reasoning"
	| "assistant_text"
	| "tool_args"
	| "tool_execution"
	| "continuation"
	| "abort"
	| "error"
	| "timeout"
	| "finish";

export type TelemetryPhaseUpsertInput = {
	phaseId?: string;
	turnId: string;
	piboSessionId: string;
	rootSessionId?: string;
	roomId?: string;
	name: TelemetryPhaseName;
	status?: TelemetryPhaseStatus;
	startedAt?: string;
	endedAt?: string;
	lastProgressAt?: string;
	durationMs?: number;
	providerRequestId?: string;
	toolCallId?: string;
	eventStreamId?: number;
	eventId?: string;
	payloadRef?: string;
	runId?: string;
	counters?: PiboJsonObject;
	summary?: string;
	retentionClass?: TelemetryRetentionClass;
	createdAt?: string;
	updatedAt?: string;
};

export type TelemetryPhaseFinishInput = {
	status?: TelemetryPhaseStatus;
	endedAt?: string;
	lastProgressAt?: string;
	durationMs?: number;
	summary?: string;
};

export type StoredTelemetryProviderRequest = {
	providerRequestId: string;
	piboSessionId: string;
	rootSessionId?: string;
	roomId?: string;
	turnId: string;
	phaseId?: string;
	provider: string;
	api: string;
	model: string;
	transport: TelemetryProviderTransport;
	serviceTier?: string;
	status: TelemetryProviderRequestStatus;
	startedAt: string;
	responseHeadersAt?: string;
	firstByteAt?: string;
	lastRawEventAt?: string;
	lastNormalizedEventAt?: string;
	completedAt?: string;
	httpStatus?: number;
	upstreamResponseId?: string;
	rawEventCount: number;
	normalizedEventCount: number;
	parseErrorCount: number;
	unknownEventCount: number;
	bytesReceived?: number;
	eventTypeCounts: PiboJsonObject;
	eventStreamId?: number;
	eventId?: string;
	payloadRef?: string;
	errorCategory?: string;
	errorMessage?: string;
	captureMode: TelemetryCaptureMode;
	retentionClass: TelemetryRetentionClass;
	createdAt: string;
	updatedAt: string;
};

export type TelemetryProviderRequestUpsertInput = {
	providerRequestId?: string;
	piboSessionId: string;
	rootSessionId?: string;
	roomId?: string;
	turnId: string;
	phaseId?: string;
	provider: string;
	api: string;
	model: string;
	transport?: TelemetryProviderTransport;
	serviceTier?: string;
	status?: TelemetryProviderRequestStatus;
	startedAt?: string;
	responseHeadersAt?: string;
	firstByteAt?: string;
	lastRawEventAt?: string;
	lastNormalizedEventAt?: string;
	completedAt?: string;
	httpStatus?: number;
	upstreamResponseId?: string;
	rawEventCount?: number;
	normalizedEventCount?: number;
	parseErrorCount?: number;
	unknownEventCount?: number;
	bytesReceived?: number;
	eventTypeCounts?: PiboJsonObject;
	eventStreamId?: number;
	eventId?: string;
	payloadRef?: string;
	errorCategory?: string;
	errorMessage?: string;
	captureMode?: TelemetryCaptureMode;
	retentionClass?: TelemetryRetentionClass;
	createdAt?: string;
	updatedAt?: string;
};

export type StoredTelemetryProviderEvent = {
	rawEventId: string;
	providerRequestId: string;
	piboSessionId?: string;
	turnId?: string;
	phaseId?: string;
	sequence: number;
	receivedAt: string;
	eventType: string;
	byteSize: number;
	parseStatus: TelemetryProviderEventParseStatus;
	normalizedType?: string;
	eventStreamId?: number;
	eventId?: string;
	itemId?: string;
	toolCallId?: string;
	payloadRef?: string;
	payloadPreviewRef?: string;
	safeFields: PiboJsonObject;
	retentionClass: TelemetryRetentionClass;
	createdAt: string;
	updatedAt: string;
};

export type TelemetryProviderEventInput = {
	rawEventId?: string;
	providerRequestId: string;
	piboSessionId?: string;
	turnId?: string;
	phaseId?: string;
	sequence?: number;
	receivedAt?: string;
	eventType: string;
	byteSize?: number;
	parseStatus?: TelemetryProviderEventParseStatus;
	normalizedType?: string;
	eventStreamId?: number;
	eventId?: string;
	itemId?: string;
	toolCallId?: string;
	payloadRef?: string;
	payloadPreviewRef?: string;
	safeFields?: PiboJsonObject;
	retentionClass?: TelemetryRetentionClass;
	createdAt?: string;
	updatedAt?: string;
};

export type StoredTelemetryToolCall = {
	toolCallId: string;
	piboSessionId: string;
	rootSessionId?: string;
	roomId?: string;
	turnId: string;
	providerRequestId?: string;
	providerItemId?: string;
	outputIndex?: number;
	toolName: string;
	status: TelemetryToolCallStatus;
	argsStartedAt?: string;
	firstDeltaAt?: string;
	lastDeltaAt?: string;
	argsCompletedAt?: string;
	executionStartedAt?: string;
	executionEndedAt?: string;
	durationMs?: number;
	argsBytes: number;
	parseStatus: TelemetryToolArgsParseStatus;
	safeArgKeys: string[];
	eventStreamId?: number;
	eventId?: string;
	payloadRef?: string;
	runId?: string;
	errorCategory?: string;
	errorMessage?: string;
	retentionClass: TelemetryRetentionClass;
	createdAt: string;
	updatedAt: string;
};

export type TelemetryToolCallUpsertInput = {
	toolCallId: string;
	piboSessionId: string;
	rootSessionId?: string;
	roomId?: string;
	turnId: string;
	providerRequestId?: string;
	providerItemId?: string;
	outputIndex?: number;
	toolName: string;
	status?: TelemetryToolCallStatus;
	argsStartedAt?: string;
	firstDeltaAt?: string;
	lastDeltaAt?: string;
	argsCompletedAt?: string;
	executionStartedAt?: string;
	executionEndedAt?: string;
	durationMs?: number;
	argsBytes?: number;
	parseStatus?: TelemetryToolArgsParseStatus;
	safeArgKeys?: string[];
	eventStreamId?: number;
	eventId?: string;
	payloadRef?: string;
	runId?: string;
	errorCategory?: string;
	errorMessage?: string;
	retentionClass?: TelemetryRetentionClass;
	createdAt?: string;
	updatedAt?: string;
};

type TelemetryTurnRow = {
	turn_id: string;
	pibo_session_id: string;
	root_session_id: string | null;
	room_id: string | null;
	input_event_id: string | null;
	event_id: string | null;
	event_stream_id: number | null;
	payload_ref: string | null;
	run_id: string | null;
	source: TelemetryTurnSource;
	status: TelemetryTurnStatus;
	current_phase: string | null;
	queued_at: string;
	started_at: string | null;
	completed_at: string | null;
	last_progress_at: string | null;
	queued_behind: number | null;
	queue_depth: number | null;
	summary: string | null;
	retention_class: TelemetryRetentionClass;
	created_at: string;
	updated_at: string;
	metadata_json: string;
};

type TelemetryPhaseRow = {
	phase_id: string;
	turn_id: string;
	pibo_session_id: string;
	root_session_id: string | null;
	room_id: string | null;
	name: TelemetryPhaseName;
	status: TelemetryPhaseStatus;
	started_at: string;
	ended_at: string | null;
	last_progress_at: string | null;
	duration_ms: number | null;
	provider_request_id: string | null;
	tool_call_id: string | null;
	event_stream_id: number | null;
	event_id: string | null;
	payload_ref: string | null;
	run_id: string | null;
	counters_json: string;
	summary: string | null;
	retention_class: TelemetryRetentionClass;
	created_at: string;
	updated_at: string;
};

type TelemetryProviderRequestRow = {
	provider_request_id: string;
	pibo_session_id: string;
	root_session_id: string | null;
	room_id: string | null;
	turn_id: string;
	phase_id: string | null;
	provider: string;
	api: string;
	model: string;
	transport: TelemetryProviderTransport;
	service_tier: string | null;
	status: TelemetryProviderRequestStatus;
	started_at: string;
	response_headers_at: string | null;
	first_byte_at: string | null;
	last_raw_event_at: string | null;
	last_normalized_event_at: string | null;
	completed_at: string | null;
	http_status: number | null;
	upstream_response_id: string | null;
	raw_event_count: number;
	normalized_event_count: number;
	parse_error_count: number;
	unknown_event_count: number;
	bytes_received: number | null;
	event_type_counts_json: string;
	event_stream_id: number | null;
	event_id: string | null;
	payload_ref: string | null;
	error_category: string | null;
	error_message: string | null;
	capture_mode: TelemetryCaptureMode;
	retention_class: TelemetryRetentionClass;
	created_at: string;
	updated_at: string;
};

type TelemetryProviderEventRow = {
	raw_event_id: string;
	provider_request_id: string;
	pibo_session_id: string | null;
	turn_id: string | null;
	phase_id: string | null;
	sequence: number;
	received_at: string;
	event_type: string;
	byte_size: number;
	parse_status: TelemetryProviderEventParseStatus;
	normalized_type: string | null;
	event_stream_id: number | null;
	event_id: string | null;
	item_id: string | null;
	tool_call_id: string | null;
	payload_ref: string | null;
	payload_preview_ref: string | null;
	safe_fields_json: string;
	retention_class: TelemetryRetentionClass;
	created_at: string;
	updated_at: string;
};

type TelemetryToolCallRow = {
	tool_call_id: string;
	pibo_session_id: string;
	root_session_id: string | null;
	room_id: string | null;
	turn_id: string;
	provider_request_id: string | null;
	provider_item_id: string | null;
	output_index: number | null;
	tool_name: string;
	status: TelemetryToolCallStatus;
	args_started_at: string | null;
	first_delta_at: string | null;
	last_delta_at: string | null;
	args_completed_at: string | null;
	execution_started_at: string | null;
	execution_ended_at: string | null;
	duration_ms: number | null;
	args_bytes: number;
	parse_status: TelemetryToolArgsParseStatus;
	safe_arg_keys_json: string;
	event_stream_id: number | null;
	event_id: string | null;
	payload_ref: string | null;
	run_id: string | null;
	error_category: string | null;
	error_message: string | null;
	retention_class: TelemetryRetentionClass;
	created_at: string;
	updated_at: string;
};

export class TelemetryStore {
	constructor(private readonly db: DatabaseSync) {}

	upsertTurn(input: TelemetryTurnUpsertInput): StoredTelemetryTurn {
		const now = input.updatedAt ?? new Date().toISOString();
		const turnId = input.turnId ?? `turn_${randomUUID()}`;
		const existing = input.turnId ? this.getTurn(input.turnId) : undefined;
		const queuedAt = input.queuedAt ?? existing?.queuedAt ?? now;
		this.db.prepare(`
			INSERT INTO telemetry_turns (
				turn_id, pibo_session_id, root_session_id, room_id, input_event_id, event_id, event_stream_id,
				payload_ref, run_id, source, status, current_phase, queued_at, started_at, completed_at,
				last_progress_at, queued_behind, queue_depth, summary, retention_class, created_at, updated_at, metadata_json
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(turn_id) DO UPDATE SET
				pibo_session_id = excluded.pibo_session_id,
				root_session_id = COALESCE(excluded.root_session_id, telemetry_turns.root_session_id),
				room_id = COALESCE(excluded.room_id, telemetry_turns.room_id),
				input_event_id = COALESCE(excluded.input_event_id, telemetry_turns.input_event_id),
				event_id = COALESCE(excluded.event_id, telemetry_turns.event_id),
				event_stream_id = COALESCE(excluded.event_stream_id, telemetry_turns.event_stream_id),
				payload_ref = COALESCE(excluded.payload_ref, telemetry_turns.payload_ref),
				run_id = COALESCE(excluded.run_id, telemetry_turns.run_id),
				source = excluded.source,
				status = excluded.status,
				current_phase = COALESCE(excluded.current_phase, telemetry_turns.current_phase),
				started_at = COALESCE(excluded.started_at, telemetry_turns.started_at),
				completed_at = COALESCE(excluded.completed_at, telemetry_turns.completed_at),
				last_progress_at = COALESCE(excluded.last_progress_at, telemetry_turns.last_progress_at),
				queued_behind = COALESCE(excluded.queued_behind, telemetry_turns.queued_behind),
				queue_depth = COALESCE(excluded.queue_depth, telemetry_turns.queue_depth),
				summary = COALESCE(excluded.summary, telemetry_turns.summary),
				retention_class = excluded.retention_class,
				updated_at = excluded.updated_at,
				metadata_json = COALESCE(excluded.metadata_json, telemetry_turns.metadata_json)
		`).run(
			turnId,
			input.piboSessionId,
			input.rootSessionId ?? null,
			input.roomId ?? null,
			input.inputEventId ?? null,
			input.eventId ?? null,
			input.eventStreamId ?? null,
			input.payloadRef ?? null,
			input.runId ?? null,
			input.source ?? existing?.source ?? "user",
			input.status ?? existing?.status ?? "queued",
			input.currentPhase ?? null,
			queuedAt,
			input.startedAt ?? null,
			input.completedAt ?? null,
			input.lastProgressAt ?? null,
			input.queuedBehind ?? null,
			input.queueDepth ?? null,
			input.summary ?? null,
			input.retentionClass ?? existing?.retentionClass ?? "diagnostic",
			input.createdAt ?? existing?.createdAt ?? now,
			now,
			JSON.stringify(input.metadata ?? existing?.metadata ?? {}),
		);
		return this.getTurn(turnId) ?? fail(`Failed to upsert telemetry turn ${turnId}`);
	}

	upsertPhase(input: TelemetryPhaseUpsertInput): StoredTelemetryPhase {
		const now = input.updatedAt ?? new Date().toISOString();
		const phaseId = input.phaseId ?? `phase_${randomUUID()}`;
		const existing = input.phaseId ? this.getPhase(input.phaseId) : undefined;
		const startedAt = input.startedAt ?? existing?.startedAt ?? now;
		this.db.prepare(`
			INSERT INTO telemetry_phases (
				phase_id, turn_id, pibo_session_id, root_session_id, room_id, name, status, started_at, ended_at,
				last_progress_at, duration_ms, provider_request_id, tool_call_id, event_stream_id, event_id,
				payload_ref, run_id, counters_json, summary, retention_class, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(phase_id) DO UPDATE SET
				turn_id = excluded.turn_id,
				pibo_session_id = excluded.pibo_session_id,
				root_session_id = COALESCE(excluded.root_session_id, telemetry_phases.root_session_id),
				room_id = COALESCE(excluded.room_id, telemetry_phases.room_id),
				name = excluded.name,
				status = excluded.status,
				ended_at = COALESCE(excluded.ended_at, telemetry_phases.ended_at),
				last_progress_at = COALESCE(excluded.last_progress_at, telemetry_phases.last_progress_at),
				duration_ms = COALESCE(excluded.duration_ms, telemetry_phases.duration_ms),
				provider_request_id = COALESCE(excluded.provider_request_id, telemetry_phases.provider_request_id),
				tool_call_id = COALESCE(excluded.tool_call_id, telemetry_phases.tool_call_id),
				event_stream_id = COALESCE(excluded.event_stream_id, telemetry_phases.event_stream_id),
				event_id = COALESCE(excluded.event_id, telemetry_phases.event_id),
				payload_ref = COALESCE(excluded.payload_ref, telemetry_phases.payload_ref),
				run_id = COALESCE(excluded.run_id, telemetry_phases.run_id),
				counters_json = COALESCE(excluded.counters_json, telemetry_phases.counters_json),
				summary = COALESCE(excluded.summary, telemetry_phases.summary),
				retention_class = excluded.retention_class,
				updated_at = excluded.updated_at
		`).run(
			phaseId,
			input.turnId,
			input.piboSessionId,
			input.rootSessionId ?? null,
			input.roomId ?? null,
			input.name,
			input.status ?? existing?.status ?? "open",
			startedAt,
			input.endedAt ?? null,
			input.lastProgressAt ?? null,
			input.durationMs ?? null,
			input.providerRequestId ?? null,
			input.toolCallId ?? null,
			input.eventStreamId ?? null,
			input.eventId ?? null,
			input.payloadRef ?? null,
			input.runId ?? null,
			JSON.stringify(input.counters ?? existing?.counters ?? {}),
			input.summary ?? null,
			input.retentionClass ?? existing?.retentionClass ?? "diagnostic",
			input.createdAt ?? existing?.createdAt ?? now,
			now,
		);
		return this.getPhase(phaseId) ?? fail(`Failed to upsert telemetry phase ${phaseId}`);
	}

	finishPhase(phaseId: string, input: TelemetryPhaseFinishInput = {}): StoredTelemetryPhase | undefined {
		const existing = this.getPhase(phaseId);
		if (!existing) return undefined;
		const endedAt = input.endedAt ?? new Date().toISOString();
		return this.upsertPhase({
			phaseId,
			turnId: existing.turnId,
			piboSessionId: existing.piboSessionId,
			rootSessionId: existing.rootSessionId,
			roomId: existing.roomId,
			name: existing.name,
			status: input.status ?? "ok",
			endedAt,
			lastProgressAt: input.lastProgressAt ?? endedAt,
			durationMs: input.durationMs ?? Math.max(0, Date.parse(endedAt) - Date.parse(existing.startedAt)),
			summary: input.summary,
			retentionClass: existing.retentionClass,
		});
	}

	upsertProviderRequest(input: TelemetryProviderRequestUpsertInput): StoredTelemetryProviderRequest {
		const now = input.updatedAt ?? new Date().toISOString();
		const providerRequestId = input.providerRequestId ?? `pr_${randomUUID()}`;
		const existing = input.providerRequestId ? this.getProviderRequest(input.providerRequestId) : undefined;
		const startedAt = input.startedAt ?? existing?.startedAt ?? now;
		this.db.prepare(`
			INSERT INTO telemetry_provider_requests (
				provider_request_id, pibo_session_id, root_session_id, room_id, turn_id, phase_id, provider, api, model,
				transport, service_tier, status, started_at, response_headers_at, first_byte_at, last_raw_event_at,
				last_normalized_event_at, completed_at, http_status, upstream_response_id, raw_event_count,
				normalized_event_count, parse_error_count, unknown_event_count, bytes_received, event_type_counts_json,
				event_stream_id, event_id, payload_ref, error_category, error_message, capture_mode, retention_class,
				created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(provider_request_id) DO UPDATE SET
				pibo_session_id = excluded.pibo_session_id,
				root_session_id = COALESCE(excluded.root_session_id, telemetry_provider_requests.root_session_id),
				room_id = COALESCE(excluded.room_id, telemetry_provider_requests.room_id),
				turn_id = excluded.turn_id,
				phase_id = COALESCE(excluded.phase_id, telemetry_provider_requests.phase_id),
				provider = excluded.provider,
				api = excluded.api,
				model = excluded.model,
				transport = excluded.transport,
				service_tier = COALESCE(excluded.service_tier, telemetry_provider_requests.service_tier),
				status = excluded.status,
				response_headers_at = COALESCE(excluded.response_headers_at, telemetry_provider_requests.response_headers_at),
				first_byte_at = COALESCE(excluded.first_byte_at, telemetry_provider_requests.first_byte_at),
				last_raw_event_at = COALESCE(excluded.last_raw_event_at, telemetry_provider_requests.last_raw_event_at),
				last_normalized_event_at = COALESCE(excluded.last_normalized_event_at, telemetry_provider_requests.last_normalized_event_at),
				completed_at = COALESCE(excluded.completed_at, telemetry_provider_requests.completed_at),
				http_status = COALESCE(excluded.http_status, telemetry_provider_requests.http_status),
				upstream_response_id = COALESCE(excluded.upstream_response_id, telemetry_provider_requests.upstream_response_id),
				raw_event_count = excluded.raw_event_count,
				normalized_event_count = excluded.normalized_event_count,
				parse_error_count = excluded.parse_error_count,
				unknown_event_count = excluded.unknown_event_count,
				bytes_received = COALESCE(excluded.bytes_received, telemetry_provider_requests.bytes_received),
				event_type_counts_json = excluded.event_type_counts_json,
				event_stream_id = COALESCE(excluded.event_stream_id, telemetry_provider_requests.event_stream_id),
				event_id = COALESCE(excluded.event_id, telemetry_provider_requests.event_id),
				payload_ref = COALESCE(excluded.payload_ref, telemetry_provider_requests.payload_ref),
				error_category = COALESCE(excluded.error_category, telemetry_provider_requests.error_category),
				error_message = COALESCE(excluded.error_message, telemetry_provider_requests.error_message),
				capture_mode = excluded.capture_mode,
				retention_class = excluded.retention_class,
				updated_at = excluded.updated_at
		`).run(
			providerRequestId,
			input.piboSessionId,
			input.rootSessionId ?? null,
			input.roomId ?? null,
			input.turnId,
			input.phaseId ?? null,
			input.provider,
			input.api,
			input.model,
			input.transport ?? existing?.transport ?? "unknown",
			input.serviceTier ?? null,
			input.status ?? existing?.status ?? "started",
			startedAt,
			input.responseHeadersAt ?? null,
			input.firstByteAt ?? null,
			input.lastRawEventAt ?? null,
			input.lastNormalizedEventAt ?? null,
			input.completedAt ?? null,
			input.httpStatus ?? null,
			input.upstreamResponseId ?? null,
			input.rawEventCount ?? existing?.rawEventCount ?? 0,
			input.normalizedEventCount ?? existing?.normalizedEventCount ?? 0,
			input.parseErrorCount ?? existing?.parseErrorCount ?? 0,
			input.unknownEventCount ?? existing?.unknownEventCount ?? 0,
			input.bytesReceived ?? existing?.bytesReceived ?? null,
			JSON.stringify(input.eventTypeCounts ?? existing?.eventTypeCounts ?? {}),
			input.eventStreamId ?? null,
			input.eventId ?? null,
			input.payloadRef ?? null,
			input.errorCategory ?? null,
			input.errorMessage ?? null,
			input.captureMode ?? existing?.captureMode ?? "metadata_only",
			input.retentionClass ?? existing?.retentionClass ?? "diagnostic",
			input.createdAt ?? existing?.createdAt ?? now,
			now,
		);
		return this.getProviderRequest(providerRequestId) ?? fail(`Failed to upsert telemetry provider request ${providerRequestId}`);
	}

	appendProviderEventSummary(input: TelemetryProviderEventInput): StoredTelemetryProviderEvent {
		const now = input.updatedAt ?? new Date().toISOString();
		const receivedAt = input.receivedAt ?? now;
		const rawEventId = input.rawEventId ?? `raw_${randomUUID()}`;
		const existingEvent = this.getProviderEvent(rawEventId);
		const sequence = input.sequence ?? existingEvent?.sequence ?? this.nextProviderEventSequence(input.providerRequestId);
		const byteSize = input.byteSize ?? 0;
		const parseStatus = input.parseStatus ?? "ok";
		this.db.prepare(`
			INSERT INTO telemetry_provider_events (
				raw_event_id, provider_request_id, pibo_session_id, turn_id, phase_id, sequence, received_at,
				event_type, byte_size, parse_status, normalized_type, event_stream_id, event_id, item_id,
				tool_call_id, payload_ref, payload_preview_ref, safe_fields_json, retention_class, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(raw_event_id) DO UPDATE SET
				provider_request_id = excluded.provider_request_id,
				pibo_session_id = COALESCE(excluded.pibo_session_id, telemetry_provider_events.pibo_session_id),
				turn_id = COALESCE(excluded.turn_id, telemetry_provider_events.turn_id),
				phase_id = COALESCE(excluded.phase_id, telemetry_provider_events.phase_id),
				sequence = excluded.sequence,
				received_at = excluded.received_at,
				event_type = excluded.event_type,
				byte_size = excluded.byte_size,
				parse_status = excluded.parse_status,
				normalized_type = COALESCE(excluded.normalized_type, telemetry_provider_events.normalized_type),
				event_stream_id = COALESCE(excluded.event_stream_id, telemetry_provider_events.event_stream_id),
				event_id = COALESCE(excluded.event_id, telemetry_provider_events.event_id),
				item_id = COALESCE(excluded.item_id, telemetry_provider_events.item_id),
				tool_call_id = COALESCE(excluded.tool_call_id, telemetry_provider_events.tool_call_id),
				payload_ref = COALESCE(excluded.payload_ref, telemetry_provider_events.payload_ref),
				payload_preview_ref = COALESCE(excluded.payload_preview_ref, telemetry_provider_events.payload_preview_ref),
				safe_fields_json = excluded.safe_fields_json,
				retention_class = excluded.retention_class,
				updated_at = excluded.updated_at
		`).run(
			rawEventId,
			input.providerRequestId,
			input.piboSessionId ?? null,
			input.turnId ?? null,
			input.phaseId ?? null,
			sequence,
			receivedAt,
			input.eventType,
			byteSize,
			parseStatus,
			input.normalizedType ?? null,
			input.eventStreamId ?? null,
			input.eventId ?? null,
			input.itemId ?? null,
			input.toolCallId ?? null,
			input.payloadRef ?? null,
			input.payloadPreviewRef ?? null,
			JSON.stringify(input.safeFields ?? {}),
			input.retentionClass ?? "provider_event",
			input.createdAt ?? now,
			now,
		);
		if (!existingEvent) this.incrementProviderCounters(input.providerRequestId, input.eventType, receivedAt, byteSize, parseStatus, input.normalizedType ? 1 : 0);
		return this.getProviderEvent(rawEventId) ?? fail(`Failed to append telemetry provider event ${rawEventId}`);
	}

	upsertToolCall(input: TelemetryToolCallUpsertInput): StoredTelemetryToolCall {
		const now = input.updatedAt ?? new Date().toISOString();
		const existing = this.getToolCall(input.toolCallId);
		this.db.prepare(`
			INSERT INTO telemetry_tool_calls (
				tool_call_id, pibo_session_id, root_session_id, room_id, turn_id, provider_request_id, provider_item_id,
				output_index, tool_name, status, args_started_at, first_delta_at, last_delta_at, args_completed_at,
				execution_started_at, execution_ended_at, duration_ms, args_bytes, parse_status, safe_arg_keys_json,
				event_stream_id, event_id, payload_ref, run_id, error_category, error_message, retention_class, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(tool_call_id) DO UPDATE SET
				pibo_session_id = excluded.pibo_session_id,
				root_session_id = COALESCE(excluded.root_session_id, telemetry_tool_calls.root_session_id),
				room_id = COALESCE(excluded.room_id, telemetry_tool_calls.room_id),
				turn_id = excluded.turn_id,
				provider_request_id = COALESCE(excluded.provider_request_id, telemetry_tool_calls.provider_request_id),
				provider_item_id = COALESCE(excluded.provider_item_id, telemetry_tool_calls.provider_item_id),
				output_index = COALESCE(excluded.output_index, telemetry_tool_calls.output_index),
				tool_name = excluded.tool_name,
				status = excluded.status,
				args_started_at = COALESCE(excluded.args_started_at, telemetry_tool_calls.args_started_at),
				first_delta_at = COALESCE(excluded.first_delta_at, telemetry_tool_calls.first_delta_at),
				last_delta_at = COALESCE(excluded.last_delta_at, telemetry_tool_calls.last_delta_at),
				args_completed_at = COALESCE(excluded.args_completed_at, telemetry_tool_calls.args_completed_at),
				execution_started_at = COALESCE(excluded.execution_started_at, telemetry_tool_calls.execution_started_at),
				execution_ended_at = COALESCE(excluded.execution_ended_at, telemetry_tool_calls.execution_ended_at),
				duration_ms = COALESCE(excluded.duration_ms, telemetry_tool_calls.duration_ms),
				args_bytes = excluded.args_bytes,
				parse_status = excluded.parse_status,
				safe_arg_keys_json = excluded.safe_arg_keys_json,
				event_stream_id = COALESCE(excluded.event_stream_id, telemetry_tool_calls.event_stream_id),
				event_id = COALESCE(excluded.event_id, telemetry_tool_calls.event_id),
				payload_ref = COALESCE(excluded.payload_ref, telemetry_tool_calls.payload_ref),
				run_id = COALESCE(excluded.run_id, telemetry_tool_calls.run_id),
				error_category = COALESCE(excluded.error_category, telemetry_tool_calls.error_category),
				error_message = COALESCE(excluded.error_message, telemetry_tool_calls.error_message),
				retention_class = excluded.retention_class,
				updated_at = excluded.updated_at
		`).run(
			input.toolCallId,
			input.piboSessionId,
			input.rootSessionId ?? null,
			input.roomId ?? null,
			input.turnId,
			input.providerRequestId ?? null,
			input.providerItemId ?? null,
			input.outputIndex ?? null,
			input.toolName,
			input.status ?? existing?.status ?? "args_started",
			input.argsStartedAt ?? null,
			input.firstDeltaAt ?? null,
			input.lastDeltaAt ?? null,
			input.argsCompletedAt ?? null,
			input.executionStartedAt ?? null,
			input.executionEndedAt ?? null,
			input.durationMs ?? null,
			input.argsBytes ?? existing?.argsBytes ?? 0,
			input.parseStatus ?? existing?.parseStatus ?? "empty",
			JSON.stringify(input.safeArgKeys ?? existing?.safeArgKeys ?? []),
			input.eventStreamId ?? null,
			input.eventId ?? null,
			input.payloadRef ?? null,
			input.runId ?? null,
			input.errorCategory ?? null,
			input.errorMessage ?? null,
			input.retentionClass ?? existing?.retentionClass ?? "diagnostic",
			input.createdAt ?? existing?.createdAt ?? now,
			now,
		);
		return this.getToolCall(input.toolCallId) ?? fail(`Failed to upsert telemetry tool call ${input.toolCallId}`);
	}

	getTurn(turnId: string): StoredTelemetryTurn | undefined {
		const row = this.db.prepare("SELECT * FROM telemetry_turns WHERE turn_id = ?").get(turnId) as TelemetryTurnRow | undefined;
		return row ? turnFromRow(row) : undefined;
	}

	getPhase(phaseId: string): StoredTelemetryPhase | undefined {
		const row = this.db.prepare("SELECT * FROM telemetry_phases WHERE phase_id = ?").get(phaseId) as TelemetryPhaseRow | undefined;
		return row ? phaseFromRow(row) : undefined;
	}

	getProviderRequest(providerRequestId: string): StoredTelemetryProviderRequest | undefined {
		const row = this.db.prepare("SELECT * FROM telemetry_provider_requests WHERE provider_request_id = ?").get(providerRequestId) as TelemetryProviderRequestRow | undefined;
		return row ? providerRequestFromRow(row) : undefined;
	}

	getProviderEvent(rawEventId: string): StoredTelemetryProviderEvent | undefined {
		const row = this.db.prepare("SELECT * FROM telemetry_provider_events WHERE raw_event_id = ?").get(rawEventId) as TelemetryProviderEventRow | undefined;
		return row ? providerEventFromRow(row) : undefined;
	}

	listProviderEvents(providerRequestId: string, input: { afterSequence?: number; limit?: number } = {}): StoredTelemetryProviderEvent[] {
		const limit = clampLimit(input.limit ?? 20, 1, 200);
		const rows = this.db.prepare(`
			SELECT * FROM telemetry_provider_events
			WHERE provider_request_id = ? AND sequence > ?
			ORDER BY sequence ASC
			LIMIT ?
		`).all(providerRequestId, input.afterSequence ?? -1, limit) as TelemetryProviderEventRow[];
		return rows.map(providerEventFromRow);
	}

	getToolCall(toolCallId: string): StoredTelemetryToolCall | undefined {
		const row = this.db.prepare("SELECT * FROM telemetry_tool_calls WHERE tool_call_id = ?").get(toolCallId) as TelemetryToolCallRow | undefined;
		return row ? toolCallFromRow(row) : undefined;
	}

	getPayloadPreview(_previewRef: string, _maxBytes = 2048): TelemetryPreviewUnavailableResult {
		return {
			status: "disabled",
			reason: "preview_capture_disabled",
			captureMode: "disabled",
			message: "Telemetry payload previews are disabled in V1; summaries store metadata and links only.",
		};
	}

	private nextProviderEventSequence(providerRequestId: string): number {
		const row = this.db.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM telemetry_provider_events WHERE provider_request_id = ?").get(providerRequestId) as { next_sequence: number };
		return row.next_sequence;
	}

	private incrementProviderCounters(providerRequestId: string, eventType: string, receivedAt: string, byteSize: number, parseStatus: TelemetryProviderEventParseStatus, normalizedDelta: number): void {
		const existing = this.getProviderRequest(providerRequestId);
		if (!existing) return;
		const eventTypeCounts = { ...existing.eventTypeCounts };
		const currentCount = typeof eventTypeCounts[eventType] === "number" ? eventTypeCounts[eventType] : 0;
		eventTypeCounts[eventType] = currentCount + 1;
		this.upsertProviderRequest({
			providerRequestId,
			piboSessionId: existing.piboSessionId,
			rootSessionId: existing.rootSessionId,
			roomId: existing.roomId,
			turnId: existing.turnId,
			phaseId: existing.phaseId,
			provider: existing.provider,
			api: existing.api,
			model: existing.model,
			transport: existing.transport,
			serviceTier: existing.serviceTier,
			status: existing.status,
			lastRawEventAt: receivedAt,
			rawEventCount: existing.rawEventCount + 1,
			normalizedEventCount: existing.normalizedEventCount + normalizedDelta,
			parseErrorCount: existing.parseErrorCount + (parseStatus === "invalid_json" ? 1 : 0),
			unknownEventCount: existing.unknownEventCount + (parseStatus === "unknown_type" ? 1 : 0),
			bytesReceived: (existing.bytesReceived ?? 0) + byteSize,
			eventTypeCounts,
			captureMode: existing.captureMode,
			retentionClass: existing.retentionClass,
		});
	}
}

export class BestEffortTelemetryService {
	constructor(private readonly store?: TelemetryStore, private readonly onError?: (error: unknown) => void) {}

	upsertTurn(input: TelemetryTurnUpsertInput): StoredTelemetryTurn | undefined {
		return this.safe(() => this.store?.upsertTurn(input));
	}

	upsertPhase(input: TelemetryPhaseUpsertInput): StoredTelemetryPhase | undefined {
		return this.safe(() => this.store?.upsertPhase(input));
	}

	finishPhase(phaseId: string, input: TelemetryPhaseFinishInput = {}): StoredTelemetryPhase | undefined {
		return this.safe(() => this.store?.finishPhase(phaseId, input));
	}

	upsertProviderRequest(input: TelemetryProviderRequestUpsertInput): StoredTelemetryProviderRequest | undefined {
		return this.safe(() => this.store?.upsertProviderRequest(input));
	}

	appendProviderEventSummary(input: TelemetryProviderEventInput): StoredTelemetryProviderEvent | undefined {
		return this.safe(() => this.store?.appendProviderEventSummary(input));
	}

	upsertToolCall(input: TelemetryToolCallUpsertInput): StoredTelemetryToolCall | undefined {
		return this.safe(() => this.store?.upsertToolCall(input));
	}

	private safe<T>(action: () => T): T | undefined {
		try {
			return action();
		} catch (error) {
			this.onError?.(error);
			return undefined;
		}
	}
}

function turnFromRow(row: TelemetryTurnRow): StoredTelemetryTurn {
	return {
		turnId: row.turn_id,
		piboSessionId: row.pibo_session_id,
		rootSessionId: row.root_session_id ?? undefined,
		roomId: row.room_id ?? undefined,
		inputEventId: row.input_event_id ?? undefined,
		eventId: row.event_id ?? undefined,
		eventStreamId: row.event_stream_id ?? undefined,
		payloadRef: row.payload_ref ?? undefined,
		runId: row.run_id ?? undefined,
		source: row.source,
		status: row.status,
		currentPhase: row.current_phase ?? undefined,
		queuedAt: row.queued_at,
		startedAt: row.started_at ?? undefined,
		completedAt: row.completed_at ?? undefined,
		lastProgressAt: row.last_progress_at ?? undefined,
		queuedBehind: row.queued_behind ?? undefined,
		queueDepth: row.queue_depth ?? undefined,
		summary: row.summary ?? undefined,
		retentionClass: row.retention_class,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		metadata: parseJsonObject(row.metadata_json),
	};
}

function phaseFromRow(row: TelemetryPhaseRow): StoredTelemetryPhase {
	return {
		phaseId: row.phase_id,
		turnId: row.turn_id,
		piboSessionId: row.pibo_session_id,
		rootSessionId: row.root_session_id ?? undefined,
		roomId: row.room_id ?? undefined,
		name: row.name,
		status: row.status,
		startedAt: row.started_at,
		endedAt: row.ended_at ?? undefined,
		lastProgressAt: row.last_progress_at ?? undefined,
		durationMs: row.duration_ms ?? undefined,
		providerRequestId: row.provider_request_id ?? undefined,
		toolCallId: row.tool_call_id ?? undefined,
		eventStreamId: row.event_stream_id ?? undefined,
		eventId: row.event_id ?? undefined,
		payloadRef: row.payload_ref ?? undefined,
		runId: row.run_id ?? undefined,
		counters: parseJsonObject(row.counters_json),
		summary: row.summary ?? undefined,
		retentionClass: row.retention_class,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function providerRequestFromRow(row: TelemetryProviderRequestRow): StoredTelemetryProviderRequest {
	return {
		providerRequestId: row.provider_request_id,
		piboSessionId: row.pibo_session_id,
		rootSessionId: row.root_session_id ?? undefined,
		roomId: row.room_id ?? undefined,
		turnId: row.turn_id,
		phaseId: row.phase_id ?? undefined,
		provider: row.provider,
		api: row.api,
		model: row.model,
		transport: row.transport,
		serviceTier: row.service_tier ?? undefined,
		status: row.status,
		startedAt: row.started_at,
		responseHeadersAt: row.response_headers_at ?? undefined,
		firstByteAt: row.first_byte_at ?? undefined,
		lastRawEventAt: row.last_raw_event_at ?? undefined,
		lastNormalizedEventAt: row.last_normalized_event_at ?? undefined,
		completedAt: row.completed_at ?? undefined,
		httpStatus: row.http_status ?? undefined,
		upstreamResponseId: row.upstream_response_id ?? undefined,
		rawEventCount: row.raw_event_count,
		normalizedEventCount: row.normalized_event_count,
		parseErrorCount: row.parse_error_count,
		unknownEventCount: row.unknown_event_count,
		bytesReceived: row.bytes_received ?? undefined,
		eventTypeCounts: parseJsonObject(row.event_type_counts_json),
		eventStreamId: row.event_stream_id ?? undefined,
		eventId: row.event_id ?? undefined,
		payloadRef: row.payload_ref ?? undefined,
		errorCategory: row.error_category ?? undefined,
		errorMessage: row.error_message ?? undefined,
		captureMode: row.capture_mode,
		retentionClass: row.retention_class,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function providerEventFromRow(row: TelemetryProviderEventRow): StoredTelemetryProviderEvent {
	return {
		rawEventId: row.raw_event_id,
		providerRequestId: row.provider_request_id,
		piboSessionId: row.pibo_session_id ?? undefined,
		turnId: row.turn_id ?? undefined,
		phaseId: row.phase_id ?? undefined,
		sequence: row.sequence,
		receivedAt: row.received_at,
		eventType: row.event_type,
		byteSize: row.byte_size,
		parseStatus: row.parse_status,
		normalizedType: row.normalized_type ?? undefined,
		eventStreamId: row.event_stream_id ?? undefined,
		eventId: row.event_id ?? undefined,
		itemId: row.item_id ?? undefined,
		toolCallId: row.tool_call_id ?? undefined,
		payloadRef: row.payload_ref ?? undefined,
		payloadPreviewRef: row.payload_preview_ref ?? undefined,
		safeFields: parseJsonObject(row.safe_fields_json),
		retentionClass: row.retention_class,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toolCallFromRow(row: TelemetryToolCallRow): StoredTelemetryToolCall {
	return {
		toolCallId: row.tool_call_id,
		piboSessionId: row.pibo_session_id,
		rootSessionId: row.root_session_id ?? undefined,
		roomId: row.room_id ?? undefined,
		turnId: row.turn_id,
		providerRequestId: row.provider_request_id ?? undefined,
		providerItemId: row.provider_item_id ?? undefined,
		outputIndex: row.output_index ?? undefined,
		toolName: row.tool_name,
		status: row.status,
		argsStartedAt: row.args_started_at ?? undefined,
		firstDeltaAt: row.first_delta_at ?? undefined,
		lastDeltaAt: row.last_delta_at ?? undefined,
		argsCompletedAt: row.args_completed_at ?? undefined,
		executionStartedAt: row.execution_started_at ?? undefined,
		executionEndedAt: row.execution_ended_at ?? undefined,
		durationMs: row.duration_ms ?? undefined,
		argsBytes: row.args_bytes,
		parseStatus: row.parse_status,
		safeArgKeys: parseStringArray(row.safe_arg_keys_json),
		eventStreamId: row.event_stream_id ?? undefined,
		eventId: row.event_id ?? undefined,
		payloadRef: row.payload_ref ?? undefined,
		runId: row.run_id ?? undefined,
		errorCategory: row.error_category ?? undefined,
		errorMessage: row.error_message ?? undefined,
		retentionClass: row.retention_class,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function parseJsonObject(text: string): PiboJsonObject {
	const parsed = JSON.parse(text) as unknown;
	return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as PiboJsonObject) : {};
}

function parseStringArray(text: string): string[] {
	const parsed = JSON.parse(text) as unknown;
	return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
}

function clampLimit(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, max));
}

function fail(message: string): never {
	throw new Error(message);
}
