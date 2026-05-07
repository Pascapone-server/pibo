import { performance } from "node:perf_hooks";
import { createPiboSignalRegistry } from "../dist/signals/registry.js";

function session(id, parentId) {
	return {
		id,
		piSessionId: `pi-${id}`,
		channel: "bench",
		kind: parentId ? "subagent" : "runtime",
		profile: "bench",
		parentId,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

function time(label, fn) {
	const start = performance.now();
	const result = fn();
	const durationMs = performance.now() - start;
	console.log(`${label}: ${durationMs.toFixed(2)}ms`);
	return result;
}

const depth = Number(process.env.PIBO_SIGNAL_BENCH_DEPTH ?? 100);
const toolUpdates = Number(process.env.PIBO_SIGNAL_BENCH_TOOL_UPDATES ?? 1000);
const registry = createPiboSignalRegistry();

time(`create ${depth}-deep session tree`, () => {
	let parentId;
	for (let index = 0; index < depth; index += 1) {
		const id = index === 0 ? "root" : `s${index}`;
		registry.project({ type: "session_created", session: session(id, parentId) });
		parentId = id;
	}
});

const leafId = depth === 1 ? "root" : `s${depth - 1}`;

time(`start one leaf tool and propagate through ${depth} ancestors`, () => {
	registry.project({ type: "pibo_output", event: { type: "tool_execution_started", piboSessionId: leafId, toolCallId: "tc-leaf", toolName: "bash" } });
});

time(`${toolUpdates} identical queue updates`, () => {
	for (let index = 0; index < toolUpdates; index += 1) registry.project({ type: "queue_changed", piboSessionId: leafId, queuedMessages: 1 });
});

time(`${toolUpdates} tool metadata updates`, () => {
	for (let index = 0; index < toolUpdates; index += 1) registry.project({ type: "pibo_output", event: { type: "tool_execution_updated", piboSessionId: leafId, toolCallId: "tc-leaf", toolName: `tool-${index}` } });
});
