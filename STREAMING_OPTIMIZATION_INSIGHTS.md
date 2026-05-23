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
- Browser-visible live trace compute metrics should measure committed overlay renders, not only flushes. The count can exceed overlay update count when React re-renders around bootstrap/trace state, so use max/total duration as the hotspot signal and preservation rows for data health.
- Keep live trace overlay memo dependencies as narrow as the data used by `patchTraceViewWithEvents`. Depending on whole bootstrap state causes extra overlay recomputes when navigation/session metadata refreshes but the selected session status and overlay events are unchanged.
- Reconnect resume cursors need frame precision when the browser has observed a numeric `<streamId>:<frameIndex>` SSE id. Resuming with `<streamId>:999999` is safe for trace-caught-up history but can skip later frames from the same durable stream after an in-stream reconnect.
- Forced selected-live reconnects need a bounded transient replay cursor because `live:<n>` SSE ids are intentionally not durable `since` cursors. Use a separate `liveSince` cursor to replay live-only events emitted during the reconnect gap while preserving `live:<n>` frame ids.
- Browser/EventSource reports must aggregate selected-live streams across reconnect-created EventSource instances; otherwise the first pre-reconnect stream can falsely fail preservation even when the combined selected-live path preserved all deltas.
- Reconnect artifacts should expose both the `liveSince` cursor and replayed transient frame count. Text/reasoning preservation proves no user-visible loss, while replay cursor/frame counts prove the selected-live reconnect exercised transient replay instead of passing only through fresh frames.
- Bounded transient replay must expose buffer misses at reconnect time. A `liveSince` cursor older than the scope-specific evicted watermark is a reliability failure even if later frames replay; benchmark reconnect gates should fail on that signal rather than silently accepting partial replay.
- Reconnect replay frame counts should come from the stream `ready.liveReplay.replayed` status, not from counting every frame with a `liveReplayId`. Fresh transient frames also carry `liveReplayId`, so normal non-reconnect runs should report zero replayed frames while reconnect runs report the bounded replay status.
- Selected-live reconnect aggregation should be a shared report/regression helper. Provider preservation and compact reports must sum reconnect-created selected-live streams before comparing to provider/SSE counts; using the first stream alone can turn healthy replay into a false drop.
- Selected-live reconnect replay should expose cursor lag from the `ready.liveReplay` status (`newestAvailable - requestedAfter`) separately from replayed frame count. The lag reveals how far the reconnect cursor trailed the transient buffer even when dedupe preserves text/reasoning output.

- Selected-live replay lag is healthy only when replayed ids were not already observed before reconnect. Track duplicate replay counts separately from lag/replayed counts so cursor safety does not hide redundant overlay work.
- Reconnect replay status must be summarized for grouped `--runs N` artifacts, not only single-run reports; repeated reconnect benchmarks need p50 replay/liveSince/lag/duplicate/miss stats to spot flakiness across runs.
- Content-only live overlay patches should not rerun async-agent run-status reconciliation. Assistant/reasoning deltas cannot update `pibo_run_start` snapshots, so skipping the trace-wide reconciliation scans on those flushes preserves status semantics while reducing large-trace patch cost.
- Trace order key equality is a hot-path shallow-share check; compare fields directly instead of serializing order keys with `JSON.stringify` during every live overlay recompute.
- Markdown rendering should fast-path single-line plain text and memoize renderer inputs. Most streaming assistant deltas are plain prose; routing those through the full ReactMarkdown/GFM parser on every visible content update adds avoidable render-path work. Keep Markdown syntax, autolinks, list prefixes, and multi-line content on the full parser path.

- Markdown render instrumentation should run only when streaming debug is enabled and split plain vs full Markdown paths. Production React builds do not report Profiler durations, so browser artifacts should use debug-only renderer duration metrics unless a profiling build is explicitly used.
- Markdown rendering benchmarks need a fixture mix that forces the full MarkdownRenderer path while preserving small per-delta visible jumps. Keep the Markdown fixture's chunks small enough that DOM max-jump gates still prove renderer work is not hiding transport chunking.
- Browser-visible Markdown full-path metrics must time the synchronous ReactMarkdown/GFM function call, not only creation of a `<ReactMarkdown>` element. Element creation can report near-zero duration while parsing/tree-building still happens later in the child component render.
- Markdown plain-text fast paths should not treat inert punctuation such as parentheses, braces, pipes, single tildes, or hashtag-style `#tag` text as structural Markdown. Keep actual syntax gates for line prefixes, links/brackets, emphasis/code, escapes, autolinks, HTML, strikethrough, and thematic breaks so ordinary prose with punctuation avoids ReactMarkdown/GFM parsing.
- The Markdown backend fixture should use real Markdown syntax markers, not punctuation that is only conservatively classified as Markdown. Otherwise improving the plain-text heuristic can accidentally weaken full-renderer benchmark coverage.
- Full Markdown rendering should select the smallest parser extension set needed by the current input. Emphasis, headings, lists, code, and blockquotes do not need `remark-gfm`; reserve GFM plugins for strikethrough, task lists, tables, and bare autolinks so streaming syntax chunks avoid plugin overhead without losing GFM rendering.
- Track CommonMark and GFM Markdown streaming separately. Emphasis/list/code style chunks prove the full renderer can avoid `remark-gfm`; strikethrough/task/table/autolink chunks are needed to measure GFM plugin overhead without misclassifying CommonMark parser cost.
- Markdown renderer path metrics should split full renders into CommonMark and GFM counts. Total/full duration alone cannot prove whether a Markdown optimization is avoiding `remark-gfm` or merely shifting work between full-parser modes.
- Simple, balanced single-line GFM strikethrough can bypass the full `remark-gfm` parser while preserving `<del>` output. Keep this fast path narrowly guarded (no escapes, nested Markdown, autolinks, task lists, tables, or unbalanced markers) so richer GFM still exercises the full parser.
- GFM Markdown metrics should distinguish full `remark-gfm` parser work from narrowly guarded direct render fast paths. Simple strikethrough can preserve GFM output without exercising the parser, so compact reports need a separate `gfmFast` count before agents claim parser-path cost changes.
- Keep simple and full-parser GFM fixture coverage separate. `gfm-markdown` validates guarded fast-path strikethrough output, while `gfm-full-markdown` should contain task-list/table/autolink-style syntax that cannot bypass `remark-gfm`, so parser regressions are not hidden by successful fast paths.
- GFM fast-path metrics should include narrowly guarded direct renderers beyond strikethrough, such as simple task-list output. Keep a separate full-parser fixture with nested Markdown so task-list fast paths do not hide `remark-gfm` parser cost.
- Guard Markdown classification regexes with cheap literal-candidate checks on the streaming hot path. Plain prose and simple Markdown should not pay task-list/table/autolink regex costs unless the input contains the marker characters those patterns require.
