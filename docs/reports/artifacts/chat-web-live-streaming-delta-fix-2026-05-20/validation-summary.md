# Chat Web Delta Streaming Fix Validation

Date: 2026-05-20

## Root cause

After the SSE lifecycle fix, text streaming could still show only the first word/first delta in a section because `traceLiveReducer` deduplicated live overlay events by `streamId + type`. Real text and reasoning deltas share the same `streamId` and differ by `streamFrameIndex`, so later frames were treated as duplicates.

A second resume issue was fixed at the same time: live reconnect cursor tracking now stores the full stream cursor (`streamId:streamFrameIndex`) from `MessageEvent.lastEventId`, not just `streamId:999999`. This prevents reconnects from skipping the rest of an active stream after the first frame.

## Fix

- Preserve `streamFrameId`/`streamFrameIndex` in live event IDs.
- Dedupe by `streamId + streamFrameIndex + type` when frame index exists.
- Track selected live SSE resume cursor as the exact last seen frame cursor.

## Validation

- `npx tsx docs/reports/artifacts/chat-web-live-streaming-delta-fix-2026-05-20/trace-live-reducer-delta-test.ts` — passed.
- `npm run typecheck` — passed.
- `npm run chat-ui:build` — passed.
- `npm run build` — passed.

Unit validation result:

```json
{"passed":true,"deltaCount":3,"text":"Hello world!"}
```
