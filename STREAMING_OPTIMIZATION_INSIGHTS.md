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
