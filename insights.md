# Streaming Instrumentation Insights

This file is the shared memory for the Streaming Ralph loop. Keep it concise and append reusable findings only.

## Current model of the streaming path

1. Provider/Pi Coding Agent emits normalized text/thinking/tool events.
2. Pibo runtime telemetry records provider request, raw events, normalized events, parse errors, and timing.
3. Pibo output events and trace reconstruction build durable and live Chat Web state.
4. `/api/chat/events` exposes selected-session live SSE and room summary SSE.
5. Browser `EventSource` receives `pibo` events with SSE `id:` values.
6. Chat UI live overlay and trace snapshot fallback merge incoming frames.
7. Compact terminal rows, Virtuoso, Markdown rendering, and sticky scroll produce visible DOM.

## Known fixed failure modes

- nginx buffered hosted SSE into roughly 16 KB chunks until chat event responses set `X-Accel-Buffering: no`.
- Live-only assistant deltas lacked SSE ids; Browser `EventSource.lastEventId` could remain stale, causing frontend dedupe to collapse distinct deltas. Transient ids such as `live:0` fix this without making live frames durable replay cursors.
- Assistant delta frame identity must include frame index; same-stream deltas must not dedupe each other.
- Optimistic and transcript-confirmed user prompts need stable identity and text fallback dedupe.

## Metrics that matter

- Provider: text delta count, delta byte p50/p90/p99, inter-delta gap p50/p90/p99, parse errors, unknown events, first text latency.
- Transport: direct vs hosted SSE event count, network chunk bytes, network chunk gaps, text events per network chunk, headers, SSE id health.
- Browser: selected live EventSource event count, `lastEventId`, readyState, errors, text delta size/gap distribution.
- React/live overlay: overlay event count, trace base output length, current output length, trace refresh count, commit count/gaps, long tasks.
- DOM: visible assistant text update count, update gaps, positive char jump sizes, first visible latency, final visible latency.

## Instrumentation rules

- Always separate provider chunking from app chunking before changing code.
- Compare direct localhost SSE with hosted HTTPS SSE for the same turn.
- Measure browser EventSource inside the page, not only with Node fetch.
- Treat DOM cadence as the final user-visible metric.
- Use medians across repeated runs; do not trust one best run.
- A smoothing change is valid only if it improves visible cadence without hiding provider-side chunking or adding long tasks.

## Candidate next instrumentation work

- Productize the temporary probes as `pibo debug web scenario streaming-benchmark`.
- Add `?debugStreaming=1` counters for enqueue, flush, overlay update, trace refresh, last durable cursor, and last transient live id.
- Add a deterministic streaming fixture: fixed number of deltas, fixed cadence, optional jitter, optional reconnect.
- Add browser-level regression checks for DOM update cadence against the deterministic fixture.
- `?debugStreaming=1` now exposes `window.__piboStreamingDebug` counters for browser-side streaming probes. Keep hot-path debug helpers cheap when disabled; guard expensive trace-output calculations with `isStreamingDebugEnabled()`.
- `pibo debug web scenario streaming-benchmark` can attach to any CDP target, enable debugStreaming for future app events, and collect DOM increment, rAF, long-task, and `window.__piboStreamingDebug` counter deltas. Use `--fixture` to run a deterministic in-browser stream without provider credentials.
- Browser timer and rAF cadence can be throttled on background CDP targets; streaming benchmarks should call `Page.bringToFront` before measuring or fixture cadence may collapse to ~1s gaps.
- `pibo debug web scenario streaming-benchmark --backend-fixture` drives deterministic live-only assistant deltas through the authenticated Chat Web app and `/api/chat/events`, exercising browser EventSource, live overlay, React, and DOM without provider credentials. When passing a specific `--target`, skip broad target probes to avoid unrelated stale tabs blocking benchmark startup.
- `pibo debug web scenario streaming-benchmark --backend-fixture --assert` now turns deterministic fixture health into CLI regressions: fixture start, debug counter availability, text delta preservation, DOM positive update count, DOM p90 gap, DOM max jump, first visible latency, and long tasks. Keep this opt-in so observation-only benchmark runs can still collect artifacts.
- Backend fixture startup should be bounded from inside the browser with an AbortController timeout; otherwise a stuck same-origin fetch consumes the whole CDP evaluation timeout and leaves Ralph without a benchmark artifact.
- `pibo debug web scenario streaming-benchmark --runs N --from artifact.json` now repeats deterministic fixture benchmarks, summarizes median smoothness/DOM metrics, and compares p50 deltas against a prior single-run or multi-run artifact. Use this before tuning UI rendering so Ralph reports variance instead of one sample.
- Streaming benchmark fixture profiles now cover three deterministic timing shapes: `steady` for regression continuity, `jitter` for uneven provider-like cadence, and `burst` for batched-arrival stress. Preserve the emitted `scheduleMs` in backend fixture artifacts so DOM gaps can be explained by input cadence rather than renderer stalls.
- `pibo debug web scenario streaming-benchmark --backend-fixture --simulate-reconnect` reloads the app with an EventSource wrapper, force-closes Chat event streams during a deterministic fixture, and records forced closes, reopen count, text event count, transient id counts, and reconnect observation in the artifact.
- Transient `live:<n>` SSE ids are connection-local. A reconnect can legitimately reset them to `live:0`; do not assert global uniqueness across reconnects. Assert no durable ids are mistaken for live-only frames, reconnect opens occur, and expected text deltas survive.
- Reconnect benchmarks now split `/api/chat/events` EventSource metrics by stream role. Use the `selected-live` row for text-delta preservation and the `room-summary` row to spot sidebar/bootstrap stream noise; aggregate forced-close counts can include both.
