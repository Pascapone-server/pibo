# Web Chat Trace UI Session Handoff

Date: 2026-04-29

## Goal

Bring the Pibo Chat Web App closer to the existing `pydantic-tracing` trace UI:

- Render user messages, assistant messages, tool calls, tool results, reasoning, execution commands, errors, and subagent delegations as trace spans.
- Keep spans collapsed by default, with global expand/collapse support.
- Show nested trace structure inline in the main chat view.
- Keep subagent sessions available as nested sidebar entries and allow opening linked child sessions from delegation spans.
- Support browser-local Thinking visibility.
- Support Clone via slash command and Fork from user-message spans with a switch confirmation modal.

## Implemented

- Added a dedicated React/TanStack Router/Vite chat UI under `src/apps/chat-ui`.
- Ported/adapted the tracing components from `/home/pibo/code/pydantic-tracing`:
  - `SpanNode`
  - `TraceTimeline`
  - `JsonRenderer`
  - `traceTree`
- Added Pibo-to-trace adaptation:
  - `user.message` -> `user.prompt`
  - `assistant.message` -> `model.response`
  - `agent.turn` -> `agent.run`
  - `model.reasoning` -> `model.reasoning`
  - `tool.call` -> `tool.call`
  - `tool.result` -> `tool.result`
  - `agent.delegation` -> `agent.delegation`
  - `execution.command` -> `tool.result`
- Added a web read model in `.pibo/web-chat.sqlite`.
  - Raw Pibo events are stored.
  - Materialized trace projections are not stored.
  - Trace nodes are reconstructed from Pi session JSONL plus raw Pibo events.
- Added web APIs for bootstrap, trace view, SSE updates, messages, and execution actions.
- Added nested session listing based on session bindings and parent session keys.
- Added explicit new-session creation from the Web Chat UI through `POST /api/chat/sessions`.
- Added basic Agents and Settings areas as V1 placeholders.
- Added slash command menu behavior and Enter/Shift+Enter handling.
- Fixed duplicate/stale transcript echo behavior:
  - Persisted transcript events are filtered only when safe.
  - Open live event ids are kept so follow-up turns render before page reload.
  - `message_finished` updates the matching `agent.turn` status.
- Fixed persisted assistant-turn reconstruction so tool calls are grouped under the final assistant response instead of duplicating as flat spans.
- Empty or whitespace-only Pi reasoning artifacts are filtered during trace reconstruction, both for persisted `thinking` parts and live `thinking_finished` events.
- Served the built chat UI from `/apps/chat`, falling back to the older inline HTML only if the build is missing.

## Important Design Decisions

- The web app currently stores raw events in SQLite, not materialized trace nodes. This keeps reconstruction flexible for future workflows and agent-team traces.
- The trace UI is copied/adapted into Pibo instead of imported as a dependency.
- The current frontend uses TanStack Router with a Vite client build. `@tanstack/react-start` is installed, but the app is not yet a full TanStack Start SSR/server-entry app.
- Browser settings such as Thinking visibility are stored in `localStorage`.
- V1 does not persist custom agent profile templates from the web UI.

## Known Gaps

- Full TanStack Start structure is still pending if SSR/server-entry semantics are required.
- The Agents page is an inventory/placeholder, not a profile builder.
- The Settings page only exposes browser-local Thinking visibility.
- Tree command is intentionally excluded from V1.
- The legacy inline fallback HTML still exists in `src/apps/chat/web-app.ts`; it is only used when the built UI is missing.
- Full browser smoke coverage is still manual; the local Web Chat flow has been exercised during development against `/apps/chat`.

## Verification

Last verified in this session:

```bash
npm run typecheck
npm run chat-ui:build
npm test
```

Result:

- Typecheck passed.
- Chat UI build passed.
- Test suite passed: 69/69 tests.

## Next Best Steps

1. Add automated browser smoke coverage for `/apps/chat` once a stable test harness for authenticated Web Chat is available.
2. Compare the rendered UI visually against `pydantic-tracing` with real tool-call and subagent sessions.
3. Decide whether to migrate the chat UI from TanStack Router/Vite to full TanStack Start.
4. Add focused tests for subagent delegation spans and longer multi-turn trace reconstruction.
