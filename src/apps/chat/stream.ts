import type { PiboOutputEvent } from "../../core/events.js";

export type ChatStreamEvent =
	| { type: "ready"; piboSessionId: string }
	| { type: "RUN_STARTED"; runId: string; input?: { text?: string; source?: string } }
	| { type: "RUN_FINISHED"; runId: string }
	| { type: "RUN_ERROR"; runId?: string; message: string }
	| { type: "TEXT_MESSAGE_START"; messageId: string; role: "assistant" }
	| { type: "TEXT_MESSAGE_CONTENT"; messageId: string; delta: string }
	| { type: "TEXT_MESSAGE_END"; messageId: string; finalText?: string }
	| { type: "REASONING_MESSAGE_START"; messageId: string }
	| { type: "REASONING_MESSAGE_CONTENT"; messageId: string; delta: string }
	| { type: "REASONING_MESSAGE_END"; messageId: string; finalText?: string }
	| { type: "TOOL_CALL_START"; toolCallId: string; toolName: string; args?: unknown; runId?: string }
	| { type: "TOOL_CALL_ARGS"; toolCallId: string; args: unknown; argsComplete: boolean }
	| { type: "TOOL_CALL_RESULT"; toolCallId: string; result: unknown; isError: boolean }
	| { type: "AGENT_DELEGATION"; toolCallId?: string; toolName: string; subagentName: string; childPiboSessionId: string; threadKey?: string }
	| { type: "EXECUTION_RESULT"; runId?: string; action: string; result: unknown }
	| { type: "RAW_EVENT"; event: PiboOutputEvent };

export type ChatStreamState = {
	textMessageIds: Set<string>;
	reasoningMessageIds: Set<string>;
	toolCallIds: Set<string>;
};

export function createChatStreamState(): ChatStreamState {
	return {
		textMessageIds: new Set(),
		reasoningMessageIds: new Set(),
		toolCallIds: new Set(),
	};
}

export function chatStreamFramesFromOutputEvent(event: PiboOutputEvent, state: ChatStreamState): ChatStreamEvent[] {
	const eventId = "eventId" in event && typeof event.eventId === "string" ? event.eventId : undefined;
	const frames: ChatStreamEvent[] = [];

	switch (event.type) {
		case "message_started":
			if (eventId) {
				frames.push({
					type: "RUN_STARTED",
					runId: eventId,
					input: { text: event.text, source: event.source },
				});
			}
			break;
		case "message_finished":
			if (eventId) frames.push({ type: "RUN_FINISHED", runId: eventId });
			break;
		case "assistant_delta":
			if (eventId && event.text.length > 0) {
				ensureTextMessageStarted(frames, state, eventId);
				frames.push({ type: "TEXT_MESSAGE_CONTENT", messageId: eventId, delta: event.text });
			}
			break;
		case "assistant_message":
			if (eventId) {
				ensureTextMessageStarted(frames, state, eventId);
				frames.push({ type: "TEXT_MESSAGE_END", messageId: eventId, finalText: event.text });
			}
			break;
		case "thinking_started":
			if (eventId) ensureReasoningStarted(frames, state, eventId);
			break;
		case "thinking_delta":
			if (eventId && event.text.length > 0) {
				ensureReasoningStarted(frames, state, eventId);
				frames.push({ type: "REASONING_MESSAGE_CONTENT", messageId: eventId, delta: event.text });
			}
			break;
		case "thinking_finished":
			if (eventId) {
				ensureReasoningStarted(frames, state, eventId);
				frames.push({ type: "REASONING_MESSAGE_END", messageId: eventId, finalText: event.text });
			}
			break;
		case "tool_call":
			ensureToolCallStarted(frames, state, event.toolCallId, event.toolName, event.args, eventId);
			frames.push({ type: "TOOL_CALL_ARGS", toolCallId: event.toolCallId, args: event.args, argsComplete: event.argsComplete });
			break;
		case "tool_execution_started":
			ensureToolCallStarted(frames, state, event.toolCallId, event.toolName, event.args, eventId);
			break;
		case "tool_execution_updated":
			ensureToolCallStarted(frames, state, event.toolCallId, event.toolName, event.args, eventId);
			break;
		case "tool_execution_finished":
			ensureToolCallStarted(frames, state, event.toolCallId, event.toolName, undefined, eventId);
			frames.push({ type: "TOOL_CALL_RESULT", toolCallId: event.toolCallId, result: event.result, isError: event.isError });
			break;
		case "subagent_session":
			frames.push({
				type: "AGENT_DELEGATION",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				subagentName: event.subagentName,
				childPiboSessionId: event.childPiboSessionId,
				threadKey: event.threadKey,
			});
			break;
		case "execution_result":
			frames.push({ type: "EXECUTION_RESULT", runId: eventId, action: event.action, result: event.result });
			break;
		case "session_error":
			frames.push({ type: "RUN_ERROR", runId: eventId, message: event.error });
			break;
		default:
			frames.push({ type: "RAW_EVENT", event });
			break;
	}

	return frames;
}

function ensureTextMessageStarted(frames: ChatStreamEvent[], state: ChatStreamState, messageId: string): void {
	if (state.textMessageIds.has(messageId)) return;
	state.textMessageIds.add(messageId);
	frames.push({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
}

function ensureReasoningStarted(frames: ChatStreamEvent[], state: ChatStreamState, messageId: string): void {
	if (state.reasoningMessageIds.has(messageId)) return;
	state.reasoningMessageIds.add(messageId);
	frames.push({ type: "REASONING_MESSAGE_START", messageId });
}

function ensureToolCallStarted(
	frames: ChatStreamEvent[],
	state: ChatStreamState,
	toolCallId: string,
	toolName: string,
	args: unknown,
	runId?: string,
): void {
	if (state.toolCallIds.has(toolCallId)) return;
	state.toolCallIds.add(toolCallId);
	frames.push({ type: "TOOL_CALL_START", toolCallId, toolName, args, runId });
}
