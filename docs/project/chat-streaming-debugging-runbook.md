# Chat Web Streaming Debugging Runbook

Use this runbook when Chat Web streaming looks chunky, delayed, duplicated, or inconsistent between local and hosted environments.

## Mental model

Treat streaming as a layered pipeline. Do not change UI code until you know which layer is losing cadence.

1. Provider and Pi Coding Agent emit normalized text, reasoning, and tool events.
2. Pibo runtime telemetry records provider requests, raw events, normalized events, parse errors, and timing.
3. Pibo output events and trace reconstruction build durable and live Chat Web state.
4. `/api/chat/events` exposes selected-session live SSE and room-summary SSE.
5. The browser receives `pibo` events through `EventSource` with SSE `id:` values.
6. Chat UI live overlay and trace snapshot fallback merge live frames into visible session state.
7. Compact terminal rows, Virtuoso, Markdown rendering, and sticky scroll produce the visible DOM.

## First rule

Separate provider chunking from app chunking before changing code. A visible 20-token jump can come from provider cadence, reverse-proxy buffering, EventSource identity, frontend dedupe, live-overlay batching, React rendering, Markdown work, virtualized scrolling, or trace fallback.

## Standard investigation order

### 1. Capture provider telemetry

Look for:

- provider request id
- text and reasoning delta counts
- delta byte p50, p90, p99
- inter-delta gap p50, p90, p99
- parse errors and unknown events
- first text latency

Use provider data to answer: did the provider actually emit fine deltas?

### 2. Compare direct and hosted SSE

Compare the same scenario through:

- direct localhost or worker gateway URL
- hosted HTTPS URL

Check:

- `X-Accel-Buffering: no`
- SSE event count
- network chunk bytes
- network chunk gaps
- text events per network chunk
- transient live ids

If hosted chunks are larger or delayed while direct is fine, suspect proxy buffering or hosted transport configuration before touching React.

### 3. Measure inside the browser page

Node `fetch` is useful but insufficient. Browser `EventSource` has its own state, reconnect behavior, and `lastEventId` behavior.

Inside the page, measure:

- selected-live EventSource event count
- room-summary EventSource noise separately
- `lastEventId`
- EventSource errors and ready state
- text and reasoning event preservation

Always bring the target page to the foreground before timing-sensitive browser measurements. Background CDP targets can throttle timers and `requestAnimationFrame`, creating false one-second streaming gaps.

### 4. Inspect live overlay and trace fallback

Use `?debugStreaming=1` where available. Compare:

- enqueue counts
- flush counts
- overlay event counts
- overlay update counts
- current output length
- trace base output length
- trace refresh count and duration
- first text, enqueue, flush, overlay, and DOM latencies

This separates transport loss from live-overlay batching.

### 5. Treat DOM cadence as the user-visible result

The final user-visible metrics are:

- positive visible assistant text updates
- update gaps
- positive character jump sizes
- first visible latency
- final visible latency
- long tasks

A smoothing change is valid only if it improves visible cadence without hiding provider-side chunking or adding long tasks.

## Benchmark command pattern

Prefer the productized debug scenario when available:

```bash
pibo debug web scenario streaming-benchmark --backend-fixture --assert --artifact
```

Useful variants:

```bash
pibo debug web scenario streaming-benchmark --backend-fixture --runs 3 --artifact
pibo debug web scenario streaming-benchmark --backend-fixture --fixture-profile jitter --assert --artifact
pibo debug web scenario streaming-benchmark --backend-fixture --fixture-mix reasoning-text --assert --artifact
pibo debug web scenario streaming-benchmark --backend-fixture --simulate-reconnect --assert --artifact
pibo debug web scenario streaming-benchmark --backend-fixture --simulate-trace-catchup --duration 2500 --assert --artifact
pibo debug web scenario streaming-benchmark --backend-fixture --compare-hosted-if-configured --assert --artifact
pibo debug web report streaming-benchmark --from artifact.json --compact
```

Use multi-run medians before tuning rendering. Do not trust one best run.

## Known fixed failure modes

### Hosted SSE buffering

Symptom: direct backend SSE delivers fine deltas, hosted HTTPS arrives as large network chunks with long gaps.

Fix pattern: Chat event responses must disable acceleration buffering, for example with `X-Accel-Buffering: no`.

Regression signal: high network chunk bytes, high chunk gaps, or high text events per network chunk on hosted only.

### Stale EventSource id dedupe

Symptom: browser receives fine events, but live overlay receives only a few frames and DOM updates mostly through trace refreshes.

Cause: live-only assistant deltas without their own SSE `id:` can inherit stale `EventSource.lastEventId`, causing frontend dedupe to collapse distinct deltas.

Fix pattern: live-only frames get transient ids such as `live:<n>`.

Invariant: transient `live:<n>` ids are connection-local and not durable replay cursors.

### Assistant delta identity collapse

Symptom: same-stream assistant deltas dedupe each other.

Fix pattern: assistant delta identity includes a frame index. Same-stream deltas must remain distinct.

### Optimistic user echo duplicates

Symptom: optimistic user prompt and transcript-confirmed user prompt both render.

Fix pattern: use stable client transaction identity and text fallback dedupe where transcript ids differ.

## Common traps

- Do not infer browser behavior from Node `fetch` alone.
- Do not use cumulative EventSource probe counters across repeated runs in the same tab. Use after-start counters.
- Do not assert transient `live:<n>` ids are globally unique across reconnects. Reconnect can reset them to `live:0`.
- Do not judge trace catch-up only by final DOM length. Trace snapshots can be transient; gate on maximum visible assistant length during the run.
- Do not let probe startup race the fixture. Start the SSE probe before posting the fixture and wait briefly for response headers.
- Do not let a stalled browser fetch abort consume the whole CDP timeout. Return partial artifacts with abort/error fields.
- Do not mix selected-live metrics with room-summary stream noise.

## Decision table

| Observation | Likely layer | Next action |
| --- | --- | --- |
| Provider deltas are already coarse | Provider/model | Do not smooth it away unless product intentionally wants artificial animation. |
| Direct SSE fine, hosted SSE chunky | Proxy/hosted transport | Check headers and buffering. |
| SSE fine, EventSource drops or repeats ids | Browser/EventSource identity | Inspect `lastEventId`, transient ids, reconnect behavior. |
| EventSource fine, debug enqueue low | Frontend live-frame selection/dedupe | Inspect live overlay ingestion and frame identity. |
| Enqueue fine, flush/update low | Live overlay batching | Compare flush/enqueue and overlay/update ratios. |
| Overlay fine, DOM jumps | Rendering/Markdown/Virtuoso | Profile DOM cadence, long tasks, Markdown, sticky scroll. |
| First visible slow, steady cadence fine | Startup latency | Inspect first text/enqueue/flush/overlay/DOM deltas. |
| Steady cadence slow, first visible fine | Cadence regression | Compare fixture schedule p90 to SSE/DOM p90 lag. |

## What to report

When handing off a streaming investigation, include:

- Pibo Session ID and provider request id, if any
- direct URL and hosted URL tested
- benchmark command and artifact path
- provider delta count and gap stats
- SSE selected-live text/reasoning preservation
- EventSource selected-live preservation
- live-overlay preservation ratios
- DOM positive update count, p90 gap, max jump, first visible latency
- warnings, regressions, and whether any were expected negative-profile failures
