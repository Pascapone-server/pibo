# Chat Streaming Benchmark Specification

This spec defines the expected behavior and review semantics for the Chat Web streaming benchmark.

## Purpose

The benchmark exists to make streaming quality measurable across provider, transport, browser, live overlay, and DOM layers. It should prevent subjective "looks chunky" reviews from becoming speculative frontend changes.

## Command surface

Primary scenario:

```bash
pibo debug web scenario streaming-benchmark [options]
```

Report renderer:

```bash
pibo debug web report streaming-benchmark --from artifact.json [--compact] [--output report.md] [--json-output report.json] [--json] [--artifact]
```

## Required benchmark modes

### Observation mode

Collect metrics without failing the command for regressions.

Use when exploring unknown behavior or capturing an artifact for later review.

### Assertion mode

`--assert` converts benchmark health checks into CLI regressions.

Use before accepting a streaming implementation change.

### Deterministic browser fixture

`--fixture` runs an in-browser deterministic stream without provider credentials.

It is useful for DOM/rAF/long-task measurement but does not exercise backend SSE.

### Deterministic backend fixture

`--backend-fixture` posts a deterministic stream through the Chat Web backend and `/api/chat/events`.

It exercises:

- backend live-only frames
- selected-session SSE
- browser EventSource
- live overlay
- React rendering
- DOM cadence

This is the default mode for regression gates.

## Fixture profiles

| Profile | Purpose |
| --- | --- |
| `steady` | Stable cadence for continuity and regression baselines. |
| `jitter` | Uneven provider-like cadence. |
| `burst` | Bursty timing without intentional batching failure. |
| `batch` | Controlled negative profile with grouped deltas. |

Artifacts must preserve fixture `scheduleMs` and schedule-gap stats so reviewers can distinguish intentional input cadence from downstream delay.

## Fixture mixes

| Mix | Expected coverage |
| --- | --- |
| `text` | Assistant text deltas and visible DOM cadence. |
| `reasoning-text` | Text plus reasoning frames. Assertions must gate reasoning preservation separately from visible assistant DOM cadence. |

## Simulation modes

### Reconnect

`--simulate-reconnect` force-closes Chat event streams during a deterministic backend fixture.

Assertions should verify:

- reconnect opens occur
- expected selected-live text and reasoning deltas survive
- transient live ids are present
- durable ids are not mistaken for live-only frames

Do not assert global uniqueness of transient ids across reconnects. `live:<n>` ids are connection-local and can reset after reconnect.

### Trace catch-up

`--simulate-trace-catchup` suppresses live text deltas and validates recovery through trace snapshots.

Assertions should verify:

- trace samples are collected
- live trace versions appear
- first live version latency is reasonable
- maximum visible assistant length during the run is nonzero
- durable event count behavior matches the mode

Use at least 2.5 seconds for the current trace-catchup fixture. Shorter runs can miss transient visible recovery.

## Negative profiles

Negative profiles intentionally require known regressions. They prove the benchmark can fail for the right layer.

### `--negative-profile batch`

Expands to the backend batch reasoning/text fixture and expected batching regressions.

Expected failure categories:

- DOM positive update count
- DOM max jump
- SSE text events per network chunk
- live-pipeline batching ratios where applicable

### `--negative-profile overlay-drop`

Preserves SSE and EventSource input while dropping text/reasoning before live-overlay enqueue.

Expected failure categories:

- live-overlay preservation ratios
- downstream DOM preservation

Transport preservation should remain healthy.

## Metrics

### Provider metrics

- text delta count
- reasoning delta count
- delta byte p50/p90/p99
- inter-delta gap p50/p90/p99
- parse errors
- unknown events
- truncated provider pages
- first byte latency
- first text latency

### Transport metrics

- selected-live SSE text and reasoning event counts
- network chunk bytes
- network chunk gaps
- text events per chunk
- `X-Accel-Buffering` header
- transient `live:<n>` id health

### Browser EventSource metrics

- selected-live event counts
- room-summary event counts, reported separately
- `lastEventId`
- ready state
- errors
- first selected-live text latency

### Live pipeline metrics

- debug expected input events
- enqueue counts
- flush counts
- flushed event counts
- overlay event counts
- overlay update counts
- current output length
- trace base output length
- trace refresh count and duration
- first text, enqueue, flush, overlay latencies

### DOM metrics

- positive visible assistant text updates
- p50/p90 update gaps
- max positive character jump
- first visible latency
- final visible latency
- long tasks

## Derived ratios and lag fields

Artifacts should include preservation ratios wherever possible:

- SSE text to provider text
- selected-live text to provider text
- SSE reasoning to provider reasoning
- selected-live reasoning to provider reasoning
- DOM positive updates to provider or fixture text deltas
- flush to enqueue
- overlay updates to flushed events

Artifacts should include fixture-normalized cadence lag:

- `domLagOverScheduleP90Ms`
- `sseTextLagOverScheduleP90Ms`

Use these fields to distinguish downstream delay from intentionally jittery or bursty input cadence.

## First-latency fields

The benchmark should track first latency separately from steady cadence:

- provider first text
- selected-live EventSource first text
- independent SSE fetch first text and first chunk
- live debug first text
- live debug first enqueue
- live debug first flush
- live debug first overlay update
- first visible DOM text

URL comparison reports should include cross-layer first-latency deltas. This catches hosted or proxy startup delay even when steady cadence is healthy.

## Assertion expectations

In assertion mode, fail on:

- fixture startup failure
- missing debug counters when required
- text or reasoning preservation loss
- unexpected SSE buffering or chunking
- missing transient live ids for live-only frames
- DOM positive update count below threshold
- DOM p90 gap above fixture-aware threshold
- DOM max jump above threshold
- excessive first visible latency
- provider parse errors, unknown events, or truncated pages when provider telemetry is available
- provider-to-SSE or provider-to-selected-live preservation ratio below 0.95 when provider telemetry is available
- long tasks introduced by the benchmarked path

Missing provider telemetry is non-fatal for deterministic worker fixtures without provider credentials.

## URL comparison expectations

`--compare-url`, `--compare-hosted`, and `--compare-hosted-if-configured` run the same backend fixture against two Chat URLs.

The comparison should gate:

- selected-live event preservation
- SSE preservation
- smoothness score degradation
- DOM cadence lag over fixture schedule
- SSE cadence lag over fixture schedule
- cross-layer first-latency deltas

`--compare-hosted-if-configured` should skip hosted comparison with a warning when no hosted URL is configured. This keeps Ralph and CI loops portable.

## Report requirements

Saved report rendering must not require CDP or browser access.

`pibo debug web report streaming-benchmark --from artifact.json` should:

- normalize old and new artifacts
- recompute summaries instead of trusting archived `summary` objects
- render detailed Markdown by default
- render reviewer-friendly tables with `--compact`
- write Markdown with `--output`
- write normalized JSON with stable `rows` using `--json-output`

Stable compact JSON rows should use:

- single or group reports: `metric`, `preservation`, `cadenceLatency`
- URL comparison reports: `metric`, `primaryP50`, `compareP50`, `delta`

## Artifact review gates

A reviewer should be able to answer from saved artifacts:

1. Did the provider emit fine-grained text and reasoning deltas?
2. Did direct and hosted SSE preserve those deltas?
3. Did browser EventSource preserve selected-live events?
4. Did live overlay preserve and flush those events?
5. Did DOM cadence match the fixture schedule without large jumps?
6. Was startup latency separate from steady-state cadence?
7. Were any regressions intentional negative-profile failures?
8. Were there warnings, long tasks, parse errors, or unknown provider events?
