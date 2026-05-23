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
- 2026-05-22T23:59:23Z: Added the first productized streaming benchmark collector under `pibo debug web scenario streaming-benchmark`. Baseline: historical reports had temporary browser probes and the prior run added `window.__piboStreamingDebug`, but Ralph still lacked a supported CLI scenario that captures DOM cadence and in-page counters together. Post-change deterministic fixture metrics: 1.2s data-URL fixture produced `textDeltaCount=6`, `textDeltaBytes=12`, `enqueue=6`, `flush=6`, `overlayUpdates=6`; DOM positive updates `6`, gap p50/p90/max `200/200/200.1ms`, jump p50/p90/max `2/2/2 chars`, rAF p50 `16.7ms`, long tasks `0`. Artifact: `docs/reports/artifacts/chat-streaming-instrumentation-2026-05-22/streaming-benchmark-fixture-2026-05-22.json`. Files changed: `src/debug/web.ts`, `test/debug-cli.test.mjs`, artifact JSON, `insights.md`, `STREAMING_RALPH_PROGRESS.md`. Checks: `npm run --silent dev -- debug web scenario --help` passed; `npm run typecheck` passed in Docker; `npm run build && node --test test/debug-cli.test.mjs` passed before the final focused test addition; `npm run typecheck && npm run build >/tmp/pibo-build-streaming-benchmark.log && node --test --test-name-pattern "streaming benchmark" test/debug-cli.test.mjs` passed; benchmark scenario ran against a deterministic CDP data-URL fixture and wrote the artifact. Implementation commit: `27e8745` (followed by a docs-only progress hash correction). Next: add a deterministic Chat Web/backend streaming fixture that the benchmark scenario can drive through the real app instead of only observing an already-running or data-URL stream.
- 2026-05-23T00:07:03Z: Productized the deterministic streaming benchmark fixture as `pibo debug web scenario streaming-benchmark --fixture`. Baseline: the existing CLI benchmark could observe an app or ad hoc data URL, but Ralph had no supported way to create a fixed-cadence browser fixture from the command itself. Post-change fixture metrics: 12 text deltas at 100ms cadence produced debug deltas `textDeltaCount=12`, `textDeltaBytes=24`, `enqueue=12`, `flush=12`, `overlayUpdates=12`; DOM positive updates `12`, gap p50/p90/max `100/100.1/100.1ms`, jump p50/p90/max `2/2/2 chars`, first/last visible `102/1202ms`, rAF p50 `16.7ms`, long tasks `0`. The benchmark now brings the CDP page to front before measuring; an initial validation without this showed background timer throttling around 1s gaps and rAF count 0. Artifact: `docs/reports/artifacts/chat-streaming-instrumentation-2026-05-22/streaming-benchmark-cli-fixture-2026-05-23.json`. Files changed: `src/debug/web.ts`, `test/debug-cli.test.mjs`, `insights.md`, `STREAMING_RALPH_PROGRESS.md`, benchmark artifact JSON. Checks: `npm run typecheck` passed in Docker; `npm run build >/tmp/pibo-build-fixture.log && node --test --test-name-pattern "streaming benchmark" test/debug-cli.test.mjs` passed in Docker; `npm run --silent dev -- debug web scenario streaming-benchmark --fixture --target 16ED7595BB6629B99B8D4BF8295A9713 --duration 1600 --json --artifact` passed in Docker. Commit: `e93d3fe` (implementation; followed by this progress hash correction). Next: add a real Chat Web/backend deterministic streaming fixture endpoint or test harness so the benchmark can measure EventSource/live-overlay/React behavior through `/api/chat/events`, not only the in-browser collector path.
