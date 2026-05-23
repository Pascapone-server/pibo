# Streaming Optimization Insights

Append concise, reusable findings here. Do not paste raw logs.

## Current model

- Treat streaming as a layered path: provider/Pi telemetry -> Pibo output events -> `/api/chat/events` SSE -> browser EventSource -> live overlay/React state -> visible DOM.
- DOM cadence is the user-visible metric. Provider/SSE/EventSource/live-pipeline metrics explain where visible chunkiness is introduced.
- Deterministic backend fixtures are preferred for regression work because they exercise the authenticated Chat Web app and real `/api/chat/events` path without provider credentials.
- Real-provider smokes are useful only when provider credentials and telemetry are available; do not copy credentials into Docker.

## Known fixed failure modes to avoid regressing

- Hosted SSE buffering is detected by direct-vs-hosted comparison and high text events per network chunk.
- Live-only deltas need transient `live:<n>` ids so Browser `EventSource.lastEventId` does not collapse distinct deltas through stale durable ids.
- Assistant delta identity must preserve frame order inside one stream.
- Trace catch-up can be transient; gate on max visible output during the run, not only final durable output.

## Optimization guardrails

- Do not optimize animation by hiding missing deltas, adding artificial delays, or masking provider-side chunking.
- Prefer changes that improve fixture-normalized DOM cadence, first visible latency, live-pipeline preservation, or long-task behavior without reducing SSE/EventSource preservation.
- Use `--runs N` medians before claiming performance improvement.

- Live overlay reducer batches must avoid per-delta full-array dedupe/copy work. Keep identity tracking batch-scoped and append into one copied events array; repeated `dedupeByIdentity([...events, event])` grows superlinearly with large streaming flushes.
- If the browser benchmark reports `fixture error: signal is aborted without reason` while direct authenticated curl to `/api/chat/debug/streaming-fixture` works with an Origin header, treat it as an in-page/CDP/browser fixture-start blocker rather than a streaming transport result.
- Multi-run backend fixtures reuse the selected session, so raw trace state (`overlayEventCount`, `currentOutputLength`) is cumulative across runs. Live preservation ratios should subtract the pre-reset trace state while keeping event/latency counters reset; otherwise healthy repeated runs can report misleading overlayEvents/currentText ratios above 1.
- Live pipeline counters have two valid denominators: enqueue/flushed counts include stream boundary frames, while overlay event/current text preservation represents text+reasoning content. Normalize enqueue/flushed against expected stream frames (22 for the steady reasoning-text backend fixture) and overlay/current text against input deltas/bytes to avoid inflated healthy ratios.
- Multi-run benchmark raw state rows should use the same pre-reset state window as live preservation ratios. Otherwise cumulative selected-session `overlayEventCount`/`currentOutputLength` can look like growth while per-run preservation is healthy.
- First content deltas are a safe latency target: flush the first text/reasoning delta for each live message immediately, then return to rAF batching for subsequent content. This improves first visible latency without masking provider/SSE cadence, as long as preservation counts, DOM positive updates, max jump, and long-task metrics stay stable.
- Live overlay enqueue/flush counters should represent frames that can mutate the live trace overlay. Non-rendering stream boundary frames are already preserved by SSE/EventSource counts and should not force React overlay updates or inflate live-pipeline denominators.
- Superseding the earlier frame-denominator note: after no-op boundary frames were removed from the overlay queue, healthy enqueue/flushed ratios should use overlayExpected=inputExpected. Full stream-frame preservation remains covered by selected-live EventSource/SSE event counts.
- Live trace annotation should pre-index persisted user message entry ids by text and reuse that index across overlay updates. Rebuilding flattened persisted node arrays and doing per-live-user linear searches adds avoidable hot-path work as traces grow.
- Compact streaming reports should keep first overlay latency next to first text/flush latency so agents can distinguish early transport arrival from React overlay application without opening full artifacts.
- Live trace overlay patching should batch-apply queued events against one flattened node copy and nest/share once per flush. Reducing `patchTraceViewWithEvent` event-by-event repeats flatten/nest/share work and becomes the dominant browser hot path on large traces.
- Optimistic user-message reconciliation is a trace-wide display cleanup and should run once per base trace, then only on live overlays that actually contain optimistic user-message events. Running it after every content-only overlay patch adds avoidable O(trace nodes) work during assistant streaming.
