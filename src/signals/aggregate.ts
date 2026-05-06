import type {
	PiboSessionSignalSnapshot,
	PiboSignalError,
	PiboSignalNode,
	PiboSignalStatus,
} from "./types.js";

const ACTIVE_STATUSES = new Set(["queued", "starting", "running", "streaming", "waiting", "blocked", "retrying", "compacting", "pausing"]);
const TERMINAL_STATUSES = new Set(["done", "error", "cancelled", "disposed", "interrupted"]);

export function isActiveSignalStatus(status: PiboSignalStatus): boolean {
	return ACTIVE_STATUSES.has(status);
}

export function isTerminalSignalStatus(status: PiboSignalStatus): boolean {
	return TERMINAL_STATUSES.has(status);
}

export function rankStatus(status: PiboSignalStatus): number {
	switch (status) {
		case "blocked": return 90;
		case "retrying": return 80;
		case "compacting": return 75;
		case "streaming": return 70;
		case "running": return 60;
		case "starting": return 55;
		case "waiting": return 50;
		case "queued": return 40;
		case "pausing": return 35;
		case "paused": return 20;
		case "unknown": return 10;
		case "idle": return 0;
		default: return isActiveSignalStatus(status) ? 45 : 5;
	}
}

export function strongestStatus(statuses: PiboSignalStatus[], fallback: PiboSignalStatus = "idle"): PiboSignalStatus {
	let best = fallback;
	let bestRank = rankStatus(fallback);
	for (const status of statuses) {
		const rank = rankStatus(status);
		if (rank > bestRank) {
			best = status;
			bestRank = rank;
		}
	}
	return best;
}

export function phaseForStatus(status: PiboSignalStatus, nodes: PiboSignalNode[]): PiboSessionSignalSnapshot["phase"] {
	if (status === "blocked") return "blocked";
	if (status === "retrying") return "retry";
	if (status === "compacting") return "compaction";
	if (status === "streaming") return "streaming";
	if (nodes.some((node) => isActiveSignalStatus(node.status) && node.kind === "tool_call")) return "tools";
	if (nodes.some((node) => isActiveSignalStatus(node.status) && node.kind === "subagent_session")) return "subagent";
	if (nodes.some((node) => isActiveSignalStatus(node.status) && node.kind === "yielded_run")) return "run";
	if (status === "queued") return "queued";
	if (status === "running" || status === "starting" || status === "waiting") return "prompting";
	return undefined;
}

export function errorFromNode(node: PiboSignalNode): PiboSignalError | undefined {
	if (node.error) return node.error;
	if (node.status !== "error") return undefined;
	return { message: `${node.kind} failed.`, source: "unknown" };
}
