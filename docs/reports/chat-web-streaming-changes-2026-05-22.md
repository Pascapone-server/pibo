# Chat Web Streaming Changes Report

Date: 2026-05-22  
Status: Deployed to dev at `3fd6ddd`  
Scope: Chat Web streaming, live trace rendering, optimistic user-message identity, and SSE transport behavior.

## Summary

We fixed three classes of Chat Web streaming problems: missing or stalled assistant output, duplicated user prompts, and visibly chunky streaming. The final deployed path now preserves live assistant deltas, keeps optimistic user messages stable, prevents nginx from buffering event streams, and gives live-only SSE frames unique transient ids so the browser no longer collapses distinct deltas into stale frames.

The latest user-visible result is much smoother streaming. For `gpt-5.5`, provider and backend deltas arrive at token/subtoken scale, usually around 5 bytes per text delta. Before the last fix, the UI still rendered most text in one-second bursts because live-only SSE frames lacked their own event ids. The browser reused a previous `lastEventId`, and the frontend deduped many distinct deltas as if they were the same stream frame. PR #62 fixed that by assigning transient ids such as `live:0` to non-durable live frames.

## Timeline of changes

### PR #49: Live stream recovery

PR #49 added the first recovery path for Chat Web live streaming. It reduced cases where the selected session stream silently stopped updating. The frontend gained reconnect and recovery behavior around the selected live stream and refreshed trace/bootstrap data when the stream looked stale.

Relevant commit:

- `6c63a4e Fix Chat Web live stream recovery`

### PR #54: Optimistic message identity

PR #54 fixed unstable identity for optimistic user messages. The sender now reuses a single `clientTxnId` through the optimistic UI event and the real runtime message path. That gave later dedupe logic a stable key.

Relevant commit:

- `20854ee Fix chat optimistic message identity`

Effect:

- The UI can match the optimistic prompt to the runtime-confirmed prompt.
- Later transcript or event-log entries can replace the optimistic row instead of appearing beside it.

### PR #55: Live delta frame preservation

PR #55 fixed a live delta dedupe bug. The client previously risked treating multiple assistant delta frames from the same stream as duplicates. The live reducer now uses the stream frame index as part of the identity, so separate frames from the same stream remain separate.

Relevant commit:

- `6bc1f76 Preserve live stream delta frames`

Effect:

- Multiple `assistant_delta` frames from one durable stream event survive reducer dedupe.
- The trace can rebuild a single assistant message by appending those deltas in order.

### PR #58: Trace snapshot fallback

PR #58 added a live streaming trace snapshot fallback. During a running turn, `/api/chat/trace` can expose `OutputCompactor` snapshots. This gives the frontend a resilient fallback when the live SSE path misses events or reconnects late.

Relevant commit:

- `4288ba0 Add live streaming trace snapshot fallback`

Effect:

- The UI no longer depends on perfect uninterrupted SSE delivery.
- A trace refresh can catch up to the current assistant output.

### PR #59: Optimistic user echo dedupe

PR #59 deduplicated optimistic user-message echoes produced by `message_queued` events. This handled the common case where a user prompt appeared once optimistically and again after the backend accepted it.

Relevant commit:

- `7d16133 Deduplicate optimistic user message echoes`

Effect:

- Accepted user messages confirm existing optimistic rows.
- The prompt no longer appears twice in normal send flows.

### PR #60: Transcript-confirmed user echo dedupe

PR #60 fixed a remaining duplicate prompt case. Some transcript user rows have a Pi entry id that differs from the original `clientTxnId`. The frontend now also matches stale optimistic or live `message_queued` echoes by user text when the transcript already confirms the message.

Relevant commit:

- `94ca600 Deduplicate transcript-confirmed user echoes`

Effect:

- Transcript rows and live `message_queued` echoes no longer produce two user prompt rows.
- The UI keeps exactly one visible user prompt after send and transcript refresh.

### PR #61: Disable nginx buffering for chat event streams

PR #61 disabled reverse-proxy buffering for `/api/chat/events` by setting `X-Accel-Buffering: no` on SSE responses.

Relevant commit:

- `2f59b0d Disable nginx buffering for chat event streams`

Why it mattered:

- Provider telemetry showed fine `gpt-5.5` deltas.
- Direct backend SSE also showed fine deltas.
- Hosted HTTPS previously delivered those deltas in roughly 16 KB batches with about one-second gaps.

Effect:

- nginx now passes SSE frames through instead of batching them.
- Backend and hosted transport behavior match much more closely.

### PR #62: Prevent stale SSE ids on live deltas

PR #62 fixed the last major chunkiness cause. Live-only assistant deltas were sent without SSE `id:` fields because they are not durable event-log frames. Browser `EventSource` therefore reused the previous `lastEventId`. The frontend parsed that stale id as a stream frame id and deduped distinct deltas as duplicates.

Relevant commit:

- `e79a5fd Prevent stale SSE ids on live deltas`

Change:

- `ChatStreamState` now tracks a per-connection transient frame counter.
- Live-only frames receive ids such as `live:0`, `live:1`, and `live:2`.
- Durable frames still use durable cursor ids such as `<streamId>:<frameIndex>`.
- The parser does not treat `live:*` ids as durable stream frame ids.

Effect:

- Distinct live-only assistant deltas no longer inherit stale durable ids.
- The live overlay keeps the delta chain instead of retaining only the last one or two deltas between trace refreshes.
- Visible streaming is smoother.

## Investigation results

The investigation separated the streaming path into provider, backend, proxy, browser EventSource, React state, and DOM rendering.

For `gpt-5.5`, provider telemetry showed small deltas:

- Provider `assistant_delta` p50: about 5 bytes.
- Provider inter-delta p50: about 9–16 ms.
- Direct backend SSE matched the provider.
- nginx HTTPS matched the backend after PR #61.

For Spark, the provider itself emitted larger chunks. That is a model/provider behavior, not a Chat Web transport bug.

Browser probes then showed that `EventSource` received fine `TEXT_MESSAGE_CONTENT` events, but the DOM still updated in larger bursts. The decisive state probe showed that the live overlay held only one to three events while 200+ text deltas arrived. The 1s trace refresh then advanced the base trace by hundreds of characters. That matched the visible pattern: short pauses followed by 20–30 tokens.

The stale `lastEventId` behavior explained this state: many live-only deltas shared the same parsed stream identity and were removed by dedupe. PR #62 fixed the identity at the SSE boundary.

## Verification performed

We validated the changes with unit, integration, transport, and browser probes.

Commands run during the final fixes:

```bash
npm run typecheck
npm run build && node --test test/web-channel.test.mjs test/trace-live-reducer.test.mjs
npm install && npm test
```

Dev deployment:

```bash
PIBO_DEV_PUBLIC_URL=https://dev.pibo2.neuralnexus.me/apps/chat ./scripts/deploy-web-dev.sh
pibo gateway dev restart
```

Current dev state:

- `upstream/dev`: `3fd6ddd`
- `origin/dev`: `3fd6ddd`
- Dev worktree: `3fd6ddd`
- Dev URL: `https://dev.pibo2.neuralnexus.me/apps/chat`
- Smoke check: HTTP 200

## Key artifacts

Investigation scripts and results were kept under `/tmp` during the work:

- `/tmp/pibo-sse-layer-probe.mjs`
- `/tmp/pibo-sse-layer-probe-gpt55-result.json`
- `/tmp/pibo-sse-transport-probe.mjs`
- `/tmp/pibo-browser-app-stream-probe.mjs`
- `/tmp/pibo-browser-app-stream-probe-gpt55.json`
- `/tmp/pibo-browser-react-stream-probe.mjs`
- `/tmp/pibo-browser-react-stream-probe-gpt55.json`
- `/tmp/pibo-browser-commit-dom-probe.mjs`
- `/tmp/pibo-browser-commit-dom-probe-gpt55.json`
- `/tmp/pibo-browser-state-probe.mjs`
- `/tmp/pibo-browser-state-probe-gpt55.json`
- `/tmp/pibo-sse-id-probe.mjs`

Important sessions and provider requests:

- Transport investigation: `ps_f600a919-c308-4181-a354-7fa997a89167`, provider `pr_dafa3a4f-0f8e-45e1-95e9-15fd85cd9455`
- Browser app probe: `ps_2521a153-e572-48d9-a0c0-7b3505755dab`, provider `pr_b1bd39a3-4339-4a66-8bf0-ba48c09ca123`
- State probe: `ps_34a7a0e2-e42b-4b42-ab4d-751abf11b3c1`

## Current status

Streaming on dev is materially better. The stack now preserves fine-grained `gpt-5.5` deltas from provider through backend, nginx, browser EventSource, live overlay state, and DOM rendering.

Two caveats remain:

1. Spark can still stream in larger provider-side chunks. Chat Web cannot split chunks the provider never sends.
2. The trace snapshot fallback still refreshes during running turns. It is useful for resilience, but we should keep watching that it does not dominate rendering now that live deltas have stable transient ids.

## Follow-up recommendations

1. Keep PR #62's transient id test in place; it guards the exact boundary where the last chunkiness bug occurred.
2. Add a small browser-level regression probe to CI or a debug command if feasible. It should assert that a live run produces many DOM increments, not only trace-refresh-sized jumps.
3. Preserve the distinction between durable cursor ids and transient live ids. Durable frames should remain replayable; live-only frames should remain unique inside the active connection but should not become replay cursors.
4. If users still report chunking, first separate provider chunking from app chunking. Spark and `gpt-5.5` behave differently.