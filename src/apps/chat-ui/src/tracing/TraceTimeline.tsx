import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { GitBranch, RefreshCw } from "lucide-react";
import type { Span, Trace } from "../types";
import { SpanNode } from "./SpanNode";
import { processSpanTree } from "./traceTree";

type TraceTimelineProps = {
	trace: Trace | null;
	showThinking: boolean;
	onFork: (entryId: string) => void;
	onOpenSession: (sessionKey: string) => void;
};

const timelineContentStyle = {
	"--trace-readable-width": "clamp(44rem, 58vw, 64rem)",
} as CSSProperties;

export function TraceTimeline({ trace, showThinking, onFork, onOpenSession }: TraceTimelineProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [expandAll, setExpandAll] = useState(false);
	const [expandSignal, setExpandSignal] = useState(0);

	const spanTree = useMemo(() => {
		if (!trace?.spans) return [];
		return processSpanTree(filterThinking(trace.spans, showThinking));
	}, [trace?.spans, showThinking]);

	const allSpans = useMemo(() => flattenSpans(spanTree), [spanTree]);
	const startTime = useMemo(() => {
		if (!allSpans.length) return 0;
		return Math.min(...allSpans.map((span) => span.startTime));
	}, [allSpans]);
	const stats = useMemo(
		() => ({
			completed: allSpans.filter((span) => span.status === "OK").length,
			error: allSpans.filter((span) => span.status === "ERROR").length,
			active: allSpans.filter((span) => span.status === "UNSET").length,
		}),
		[allSpans],
	);
	const isStreaming = trace?.status === "UNSET";

	useEffect(() => {
		if (isStreaming && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
	}, [isStreaming, trace?.spans.length]);

	if (!trace) {
		return (
			<section className="flex-1 flex flex-col bg-[#0c1214] relative overflow-hidden">
				<div className="h-14 px-6 border-b border-slate-800 bg-[#1a262b]/80 flex items-center justify-between">
					<h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
						<GitBranch size={18} className="text-[#11a4d4]" />
						Execution Flow
					</h2>
				</div>
				<div className="flex-1 flex items-center justify-center text-slate-500">No Trace Selected</div>
			</section>
		);
	}

	const handleExpandAll = () => {
		const nextValue = !expandAll;
		setExpandAll(nextValue);
		setExpandSignal((current) => current + 1);
	};

	return (
		<section className="flex-1 flex flex-col bg-[#0c1214] relative overflow-hidden">
			<div className="h-14 px-6 border-b border-slate-800 bg-[#1a262b]/80 flex items-center justify-between sticky top-0 z-20">
				<div className="flex items-center gap-4">
					<h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
						<GitBranch size={18} className="text-[#11a4d4]" />
						Active Execution Flow
					</h2>
					<div className="flex items-center gap-2">
						{stats.active > 0 ? <Badge color="cyan">{stats.active} Active</Badge> : null}
						{stats.completed > 0 ? <Badge color="green">{stats.completed} Done</Badge> : null}
						{stats.error > 0 ? <Badge color="orange">{stats.error} Errors</Badge> : null}
					</div>
				</div>
				<button
					type="button"
					onClick={handleExpandAll}
					className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-[#11a4d4] border border-transparent hover:border-slate-700 rounded-sm transition-all"
				>
					{expandAll ? "Collapse All" : "Expand All"}
				</button>
			</div>

			<div ref={scrollRef} className="flex-1 overflow-auto p-6">
				<div className="relative w-max min-w-full pr-6" style={timelineContentStyle}>
					{spanTree.map((span) => (
						<SpanNode
							key={span.id}
							span={span}
							startTime={startTime}
							forceExpanded={expandSignal > 0 ? expandAll : undefined}
							forceExpandedSignal={expandSignal}
							forceContentExpanded={expandSignal > 0 ? expandAll : undefined}
							forceContentExpandedSignal={expandSignal}
							onFork={onFork}
							onOpenSession={onOpenSession}
						/>
					))}
					{isStreaming ? <StreamingIndicator /> : null}
				</div>
			</div>
		</section>
	);
}

function Badge({ color, children }: { color: "cyan" | "green" | "orange"; children: React.ReactNode }) {
	const className =
		color === "cyan"
			? "bg-[#11a4d4]/20 text-[#11a4d4]"
			: color === "green"
				? "bg-[#0bda57]/20 text-[#0bda57]"
				: "bg-[#ff6b00]/20 text-[#ff6b00]";
	return <span className={`px-2 py-0.5 text-xs font-bold rounded-sm uppercase ${className}`}>{children}</span>;
}

function StreamingIndicator() {
	return (
		<div className="relative mb-8" style={{ width: "var(--trace-readable-width)" }}>
			<div className="bg-[#1a262b] border border-[#11a4d4]/30 rounded-sm p-4 flex items-center gap-3">
				<span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#11a4d4]/20 border-2 border-[#11a4d4] animate-pulse">
					<RefreshCw size={14} className="text-[#11a4d4] animate-spin" />
				</span>
				<span className="text-sm text-[#11a4d4]">Executing...</span>
			</div>
		</div>
	);
}

function filterThinking(spans: Span[], showThinking: boolean): Span[] {
	return spans.flatMap((span) => {
		if (!showThinking && span.spanType === "model.reasoning") return [];
		return [{ ...span, children: span.children ? filterThinking(span.children, showThinking) : undefined }];
	});
}

function flattenSpans(spans: Span[]): Span[] {
	return spans.flatMap((span) => [span, ...(span.children ? flattenSpans(span.children) : [])]);
}
