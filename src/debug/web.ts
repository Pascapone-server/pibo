import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPiboHome } from "../core/pibo-home.js";
import { listBrowserUseCdpTargets, selectBestChatTarget, formatBrowserUseTargets, type BrowserUseCdpTarget } from "../tools/browser-use-cdp.js";
import { CdpClient } from "../tools/cdp-client.js";

const DEFAULT_WATCH_DURATION_MS = 5_000;
const MAX_WATCH_DURATION_MS = 30_000;
const DEFAULT_NODE_LIMIT = 250;
const DEFAULT_DEPTH_LIMIT = 8;
const DEFAULT_EVENT_LIMIT = 500;
const DEFAULT_TEXT_LIMIT = 80;
const STDOUT_BUDGET = 12_000;

type WebOptions = {
	positionals: string[];
	cdpUrl?: string;
	target?: string;
	scope?: string;
	preset?: string;
	duration?: string;
	runs?: string;
	json: boolean;
	artifact: boolean;
	fixture: boolean;
	backendFixture: boolean;
	assertHealthy: boolean;
	from?: string;
	act: boolean;
	manual: boolean;
	includeText: boolean;
	includeLayout: boolean;
};

type SnapshotNode = {
	ref: string;
	identity: string;
	identityKind: string;
	depth: number;
	tag: string;
	role?: string;
	name?: string;
	text?: string;
	attributes: Record<string, string | boolean | number>;
	classSummary?: string;
	path: string;
	focused?: boolean;
	box?: { x: number; y: number; w: number; h: number };
};

type WebSnapshot = {
	kind: "snapshot";
	createdAt: string;
	url: string;
	title: string;
	scope: string;
	rootFound: boolean;
	root?: SnapshotNode;
	activeElement?: { identity: string; tag: string; name?: string; path: string };
	nodes: SnapshotNode[];
	omitted: { nodes: number; depth: number; budget: boolean };
};

type WatchEvent = {
	t: number;
	source: "dom" | "focus" | "route" | "action";
	kind: string;
	target?: string;
	detail?: string;
	before?: string;
	after?: string;
	node?: SnapshotNode;
};

type WebWatch = {
	kind: "watch";
	createdAt: string;
	url: string;
	title: string;
	scope: string;
	durationMs: number;
	rootFound: boolean;
	events: WatchEvent[];
	before?: WebSnapshot;
	after?: WebSnapshot;
	omitted: { events: number; nodes: number; depth: number; budget: boolean };
	action?: { requested: string; performed: boolean; error?: string };
};

type NumberStats = {
	count: number;
	min?: number;
	p50?: number;
	p90?: number;
	p99?: number;
	max?: number;
	avg?: number;
};

type StreamingDebugCounters = Record<string, unknown> & {
	eventCount?: number;
	textDeltaCount?: number;
	textDeltaBytes?: number;
	enqueueCount?: number;
	flushCount?: number;
	overlayUpdateCount?: number;
	overlayEventCount?: number;
	traceRefreshCompletedCount?: number;
	traceRefreshFailedCount?: number;
	currentOutputLength?: number;
	traceBaseOutputLength?: number;
	lastDurableCursor?: string;
	lastTransientLiveId?: string;
};

type StreamingSmoothnessScore = {
	smoothness: number;
	domGapP50Ms?: number;
	domGapP90Ms?: number;
	domJumpP90Chars?: number;
	textDeltaCount: number;
	domPositiveUpdateCount: number;
	firstVisibleMs?: number;
};

type StreamingBenchmark = {
	kind: "streaming-benchmark";
	createdAt: string;
	url: string;
	title: string;
	durationMs: number;
	debug: {
		enabledRequested: boolean;
		available: boolean;
		reset: boolean;
		before?: StreamingDebugCounters;
		after?: StreamingDebugCounters;
		delta?: Record<string, number>;
	};
	dom: {
		selector: string;
		targetCountStart: number;
		targetCountEnd: number;
		lengthStart: number;
		lengthEnd: number;
		updateCount: number;
		positiveUpdateCount: number;
		firstPositiveUpdateMs?: number;
		lastPositiveUpdateMs?: number;
		gapsMs: NumberStats;
		positiveCharJumps: NumberStats;
	};
	raf: { count: number; gapsMs: NumberStats };
	longTasks: { count: number; totalMs: number; maxMs: number };
	fixture?: { requested: boolean; mode: "browser" | "backend"; available: boolean; started: boolean; deltaCount?: number; cadenceMs?: number; piboSessionId?: string; error?: string };
	score: StreamingSmoothnessScore;
	regressions: string[];
	warnings: string[];
};

type StreamingBenchmarkSummary = {
	runs: number;
	smoothness: NumberStats;
	textDeltaCount: NumberStats;
	domPositiveUpdateCount: NumberStats;
	domGapP50Ms: NumberStats;
	domGapP90Ms: NumberStats;
	domGapMaxMs: NumberStats;
	domJumpP90Chars: NumberStats;
	domJumpMaxChars: NumberStats;
	firstVisibleMs: NumberStats;
	longTaskMaxMs: NumberStats;
	regressionCount: NumberStats;
};

type StreamingBenchmarkComparison = {
	baselineRuns: number;
	currentRuns: number;
	smoothnessDelta?: number;
	domGapP90DeltaMs?: number;
	domPositiveUpdateDelta?: number;
	domJumpMaxDeltaChars?: number;
	longTaskMaxDeltaMs?: number;
};

type StreamingBenchmarkGroup = {
	kind: "streaming-benchmark-runs";
	createdAt: string;
	durationMs: number;
	runs: StreamingBenchmark[];
	summary: StreamingBenchmarkSummary;
	comparison?: StreamingBenchmarkComparison;
	regressions: string[];
	warnings: string[];
};

export async function runDebugWeb(args: string[]): Promise<void> {
	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		printWebDiscovery();
		return;
	}

	const command = args[0];
	const options = parseOptions(args.slice(1));
	if (command === "targets") {
		await runTargets(options);
		return;
	}
	if (command === "attach-chat") {
		await runAttachChat(options);
		return;
	}
	if (command === "snapshot") {
		await runSnapshot(options);
		return;
	}
	if (command === "diff") {
		await runDiff(options);
		return;
	}
	if (command === "watch") {
		await runWatch(options);
		return;
	}
	if (command === "scenario") {
		await runScenario(options);
		return;
	}
	throw new Error(`Unknown pibo debug web command "${command}". Run pibo debug web --help.`);
}

function printWebDiscovery(): void {
	console.log(`pibo debug web - inspect browser render state via CDP

Commands:
  targets      List Chrome CDP targets with Chat auth hints
  attach-chat  Show the best authenticated Chat Web target
  snapshot     Capture a scoped compact DOM snapshot
  diff         Compare current scoped snapshot against previous or artifact
  watch        Record a bounded scoped DOM/focus/route timeline
  scenario     Run guided Chat Web debug workflows

Next:
  pibo debug web targets
  pibo debug web snapshot --preset session-list
  pibo debug web watch --preset chat-shell --duration 5000
`);
}

function printSnapshotHelp(): void {
	console.log(`pibo debug web snapshot - capture a scoped compact DOM snapshot

Usage:
  pibo debug web snapshot --scope <selector> [--target id|ws] [--json] [--artifact]
  pibo debug web snapshot --preset session-list

Presets:
  app | route-shell | sidebar | session-list | chat-shell | composer

Next:
  pibo debug web diff --preset session-list
  pibo debug web watch --preset chat-shell --duration 5000
`);
}

function printWatchHelp(): void {
	console.log(`pibo debug web watch - record compact render-state changes

Usage:
  pibo debug web watch --scope <selector> [--duration ms] [--target id|ws] [--json] [--artifact]
  pibo debug web watch --preset chat-shell --duration 5000

Defaults:
  duration=5000ms, max=30000ms, event budget=500

Next:
  pibo debug web diff --preset chat-shell
  pibo debug web scenario new-session --manual
`);
}

function printScenarioHelp(): void {
	console.log(`pibo debug web scenario - guided Chat Web debug workflows

Usage:
  pibo debug web scenario new-session [--manual|--act] [--duration ms] [--json] [--artifact]
  pibo debug web scenario streaming-benchmark [--fixture|--backend-fixture] [--duration ms] [--runs n] [--from artifact.json] [--assert] [--json] [--artifact]

Defaults:
  new-session --manual waits while you click New Session yourself.
  new-session --act clicks the discovered New Session button after the watcher starts.
  streaming-benchmark enables debugStreaming for future events, observes assistant DOM increments, and snapshots window.__piboStreamingDebug.
  streaming-benchmark --fixture navigates the target to a deterministic in-browser stream fixture before measuring.
  streaming-benchmark --backend-fixture posts to /api/chat/debug/streaming-fixture so the real app consumes deterministic /api/chat/events frames.
  streaming-benchmark --runs repeats the same scenario and reports medians; --from compares against a prior benchmark artifact.
  streaming-benchmark --assert exits non-zero when fixture/debug/DOM smoothness gates fail.
`);
}

async function runTargets(options: WebOptions): Promise<void> {
	const targets = await listBrowserUseCdpTargets({ cdpUrl: options.cdpUrl, probe: true });
	if (options.json) {
		console.log(JSON.stringify({ targets }, null, 2));
		return;
	}
	console.log(formatBrowserUseTargets(targets));
	if (targets.length === 0) {
		console.log("\nNext: eval \"$(pibo tools env browser-use)\" or pass --cdp-url http://127.0.0.1:<port>");
	}
}

async function runAttachChat(options: WebOptions): Promise<void> {
	const targets = await listBrowserUseCdpTargets({ cdpUrl: options.cdpUrl, probe: true });
	const target = resolveTargetFromList(targets, options.target) ?? selectBestChatTarget(targets);
	if (!target) {
		throw new Error("No authenticated Chat Web target with a composer textarea was found. Next: pibo tools browser-use targets or acquire a Browser Use lease.");
	}
	if (options.json) {
		console.log(JSON.stringify({ target }, null, 2));
		return;
	}
	console.log(`target\t${target.id}`);
	console.log(`url\t${target.url}`);
	console.log(`auth\t${target.auth}`);
	console.log(`composer\t${target.composer ? "yes" : "no"}`);
	console.log(`ws\t${target.webSocketDebuggerUrl ?? ""}`);
	console.log("\nNext:");
	console.log(`  pibo debug web snapshot --target ${shellQuote(target.id)} --preset session-list`);
	console.log(`  pibo debug web watch --target ${shellQuote(target.id)} --preset chat-shell --duration 5000`);
}

async function runSnapshot(options: WebOptions): Promise<void> {
	if (options.positionals[0] === "--help" || options.positionals[0] === "-h") {
		printSnapshotHelp();
		return;
	}
	const scope = resolveScope(options);
	const { client, target } = await connectTarget(options);
	try {
		const snapshot = await captureSnapshot(client, scope, options);
		if (options.json) {
			console.log(JSON.stringify({ target: compactTarget(target), snapshot }, null, 2));
		} else {
			console.log(limitStdout(formatSnapshot(snapshot, target)));
		}
		await writeLastSnapshot(snapshot);
		if (options.artifact) {
			const artifact = await writeArtifact("snapshot", snapshot);
			if (!options.json) console.log(`Artifact: ${artifact}`);
		}
	} finally {
		client.close();
	}
}

async function runDiff(options: WebOptions): Promise<void> {
	if (options.positionals[0] === "--help" || options.positionals[0] === "-h") {
		console.log(`pibo debug web diff - compare scoped render snapshots

Usage:
  pibo debug web diff --scope <selector> [--from artifact.json]
  pibo debug web diff --preset session-list

Default --from is the last snapshot captured by pibo debug web snapshot.
`);
		return;
	}
	const scope = resolveScope(options);
	const baseline = await readBaselineSnapshot(options.from);
	const { client, target } = await connectTarget(options);
	try {
		const current = await captureSnapshot(client, scope, options);
		if (baseline.scope !== current.scope) {
			if (options.json) console.log(JSON.stringify({ target: compactTarget(target), baseline, current, error: "scope_mismatch" }, null, 2));
			else console.log(`Scope mismatch: baseline=${baseline.scope} current=${current.scope}\nTake a new baseline with: pibo debug web snapshot --scope ${shellQuote(current.scope)}`);
			await writeLastSnapshot(current);
			return;
		}
		const diff = diffSnapshots(baseline, current);
		if (options.json) console.log(JSON.stringify({ target: compactTarget(target), baseline, current, diff }, null, 2));
		else console.log(limitStdout(formatSnapshotDiff(diff, baseline, current, target)));
		await writeLastSnapshot(current);
		if (options.artifact) {
			const artifact = await writeArtifact("diff", { baseline, current, diff });
			if (!options.json) console.log(`Artifact: ${artifact}`);
		}
	} finally {
		client.close();
	}
}

async function runWatch(options: WebOptions): Promise<void> {
	if (options.positionals[0] === "--help" || options.positionals[0] === "-h") {
		printWatchHelp();
		return;
	}
	if (options.act || options.manual) {
		throw new Error("Action flags are only supported by scenarios. Next: pibo debug web scenario new-session --act");
	}
	if (options.positionals.length) {
		throw new Error(`Unexpected pibo debug web watch argument "${options.positionals[0]}". Run pibo debug web watch --help.`);
	}
	const scope = resolveScope(options);
	const durationMs = parseDuration(options.duration);
	const { client, target } = await connectTarget(options);
	try {
		const watch = await runBrowserWatch(client, scope, durationMs, options);
		if (options.json) console.log(JSON.stringify({ target: compactTarget(target), watch }, null, 2));
		else console.log(limitStdout(formatWatch(watch, target)));
		await writeLastSnapshot(watch.after ?? watch.before);
		const artifact = await writeArtifact("watch", watch);
		if (options.artifact && !options.json) console.log(`Artifact: ${artifact}`);
	} finally {
		client.close();
	}
}

async function runScenario(options: WebOptions): Promise<void> {
	const scenario = options.positionals[0];
	if (!scenario || scenario === "--help" || scenario === "-h") {
		printScenarioHelp();
		return;
	}
	if (options.positionals.length > 1) {
		throw new Error(`Unexpected pibo debug web scenario argument "${options.positionals[1]}". Run pibo debug web scenario --help.`);
	}
	if (options.act && options.manual) throw new Error("Use either --manual or --act, not both.");
	if (scenario !== "new-session" && scenario !== "streaming-benchmark") throw new Error(`Unknown pibo debug web scenario "${scenario}". Run pibo debug web scenario --help.`);
	if (scenario === "streaming-benchmark" && (options.act || options.manual)) throw new Error("streaming-benchmark does not support --act or --manual. Start or observe the stream separately, then run the scenario.");
	if (scenario === "streaming-benchmark" && options.fixture && options.backendFixture) throw new Error("Use either --fixture or --backend-fixture, not both.");
	const durationMs = parseDuration(options.duration);
	const runs = parseRuns(options.runs);
	const { client, target } = await connectTarget({ ...options, preset: "app" });
	try {
		if (scenario === "streaming-benchmark") {
			if (options.fixture) await navigateStreamingBenchmarkFixture(client);
			if (options.backendFixture) await enableStreamingDebugForCurrentApp(client);
			const benchmarks: StreamingBenchmark[] = [];
			for (let run = 0; run < runs; run++) {
				benchmarks.push(await runStreamingBenchmark(client, durationMs, { startFixture: options.fixture, startBackendFixture: options.backendFixture }));
			}
			const baseline = options.from ? await readStreamingBenchmarkRuns(options.from) : undefined;
			const benchmark: StreamingBenchmark | StreamingBenchmarkGroup = runs === 1
				? benchmarks[0]
				: summarizeStreamingBenchmarkGroup(benchmarks, baseline);
			if (options.json) console.log(JSON.stringify({ target: compactTarget(target), scenario, benchmark }, null, 2));
			else console.log(limitStdout(formatStreamingBenchmarkResult(benchmark, target)));
			const artifact = await writeArtifact(`scenario-${scenario}`, benchmark);
			if (!options.json) console.log(`Artifact: ${artifact}`);
			const regressions = benchmark.kind === "streaming-benchmark-runs" ? benchmark.regressions : benchmark.regressions;
			if (options.assertHealthy && regressions.length) throw new Error(`streaming benchmark assertions failed: ${regressions.join("; ")}`);
			return;
		}

		const watch = await runBrowserWatch(client, presetScope("app"), durationMs, {
			...options,
			act: options.act,
			manual: !options.act,
		}, options.act ? "new-session" : undefined);
		if (options.json) console.log(JSON.stringify({ target: compactTarget(target), scenario, watch }, null, 2));
		else console.log(limitStdout(formatWatch(watch, target, `scenario ${scenario}`)));
		const artifact = await writeArtifact(`scenario-${scenario}`, watch);
		if (!options.json) console.log(`Artifact: ${artifact}`);
	} finally {
		client.close();
	}
}

async function connectTarget(options: WebOptions): Promise<{ client: CdpClient; target: BrowserUseCdpTarget | { id: string; url: string; title: string; webSocketDebuggerUrl: string } }> {
	const envWs = process.env.PIBO_CDP_TARGET_WS;
	if (isWebSocketUrl(options.target)) {
		const client = new CdpClient(options.target!);
		await client.connect();
		return { client, target: { id: "direct", url: "", title: "direct", webSocketDebuggerUrl: options.target! } };
	}
	if (!options.target && envWs) {
		const client = new CdpClient(envWs);
		await client.connect();
		return { client, target: { id: process.env.PIBO_CDP_TARGET_ID ?? "env", url: process.env.PIBO_CHAT_URL ?? "", title: "env", webSocketDebuggerUrl: envWs } };
	}

	const cdpUrl = options.cdpUrl ?? process.env.PIBO_CDP_URL;
	const targets = await listBrowserUseCdpTargets({ cdpUrl, probe: !options.target });
	const target = resolveTargetFromList(targets, options.target) ?? selectBestChatTarget(targets) ?? targets.find((item) => item.webSocketDebuggerUrl);
	if (!target?.webSocketDebuggerUrl) {
		throw new Error("No attachable CDP target found. Next: pibo debug web targets or pass --cdp-url/--target.");
	}
	const client = new CdpClient(target.webSocketDebuggerUrl);
	await client.connect();
	return { client, target };
}

function resolveTargetFromList(targets: readonly BrowserUseCdpTarget[], target?: string): BrowserUseCdpTarget | undefined {
	if (!target) return undefined;
	return targets.find((item) => item.id === target || item.url === target || item.title === target || item.webSocketDebuggerUrl === target);
}

async function captureSnapshot(client: CdpClient, scope: string, options: WebOptions): Promise<WebSnapshot> {
	const expression = buildSnapshotExpression({
		scope,
		maxNodes: DEFAULT_NODE_LIMIT,
		maxDepth: DEFAULT_DEPTH_LIMIT,
		textLimit: DEFAULT_TEXT_LIMIT,
		includeText: options.includeText,
		includeLayout: options.includeLayout,
	});
	return client.evaluate<WebSnapshot>(expression, 10_000);
}

async function runBrowserWatch(client: CdpClient, scope: string, durationMs: number, options: WebOptions, action?: "new-session"): Promise<WebWatch> {
	const expression = buildWatchExpression({
		scope,
		durationMs,
		maxNodes: DEFAULT_NODE_LIMIT,
		maxDepth: DEFAULT_DEPTH_LIMIT,
		maxEvents: DEFAULT_EVENT_LIMIT,
		textLimit: DEFAULT_TEXT_LIMIT,
		includeText: options.includeText,
		includeLayout: options.includeLayout,
		action,
	});
	return client.evaluate<WebWatch>(expression, durationMs + 10_000);
}

async function runStreamingBenchmark(client: CdpClient, durationMs: number, options: { startFixture?: boolean; startBackendFixture?: boolean } = {}): Promise<StreamingBenchmark> {
	await client.send("Page.bringToFront").catch(() => undefined);
	const benchmark = await client.evaluate<Omit<StreamingBenchmark, "score">>(buildStreamingBenchmarkExpression(durationMs, options), durationMs + 10_000);
	return { ...benchmark, score: scoreStreamingBenchmark(benchmark) };
}

async function navigateStreamingBenchmarkFixture(client: CdpClient): Promise<void> {
	const url = `data:text/html;charset=utf-8,${encodeURIComponent(streamingBenchmarkFixtureHtml())}`;
	await client.send("Page.enable").catch(() => undefined);
	await client.send("Page.navigate", { url }, 5_000);
	await client.send("Page.bringToFront").catch(() => undefined);
	await client.evaluate("new Promise((resolve) => { if (document.readyState === 'complete') resolve(true); else addEventListener('load', () => resolve(true), { once: true }); })", 5_000);
}

async function enableStreamingDebugForCurrentApp(client: CdpClient): Promise<void> {
	const state = await client.evaluate<{ href: string; hasReset: boolean }>(`(() => {
  try { localStorage.setItem('pibo.chat.debugStreaming', '1'); } catch {}
  return { href: location.href, hasReset: typeof window.__piboStreamingDebugReset === 'function' };
})()`, 5_000);
	if (state.hasReset) return;
	const url = new URL(state.href);
	if (url.protocol !== "http:" && url.protocol !== "https:") return;
	url.searchParams.set("debugStreaming", "1");
	await client.send("Page.enable").catch(() => undefined);
	await client.send("Page.navigate", { url: url.toString() }, 5_000);
	await client.send("Page.bringToFront").catch(() => undefined);
	await client.evaluate("new Promise((resolve) => { if (document.readyState === 'complete') resolve(true); else addEventListener('load', () => resolve(true), { once: true }); })", 5_000);
	await client.evaluate("new Promise((resolve) => setTimeout(resolve, 500))", 2_000);
}

function streamingBenchmarkFixtureHtml(): string {
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Streaming Benchmark Fixture</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;line-height:1.4} [data-pibo-component]{white-space:pre-wrap}</style>
</head>
<body data-pibo-debug="chat-app">
<h1>Streaming Benchmark Fixture</h1>
<div data-pibo-component="MarkdownRendererHost" data-pibo-markdown-kind="assistant-message">hello</div>
<script>
(() => {
  const target = document.querySelector('[data-pibo-component="MarkdownRendererHost"]');
  const deltas = [' a', ' b', ' c', ' d', ' e', ' f', ' g', ' h', ' i', ' j', ' k', ' l'];
  const cadenceMs = 100;
  let timer;
  let index = 0;
  function snapshot() {
    return {
      eventCount: 0,
      textDeltaCount: 0,
      textDeltaBytes: 0,
      reasoningDeltaCount: 0,
      reasoningDeltaBytes: 0,
      enqueueCount: 0,
      flushCount: 0,
      flushedEventCount: 0,
      overlayUpdateCount: 0,
      overlayEventCount: 0,
      traceRefreshStartedCount: 0,
      traceRefreshCompletedCount: 0,
      traceRefreshFailedCount: 0,
      traceBaseUpdateCount: 0,
      traceBaseOutputLength: 0,
      currentOutputLength: target.textContent.length,
      lastDurableCursor: undefined,
      lastTransientLiveId: 'live:-1',
    };
  }
  window.__piboStreamingDebugReset = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    index = 0;
    target.textContent = 'hello';
    window.__piboStreamingDebug = snapshot();
    return window.__piboStreamingDebug;
  };
  window.__piboStreamingFixtureConfig = { deltaCount: deltas.length, cadenceMs };
  window.__piboStreamingFixtureStart = () => {
    window.__piboStreamingDebugReset();
    timer = setInterval(() => {
      const delta = deltas[index];
      target.textContent += delta;
      const debug = window.__piboStreamingDebug;
      debug.eventCount += 1;
      debug.textDeltaCount += 1;
      debug.textDeltaBytes += delta.length;
      debug.enqueueCount += 1;
      debug.flushCount += 1;
      debug.flushedEventCount += 1;
      debug.overlayUpdateCount += 1;
      debug.overlayEventCount = index + 1;
      debug.currentOutputLength = target.textContent.length;
      debug.lastTransientLiveId = 'live:' + index;
      index += 1;
      if (index >= deltas.length) {
        clearInterval(timer);
        timer = undefined;
      }
    }, cadenceMs);
    return window.__piboStreamingFixtureConfig;
  };
  window.__piboStreamingDebugReset();
})();
</script>
</body>
</html>`;
}

function buildSnapshotExpression(options: { scope: string; maxNodes: number; maxDepth: number; textLimit: number; includeText: boolean; includeLayout: boolean }): string {
	return `(() => {
  const options = ${JSON.stringify(options)};
  ${browserSnapshotLibrary()}
  return captureSnapshot(options);
})()`;
}

function buildWatchExpression(options: { scope: string; durationMs: number; maxNodes: number; maxDepth: number; maxEvents: number; textLimit: number; includeText: boolean; includeLayout: boolean; action?: "new-session" }): string {
	return `(async () => {
  const options = ${JSON.stringify(options)};
  ${browserSnapshotLibrary()}
  return await runWatch(options);
})()`;
}

function buildStreamingBenchmarkExpression(durationMs: number, input: { startFixture?: boolean; startBackendFixture?: boolean } = {}): string {
	return `(async () => {
  const options = ${JSON.stringify({ durationMs, startFixture: Boolean(input.startFixture), startBackendFixture: Boolean(input.startBackendFixture) })};
  ${browserStreamingBenchmarkLibrary()}
  return await runStreamingBenchmark(options);
})()`;
}

function browserStreamingBenchmarkLibrary(): string {
	return String.raw`
const ASSISTANT_SELECTOR = '[data-pibo-component="MarkdownRendererHost"][data-pibo-markdown-kind="assistant-message"]';
function nowIso() { return new Date().toISOString(); }
function cloneDebugSnapshot(value) {
  if (!value || typeof value !== 'object') return undefined;
  try { return JSON.parse(JSON.stringify(value)); } catch { return undefined; }
}
function numericDelta(before, after, keys) {
  const delta = {};
  for (const key of keys) {
    const left = before && typeof before[key] === 'number' ? before[key] : 0;
    const right = after && typeof after[key] === 'number' ? after[key] : 0;
    delta[key] = right - left;
  }
  return delta;
}
function stats(values) {
  const nums = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!nums.length) return { count: 0 };
  const pick = (q) => nums[Math.min(nums.length - 1, Math.max(0, Math.floor((nums.length - 1) * q)))];
  const avg = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  return {
    count: nums.length,
    min: Math.round(nums[0] * 1000) / 1000,
    p50: Math.round(pick(0.50) * 1000) / 1000,
    p90: Math.round(pick(0.90) * 1000) / 1000,
    p99: Math.round(pick(0.99) * 1000) / 1000,
    max: Math.round(nums[nums.length - 1] * 1000) / 1000,
    avg: Math.round(avg * 1000) / 1000,
  };
}
function fetchWithTimeout(url, init, timeoutMs) {
  if (typeof AbortController === 'undefined') return fetch(url, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}
function streamingBenchmarkRegressions(result) {
  const failures = [];
  const fixture = result.fixture;
  const expectedDeltas = fixture && typeof fixture.deltaCount === 'number' ? fixture.deltaCount : undefined;
  const cadenceMs = fixture && typeof fixture.cadenceMs === 'number' ? fixture.cadenceMs : 100;
  const textDeltas = result.debugDelta && typeof result.debugDelta.textDeltaCount === 'number' ? result.debugDelta.textDeltaCount : 0;
  const domPositive = result.dom.positiveUpdateCount || 0;
  const domGapP90 = result.dom.gapsMs && typeof result.dom.gapsMs.p90 === 'number' ? result.dom.gapsMs.p90 : undefined;
  const domJumpMax = result.dom.positiveCharJumps && typeof result.dom.positiveCharJumps.max === 'number' ? result.dom.positiveCharJumps.max : undefined;
  const firstPositiveMs = typeof result.dom.firstPositiveUpdateMs === 'number' ? result.dom.firstPositiveUpdateMs : undefined;
  const longTaskMax = result.longTasks.length ? Math.max(...result.longTasks) : 0;
  if (!result.debugAfter) failures.push('debug counters unavailable');
  if (fixture) {
    if (!fixture.available) failures.push('fixture unavailable');
    if (!fixture.started) failures.push('fixture did not start');
    if (fixture.error) failures.push('fixture error: ' + fixture.error);
    if (expectedDeltas !== undefined && textDeltas < expectedDeltas) failures.push('text deltas ' + textDeltas + ' < fixture deltas ' + expectedDeltas);
    if (expectedDeltas !== undefined && domPositive < Math.max(1, expectedDeltas - 2)) failures.push('positive DOM updates ' + domPositive + ' < ' + Math.max(1, expectedDeltas - 2));
    if (domGapP90 !== undefined && domGapP90 > Math.max(300, cadenceMs * 3)) failures.push('DOM p90 gap ' + domGapP90 + 'ms exceeds gate');
    if (domJumpMax !== undefined && domJumpMax > 4) failures.push('DOM max jump ' + domJumpMax + ' chars exceeds gate');
    if (firstPositiveMs !== undefined && firstPositiveMs > 500) failures.push('first visible update ' + firstPositiveMs + 'ms exceeds gate');
  }
  if (longTaskMax > 50) failures.push('long task max ' + Math.round(longTaskMax * 1000) / 1000 + 'ms exceeds 50ms');
  return failures;
}
function assistantTargets() {
  return Array.from(document.querySelectorAll(ASSISTANT_SELECTOR));
}
function selectedAssistantText() {
  const targets = assistantTargets();
  const target = targets[targets.length - 1];
  return target ? (target.innerText || target.textContent || '') : '';
}
async function runStreamingBenchmark(options) {
  const startedAt = performance.now();
  const warnings = [];
  let reset = false;
  try { localStorage.setItem('pibo.chat.debugStreaming', '1'); } catch (error) { warnings.push('failed to set debugStreaming localStorage: ' + String(error)); }
  if (typeof window.__piboStreamingDebugReset === 'function') {
    try { window.__piboStreamingDebugReset(); reset = true; } catch (error) { warnings.push('failed to reset __piboStreamingDebug: ' + String(error)); }
  }

  const debugBefore = cloneDebugSnapshot(window.__piboStreamingDebug);
  const initialText = selectedAssistantText();
  const targetCountStart = assistantTargets().length;
  const updates = [];
  const positiveJumps = [];
  let currentLength = initialText.length;
  let lastPositiveAt;
  let firstPositiveUpdateMs;
  const sample = () => {
    const text = selectedAssistantText();
    const length = text.length;
    if (length === currentLength) return;
    const t = performance.now() - startedAt;
    const delta = length - currentLength;
    updates.push({ t, length, delta });
    if (delta > 0) {
      positiveJumps.push(delta);
      firstPositiveUpdateMs ??= t;
      lastPositiveAt = t;
    }
    currentLength = length;
  };
  const observer = new MutationObserver(sample);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  const rafGaps = [];
  let rafCount = 0;
  let lastRaf;
  let rafHandle;
  const onRaf = (t) => {
    rafCount += 1;
    if (lastRaf !== undefined) rafGaps.push(t - lastRaf);
    lastRaf = t;
    rafHandle = requestAnimationFrame(onRaf);
  };
  rafHandle = requestAnimationFrame(onRaf);

  const longTasks = [];
  let perfObserver;
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration || 0);
      });
      perfObserver.observe({ entryTypes: ['longtask'] });
    } catch {
      warnings.push('longtask PerformanceObserver unavailable');
    }
  } else {
    warnings.push('PerformanceObserver unavailable');
  }

  let fixtureStarted = false;
  let fixtureConfig;
  let backendFixtureError;
  const selectedSessionId = () => document.querySelector('[data-pibo-debug="chat-shell"]')?.getAttribute('data-pibo-session-id')
    || document.querySelector('[data-pibo-selected-session-id]')?.getAttribute('data-pibo-selected-session-id')
    || undefined;
  if (options.startFixture) {
    if (typeof window.__piboStreamingFixtureStart === 'function') {
      try { fixtureConfig = window.__piboStreamingFixtureStart(); fixtureStarted = true; } catch (error) { warnings.push('failed to start streaming fixture: ' + String(error)); }
    } else {
      warnings.push('streaming fixture was requested but window.__piboStreamingFixtureStart is unavailable');
    }
  } else if (options.startBackendFixture) {
    const piboSessionId = selectedSessionId();
    if (!piboSessionId) {
      backendFixtureError = 'selected Chat session not found in DOM';
      warnings.push('backend streaming fixture was requested but selected Chat session was not found');
    } else {
      try {
        const response = await fetchWithTimeout('/api/chat/debug/streaming-fixture', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ piboSessionId }),
        }, 5000);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload && payload.error ? payload.error : response.status + ' ' + response.statusText);
        fixtureConfig = payload.fixture || payload;
        fixtureStarted = true;
      } catch (error) {
        backendFixtureError = String(error && error.message ? error.message : error);
        warnings.push('failed to start backend streaming fixture: ' + backendFixtureError);
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, options.durationMs));
  sample();
  observer.disconnect();
  if (rafHandle !== undefined) cancelAnimationFrame(rafHandle);
  try { perfObserver && perfObserver.disconnect(); } catch {}

  const debugAfter = cloneDebugSnapshot(window.__piboStreamingDebug);
  if (!debugAfter) warnings.push('window.__piboStreamingDebug was absent; run with ?debugStreaming=1 or start a fresh stream after this command enables localStorage');
  const positiveUpdates = updates.filter((update) => update.delta > 0);
  const positiveGaps = [];
  for (let i = 1; i < positiveUpdates.length; i++) positiveGaps.push(positiveUpdates[i].t - positiveUpdates[i - 1].t);
  const debugDelta = numericDelta(debugBefore, debugAfter, [
    'eventCount',
    'textDeltaCount',
    'textDeltaBytes',
    'reasoningDeltaCount',
    'reasoningDeltaBytes',
    'enqueueCount',
    'flushCount',
    'flushedEventCount',
    'overlayUpdateCount',
    'traceRefreshStartedCount',
    'traceRefreshCompletedCount',
    'traceRefreshFailedCount',
    'traceBaseUpdateCount',
  ]);
  const domGaps = stats(positiveGaps);
  const domJumps = stats(positiveJumps);
  const fixtureSummary = (options.startFixture || options.startBackendFixture) ? {
    requested: true,
    mode: options.startBackendFixture ? 'backend' : 'browser',
    available: options.startBackendFixture ? !backendFixtureError : typeof window.__piboStreamingFixtureStart === 'function',
    started: fixtureStarted,
    deltaCount: fixtureConfig && typeof fixtureConfig.deltaCount === 'number' ? fixtureConfig.deltaCount : undefined,
    cadenceMs: fixtureConfig && typeof fixtureConfig.cadenceMs === 'number' ? fixtureConfig.cadenceMs : undefined,
    piboSessionId: fixtureConfig && typeof fixtureConfig.piboSessionId === 'string' ? fixtureConfig.piboSessionId : undefined,
    error: backendFixtureError,
  } : undefined;
  const regressions = streamingBenchmarkRegressions({
    debugAfter,
    debugDelta,
    fixture: fixtureSummary,
    dom: { positiveUpdateCount: positiveUpdates.length, gapsMs: domGaps, positiveCharJumps: domJumps, firstPositiveUpdateMs },
    longTasks,
  });
  return {
    kind: 'streaming-benchmark',
    createdAt: nowIso(),
    url: location.href,
    title: document.title,
    durationMs: options.durationMs,
    debug: {
      enabledRequested: true,
      available: Boolean(debugAfter),
      reset,
      before: debugBefore,
      after: debugAfter,
      delta: debugDelta,
    },
    dom: {
      selector: ASSISTANT_SELECTOR,
      targetCountStart,
      targetCountEnd: assistantTargets().length,
      lengthStart: initialText.length,
      lengthEnd: currentLength,
      updateCount: updates.length,
      positiveUpdateCount: positiveUpdates.length,
      firstPositiveUpdateMs: firstPositiveUpdateMs === undefined ? undefined : Math.round(firstPositiveUpdateMs),
      lastPositiveUpdateMs: lastPositiveAt === undefined ? undefined : Math.round(lastPositiveAt),
      gapsMs: domGaps,
      positiveCharJumps: domJumps,
    },
    raf: { count: rafCount, gapsMs: stats(rafGaps) },
    longTasks: {
      count: longTasks.length,
      totalMs: Math.round(longTasks.reduce((sum, value) => sum + value, 0) * 1000) / 1000,
      maxMs: Math.round((longTasks.length ? Math.max(...longTasks) : 0) * 1000) / 1000,
    },
    fixture: fixtureSummary,
    regressions,
    warnings,
  };
}
`;
}

function browserSnapshotLibrary(): string {
	return String.raw`
function nowIso() { return new Date().toISOString(); }
function safeString(value) { return typeof value === 'string' ? value : ''; }
function short(value, limit) {
  const text = safeString(value).replace(/\s+/g, ' ').trim();
  return text.length > limit ? text.slice(0, Math.max(0, limit - 1)) + '…' : text;
}
function redactText(element, options) {
  const tag = element.tagName.toLowerCase();
  const debug = element.getAttribute('data-pibo-debug') || '';
  if (tag === 'textarea' || tag === 'input' || debug === 'composer') {
    const value = 'value' in element ? String(element.value || '') : '';
    return value ? '[redacted:' + value.length + ' chars]' : '';
  }
  const text = element.innerText || element.textContent || '';
  if (!options.includeText && /message|trace|terminal|composer/i.test(debug)) return text ? '[redacted]' : '';
  return short(text, options.textLimit);
}
function classSummary(element) {
  const value = safeString(element.getAttribute('class'));
  if (!value) return undefined;
  const parts = value.split(/\s+/).filter(Boolean);
  const useful = parts.filter((part) => /selected|active|hidden|opacity|translate|animate|border|bg-|text-|ring|disabled|pointer|sr-only/.test(part));
  return (useful.length ? useful : parts.slice(0, 6)).slice(0, 10).join(' ');
}
function attrMap(element) {
  const attrs = {};
  const allow = /^(id|role|aria-|data-pibo-|data-testid$|disabled$|checked$|selected$|hidden$|tabindex$|title$)/;
  for (const attr of Array.from(element.attributes || [])) {
    if (!allow.test(attr.name)) continue;
    if (/token|cookie|authorization|secret|password/i.test(attr.name)) {
      attrs[attr.name] = '[redacted]';
    } else {
      attrs[attr.name] = short(attr.value, 120);
    }
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    attrs.value = element.value ? '[redacted:' + element.value.length + ' chars]' : '';
    attrs.disabled = Boolean(element.disabled);
  }
  return attrs;
}
function roleOf(element) {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a') return 'link';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') return 'input';
  if (tag === 'select') return 'combobox';
  if (tag === 'main') return 'main';
  if (tag === 'aside') return 'complementary';
  if (tag === 'nav') return 'navigation';
  return undefined;
}
function nameOf(element, options) {
  const aria = element.getAttribute('aria-label');
  if (aria) return short(aria, options.textLimit);
  const title = element.getAttribute('title');
  if (title) return short(title, options.textLimit);
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return short(element.getAttribute('placeholder') || '', options.textLimit);
  const debug = element.getAttribute('data-pibo-debug');
  if (debug === 'session-row') return short(element.getAttribute('data-pibo-title') || element.innerText || '', options.textLimit);
  return undefined;
}
function elementPath(element) {
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    const parent = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const index = Array.from(parent.children).filter((child) => child.tagName === current.tagName).indexOf(current) + 1;
    parts.unshift(tag + ':nth-of-type(' + index + ')');
    current = parent;
  }
  return parts.join('>');
}
function identityOf(element) {
  const debug = element.getAttribute('data-pibo-debug');
  const session = element.getAttribute('data-pibo-session-id');
  const room = element.getAttribute('data-pibo-room-id');
  const view = element.getAttribute('data-pibo-view-id');
  const testId = element.getAttribute('data-testid');
  const id = element.id;
  if (debug && session) return { identity: debug + ':' + session, kind: 'pibo-session' };
  if (debug && room) return { identity: debug + ':' + room, kind: 'pibo-room' };
  if (debug && view) return { identity: debug + ':' + view, kind: 'pibo-view' };
  if (debug) return { identity: debug, kind: 'pibo-debug' };
  if (testId) return { identity: 'testid:' + testId, kind: 'testid' };
  if (id) return { identity: 'id:' + id, kind: 'id' };
  const role = roleOf(element);
  const name = nameOf(element, { textLimit: 40 }) || '';
  if (role && name) return { identity: role + ':' + name, kind: 'role-name' };
  return { identity: 'path:' + elementPath(element), kind: 'path' };
}
function boxOf(element) {
  const rect = element.getBoundingClientRect();
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
}
function isImportantElement(element, depth) {
  if (!(element instanceof Element)) return false;
  const tag = element.tagName.toLowerCase();
  if (depth === 0) return true;
  if (['script', 'style', 'svg', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon'].includes(tag)) return false;
  if (element.hasAttribute('data-pibo-debug') || element.hasAttribute('data-pibo-session-id') || element.hasAttribute('data-testid')) return true;
  if (element.hasAttribute('aria-label') || element.hasAttribute('title') || element.hasAttribute('role')) return true;
  if (['button', 'a', 'input', 'textarea', 'select', 'option', 'main', 'aside', 'nav'].includes(tag)) return true;
  if (element === document.activeElement) return true;
  if (element.getAttribute('aria-selected') === 'true' || element.getAttribute('data-pibo-selected') === 'true' || element.hasAttribute('hidden')) return true;
  const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
  if (text && element.children.length === 0 && depth <= 4) return true;
  return false;
}
function summarizeElement(element, depth, ref, options) {
  const ident = identityOf(element);
  const node = {
    ref,
    identity: ident.identity,
    identityKind: ident.kind,
    depth,
    tag: element.tagName.toLowerCase(),
    attributes: attrMap(element),
    path: elementPath(element),
  };
  const role = roleOf(element); if (role) node.role = role;
  const name = nameOf(element, options); if (name) node.name = name;
  const text = redactText(element, options); if (text) node.text = text;
  const classes = classSummary(element); if (classes) node.classSummary = classes;
  if (document.activeElement === element) node.focused = true;
  if (options.includeLayout) node.box = boxOf(element);
  return node;
}
function captureSnapshot(options) {
  const root = document.querySelector(options.scope);
  const nodes = [];
  const omitted = { nodes: 0, depth: 0, budget: false };
  let refSeq = 0;
  function walk(element, depth) {
    if (!(element instanceof Element)) return;
    if (depth > options.maxDepth) { omitted.depth += 1; return; }
    if (isImportantElement(element, depth)) {
      if (nodes.length >= options.maxNodes) { omitted.nodes += 1; omitted.budget = true; return; }
      const node = summarizeElement(element, depth, '@n' + (++refSeq), options);
      nodes.push(node);
    }
    for (const child of Array.from(element.children)) walk(child, depth + 1);
  }
  if (root) walk(root, 0);
  const active = document.activeElement instanceof Element ? summarizeElement(document.activeElement, 0, '@focus', options) : undefined;
  return {
    kind: 'snapshot',
    createdAt: nowIso(),
    url: location.href,
    title: document.title || '',
    scope: options.scope,
    rootFound: Boolean(root),
    root: nodes[0],
    activeElement: active ? { identity: active.identity, tag: active.tag, name: active.name, path: active.path } : undefined,
    nodes,
    omitted,
  };
}
function mutationTarget(mutation, options) {
  const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
  return target ? summarizeElement(target, 0, '@target', options) : undefined;
}
function pushEvent(events, omitted, maxEvents, event) {
  if (events.length >= maxEvents) { omitted.events += 1; return; }
  events.push(event);
}
function findNewSessionButton() {
  const candidates = Array.from(document.querySelectorAll('button'));
  return candidates.find((button) => {
    const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent].filter(Boolean).join(' ');
    return /New Session/i.test(label);
  });
}
async function runWatch(options) {
  const root = document.querySelector(options.scope);
  const events = [];
  const omitted = { events: 0, nodes: 0, depth: 0, budget: false };
  const start = performance.now();
  const at = () => Math.max(0, Math.round(performance.now() - start));
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  let action = undefined;
  const routeEvent = (kind, beforeUrl, afterUrl) => {
    if (beforeUrl !== afterUrl) pushEvent(events, omitted, options.maxEvents, { t: at(), source: 'route', kind, before: beforeUrl, after: afterUrl });
  };
  history.pushState = function(...args) {
    const beforeUrl = location.href;
    const result = originalPushState.apply(this, args);
    routeEvent('pushState', beforeUrl, location.href);
    return result;
  };
  history.replaceState = function(...args) {
    const beforeUrl = location.href;
    const result = originalReplaceState.apply(this, args);
    routeEvent('replaceState', beforeUrl, location.href);
    return result;
  };
  const onPopState = () => pushEvent(events, omitted, options.maxEvents, { t: at(), source: 'route', kind: 'popstate', after: location.href });
  const onFocusIn = (event) => {
    if (!(event.target instanceof Element)) return;
    if (root && !root.contains(event.target)) return;
    const node = summarizeElement(event.target, 0, '@focus', options);
    pushEvent(events, omitted, options.maxEvents, { t: at(), source: 'focus', kind: 'focusin', target: node.identity, node });
  };
  const observer = root ? new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const added of Array.from(mutation.addedNodes)) {
          if (!(added instanceof Element)) continue;
          const node = summarizeElement(added, 0, '@added', options);
          pushEvent(events, omitted, options.maxEvents, { t: at(), source: 'dom', kind: 'added', target: node.identity, node });
        }
        for (const removed of Array.from(mutation.removedNodes)) {
          if (!(removed instanceof Element)) continue;
          const node = summarizeElement(removed, 0, '@removed', options);
          pushEvent(events, omitted, options.maxEvents, { t: at(), source: 'dom', kind: 'removed', target: node.identity, node });
        }
      } else if (mutation.type === 'attributes') {
        const node = mutationTarget(mutation, options);
        if (!node) continue;
        const name = mutation.attributeName || 'attribute';
        const after = mutation.target instanceof Element ? mutation.target.getAttribute(name) : undefined;
        pushEvent(events, omitted, options.maxEvents, { t: at(), source: 'dom', kind: 'attr', target: node.identity, detail: name, before: mutation.oldValue || '', after: after || '', node });
      } else if (mutation.type === 'characterData') {
        const node = mutationTarget(mutation, options);
        pushEvent(events, omitted, options.maxEvents, { t: at(), source: 'dom', kind: 'text', target: node ? node.identity : undefined, before: short(mutation.oldValue || '', options.textLimit), after: short(mutation.target.textContent || '', options.textLimit), node });
      }
    }
  }) : undefined;
  if (observer && root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true, attributeFilter: ['class', 'style', 'hidden', 'aria-selected', 'aria-expanded', 'data-pibo-selected', 'data-pibo-session-id', 'data-pibo-selected-session-id', 'data-pibo-state', 'data-pibo-debug'] });
  document.addEventListener('focusin', onFocusIn, true);
  window.addEventListener('popstate', onPopState, true);
  const before = captureSnapshot(options);
  omitted.nodes += before.omitted.nodes;
  omitted.depth += before.omitted.depth;
  omitted.budget = omitted.budget || before.omitted.budget;
  if (options.action === 'new-session') {
    try {
      const button = findNewSessionButton();
      action = { requested: 'new-session', performed: Boolean(button) };
      if (button) {
        const node = summarizeElement(button, 0, '@action', options);
        pushEvent(events, omitted, options.maxEvents, { t: at(), source: 'action', kind: 'click', target: node.identity, detail: 'New Session', node });
        button.click();
      } else {
        action.error = 'New Session button not found';
      }
    } catch (error) {
      action = { requested: 'new-session', performed: false, error: String(error && error.message ? error.message : error) };
    }
  }
  await new Promise((resolve) => setTimeout(resolve, options.durationMs));
  observer?.disconnect();
  document.removeEventListener('focusin', onFocusIn, true);
  window.removeEventListener('popstate', onPopState, true);
  history.pushState = originalPushState;
  history.replaceState = originalReplaceState;
  const after = captureSnapshot(options);
  omitted.nodes += after.omitted.nodes;
  omitted.depth += after.omitted.depth;
  omitted.budget = omitted.budget || after.omitted.budget || omitted.events > 0;
  return {
    kind: 'watch',
    createdAt: nowIso(),
    url: location.href,
    title: document.title || '',
    scope: options.scope,
    durationMs: options.durationMs,
    rootFound: Boolean(before.rootFound || after.rootFound),
    events,
    before,
    after,
    omitted,
    action,
  };
}
`;
}

function parseOptions(args: string[]): WebOptions {
	const options: WebOptions = {
		positionals: [],
		json: false,
		artifact: false,
		fixture: false,
		backendFixture: false,
		assertHealthy: false,
		act: false,
		manual: false,
		includeText: false,
		includeLayout: false,
	};
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--json") options.json = true;
		else if (arg === "--artifact") options.artifact = true;
		else if (arg === "--fixture") options.fixture = true;
		else if (arg === "--backend-fixture") options.backendFixture = true;
		else if (arg === "--assert") options.assertHealthy = true;
		else if (arg === "--act") options.act = true;
		else if (arg === "--manual") options.manual = true;
		else if (arg === "--include-text") options.includeText = true;
		else if (arg === "--include-layout") options.includeLayout = true;
		else if (arg === "--cdp-url") options.cdpUrl = requireValue(args, ++index, arg);
		else if (arg.startsWith("--cdp-url=")) options.cdpUrl = arg.slice("--cdp-url=".length);
		else if (arg === "--target") options.target = requireValue(args, ++index, arg);
		else if (arg.startsWith("--target=")) options.target = arg.slice("--target=".length);
		else if (arg === "--scope") options.scope = requireValue(args, ++index, arg);
		else if (arg.startsWith("--scope=")) options.scope = arg.slice("--scope=".length);
		else if (arg === "--preset") options.preset = requireValue(args, ++index, arg);
		else if (arg.startsWith("--preset=")) options.preset = arg.slice("--preset=".length);
		else if (arg === "--duration") options.duration = requireValue(args, ++index, arg);
		else if (arg.startsWith("--duration=")) options.duration = arg.slice("--duration=".length);
		else if (arg === "--runs") options.runs = requireValue(args, ++index, arg);
		else if (arg.startsWith("--runs=")) options.runs = arg.slice("--runs=".length);
		else if (arg === "--from") options.from = requireValue(args, ++index, arg);
		else if (arg.startsWith("--from=")) options.from = arg.slice("--from=".length);
		else options.positionals.push(arg);
	}
	return options;
}

function requireValue(args: string[], index: number, flag: string): string {
	const value = args[index];
	if (!value) throw new Error(`${flag} requires a value`);
	return value;
}

function resolveScope(options: WebOptions): string {
	if (options.scope) return options.scope;
	if (options.preset) return presetScope(options.preset);
	throw new Error("Missing --scope or --preset. Try --preset session-list, chat-shell, composer, or app.");
}

function presetScope(preset: string): string {
	switch (preset) {
		case "app": return "[data-pibo-debug=\"chat-app\"]";
		case "route-shell": return "[data-pibo-debug=\"route-shell\"]";
		case "sidebar": return "[data-pibo-debug=\"sidebar-shell\"]";
		case "session-list": return "[data-pibo-debug=\"session-list\"]";
		case "chat-shell": return "[data-pibo-debug=\"chat-shell\"]";
		case "composer": return "[data-pibo-debug=\"composer\"]";
		default: throw new Error(`Unknown web render preset "${preset}". Use app, route-shell, sidebar, session-list, chat-shell, or composer.`);
	}
}

function parseDuration(value?: string): number {
	if (!value) return DEFAULT_WATCH_DURATION_MS;
	const duration = Number(value);
	if (!Number.isFinite(duration) || duration <= 0) throw new Error("--duration must be a positive number of milliseconds");
	if (duration > MAX_WATCH_DURATION_MS) throw new Error(`--duration must be <= ${MAX_WATCH_DURATION_MS}ms`);
	return Math.round(duration);
}

function parseRuns(value?: string): number {
	if (!value) return 1;
	const runs = Number(value);
	if (!Number.isInteger(runs) || runs <= 0) throw new Error("--runs must be a positive integer");
	if (runs > 10) throw new Error("--runs must be <= 10");
	return runs;
}

function formatSnapshot(snapshot: WebSnapshot, target: BrowserUseCdpTarget | { id: string; url: string; title: string }): string {
	const lines = [
		`# Web Render Snapshot`,
		`# target: ${target.id} ${target.url || snapshot.url}`,
		`# scope: ${snapshot.scope}`,
	];
	if (!snapshot.rootFound) {
		lines.push("root: not found");
		return lines.join("\n");
	}
	for (const node of snapshot.nodes) lines.push(formatNodeLine(node));
	lines.push(`Summary: ${snapshot.nodes.length} nodes, omitted=${snapshot.omitted.nodes}, depth_omitted=${snapshot.omitted.depth}`);
	return lines.join("\n");
}

function formatNodeLine(node: SnapshotNode): string {
	const indent = "  ".repeat(Math.min(node.depth, 8));
	const parts = [`${indent}${node.ref}`, node.identityKind === "path" ? `${node.identity} unstable` : node.identity, `<${node.tag}>`];
	if (node.role) parts.push(`role=${node.role}`);
	if (node.name) parts.push(`name=${JSON.stringify(node.name)}`);
	if (node.attributes["data-pibo-session-id"]) parts.push(`session=${node.attributes["data-pibo-session-id"]}`);
	if (node.attributes["data-pibo-selected"]) parts.push(`selected=${node.attributes["data-pibo-selected"]}`);
	if (node.attributes["data-pibo-state"]) parts.push(`state=${node.attributes["data-pibo-state"]}`);
	if (node.classSummary) parts.push(`class=${JSON.stringify(node.classSummary)}`);
	if (node.text && !node.name) parts.push(`text=${JSON.stringify(node.text)}`);
	if (node.focused) parts.push("focused=true");
	if (node.box) parts.push(`box=${node.box.x},${node.box.y},${node.box.w},${node.box.h}`);
	return parts.join(" ");
}

function diffSnapshots(before: WebSnapshot, after: WebSnapshot): { added: SnapshotNode[]; removed: SnapshotNode[]; changed: Array<{ before: SnapshotNode; after: SnapshotNode; changes: string[] }>; suspectedFlickers: string[] } {
	const beforeMap = new Map(before.nodes.map((node) => [node.identity, node]));
	const afterMap = new Map(after.nodes.map((node) => [node.identity, node]));
	const added: SnapshotNode[] = [];
	const removed: SnapshotNode[] = [];
	const changed: Array<{ before: SnapshotNode; after: SnapshotNode; changes: string[] }> = [];
	for (const node of after.nodes) if (!beforeMap.has(node.identity)) added.push(node);
	for (const node of before.nodes) if (!afterMap.has(node.identity)) removed.push(node);
	for (const [identity, beforeNode] of beforeMap) {
		const afterNode = afterMap.get(identity);
		if (!afterNode) continue;
		const changes = nodeChanges(beforeNode, afterNode);
		if (changes.length) changed.push({ before: beforeNode, after: afterNode, changes });
	}
	const suspectedFlickers = inferSnapshotFlickers(removed, added);
	return { added, removed, changed, suspectedFlickers };
}

function nodeChanges(before: SnapshotNode, after: SnapshotNode): string[] {
	const changes: string[] = [];
	if (before.name !== after.name) changes.push(`name ${jsonShort(before.name)} -> ${jsonShort(after.name)}`);
	if (before.text !== after.text) changes.push(`text ${jsonShort(before.text)} -> ${jsonShort(after.text)}`);
	if (before.classSummary !== after.classSummary) changes.push(`class ${jsonShort(before.classSummary)} -> ${jsonShort(after.classSummary)}`);
	for (const key of new Set([...Object.keys(before.attributes), ...Object.keys(after.attributes)])) {
		if (before.attributes[key] !== after.attributes[key]) changes.push(`${key} ${jsonShort(before.attributes[key])} -> ${jsonShort(after.attributes[key])}`);
	}
	if (before.box && after.box) {
		const moved = Math.abs(before.box.x - after.box.x) + Math.abs(before.box.y - after.box.y);
		const resized = Math.abs(before.box.w - after.box.w) + Math.abs(before.box.h - after.box.h);
		if (moved > 2 || resized > 2) changes.push(`box ${before.box.x},${before.box.y},${before.box.w},${before.box.h} -> ${after.box.x},${after.box.y},${after.box.w},${after.box.h}`);
	}
	return changes;
}

function inferSnapshotFlickers(removed: SnapshotNode[], added: SnapshotNode[]): string[] {
	const flickers: string[] = [];
	for (const oldNode of removed) {
		const match = bestLogicalMatch(oldNode, added);
		if (match && match.score >= 55) {
			flickers.push(`remount-like ${oldNode.identity} -> ${match.node.identity} reason=${match.reason}`);
		}
	}
	return flickers.slice(0, 20);
}

function formatSnapshotDiff(diff: ReturnType<typeof diffSnapshots>, before: WebSnapshot, after: WebSnapshot, target: BrowserUseCdpTarget | { id: string; url: string; title: string }): string {
	const lines = [
		`# Web Render Diff`,
		`# target: ${target.id} ${target.url || after.url}`,
		`# scope: ${after.scope}`,
		`# baseline: ${before.createdAt}`,
		`# current: ${after.createdAt}`,
	];
	for (const node of diff.removed) lines.push(`- ${node.identity} ${describeNode(node)}`);
	for (const node of diff.added) lines.push(`+ ${node.identity} ${describeNode(node)}`);
	for (const item of diff.changed) lines.push(`~ ${item.after.identity} ${item.changes.join("; ")}`);
	if (diff.suspectedFlickers.length) {
		lines.push("", "Suspected flicker:");
		for (const flicker of diff.suspectedFlickers) lines.push(`- ${flicker}`);
	}
	lines.push(``, `Summary: ${diff.added.length} adds, ${diff.removed.length} removals, ${diff.changed.length} updates, ${diff.suspectedFlickers.length} suspected flickers`);
	return lines.join("\n");
}

export function formatWatch(watch: WebWatch, target: BrowserUseCdpTarget | { id: string; url: string; title: string }, label = "watch"): string {
	const lines = [
		`# Web Render Watch: ${label}, ${(watch.durationMs / 1000).toFixed(1)}s`,
		`# target: ${target.id} ${target.url || watch.url}`,
		`# scope: ${watch.scope}`,
	];
	if (!watch.rootFound) {
		lines.push("root: not found");
		return lines.join("\n");
	}
	if (watch.action) {
		lines.push(`# action: ${watch.action.requested} performed=${watch.action.performed}${watch.action.error ? ` error=${watch.action.error}` : ""}`);
	}
	const snapshotDelta = watch.before && watch.after ? diffSnapshots(watch.before, watch.after) : undefined;
	const hasSnapshotDelta = snapshotDelta ? hasSnapshotDiff(snapshotDelta) : false;
	if (!watch.events.length && hasSnapshotDelta) {
		lines.push("no mutation events captured; final snapshot differs:");
		lines.push(...formatCompactSnapshotDelta(snapshotDelta!));
	} else if (!watch.events.length) {
		lines.push("no changes");
	}
	for (const event of watch.events) {
		lines.push(formatWatchEvent(event));
	}
	const flickers = inferWatchFlickers(watch.events);
	if (flickers.length) {
		lines.push("", "Suspected flicker:");
		for (const flicker of flickers) lines.push(`- ${flicker}`);
	}
	const counts = countEvents(watch.events);
	lines.push("", `Summary: ${counts.added} adds, ${counts.removed} removals, ${counts.attr} attr updates, ${counts.text} text updates, ${counts.focus} focus, ${counts.route} route, ${flickers.length} suspected flickers, omitted=${watch.omitted.events}`);
	return lines.join("\n");
}

function formatWatchEvent(event: WatchEvent): string {
	const t = String(event.t).padStart(4, "0");
	if (event.source === "dom" && event.kind === "attr") return `${t}ms dom ~ ${event.target ?? "?"} ${event.detail}: ${jsonShort(event.before)} -> ${jsonShort(event.after)}`;
	if (event.source === "dom" && event.kind === "text") return `${t}ms dom ~ ${event.target ?? "?"} text: ${jsonShort(event.before)} -> ${jsonShort(event.after)}`;
	if (event.source === "dom" && event.kind === "added") return `${t}ms dom + ${event.target ?? "?"} ${event.node ? describeNode(event.node) : ""}`;
	if (event.source === "dom" && event.kind === "removed") return `${t}ms dom - ${event.target ?? "?"} ${event.node ? describeNode(event.node) : ""}`;
	if (event.source === "focus") return `${t}ms focus ${event.kind} ${event.target ?? "?"}`;
	if (event.source === "route") return `${t}ms route ${event.kind} ${event.before ? `${event.before} -> ` : ""}${event.after ?? ""}`;
	if (event.source === "action") return `${t}ms action ${event.kind} ${event.detail ?? ""} ${event.target ?? ""}`;
	return `${t}ms ${event.source} ${event.kind} ${event.target ?? ""}`;
}

function hasSnapshotDiff(diff: ReturnType<typeof diffSnapshots>): boolean {
	return Boolean(diff.added.length || diff.removed.length || diff.changed.length);
}

function scoreStreamingBenchmark(benchmark: Omit<StreamingBenchmark, "score">): StreamingSmoothnessScore {
	const debugDelta = benchmark.debug.delta ?? {};
	const textDeltaCount = numberField(debugDelta, "textDeltaCount");
	const domGapP50Ms = finiteNumber(benchmark.dom.gapsMs.p50);
	const domGapP90Ms = finiteNumber(benchmark.dom.gapsMs.p90);
	const domJumpP90Chars = finiteNumber(benchmark.dom.positiveCharJumps.p90);
	const firstVisibleMs = finiteNumber(benchmark.dom.firstPositiveUpdateMs);
	const providerToDomRatio = textDeltaCount > 0 ? Math.min(1, benchmark.dom.positiveUpdateCount / textDeltaCount) : 0;
	const smoothness =
		0.30 * clampScore(100 - (domGapP50Ms ?? 100))
		+ 0.25 * clampScore(((300 - (domGapP90Ms ?? 300)) / 3))
		+ 0.20 * clampScore(((120 - (domJumpP90Chars ?? 120)) / 1.2))
		+ 0.15 * clampScore(providerToDomRatio * 100)
		+ 0.10 * clampScore(100 - ((firstVisibleMs ?? 500) / 5));
	return {
		smoothness: round3(smoothness),
		domGapP50Ms,
		domGapP90Ms,
		domJumpP90Chars,
		textDeltaCount,
		domPositiveUpdateCount: benchmark.dom.positiveUpdateCount,
		firstVisibleMs,
	};
}

function summarizeStreamingBenchmarkGroup(runs: StreamingBenchmark[], baselineRuns?: StreamingBenchmark[]): StreamingBenchmarkGroup {
	const summary = summarizeStreamingBenchmarks(runs);
	return {
		kind: "streaming-benchmark-runs",
		createdAt: new Date().toISOString(),
		durationMs: runs[0]?.durationMs ?? 0,
		runs,
		summary,
		comparison: baselineRuns?.length ? compareStreamingBenchmarkSummaries(summarizeStreamingBenchmarks(baselineRuns), summary) : undefined,
		regressions: runs.flatMap((run, index) => run.regressions.map((regression) => `run ${index + 1}: ${regression}`)),
		warnings: runs.flatMap((run, index) => run.warnings.map((warning) => `run ${index + 1}: ${warning}`)),
	};
}

function summarizeStreamingBenchmarks(runs: StreamingBenchmark[]): StreamingBenchmarkSummary {
	return {
		runs: runs.length,
		smoothness: numericStats(runs.map((run) => run.score.smoothness)),
		textDeltaCount: numericStats(runs.map((run) => run.score.textDeltaCount)),
		domPositiveUpdateCount: numericStats(runs.map((run) => run.score.domPositiveUpdateCount)),
		domGapP50Ms: numericStats(runs.map((run) => run.dom.gapsMs.p50)),
		domGapP90Ms: numericStats(runs.map((run) => run.dom.gapsMs.p90)),
		domGapMaxMs: numericStats(runs.map((run) => run.dom.gapsMs.max)),
		domJumpP90Chars: numericStats(runs.map((run) => run.dom.positiveCharJumps.p90)),
		domJumpMaxChars: numericStats(runs.map((run) => run.dom.positiveCharJumps.max)),
		firstVisibleMs: numericStats(runs.map((run) => run.dom.firstPositiveUpdateMs)),
		longTaskMaxMs: numericStats(runs.map((run) => run.longTasks.maxMs)),
		regressionCount: numericStats(runs.map((run) => run.regressions.length)),
	};
}

function compareStreamingBenchmarkSummaries(baseline: StreamingBenchmarkSummary, current: StreamingBenchmarkSummary): StreamingBenchmarkComparison {
	return {
		baselineRuns: baseline.runs,
		currentRuns: current.runs,
		smoothnessDelta: statDelta(current.smoothness, baseline.smoothness),
		domGapP90DeltaMs: statDelta(current.domGapP90Ms, baseline.domGapP90Ms),
		domPositiveUpdateDelta: statDelta(current.domPositiveUpdateCount, baseline.domPositiveUpdateCount),
		domJumpMaxDeltaChars: statDelta(current.domJumpMaxChars, baseline.domJumpMaxChars),
		longTaskMaxDeltaMs: statDelta(current.longTaskMaxMs, baseline.longTaskMaxMs),
	};
}

async function readStreamingBenchmarkRuns(file: string): Promise<StreamingBenchmark[]> {
	const parsed = JSON.parse(await readFile(file, "utf8"));
	const value = parsed.benchmark ?? parsed;
	const runs = value.kind === "streaming-benchmark-runs" ? value.runs : [value];
	return runs.filter((run: Partial<StreamingBenchmark>) => run.kind === "streaming-benchmark").map((run: StreamingBenchmark) => ({
		...run,
		score: run.score ?? scoreStreamingBenchmark(run),
	}));
}

function numericStats(values: readonly unknown[]): NumberStats {
	const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).slice().sort((a, b) => a - b);
	if (!nums.length) return { count: 0 };
	const pick = (q: number) => nums[Math.min(nums.length - 1, Math.max(0, Math.floor((nums.length - 1) * q)))];
	const avg = nums.reduce((sum, value) => sum + value, 0) / nums.length;
	return {
		count: nums.length,
		min: round3(nums[0]),
		p50: round3(pick(0.50)),
		p90: round3(pick(0.90)),
		p99: round3(pick(0.99)),
		max: round3(nums[nums.length - 1]),
		avg: round3(avg),
	};
}

function statDelta(current: NumberStats, baseline: NumberStats): number | undefined {
	if (current.p50 === undefined || baseline.p50 === undefined) return undefined;
	return round3(current.p50 - baseline.p50);
}

function clampScore(value: number): number {
	return Math.min(100, Math.max(0, value));
}

function finiteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function round3(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function formatStreamingBenchmarkResult(benchmark: StreamingBenchmark | StreamingBenchmarkGroup, target: BrowserUseCdpTarget | { id: string; url: string; title: string }): string {
	return benchmark.kind === "streaming-benchmark-runs" ? formatStreamingBenchmarkGroup(benchmark, target) : formatStreamingBenchmark(benchmark, target);
}

function formatStreamingBenchmark(benchmark: StreamingBenchmark, target: BrowserUseCdpTarget | { id: string; url: string; title: string }): string {
	const debugDelta: Record<string, number> = benchmark.debug.delta ?? {};
	const debugAfter: StreamingDebugCounters = benchmark.debug.after ?? {};
	const lines = [
		`# Web Streaming Benchmark, ${(benchmark.durationMs / 1000).toFixed(1)}s`,
		`# target: ${target.id} ${target.url || benchmark.url}`,
		`debug: available=${benchmark.debug.available} reset=${benchmark.debug.reset}`,
		`events: text=${numberField(debugDelta, "textDeltaCount")} (${numberField(debugDelta, "textDeltaBytes")} bytes), reasoning=${numberField(debugDelta, "reasoningDeltaCount")}, enqueue=${numberField(debugDelta, "enqueueCount")}, flush=${numberField(debugDelta, "flushCount")}, overlayUpdates=${numberField(debugDelta, "overlayUpdateCount")}`,
		`state: overlayEvents=${jsonShort(debugAfter.overlayEventCount)} currentOutput=${jsonShort(debugAfter.currentOutputLength)} traceBase=${jsonShort(debugAfter.traceBaseOutputLength)} durable=${jsonShort(debugAfter.lastDurableCursor)} transient=${jsonShort(debugAfter.lastTransientLiveId)}`,
		`score: smoothness=${benchmark.score.smoothness}, dom/provider updates=${benchmark.score.domPositiveUpdateCount}/${benchmark.score.textDeltaCount}`,
		`dom: targets=${benchmark.dom.targetCountStart}->${benchmark.dom.targetCountEnd}, length=${benchmark.dom.lengthStart}->${benchmark.dom.lengthEnd}, updates=${benchmark.dom.updateCount}, positive=${benchmark.dom.positiveUpdateCount}, firstPositive=${jsonShort(benchmark.dom.firstPositiveUpdateMs)}ms`,
		`dom gaps: ${formatStats(benchmark.dom.gapsMs)}`,
		`dom jumps: ${formatStats(benchmark.dom.positiveCharJumps)} chars`,
		`raf: count=${benchmark.raf.count}, gaps=${formatStats(benchmark.raf.gapsMs)}`,
		`longTasks: count=${benchmark.longTasks.count}, max=${benchmark.longTasks.maxMs}ms, total=${benchmark.longTasks.totalMs}ms`,
	];
	if (benchmark.fixture) lines.push(`fixture: mode=${benchmark.fixture.mode} available=${benchmark.fixture.available} started=${benchmark.fixture.started} deltas=${jsonShort(benchmark.fixture.deltaCount)} cadence=${jsonShort(benchmark.fixture.cadenceMs)}ms session=${jsonShort(benchmark.fixture.piboSessionId)}${benchmark.fixture.error ? ` error=${benchmark.fixture.error}` : ""}`);
	if (benchmark.regressions.length) {
		lines.push("", "Regressions:");
		for (const regression of benchmark.regressions) lines.push(`- ${regression}`);
	}
	if (benchmark.warnings.length) {
		lines.push("", "Warnings:");
		for (const warning of benchmark.warnings) lines.push(`- ${warning}`);
	}
	return lines.join("\n");
}

function formatStreamingBenchmarkGroup(group: StreamingBenchmarkGroup, target: BrowserUseCdpTarget | { id: string; url: string; title: string }): string {
	const lines = [
		`# Web Streaming Benchmark, ${group.runs.length} runs x ${(group.durationMs / 1000).toFixed(1)}s`,
		`# target: ${target.id} ${target.url || group.runs[0]?.url || ""}`,
		`summary: smoothness=${formatStats(group.summary.smoothness)}, regressions=${formatStats(group.summary.regressionCount)}`,
		`events: text=${formatStats(group.summary.textDeltaCount)}, domPositive=${formatStats(group.summary.domPositiveUpdateCount)}`,
		`dom gaps p50=${formatStats(group.summary.domGapP50Ms)}, p90=${formatStats(group.summary.domGapP90Ms)}, max=${formatStats(group.summary.domGapMaxMs)}`,
		`dom jumps p90=${formatStats(group.summary.domJumpP90Chars)}, max=${formatStats(group.summary.domJumpMaxChars)} chars`,
		`firstVisible=${formatStats(group.summary.firstVisibleMs)}, longTaskMax=${formatStats(group.summary.longTaskMaxMs)}`,
	];
	if (group.comparison) {
		lines.push(`comparison vs baseline (${group.comparison.baselineRuns} runs): smoothness ${signed(group.comparison.smoothnessDelta)}, domP90Gap ${signed(group.comparison.domGapP90DeltaMs)}ms, domPositive ${signed(group.comparison.domPositiveUpdateDelta)}, maxJump ${signed(group.comparison.domJumpMaxDeltaChars)} chars, longTaskMax ${signed(group.comparison.longTaskMaxDeltaMs)}ms`);
	}
	if (group.regressions.length) {
		lines.push("", "Regressions:");
		for (const regression of group.regressions) lines.push(`- ${regression}`);
	}
	if (group.warnings.length) {
		lines.push("", "Warnings:");
		for (const warning of group.warnings) lines.push(`- ${warning}`);
	}
	return lines.join("\n");
}

function signed(value: number | undefined): string {
	if (value === undefined) return "n/a";
	return value > 0 ? `+${value}` : String(value);
}

function numberField(record: Record<string, unknown>, key: string): number {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatStats(stats: NumberStats): string {
	if (!stats.count) return "count=0";
	return `count=${stats.count}, p50=${stats.p50}, p90=${stats.p90}, p99=${stats.p99}, max=${stats.max}, avg=${stats.avg}`;
}

function formatCompactSnapshotDelta(diff: ReturnType<typeof diffSnapshots>, limit = 8): string[] {
	const lines: string[] = [];
	for (const node of diff.removed) lines.push(`  - ${node.identity} ${describeNode(node)}`);
	for (const node of diff.added) lines.push(`  + ${node.identity} ${describeNode(node)}`);
	for (const item of diff.changed) lines.push(`  ~ ${item.after.identity} ${item.changes.join("; ")}`);
	if (lines.length > limit) return [...lines.slice(0, limit), `  … ${lines.length - limit} more snapshot changes`];
	return lines;
}

export function inferWatchFlickers(events: readonly WatchEvent[]): string[] {
	const flickers: string[] = [];
	const removals = events.filter((event) => event.kind === "removed" && event.node);
	const additions = events.filter((event) => event.kind === "added" && event.node);
	for (const added of additions) {
		const addedNode = added.node!;
		const removal = removals.find((removed) => removed.t >= added.t && removed.t - added.t <= 500 && removed.node && sameStableNode(addedNode, removed.node));
		if (removal?.node) flickers.push(`transient node within ${removal.t - added.t}ms: ${addedNode.identity} added then removed`);
	}
	for (const removed of removals) {
		const removedNode = removed.node!;
		const candidates = additions.filter((added) => added.t >= removed.t && added.t - removed.t <= 500 && added.node);
		const match = bestLogicalMatch(removedNode, candidates.map((candidate) => candidate.node!));
		if (match && match.score >= 55) {
			const event = candidates.find((candidate) => candidate.node === match.node);
			if (event) flickers.push(`remove/add within ${event.t - removed.t}ms: ${removedNode.identity} -> ${match.node.identity} reason=${match.reason}`);
		}
	}
	const attrRollbacks = new Map<string, WatchEvent[]>();
	for (const event of events) {
		if (event.kind !== "attr" || !event.target || !event.detail) continue;
		const key = `${event.target}:${event.detail}`;
		attrRollbacks.set(key, [...(attrRollbacks.get(key) ?? []), event]);
	}
	for (const [key, entries] of attrRollbacks) {
		for (let i = 1; i < entries.length; i++) {
			if (entries[i - 1].before === entries[i].after && entries[i].t - entries[i - 1].t <= 500) {
				flickers.push(`attribute rollback within ${entries[i].t - entries[i - 1].t}ms: ${key}`);
				break;
			}
		}
	}
	return [...new Set(flickers)].slice(0, 20);
}

function sameStableNode(left: SnapshotNode, right: SnapshotNode): boolean {
	if (left.identity === right.identity) return true;
	const leftSession = attrText(left, "data-pibo-session-id");
	const rightSession = attrText(right, "data-pibo-session-id");
	return Boolean(leftSession && leftSession === rightSession);
}

function bestLogicalMatch(node: SnapshotNode, candidates: readonly SnapshotNode[]): { node: SnapshotNode; score: number; reason: string } | undefined {
	let best: { node: SnapshotNode; score: number; reason: string } | undefined;
	for (const candidate of candidates) {
		const match = logicalMatchScore(node, candidate);
		if (!best || match.score > best.score) best = { node: candidate, ...match };
	}
	return best && best.score > 0 ? best : undefined;
}

function logicalMatchScore(left: SnapshotNode, right: SnapshotNode): { score: number; reason: string } {
	if (left.identity === right.identity) return { score: 100, reason: "same-identity" };
	const leftSession = attrText(left, "data-pibo-session-id");
	const rightSession = attrText(right, "data-pibo-session-id");
	if (leftSession && rightSession && leftSession === rightSession) return { score: 90, reason: "same-session-id" };

	const reasons: string[] = [];
	let score = 0;
	const leftDebug = attrText(left, "data-pibo-debug");
	const rightDebug = attrText(right, "data-pibo-debug");
	if (leftDebug || rightDebug) {
		if (leftDebug !== rightDebug) return { score: 0, reason: "different-debug-anchor" };
		score += 45;
		reasons.push("same-debug-anchor");
	}
	if (left.tag === right.tag) {
		score += 10;
		reasons.push("same-tag");
	}
	if (left.path && left.path === right.path) {
		score += 25;
		reasons.push("same-path");
	}
	if (left.role && left.role === right.role) {
		score += 10;
		reasons.push("same-role");
	}

	const differentSessionIds = Boolean(leftSession && rightSession && leftSession !== rightSession);
	if (!differentSessionIds) {
		if (left.name && left.name === right.name) {
			score += 15;
			reasons.push("same-name");
		}
		if (left.text && left.text === right.text) {
			score += 10;
			reasons.push("same-text");
		}
	}
	return { score, reason: reasons.join("+") || "weak-match" };
}

function attrText(node: SnapshotNode, key: string): string | undefined {
	const value = node.attributes[key];
	return typeof value === "string" && value.length ? value : undefined;
}

function countEvents(events: readonly WatchEvent[]): { added: number; removed: number; attr: number; text: number; focus: number; route: number } {
	return {
		added: events.filter((event) => event.kind === "added").length,
		removed: events.filter((event) => event.kind === "removed").length,
		attr: events.filter((event) => event.kind === "attr").length,
		text: events.filter((event) => event.kind === "text").length,
		focus: events.filter((event) => event.source === "focus").length,
		route: events.filter((event) => event.source === "route").length,
	};
}

function describeNode(node: SnapshotNode): string {
	const parts = [`<${node.tag}>`];
	if (node.role) parts.push(`role=${node.role}`);
	if (node.name) parts.push(`name=${JSON.stringify(node.name)}`);
	if (node.text && !node.name) parts.push(`text=${JSON.stringify(node.text)}`);
	if (node.attributes["data-pibo-session-id"]) parts.push(`session=${node.attributes["data-pibo-session-id"]}`);
	if (node.attributes["data-pibo-selected"]) parts.push(`selected=${node.attributes["data-pibo-selected"]}`);
	if (node.classSummary) parts.push(`class=${JSON.stringify(node.classSummary)}`);
	return parts.join(" ");
}

async function writeLastSnapshot(snapshot: WebSnapshot | undefined): Promise<void> {
	if (!snapshot) return;
	const file = lastSnapshotPath();
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, JSON.stringify(snapshot, null, 2), "utf-8");
}

async function readBaselineSnapshot(file?: string): Promise<WebSnapshot> {
	const target = file ?? lastSnapshotPath();
	let text: string;
	try {
		text = await readFile(target, "utf-8");
	} catch {
		throw new Error(`Baseline snapshot not found at ${target}. Run pibo debug web snapshot first or pass --from <artifact>.`);
	}
	const parsed = JSON.parse(text) as unknown;
	if (isSnapshot(parsed)) return parsed;
	if (isRecord(parsed) && isSnapshot(parsed.snapshot)) return parsed.snapshot;
	if (isRecord(parsed) && isSnapshot(parsed.current)) return parsed.current;
	throw new Error(`File is not a web render snapshot: ${target}`);
}

async function writeArtifact(kind: string, payload: unknown): Promise<string> {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const dir = path.join(getPiboHome(), "debug", "web-render", stamp);
	await mkdir(dir, { recursive: true });
	const file = path.join(dir, `${kind}.json`);
	await writeFile(file, JSON.stringify(payload, null, 2), "utf-8");
	return file;
}

function lastSnapshotPath(): string {
	return path.join(getPiboHome(), "debug", "web-render", "last-snapshot.json");
}

function compactTarget(target: BrowserUseCdpTarget | { id: string; url: string; title: string; webSocketDebuggerUrl?: string }): Record<string, unknown> {
	return { id: target.id, url: target.url, title: target.title, webSocketDebuggerUrl: target.webSocketDebuggerUrl };
}

function limitStdout(value: string): string {
	if (value.length <= STDOUT_BUDGET) return value;
	return `${value.slice(0, STDOUT_BUDGET)}\n... truncated ${value.length - STDOUT_BUDGET} chars by stdout budget ...`;
}

function isSnapshot(value: unknown): value is WebSnapshot {
	return isRecord(value) && value.kind === "snapshot" && typeof value.scope === "string" && Array.isArray(value.nodes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWebSocketUrl(value?: string): boolean {
	return Boolean(value && /^wss?:\/\//.test(value));
}

function jsonShort(value: unknown): string {
	if (value === undefined) return "undefined";
	const text = typeof value === "string" ? value : JSON.stringify(value);
	return text.length > 90 ? `${text.slice(0, 89)}…` : text;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
