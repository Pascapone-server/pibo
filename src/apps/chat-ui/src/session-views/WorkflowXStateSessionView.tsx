import type { ReactNode } from "react";
import { Activity, AlertTriangle, CheckCircle2, Circle, Clock3, GitBranch, Layers3, Route, XCircle } from "lucide-react";
import { JsonRenderer } from "../tracing/JsonRenderer";
import type { PiboProjectSession, PiboSessionTraceView, PiboWebSessionStatus } from "../types";
import type { ChatSessionViewProps } from "./types";

type WorkflowNodeStatus = "idle" | "active" | "waiting" | "completed" | "failed" | "cancelled";

type WorkflowVisualNode = {
	id: string;
	label: string;
	kind: string;
	status: WorkflowNodeStatus;
	description: string;
};

type WorkflowVisualEdge = {
	id: string;
	source: string;
	target: string;
	label: string;
};

export function WorkflowXStateSessionView({
	traceView,
	isLoading,
	selectedSessionStatus,
	selectedSessionSignal,
	workflowProjectSession,
}: ChatSessionViewProps) {
	const workflowModel = workflowProjectSession ? createProjectSessionWorkflowModel(workflowProjectSession, traceView, selectedSessionStatus) : null;

	if (!workflowModel) {
		return (
			<section className="min-w-0 flex-1 overflow-auto bg-[#0b0f14] p-4 text-slate-300">
				<div className="mx-auto flex max-w-4xl flex-col gap-4">
					<div className="rounded-sm border border-slate-800 bg-[#111820] p-4">
						<div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
							<Layers3 size={16} className="text-[#11a4d4]" />
							Workflow / XState
						</div>
						<p className="mt-2 text-sm text-slate-400">
							{isLoading ? "Loading session trace…" : "This session is not linked to a workflow run, so no Workflow/XState projection is available."}
						</p>
					</div>
				</div>
			</section>
		);
	}

	return (
		<section className="min-w-0 flex-1 overflow-auto bg-[#0b0f14] p-4 text-slate-300">
			<div className="mx-auto flex max-w-6xl flex-col gap-4">
				<WorkflowSummaryCard model={workflowModel} />
				<WorkflowGraph nodes={workflowModel.nodes} edges={workflowModel.edges} />
				<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
					<WorkflowRuntimeSnapshot model={workflowModel} />
					<WorkflowProjectionFacts model={workflowModel} />
				</div>
			</div>
		</section>
	);
}

type WorkflowProjectSessionUiModel = {
	workflowId: string;
	workflowRunId?: string;
	piboSessionId: string;
	state: string;
	status: WorkflowNodeStatus;
	traceTitle?: string;
	traceVersion?: string;
	latestStreamId?: number;
	nodes: WorkflowVisualNode[];
	edges: WorkflowVisualEdge[];
	snapshot: Record<string, unknown>;
};

function WorkflowSummaryCard({ model }: { model: WorkflowProjectSessionUiModel }) {
	return (
		<div className="rounded-sm border border-slate-800 bg-[#111820] p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
						<Layers3 size={16} className="text-[#11a4d4]" />
						Workflow / XState Projection
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
						<WorkflowBadge tone="blue">{model.workflowId}</WorkflowBadge>
						{model.workflowRunId ? <WorkflowBadge tone="slate">run {shortWorkflowValue(model.workflowRunId)}</WorkflowBadge> : null}
						<WorkflowBadge tone={badgeToneForStatus(model.status)}>{model.state}</WorkflowBadge>
					</div>
				</div>
				<div className="min-w-0 text-right font-mono text-[11px] text-slate-500">
					<div className="truncate">session {shortWorkflowValue(model.piboSessionId)}</div>
					{model.latestStreamId !== undefined ? <div>stream {model.latestStreamId}</div> : null}
				</div>
			</div>
			<p className="mt-3 text-sm text-slate-400">
				Dedicated workflow visualization surface. This V1 view derives the current XState-style UI snapshot from project-session workflow linkage and live session state while keeping kernel records as durable truth.
			</p>
		</div>
	);
}

function WorkflowGraph({ nodes, edges }: { nodes: WorkflowVisualNode[]; edges: WorkflowVisualEdge[] }) {
	return (
		<div className="rounded-sm border border-slate-800 bg-[#0f171e] p-4">
			<div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
				<Route size={14} />
				Visual State Flow
			</div>
			<div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
				{nodes.map((node, index) => (
					<WorkflowGraphItem key={node.id} node={node} edge={edges[index]} />
				))}
			</div>
		</div>
	);
}

function WorkflowGraphItem({ node, edge }: { node: WorkflowVisualNode; edge?: WorkflowVisualEdge }) {
	return (
		<>
			<div className={`rounded-sm border p-3 ${nodeCardClass(node.status)}`}>
				<div className="flex items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-2">
						<WorkflowStatusIcon status={node.status} />
						<div className="min-w-0 truncate text-sm font-semibold text-slate-100">{node.label}</div>
					</div>
					<span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">{node.kind}</span>
				</div>
				<p className="mt-2 text-xs text-slate-400">{node.description}</p>
			</div>
			{edge ? (
				<div className="hidden items-center justify-center text-center text-[10px] uppercase tracking-wide text-slate-500 md:flex">
					<div>
						<GitBranch size={14} className="mx-auto mb-1 text-[#11a4d4]" />
						{edge.label}
					</div>
				</div>
			) : null}
		</>
	);
}

function WorkflowRuntimeSnapshot({ model }: { model: WorkflowProjectSessionUiModel }) {
	return (
		<div className="rounded-sm border border-slate-800 bg-[#111820] p-4">
			<div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
				<Activity size={14} />
				Current UI Snapshot
			</div>
			<JsonRenderer value={model.snapshot} showControls={false} />
		</div>
	);
}

function WorkflowProjectionFacts({ model }: { model: WorkflowProjectSessionUiModel }) {
	return (
		<div className="rounded-sm border border-slate-800 bg-[#111820] p-4 text-sm">
			<div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
				<Circle size={14} />
				Projection Facts
			</div>
			<dl className="space-y-3">
				<WorkflowFact label="projection kind" value="pibo.workflow.xstateUiModel" />
				<WorkflowFact label="schema" value="v1" />
				<WorkflowFact label="durable truth" value="kernel" />
				<WorkflowFact label="private payloads" value="not exposed" />
				<WorkflowFact label="states" value={String(model.nodes.length)} />
				<WorkflowFact label="transitions" value={String(model.edges.length)} />
				<WorkflowFact label="trace" value={model.traceVersion ?? "pending"} />
			</dl>
		</div>
	);
}

function WorkflowFact({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3 border-b border-slate-800/70 pb-2 last:border-b-0 last:pb-0">
			<dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
			<dd className="min-w-0 truncate text-right font-mono text-xs text-slate-300">{value}</dd>
		</div>
	);
}

function createProjectSessionWorkflowModel(
	projectSession: PiboProjectSession,
	traceView: PiboSessionTraceView | null,
	selectedSessionStatus: PiboWebSessionStatus | undefined,
): WorkflowProjectSessionUiModel | null {
	if (!isWorkflowBackedProjectSession(projectSession)) return null;
	const status = workflowNodeStatus(projectSession, selectedSessionStatus);
	const activeStateId = stateIdForStatus(status);
	const nodes: WorkflowVisualNode[] = [
		{
			id: "workflow.entry",
			label: "workflow entry",
			kind: "initial",
			status: status === "idle" ? "active" : "completed",
			description: "Project session is linked to a workflow-capable route.",
		},
		{
			id: "node.session",
			label: traceView?.title ?? "pibo session actor",
			kind: "agent",
			status: activeStateId === "node.session" ? status : status === "completed" ? "completed" : "idle",
			description: "Normal Pibo routed session used as the visible workflow actor.",
		},
		{
			id: terminalStateIdForStatus(status),
			label: terminalLabelForStatus(status),
			kind: "terminal",
			status: activeStateId.startsWith("workflow.") ? status : "idle",
			description: "Terminal state projected from the current workflow/session state.",
		},
	];
	return {
		workflowId: projectSession.workflowId,
		...(projectSession.workflowRunId ? { workflowRunId: projectSession.workflowRunId } : {}),
		piboSessionId: projectSession.piboSessionId,
		state: workflowStateLabel(projectSession, selectedSessionStatus),
		status,
		traceTitle: traceView?.title,
		traceVersion: traceView?.version,
		latestStreamId: traceView?.latestStreamId,
		nodes,
		edges: [
			{ id: "workflow.transition.entry.session", source: "workflow.entry", target: "node.session", label: "WORKFLOW.START" },
			{ id: "workflow.transition.session.terminal", source: "node.session", target: terminalStateIdForStatus(status), label: terminalEventForStatus(status) },
		],
		snapshot: {
			kind: "pibo.workflow.xstateUiModel",
			schemaVersion: 1,
			projection: {
				workflowId: projectSession.workflowId,
				initialStateId: "workflow.entry",
				durableTruth: "kernel",
				exposesPrivatePayloads: false,
			},
			current: {
				snapshotKind: "ui",
				...(projectSession.workflowRunId ? { runId: projectSession.workflowRunId } : {}),
				status: workflowStateLabel(projectSession, selectedSessionStatus),
				stateIds: [activeStateId],
				nodeId: activeStateId === "node.session" ? "session" : undefined,
			},
			actors: [{ id: "workflow.actor.session", kind: "agent", piboSessionId: projectSession.piboSessionId }],
		},
	};
}

function isWorkflowBackedProjectSession(projectSession: PiboProjectSession): boolean {
	return Boolean(projectSession.workflowRunId) || projectSession.state === "workflow" || projectSession.workflowId !== "simple-chat";
}

function workflowStateLabel(projectSession: PiboProjectSession, selectedSessionStatus: PiboWebSessionStatus | undefined): string {
	if (projectSession.archived) return "archived";
	if (projectSession.state && projectSession.state !== "workflow") return projectSession.state.replace(/_/g, " ");
	if (selectedSessionStatus === "running") return "running";
	if (selectedSessionStatus === "error") return "failed";
	return projectSession.workflowRunId ? "workflow" : projectSession.kind;
}

function workflowNodeStatus(projectSession: PiboProjectSession, selectedSessionStatus: PiboWebSessionStatus | undefined): WorkflowNodeStatus {
	const state = workflowStateLabel(projectSession, selectedSessionStatus).toLowerCase();
	if (projectSession.archived) return "cancelled";
	if (state.includes("complete") || state.includes("done")) return "completed";
	if (state.includes("fail") || state.includes("error")) return "failed";
	if (state.includes("cancel")) return "cancelled";
	if (state.includes("wait") || state.includes("blocked")) return "waiting";
	return selectedSessionStatus === "running" ? "active" : "active";
}

function stateIdForStatus(status: WorkflowNodeStatus): string {
	if (status === "completed") return "workflow.completed";
	if (status === "failed") return "workflow.failed";
	if (status === "cancelled") return "workflow.cancelled";
	return "node.session";
}

function terminalStateIdForStatus(status: WorkflowNodeStatus): string {
	if (status === "failed") return "workflow.failed";
	if (status === "cancelled") return "workflow.cancelled";
	return "workflow.completed";
}

function terminalLabelForStatus(status: WorkflowNodeStatus): string {
	if (status === "failed") return "failed";
	if (status === "cancelled") return "cancelled";
	return "completed";
}

function terminalEventForStatus(status: WorkflowNodeStatus): string {
	if (status === "failed") return "WORKFLOW.FAIL";
	if (status === "cancelled") return "WORKFLOW.CANCEL";
	return "WORKFLOW.NODE.DONE";
}

function WorkflowStatusIcon({ status }: { status: WorkflowNodeStatus }) {
	if (status === "completed") return <CheckCircle2 size={16} className="text-emerald-300" />;
	if (status === "failed") return <XCircle size={16} className="text-red-300" />;
	if (status === "cancelled") return <AlertTriangle size={16} className="text-slate-400" />;
	if (status === "waiting") return <Clock3 size={16} className="text-amber-300" />;
	if (status === "active") return <Activity size={16} className="text-[#11a4d4]" />;
	return <Circle size={16} className="text-slate-500" />;
}

function WorkflowBadge({ tone, children }: { tone: "blue" | "slate" | "green" | "amber" | "red"; children: ReactNode }) {
	const classes = {
		blue: "border-[#11a4d4]/40 bg-[#11a4d4]/10 text-[#11a4d4]",
		slate: "border-slate-700 bg-slate-900/50 text-slate-300",
		green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
		amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
		red: "border-red-500/40 bg-red-500/10 text-red-300",
	};
	return <span className={`rounded border px-2 py-1 font-mono ${classes[tone]}`}>{children}</span>;
}

function badgeToneForStatus(status: WorkflowNodeStatus): "blue" | "slate" | "green" | "amber" | "red" {
	if (status === "completed") return "green";
	if (status === "failed" || status === "cancelled") return "red";
	if (status === "waiting") return "amber";
	return "blue";
}

function nodeCardClass(status: WorkflowNodeStatus): string {
	if (status === "completed") return "border-emerald-500/40 bg-emerald-500/10";
	if (status === "failed") return "border-red-500/40 bg-red-500/10";
	if (status === "cancelled") return "border-slate-600 bg-slate-800/40";
	if (status === "waiting") return "border-amber-500/40 bg-amber-500/10";
	if (status === "active") return "border-[#11a4d4]/50 bg-[#11a4d4]/10 shadow-[0_0_0_1px_rgba(17,164,212,0.18)]";
	return "border-slate-800 bg-[#111820]";
}

function shortWorkflowValue(value: string): string {
	return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}
