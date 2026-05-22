# Chat Streaming Instrumentation and Ralph Metrics Report

Date: 2026-05-22  
Audience: Ralph implementation loop and reviewers  
Scope: How to instrument, debug, monitor, and score Chat Web streaming from Pi Coding Agent/provider output through Pibo transport and React DOM rendering.

## Summary

Ralph needs a benchmark harness, not a single subjective check. The harness should measure each streaming layer separately and then compute one user-visible smoothness score. The past debugging work showed why this matters: provider and backend deltas were already fine, nginx later buffered them, and after the nginx fix the browser still received fine events while React/DOM rendered large bursts. A single end-to-end screenshot would not have found those layer boundaries.

The best Ralph loop should run the same probe before and after every change, save artifacts, and compare metrics against a baseline. It should report whether a change improves one layer without hurting another. The minimum useful harness has five probes:

1. Provider/Pi telemetry probe: delta count, delta size, delta gaps, parse errors, and first-token latency.
2. Backend and proxy SSE probe: event counts, `id:` behavior, headers, network chunk size, and network chunk gaps for localhost and hosted HTTPS.
3. Browser EventSource probe: selected live stream event counts, `lastEventId`, readyState, errors, text delta sizes, and gaps.
4. React/live-overlay state probe: live overlay event accumulation, trace base length, current output length, trace refreshes, and React commits.
5. DOM/perception probe: visible assistant text length changes, DOM update gaps, jump sizes, rAF cadence, and long tasks.

Ralph should treat streaming as improved only when the user-visible metrics improve and the lower layers still match the provider. A frontend smoothing change that hides provider stalls is not a transport fix. A transport change that increases DOM long tasks is not a net win.

## Historical evidence reviewed

I inspected the dev Pibo data with `PIBO_HOME=/root/.pibo-dev` and the project debug CLI:

```bash
npm run dev -- debug --help
npm run dev -- debug session --help
npm run dev -- debug trace --help
npm run dev -- debug events --help
npm run dev -- debug telemetry --help
npm run dev -- debug web --help
```

I then inspected representative streaming sessions and provider requests:

| Purpose | Pibo session | Provider request | Finding |
| --- | --- | --- | --- |
| Original chunk investigation | `ps_86e43bff-fe38-45b5-af08-af141efd0b90` | `pr_7d4798d2-7f1c-4e0a-9ecd-f94392200efc` | Provider produced 1339 `pi.text_delta` events, p50 4 bytes, p90 8 bytes. The provider was not the chunk source. |
| Post-nginx fix layer probe | `ps_f600a919-c308-4181-a354-7fa997a89167` | `pr_dafa3a4f-0f8e-45e1-95e9-15fd85cd9455` | Direct backend and nginx HTTPS both delivered small deltas after `X-Accel-Buffering: no`. |
| Browser app EventSource probe | `ps_2521a153-e572-48d9-a0c0-7b3505755dab` | `pr_b1bd39a3-4339-4a66-8bf0-ba48c09ca123` | Browser selected-live EventSource received fine deltas, but DOM rendered only a few large jumps before PR #62. |
| Browser stream probe | `ps_4e1a6f49-1a86-4f9a-92d0-b48d540b119e` | `pr_6d5abaa0-e6b7-4796-a051-2ed12aa04ec6` | EventSource and DOM divergence reproduced in a real browser. |
| State probe | `ps_34a7a0e2-e42b-4b42-ab4d-751abf11b3c1` | `pr_30a67cb8-db75-4a73-929a-73876cdc1a4a` | Live overlay held only 1–3 events while many deltas arrived, pointing to stale SSE frame identity. |

Artifacts are under:

```text
docs/reports/artifacts/chat-streaming-instrumentation-2026-05-22/
```

The compact metrics summary is:

```text
docs/reports/artifacts/chat-streaming-instrumentation-2026-05-22/metrics-summary.json
```

## What the past sessions taught us

### 1. Provider telemetry must be the baseline

Provider telemetry answered the first question: are chunks coming from the model/provider or from Pibo? For `gpt-5.5`, the answer was clear. The provider emitted token/subtoken-scale events:

| Provider request | Text deltas | p50 bytes | p90 bytes | p50 gap | p90 gap |
| --- | ---: | ---: | ---: | ---: | ---: |
| `pr_7d4798d2...` | 1339 | 4 | 8 | 9 ms | 42 ms |
| `pr_dafa3a4f...` | 242 | 5 | 9 | 13 ms | 43 ms |
| `pr_b1bd39a3...` | 234 | 5 | 10 | 9 ms | 12 ms |

Ralph should start every run by recording provider metrics. If the provider emits 200-byte deltas, the frontend cannot render 5-byte deltas honestly. If the provider emits 5-byte deltas and the DOM jumps by 500 characters, the bug is downstream.

Recommended command pattern:

```bash
PIBO_HOME=/root/.pibo-dev npm run --silent dev -- debug telemetry session <ps_...> --json
PIBO_HOME=/root/.pibo-dev npm run --silent dev -- debug telemetry provider <pr_...> --json
PIBO_HOME=/root/.pibo-dev npm run --silent dev -- debug telemetry provider <pr_...> events --limit 200 --json
```

Metrics to extract:

- `rawEventCount`, `normalizedEventCount`
- `eventTypeCounts.pi.text_delta`
- `parseErrorCount`, `unknownEventCount`
- first byte time, first normalized event time, first text delta time
- text delta bytes: count, p50, p90, p99, max
- text delta gaps: p50, p90, p99, max
- model, provider, transport, reasoning/service-tier settings

### 2. Backend and proxy SSE must be measured separately

Before PR #61, direct backend SSE streamed fine while hosted HTTPS arrived in large network chunks. The pre-fix transport probe showed:

| Layer | Text events | Delta p50 | Text gap p50 | Network chunk p50 | Network chunk gap p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Direct localhost | 342 | 5 bytes | 11.6 ms | 297 bytes | 11.7 ms |
| nginx HTTPS | 314 | 5 bytes | 0.004 ms inside batches | 16006 bytes | 983 ms |

After PR #61, both layers matched:

| Layer | Text events | Delta p50 | Text gap p50 | Network chunk p50 | Text events per chunk p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Direct localhost | 242 | 5 bytes | 12.8 ms | 309 bytes | 1 |
| nginx HTTPS | 242 | 5 bytes | 12.7 ms | 309 bytes | 1 |

Ralph should keep a two-connection transport probe. It should open `/api/chat/events` against localhost and hosted HTTPS for the same session, then send one prompt. This isolates backend framing from proxy buffering.

Metrics to extract:

- response headers: `content-type`, `cache-control`, `x-accel-buffering`, `content-encoding`, `connection`
- SSE event count and text event count
- text delta bytes and inter-text gaps
- raw network chunk bytes and chunk gaps
- text events per network chunk
- terminal event timing: `RUN_FINISHED` or `RUN_ERROR`
- SSE `id:` values, including durable `<streamId>:<frameIndex>` and transient `live:<n>` ids

Pass conditions:

- The app sets `x-accel-buffering: no` on chat event streams; hosted HTTPS behavior confirms nginx is not buffering, even if the header is not visible after proxy handling.
- Hosted HTTPS p50 network chunk gap stays close to direct localhost.
- Hosted HTTPS p50 text events per chunk is about 1 for fine provider streams.
- Hosted HTTPS does not compress or buffer SSE in a way that hides events.

### 3. Browser EventSource must be instrumented inside the page

Transport success does not prove the app consumes the stream correctly. The browser app probe showed the selected live EventSource receiving fine deltas:

- `TEXT_MESSAGE_CONTENT` events: 234
- delta bytes p50: 5
- text gap p50: 9.2 ms
- text gap p90: 11.9 ms
- EventSource errors: 0
- tab visible: `document.hidden=false`
- rAF stable around 16.7 ms

At the same time, the DOM changed only eight times, with p50 visible jump around 115 characters. That narrowed the bug to the React/live overlay pipeline.

Ralph should inject a small page script before navigation with `Page.addScriptToEvaluateOnNewDocument`. The script should wrap `window.EventSource`, record only the selected live stream, and log:

- stream URL and mode
- event count by type
- `TEXT_MESSAGE_CONTENT` bytes and gaps
- `message.lastEventId` for every event
- parse errors
- readyState and errors
- first text event and last text event times

The `lastEventId` metric matters because PR #62 fixed stale ids on live-only deltas. Ralph should explicitly detect repeated stale ids and missing ids.

Pass conditions:

- Browser text event count is near provider text delta count for the same turn.
- Browser p50/p90 delta size and gap match backend SSE.
- EventSource error count is zero.
- Live-only text frames use transient ids like `live:<n>` and do not inherit stale durable ids.

### 4. React and live-overlay state must show accumulation, not fallback-only rendering

The state probe was the decisive instrument. It inspected React hook state through the React DevTools global hook and compared:

- live overlay event count
- trace raw event count
- base trace assistant output length
- current output length
- DOM length

Before PR #62, the selected live EventSource received hundreds of fine events, but `liveOverlayEvents` stayed at 1–3. The base trace length then jumped during 1s trace refreshes. This proved that the UI was mostly rendering trace snapshots, not the live delta chain.

Ralph should keep a React state probe that records these values on every commit:

- `liveOverlayEvents`
- `baseOutputLen`
- `currentOutputLen`
- `domLen`
- trace refresh fetches to `/api/chat/trace`
- `flushPendingStreamEvents` count, if instrumented directly
- `setLiveTraceOverlay` count, if instrumented directly
- React commit count and commit gaps
- component render counts for `CompactTerminalSessionView`, `TerminalAssistantMessage`, and `MarkdownRendererHost`

Pass conditions:

- During healthy streaming, live overlay event count should grow or advance continuously instead of staying at 1.
- DOM output should advance between trace refreshes.
- The 1s trace fallback should catch up, not dominate the visible stream.
- Trace refreshes should not trim or overwrite valid live overlay deltas.

### 5. DOM metrics should model perceived smoothness

The user sees DOM updates, not provider events. Ralph should score visible assistant text changes with a `MutationObserver` on:

```css
[data-pibo-component="MarkdownRendererHost"][data-pibo-markdown-kind="assistant-message"]
```

For every text-length change, record:

- timestamp
- visible text length
- positive length delta
- tail sample for debugging

Core DOM metrics:

- DOM update count
- DOM update rate while provider text is active
- p50/p90/p99 DOM gap
- max DOM gap
- p50/p90/p99 positive character jump
- max positive jump
- first visible text latency from first provider text delta
- final visible text latency from provider/message finish

Historical pre-PR #62 browser probes showed the failure pattern:

| Probe | EventSource text events | EventSource p50 gap | DOM updates | DOM p50 gap | DOM max gap | DOM p50 jump | DOM max jump |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Browser stream | 242 | 9.9 ms | 12 | 299 ms | 1555 ms | 59 chars | 287 chars |
| App EventSource | 234 | 9.2 ms | 8 | 249 ms | 1605 ms | 115 chars | 614 chars |
| React probe | 306 | 10.7 ms | 14 | 146 ms | 1575 ms | 74 chars | 353 chars |
| Commit DOM probe | 287 | 9.3 ms | 10 | 124 ms | 1604 ms | 49 chars | 523 chars |

Ralph should improve these DOM metrics without increasing provider, transport, or React costs.

## Recommended Ralph benchmark harness

Build one reusable script or CLI command, preferably under `pibo debug web scenario streaming-benchmark`, that runs a fixed scenario and writes a single JSON artifact.

### Inputs

- target URL: dev worker URL or dev gateway URL
- CDP URL or browser-use lease
- Pibo home path, e.g. `/root/.pibo-dev` for dev gateway
- model mode:
  - deterministic streaming fixture for normal Ralph runs
  - optional real provider run only when auth and policy allow it
- prompt text and expected output size
- run count, default 3
- baseline artifact path

### Standard scenario

1. Open a visible authenticated Chat Web tab.
2. Create a fresh session.
3. Select a stable model configuration.
4. Start provider telemetry capture.
5. Open direct backend and hosted SSE observers when applicable.
6. Inject browser probes before navigation.
7. Send a fixed prompt.
8. Wait for `RUN_FINISHED` and stable DOM.
9. Collect provider, event stream, signal, trace, React, DOM, rAF, and long-task metrics.
10. Write one artifact JSON and one compact markdown summary.

### Artifact shape

```json
{
  "runId": "stream-bench-...",
  "commit": "...",
  "environment": { "url": "...", "browser": "...", "piboHome": "..." },
  "session": { "piboSessionId": "...", "roomId": "...", "turnId": "...", "providerRequestId": "..." },
  "provider": { "textDeltaBytes": {}, "textDeltaGapsMs": {}, "firstTextMs": 0 },
  "sse": { "direct": {}, "hosted": {}, "idHealth": {} },
  "browserEventSource": {},
  "react": {},
  "dom": {},
  "signals": {},
  "trace": {},
  "score": {},
  "regressions": []
}
```

## Proposed scoring model

Ralph needs a small set of objective scores. Use ratios where possible, because provider behavior varies by model.

### Layer health gates

A run fails before scoring if any gate fails:

- Provider request has parse errors or unknown event spikes.
- Message ends with `RUN_ERROR`.
- Browser EventSource reports errors.
- The app stops setting `X-Accel-Buffering: no`, or hosted HTTPS behavior shows nginx-style batching again.
- Duplicate user prompt rows appear.
- Trace check reports severe consistency errors.
- Final DOM text is missing or substantially shorter than final trace assistant output.

### Smoothness metrics

Use these primary metrics:

| Metric | Meaning | Good target for fine provider streams |
| --- | --- | --- |
| `providerToBrowserTextRatio` | browser text events / provider text deltas | `>= 0.95` |
| `hostedToDirectGapRatioP50` | hosted text p50 gap / direct text p50 gap | `0.5–2.0` |
| `networkEventsPerChunkP90` | text events batched in one network read | `<= 2` |
| `domUpdatesPerSecond` | positive visible DOM updates while streaming | `>= 8/s` or better than baseline |
| `domGapP50Ms` | median visible pause | `<= 100 ms` |
| `domGapP90Ms` | p90 visible pause | `<= 300 ms` |
| `domGapMaxMs` | worst visible pause | `<= 1000 ms` unless provider stalls |
| `domJumpP50Chars` | median visible text jump | `<= 40 chars` |
| `domJumpP90Chars` | p90 visible text jump | `<= 120 chars` |
| `firstVisibleLagMs` | first DOM text after first provider text | `<= 250 ms` |
| `finalVisibleLagMs` | final DOM text after run finish | `<= 500 ms` |

### Performance metrics

A change should not buy smoothness with excessive work:

| Metric | Watch for |
| --- | --- |
| React commits per second | Large increases with no DOM smoothness gain |
| Long tasks > 50 ms | Markdown, Virtuoso, or reducer stalls |
| rAF p95 | Sustained frame delays over 33 ms |
| trace patch time | Reducer regressions |
| markdown render time | Expensive full-message rerenders |
| memory/listener count | EventSource or observer leaks across sessions |

### Suggested aggregate score

Use the aggregate only after gates pass:

```text
smoothnessScore =
  0.30 * clamp(100 - domGapP50Ms, 0, 100)
+ 0.25 * clamp(300 - domGapP90Ms, 0, 300) / 3
+ 0.20 * clamp(120 - domJumpP90Chars, 0, 120) / 1.2
+ 0.15 * clamp(providerToBrowserTextRatio * 100, 0, 100)
+ 0.10 * clamp(100 - firstVisibleLagMs / 5, 0, 100)
```

Prefer direct metric comparisons in reviews. The score is useful for Ralph stop/continue decisions, but it should not hide which layer regressed.

## Debugging ladder for Ralph

Ralph should follow this order when a streaming run gets worse.

### Step 1: Provider/Pi Coding Agent

Commands:

```bash
PIBO_HOME=<home> npm run --silent dev -- debug telemetry session <ps_...> --json
PIBO_HOME=<home> npm run --silent dev -- debug telemetry provider <pr_...> --json
PIBO_HOME=<home> npm run --silent dev -- debug telemetry turn <turn_...> --events --json
```

Questions:

- Did provider delta sizes or gaps change?
- Did the selected model/reasoning/service tier change?
- Did tools, thinking, or compaction block assistant text?
- Did parse errors or unknown events appear?

### Step 2: Pibo output events and trace reconstruction

Commands:

```bash
PIBO_HOME=<home> npm run --silent dev -- debug session <ps_...> --events --limit 80 --json
PIBO_HOME=<home> npm run --silent dev -- debug events <ps_...> --limit 120 --json
PIBO_HOME=<home> npm run --silent dev -- debug trace <ps_...> --check --json
PIBO_HOME=<home> npm run --silent dev -- debug events stats --topic pibo.output --session <ps_...> --json
```

Questions:

- Are `message_started`, `assistant_message`, and `message_finished` ordered correctly?
- Are live deltas preserved until the frontend consumes them?
- Does trace reconstruction match final DOM output?
- Are cursor ids durable where needed and transient where live-only?

### Step 3: SSE transport

Use a direct-vs-hosted layer probe.

Questions:

- Does localhost stream fine while hosted batches?
- Did headers change?
- Are SSE ids present and unique?
- Does `since` replay skip or duplicate frames?
- Does reconnect preserve durable cursor behavior without deduping live-only frames?

### Step 4: Browser EventSource

Use CDP injection or a productized `pibo debug web scenario streaming-benchmark`.

Questions:

- Which EventSource URL is selected live mode?
- How many text events reached the browser?
- What are `lastEventId`, readyState, and error counts?
- Are summary streams or signal streams interfering with selected live stream behavior?

### Step 5: React state and DOM

Use React hook inspection and `MutationObserver`.

Questions:

- Is live overlay accumulating events?
- Is trace fallback dominating visible text?
- Are React commits frequent but assistant text static?
- Are Markdown/Virtuoso rerenders causing long tasks?
- Is sticky scroll/layout work delaying visible commits?

## Recommended instrumentation additions

The past probes were effective but temporary. Ralph will work better if these become stable project tools.

### 1. Add `pibo debug web scenario streaming-benchmark`

This should wrap the current ad hoc scripts into a supported command. It should:

- acquire or attach to a browser target;
- inject EventSource, React, DOM, rAF, long-task, and fetch instrumentation;
- create a session and send a fixed prompt;
- collect debug telemetry and trace checks;
- write JSON and markdown artifacts.

### 2. Add lightweight frontend debug counters

Expose debug-only counters on `window.__piboStreamingDebug` when `?debugStreaming=1` is present:

- pending stream event enqueue count
- flush count and flush duration
- live overlay event count
- setLiveTraceOverlay count
- trace refresh count and duration
- selected live EventSource status
- last applied SSE id
- last durable cursor and last transient live id

This avoids brittle React fiber inspection.

### 3. Add a deterministic streaming fixture

Ralph should not depend only on real providers. Add a fixture that emits known deltas at controlled intervals:

- 300 deltas
- 5 bytes per delta
- 10 ms cadence
- optional jitter and burst modes
- optional reconnect halfway through
- optional thinking deltas mixed with text

This lets Ralph test frontend and transport changes inside Docker without provider credentials.

### 4. Keep real-provider probes as periodic smoke tests

Real-provider tests are still valuable because Pi Coding Agent/provider behavior can change. Use them only when auth and policy allow it. Per current real-model policy, use Spark with low/off reasoning for real E2E smoke tests unless the user explicitly approves another model for this benchmark. Always record provider metrics first so Ralph does not blame the UI for provider-side chunking.

### 5. Add regression assertions for the known failures

Tests should assert:

- selected live event streams set `X-Accel-Buffering: no`;
- live-only frames receive `live:<n>` ids;
- durable replay frames keep `<streamId>:<frameIndex>` ids;
- assistant deltas with different frame indexes are not deduped;
- optimistic and transcript-confirmed user prompts render once;
- browser DOM receives many small increments for a fine-grained fixture.

## Ralph operating rules

Ralph should follow these rules in every streaming-improvement iteration:

1. Run the benchmark on the current branch before changing code.
2. Save the baseline artifact under `docs/reports/artifacts/<slug>/baseline-<commit>.json`.
3. Make one focused change.
4. Run the same benchmark at least three times.
5. Compare medians, not a single best run.
6. Commit only if gates pass and either smoothness or performance improves.
7. If a metric regresses, name the layer and either fix it or revert.
8. Keep generated secrets, cookies, and provider payloads out of commits.
9. Use Docker/fixture benchmarks for normal loop work; use real-provider host/dev benchmarks only when explicitly allowed.
10. Report final results with session ids, provider request ids, artifact paths, and before/after tables.

## Minimal prompt Ralph should receive

Ralph's prompt for this work should not say only “make streaming smoother.” It should say:

```text
Improve Chat Web streaming smoothness and performance using objective instrumentation.

Before each code change, run the streaming benchmark and save a baseline artifact. After each change, run the same benchmark three times. A change is successful only if all layer health gates pass and the DOM smoothness metrics improve without provider, SSE, React, or long-task regressions.

Measure these layers separately: provider telemetry, Pibo output events, direct and hosted SSE transport, browser EventSource, React/live-overlay state, visible DOM updates, rAF, and long tasks.

Do not rely on subjective screenshots. Do not use real provider credentials inside Docker. Use deterministic fixture runs for normal iteration. Use real-provider smoke tests only when the environment already has auth and policy permits it.

Stop and report if provider delta size is the limiting factor. Do not mask provider-side chunking with frontend smoothing and call it a transport fix.
```

## Recommended next work

1. Productize the current temporary probes as `pibo debug web scenario streaming-benchmark`.
2. Add frontend debug counters behind `?debugStreaming=1`.
3. Add a deterministic streaming fixture so Ralph can run without provider auth.
4. Add browser-level regression assertions for DOM update cadence.
5. Start the Ralph loop only after the benchmark can produce one baseline artifact and one comparison artifact reliably.

## Bottom line

The best metric is not raw token speed. The best metric is layer agreement plus visible cadence: provider emits fine deltas, backend and proxy preserve them, the browser receives them, React accumulates them, and the DOM advances in small, frequent increments without long tasks. Ralph should optimize that full chain and prove each improvement with artifacts.