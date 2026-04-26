import { StringEnum, Type } from "@mariozechner/pi-ai";
import { defineTool, type ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { SubagentProfile } from "../core/profiles.js";
import type {
	PiboRunCompletionPolicy,
	PiboRunReadResult,
	PiboRunWaitResult,
	PiboSubagentRunSnapshot,
} from "./registry.js";

export type PiboRunStartSubagentInput = {
	subagent: SubagentProfile;
	message: string;
	threadKey?: string;
	completionPolicy?: PiboRunCompletionPolicy;
};

export type PiboRunToolController = {
	startSubagent(input: PiboRunStartSubagentInput): Promise<PiboSubagentRunSnapshot>;
	listRuns(options?: { includeConsumed?: boolean; includeDetached?: boolean }): PiboSubagentRunSnapshot[];
	getRunStatus(runId: string): PiboSubagentRunSnapshot;
	waitForRun(runId: string, timeoutMs: number): Promise<PiboRunWaitResult>;
	readRun(runId: string): PiboRunReadResult;
	cancelRun(runId: string): Promise<PiboSubagentRunSnapshot>;
	ackRun(runId: string): PiboSubagentRunSnapshot;
};

function requireSubagent(subagents: readonly SubagentProfile[], name: string): SubagentProfile {
	const subagent = subagents.find((candidate) => candidate.name === name && candidate.enabled !== false);
	if (!subagent) {
		throw new Error(`Unknown or disabled subagent "${name}"`);
	}
	return subagent;
}

function resultText(prefix: string, value: unknown): string {
	return `${prefix}\n${JSON.stringify(value, null, 2)}`;
}

export function createRunToolDefinitions(
	subagents: readonly SubagentProfile[],
	controller: PiboRunToolController,
): ToolDefinition[] {
	const subagentNames = subagents
		.filter((subagent) => subagent.enabled !== false)
		.map((subagent) => subagent.name);

	return [
		defineTool({
			name: "pibo_subagent_start",
			label: "Pibo Subagent Start",
			description:
				"Start a subagent as a yielded run. Use tracked when the result may matter later; use detached only for intentional fire-and-forget work.",
			promptSnippet:
				"Use pibo_subagent_start for long-running subagent work. It returns a runId. Use pibo_run_read for completed results and pibo_run_wait/status/list/cancel/ack to manage runs.",
			executionMode: "parallel",
			parameters: Type.Object({
				subagentName: StringEnum(subagentNames, { description: "Visible subagent name to start" }),
				message: Type.String({ description: "Message to send to the subagent" }),
				threadKey: Type.Optional(
					Type.String({
						description:
							"Stable key for continuing a previous subagent conversation. Omit it to create a new subagent session.",
					}),
				),
				completionPolicy: Type.Optional(
					StringEnum(["tracked", "detached"], {
						description:
							"tracked reminds this agent about completion; detached is fire-and-forget and creates no automatic reminders.",
						default: "tracked",
					}),
				),
			}),
			async execute(_toolCallId, params) {
				const run = await controller.startSubagent({
					subagent: requireSubagent(subagents, params.subagentName),
					message: params.message,
					threadKey: params.threadKey,
					completionPolicy: params.completionPolicy as PiboRunCompletionPolicy | undefined,
				});
				return {
					content: [{ type: "text", text: resultText(`Started subagent run ${run.runId}.`, run) }],
					details: run,
				};
			},
		}),
		defineTool({
			name: "pibo_run_list",
			label: "Pibo Run List",
			description: "List yielded runs owned by this agent session.",
			promptSnippet: "Use pibo_run_list to inspect yielded runs owned by this session.",
			executionMode: "parallel",
			parameters: Type.Object({
				includeConsumed: Type.Optional(Type.Boolean({ description: "Include already read, cancelled, or acknowledged runs" })),
				includeDetached: Type.Optional(Type.Boolean({ description: "Include fire-and-forget detached runs" })),
			}),
			async execute(_toolCallId, params) {
				const runs = controller.listRuns({
					includeConsumed: params.includeConsumed,
					includeDetached: params.includeDetached,
				});
				return {
					content: [{ type: "text", text: resultText("Runs:", { runs }) }],
					details: { runs },
				};
			},
		}),
		defineTool({
			name: "pibo_run_status",
			label: "Pibo Run Status",
			description: "Read compact status for one yielded run.",
			promptSnippet: "Use pibo_run_status to inspect one yielded run without reading its full result.",
			executionMode: "parallel",
			parameters: Type.Object({
				runId: Type.String({ description: "Run id returned by pibo_subagent_start" }),
			}),
			async execute(_toolCallId, params) {
				const run = controller.getRunStatus(params.runId);
				return {
					content: [{ type: "text", text: resultText(`Run ${run.runId} status: ${run.status}.`, run) }],
					details: run,
				};
			},
		}),
		defineTool({
			name: "pibo_run_wait",
			label: "Pibo Run Wait",
			description: "Wait a bounded time for a yielded run. Timeout is normal and does not mean failure.",
			promptSnippet: "Use pibo_run_wait when blocked on a run. Timeout is normal; call again or continue other work.",
			executionMode: "parallel",
			parameters: Type.Object({
				runId: Type.String({ description: "Run id returned by pibo_subagent_start" }),
				timeoutMs: Type.Optional(Type.Number({ description: "Maximum wait time in milliseconds, clamped to 300000" })),
			}),
			async execute(_toolCallId, params) {
				const run = await controller.waitForRun(params.runId, params.timeoutMs ?? 30000);
				return {
					content: [
						{
							type: "text",
							text: resultText(
								run.timedOut
									? `Run ${run.runId} is still ${run.status}; wait timed out.`
									: `Run ${run.runId} reached ${run.status}.`,
								run,
							),
						},
					],
					details: run,
				};
			},
		}),
		defineTool({
			name: "pibo_run_read",
			label: "Pibo Run Read",
			description: "Read the terminal result or error for a yielded run.",
			promptSnippet: "Use pibo_run_read to retrieve a completed or failed run result. Reading terminal tracked runs consumes reminders.",
			executionMode: "parallel",
			parameters: Type.Object({
				runId: Type.String({ description: "Run id returned by pibo_subagent_start" }),
			}),
			async execute(_toolCallId, params) {
				const run = controller.readRun(params.runId);
				const text = run.result?.text ?? run.error ?? `Run ${run.runId} is ${run.status}; no terminal result is available yet.`;
				return {
					content: [{ type: "text", text }],
					details: run,
				};
			},
		}),
		defineTool({
			name: "pibo_run_cancel",
			label: "Pibo Run Cancel",
			description: "Cancel a yielded run if possible and suppress future reminders.",
			promptSnippet: "Use pibo_run_cancel when a yielded run is no longer needed.",
			executionMode: "parallel",
			parameters: Type.Object({
				runId: Type.String({ description: "Run id returned by pibo_subagent_start" }),
			}),
			async execute(_toolCallId, params) {
				const run = await controller.cancelRun(params.runId);
				return {
					content: [{ type: "text", text: resultText(`Cancelled run ${run.runId}.`, run) }],
					details: run,
				};
			},
		}),
		defineTool({
			name: "pibo_run_ack",
			label: "Pibo Run Ack",
			description: "Acknowledge a yielded run update and suppress reminders for its current state.",
			promptSnippet:
				"Use pibo_run_ack when you intentionally do not need to read a completed result or do not need more reminders for the current running state.",
			executionMode: "parallel",
			parameters: Type.Object({
				runId: Type.String({ description: "Run id returned by pibo_subagent_start" }),
			}),
			async execute(_toolCallId, params) {
				const run = controller.ackRun(params.runId);
				return {
					content: [{ type: "text", text: resultText(`Acknowledged run ${run.runId}.`, run) }],
					details: run,
				};
			},
		}),
	];
}
