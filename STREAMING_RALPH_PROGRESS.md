# Streaming Ralph Loop Progress

## Ralph job setup

- Created: 2026-05-22
- Owner scope: `user:ueR3mwuqBMPNTber3xuTwLmODbUlF4Sa`
- Target room: `room_01714a7e-696f-4975-a736-1799bcbf18ae` (`Lisa Streaming Lab`)
- Profile: `pibo-agent`
- Ralph job: `ralph_17107d46-8939-4c74-b3f9-285913cca5fa`
- Worktree: `/root/code/pibo/.worktrees/streaming-ralph-loop`
- Branch: `streaming-ralph-loop`
- Base: `upstream/dev` at setup time
- Docker dev worker: `pibo-dev-streaming-ralph-loop`
- Worker ports: gateway `4800`, CDP `4801`, web `4802`, chat-ui `4803`, context-files `4804`
- Companion insights file: `/root/code/pibo/.worktrees/streaming-ralph-loop/insights.md`

## Scope

Continuously improve Chat Web streaming smoothness and performance from Pi Coding Agent/provider output through Pibo transport, SSE delivery, frontend state, React rendering, and visible DOM output.

## Operating notes

- Work only in this host worktree unless explicitly instructed otherwise.
- Use the Docker worker for runtime, builds, tests, gateway, and browser checks.
- Run container commands as: `docker exec pibo-dev-streaming-ralph-loop bash -lc 'cd /workspace && <command>'`.
- Keep git operations on the host worktree path.
- Do not use provider credentials inside Docker unless the user explicitly approves that exact transfer.
- Prefer deterministic fixture/instrumentation work over real-provider-dependent iteration.
- Do not restart production gateways.
- Keep commits focused and small.
- Update this file after every run with actions, measurements, artifacts, checks, commits, and next work.
- Update `insights.md` whenever a reusable instrumentation technique, metric, pitfall, or architectural insight is discovered.

## Baseline reading list

- `docs/reports/chat-streaming-instrumentation-and-ralph-metrics-2026-05-22.md`
- `docs/reports/chat-web-streaming-changes-2026-05-22.md`
- `docs/reports/artifacts/chat-streaming-instrumentation-2026-05-22/metrics-summary.json`

## Progress log

- 2026-05-22: Loop worktree and Docker worker created. Seeded progress file, insights file, and streaming instrumentation reports. Setup commit: `d4c4cf6`. Ralph job created stopped as `ralph_17107d46-8939-4c74-b3f9-285913cca5fa` with max iterations `50` and max-iterations-only stop policy. First Ralph run should read the recent git history and the reports before editing.
- 2026-05-22: Initial run was stopped because it targeted the current user room. Created dedicated room `room_01714a7e-696f-4975-a736-1799bcbf18ae` (`Lisa Streaming Lab`) with workspace `/root/code/pibo/.worktrees/streaming-ralph-loop`. Retargeted Ralph job to that room. The loop must continue using Docker worker `pibo-dev-streaming-ralph-loop` for every run.

- 2026-05-22T23:49:10Z: Added opt-in Chat Web frontend streaming counters behind `?debugStreaming=1` / `localStorage.pibo.chat.debugStreaming=1`. Baseline: the loop had historical provider/SSE/DOM metrics, but no supported in-page counter for live enqueue/flush/overlay/trace-refresh state. Post-change metric surface: `window.__piboStreamingDebug` records live EventSource opens/errors/events, text/reasoning delta byte totals, enqueue/flush counts, overlay event count, trace refresh schedule/start/end/duration counts, base/current assistant output length, last durable cursor, and last transient `live:<n>` id. Files changed: `src/apps/chat-ui/src/App.tsx`, `src/apps/chat-ui/src/streamingDebug.ts`, `insights.md`, `STREAMING_RALPH_PROGRESS.md`. Checks: `docker exec pibo-dev-streaming-ralph-loop bash -lc 'cd /workspace && npm run chat-ui:typecheck'` passed; `npm run typecheck` passed; `npm run chat-ui:typecheck && npm run chat-ui:build` passed; `node --test test/trace-live-reducer.test.mjs` passed. Commit: current implementation commit (hash reported in Ralph run response). Next: add a `pibo debug web scenario streaming-benchmark` collector that enables `debugStreaming`, drives or observes a deterministic stream, and saves `__piboStreamingDebug` plus DOM MutationObserver metrics as an artifact.
- 2026-05-22T23:59:23Z: Added the first productized streaming benchmark collector under `pibo debug web scenario streaming-benchmark`. Baseline: historical reports had temporary browser probes and the prior run added `window.__piboStreamingDebug`, but Ralph still lacked a supported CLI scenario that captures DOM cadence and in-page counters together. Post-change deterministic fixture metrics: 1.2s data-URL fixture produced `textDeltaCount=6`, `textDeltaBytes=12`, `enqueue=6`, `flush=6`, `overlayUpdates=6`; DOM positive updates `6`, gap p50/p90/max `200/200/200.1ms`, jump p50/p90/max `2/2/2 chars`, rAF p50 `16.7ms`, long tasks `0`. Artifact: `docs/reports/artifacts/chat-streaming-instrumentation-2026-05-22/streaming-benchmark-fixture-2026-05-22.json`. Files changed: `src/debug/web.ts`, `test/debug-cli.test.mjs`, artifact JSON, `insights.md`, `STREAMING_RALPH_PROGRESS.md`. Checks: `npm run --silent dev -- debug web scenario --help` passed; `npm run typecheck` passed in Docker; `npm run build && node --test test/debug-cli.test.mjs` passed before the final focused test addition; `npm run typecheck && npm run build >/tmp/pibo-build-streaming-benchmark.log && node --test --test-name-pattern "streaming benchmark" test/debug-cli.test.mjs` passed; benchmark scenario ran against a deterministic CDP data-URL fixture and wrote the artifact. Commit: `2fd3392`. Next: add a deterministic Chat Web/backend streaming fixture that the benchmark scenario can drive through the real app instead of only observing an already-running or data-URL stream.
