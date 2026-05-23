# Chat Web Streaming Regression Knowledge Base

This document records high-value Chat Web streaming failures and invariants that should not be relearned through ad hoc debugging.

## Regression patterns

### Hosted SSE buffering

**Symptom**

The provider and direct backend SSE produce fine deltas, but the hosted Chat Web stream arrives in large bursts.

**Diagnostic signals**

- hosted network chunks are much larger than direct chunks
- hosted chunk gaps are much higher than direct gaps
- many text events appear in one network chunk
- direct backend has normal per-token or sub-token cadence

**Important invariant**

Chat event stream responses must disable reverse-proxy buffering. Keep `X-Accel-Buffering: no` on `/api/chat/events` responses.

**Regression check**

Use a deterministic backend fixture and compare direct vs hosted:

```bash
pibo debug web scenario streaming-benchmark --backend-fixture --compare-hosted-if-configured --assert --artifact
```

### Stale EventSource `lastEventId` collapses live deltas

**Symptom**

Browser EventSource receives fine `TEXT_MESSAGE_CONTENT` frames, but the UI live overlay receives only a few updates. Visible output then appears mostly through periodic trace refreshes.

**Cause**

Live-only assistant delta frames without their own SSE `id:` can reuse a stale browser `EventSource.lastEventId`. Frontend dedupe can then treat distinct deltas as duplicates.

**Important invariant**

Live-only frames need unique transient SSE ids such as `live:<n>`. These ids are intentionally not durable replay cursors.

**Reconnect invariant**

Transient live ids are connection-local. After reconnect, `live:0` can legitimately appear again. Tests should assert preservation and role separation, not global uniqueness.

### Same-stream assistant delta dedupe

**Symptom**

Only one or a small number of assistant deltas for a stream survive dedupe.

**Cause**

Frame identity does not distinguish different deltas within the same stream.

**Important invariant**

Assistant delta frame identity must include a frame index or equivalent per-frame identity. Same-stream deltas must not dedupe each other.

### Optimistic user echo duplication

**Symptom**

A user prompt appears twice: once as an optimistic message and once as transcript-confirmed output.

**Cause**

The transcript row can have a different Pi entry id than the client transaction id. Identity-only matching can miss confirmation.

**Important invariant**

Optimistic user messages need stable client transaction identity. Transcript-confirmed user rows may also need text fallback dedupe when ids differ.

### Trace catch-up is transient

**Symptom**

A trace catch-up test appears to fail if only final DOM or final transcript output is inspected.

**Cause**

`OutputCompactor` live snapshots can make assistant output visible during the run, then disappear after message-boundary flush if the recovery was live-snapshot-only.

**Important invariant**

Trace catch-up validation should gate on maximum visible assistant length during the run, live trace versions, and trace probe samples, not only final DOM length.

### Browser timing false positives

**Symptom**

A deterministic streaming fixture shows roughly one-second gaps even though backend cadence is lower.

**Cause**

The measured CDP target is in the background and Chromium throttles timers or `requestAnimationFrame`.

**Important invariant**

Bring the target page to the foreground before measuring browser cadence.

### Probe state contamination across runs

**Symptom**

Multi-run artifacts show counters such as transient ids increasing as 22, 44, 66, making transport behavior look unstable.

**Cause**

EventSource wrappers and debug counters can persist in the same tab across repeated runs.

**Important invariant**

Use after-start counters for repeated runs. Do not summarize cumulative probe totals unless the scenario explicitly requires them.

### Benchmark probe races fixture startup

**Symptom**

Fixture startup fails or first text frames appear missing.

**Cause**

The in-page SSE fetch probe starts too late, races the app EventSource on the same URL, or blocks the fixture POST.

**Important invariants**

- Start the SSE probe just before posting the backend fixture.
- Wait briefly for SSE response headers.
- Add a cache-busting probe query.
- Bound the probe stop path after `AbortController.abort()` so partial diagnostics survive.

## Negative controls

Negative profiles are useful because they prove the benchmark gates can fail for the right reason.

### `batch`

The batch profile intentionally groups several text deltas at the same scheduled timestamp after a cadence pause.

Expected failure shape:

- text and reasoning events are preserved
- DOM positive update count drops
- DOM max jump increases
- text events per network chunk can exceed the steady-state gate

Use this to test batching and cadence-lag gates.

### `overlay-drop`

The overlay-drop profile preserves EventSource and independent SSE input but drops text/reasoning before live-overlay enqueue through a benchmark-only hook.

Expected failure shape:

- SSE and EventSource preservation stay healthy
- live-overlay preservation ratios fail
- DOM preservation can fail downstream

Use this to prove live-pipeline gates catch frontend loss separately from transport loss.

## Review checklist

Before accepting a Chat Web streaming change, check:

- Provider parse errors and unknown event counts are clean.
- Direct and hosted SSE preserve selected-live text and reasoning events.
- Hosted transport does not add excessive chunking or first latency.
- `EventSource.lastEventId` behavior is compatible with transient live ids.
- Live overlay enqueue, flush, and overlay update ratios explain DOM behavior.
- DOM positive update count, p90 gap, and max jump are acceptable for the input schedule.
- Negative profiles fail only with expected regressions.
- No long tasks were introduced by smoothing or Markdown/render changes.
