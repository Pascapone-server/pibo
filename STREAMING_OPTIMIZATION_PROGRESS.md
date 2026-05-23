# Streaming Optimization Ralph Progress

## Ralph job setup

- Created: 2026-05-23
- Owner scope: `user:ueR3mwuqBMPNTber3xuTwLmODbUlF4Sa`
- Target room: `room_08dcad21-db11-4602-b671-cd3466220fb7`
- Profile: `pibo-agent`
- Worktree: `/root/code/pibo/.worktrees/streaming-optimization-ralph`
- Branch: `streaming-optimization-ralph`
- Remote PR branch: `origin/feature/streaming-optimization-ralph`
- Docker dev worker: `pibo-dev-streaming-optimization-ralph`
- Container workspace: `/workspace`
- Docker gateway port: `4810`
- Docker CDP port: `4811`
- Docker web port: `4812`
- Docker Chat UI port: `4813`
- Docker Context Files port: `4814`
- Progress file: `/root/code/pibo/.worktrees/streaming-optimization-ralph/STREAMING_OPTIMIZATION_PROGRESS.md`
- Insights file: `/root/code/pibo/.worktrees/streaming-optimization-ralph/STREAMING_OPTIMIZATION_INSIGHTS.md`
- Ralph job: `ralph_a0065691-affd-445b-b8d5-f6419cfd074b`
- Hard iteration limit: `50`

## Scope

Optimize Chat Web streaming across performance, reliability, latency, and animation quality.

Primary implementation and documentation references:

- `docs/specs/chat-streaming-benchmark.md`
- `docs/project/chat-streaming-debugging-runbook.md`
- `docs/project/chat-streaming-regressions.md`
- `docs/reports/chat-streaming-instrumentation-and-ralph-metrics-2026-05-22.md` if present
- `docs/reports/chat-web-streaming-changes-2026-05-22.md` if present

## Operating notes

- Work in the host worktree above.
- Use the Docker worker for runtime, tests, builds, dev gateway restarts, and browser checks.
- Run container commands as: `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && <command>'`.
- Git operations and commits must be run from the host worktree.
- Do not create, release, or replace Docker workers unless explicitly asked.
- Do not restart production gateways or host services.
- Do not copy or expose provider credentials.
- Prefer measured improvements over subjective visual changes.
- Commit after each coherent improvement that passes verification.
- Keep this file append-only except for replacing setup placeholders during initial job creation.

## Required first reads for every Ralph iteration

Before planning or editing, read:

1. `GLOSSARY.md`
2. `/root/code/pibo/skills/builtin/ralph-loop/SKILL.md`
3. `/root/code/pibo/skills/builtin/pibo-docker-system/SKILL.md`
4. `/root/.pibo/user-skills/github-server-flow/SKILL.md`
5. `STREAMING_OPTIMIZATION_PROGRESS.md`
6. `STREAMING_OPTIMIZATION_INSIGHTS.md`
7. `docs/specs/chat-streaming-benchmark.md`
8. `docs/project/chat-streaming-debugging-runbook.md`
9. `docs/project/chat-streaming-regressions.md`

## Progress log

- 2026-05-23: Created dedicated worktree and Docker worker for follow-up streaming optimization loop.
- 2026-05-23: Created room `room_08dcad21-db11-4602-b671-cd3466220fb7` with workspace `/root/code/pibo/.worktrees/streaming-optimization-ralph`.
- 2026-05-23: Created Ralph job `ralph_a0065691-affd-445b-b8d5-f6419cfd074b` with profile `pibo-agent`, max iterations `50`, and max-iterations-only stop policy.

- 2026-05-23T09:49:56+00:00: Selected goal: reduce live overlay reducer hot-path work during streaming flushes.
  - Baseline metrics: one-off Node microbenchmark of the previous reducer algorithm on 1,000 unique live RAW_EVENT assistant deltas over 200 iterations: p50 121.47ms, p90 127.04ms, avg 122.84ms. Browser backend-fixture benchmark was attempted after starting the Docker worker gateway/browser, but remained blocked by fixture startup aborts (`signal is aborted without reason`) and produced no valid DOM/SSE metrics.
  - Change: optimized `applyTraceLiveEvents` to build the identity set once per batch and append to one copied events array, avoiding repeated whole-array dedupe/copy work for each live delta while preserving final-message replacement behavior.
  - Post-change metrics: same one-off Node microbenchmark: p50 0.34ms, p90 0.40ms, avg 0.35ms for the same 1,000-delta batch (~361x p50 speedup in reducer-only hot-path cost). Browser benchmark still blocked at fixture startup, so no claim on DOM/SSE cadence movement this iteration.
  - Files changed: `src/shared/trace-live-reducer.ts`.
  - Commands/checks: `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && npm run build && node --test test/trace-live-reducer.test.mjs && node tmp/trace-live-reducer-bench.mjs'` passed; `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && npm run typecheck'` passed; `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && npm run --silent dev -- debug web scenario streaming-benchmark --backend-fixture --fixture-mix reasoning-text --runs 5 --assert --artifact'` failed because backend fixture did not start; single-run artifact `/root/.pibo/debug/web-render/2026-05-23T09-44-14-168Z/scenario-streaming-benchmark.json` shows the same fixture abort blocker.
  - Commit: this commit (`Optimize live trace reducer batching`; final hash reported in session summary).
  - Blockers: backend fixture benchmark in this worker/browser currently aborts fixture POST from the page; direct authenticated curl to `/api/chat/debug/streaming-fixture` succeeds with an Origin header, so the next iteration should debug the in-page fixture fetch/CDP/browser state before relying on DOM/SSE metrics.
  - Next recommended step: stabilize or diagnose the backend fixture startup path, then rerun `--runs 5 --assert --artifact` against this reducer change for DOM/SSE confirmation.

- 2026-05-23T09:55:35+00:00: Selected goal: stabilize multi-run backend-fixture live overlay preservation metrics by making stateful trace output ratios per-run instead of cumulative across repeated fixtures in one selected session.
  - Baseline metrics: backend fixture `--runs 5 --assert --artifact` before the change passed with no regressions, but cumulative live state inflated preservation ratios as the same session accumulated live-only fixture outputs: overlayEvents/expected p50 3, p90 4, max 5; currentText/expected p50 3, p90 4, max 5. DOM/SSE health was otherwise good: DOM positive p50 12/12, DOM p90 gap p50 100.7ms, first visible p50 144ms, longTaskMax p50 0ms, selected-live text/reasoning 12/4, SSE text/reasoning 12/4.
  - Change: captured the streaming debug snapshot immediately before the benchmark reset and used its trace state as a baseline for live overlay `overlayEventCount` and `currentOutputLength` ratios. This keeps debug counters reset for latency/cadence while making stateful trace preservation ratios reflect only the current benchmark run.
  - Post-change metrics: backend fixture `--runs 5 --assert --artifact` passed with no regressions. The same cumulative state was still visible in raw debug state (`overlayEvents` p50 48, currentOutput p50 72), but normalized live ratios became stable per-run values: overlayEvents/expected p50/p90/max 1/1/1 and currentText/expected p50/p90/max 1/1/1. DOM/SSE preservation remained healthy: DOM positive p50 12/12, DOM p90 gap p50 102.1ms, first visible p50 150ms, longTaskMax p50 0ms, selected-live text/reasoning 12/4, SSE text/reasoning 12/4.
  - Files changed: `src/debug/web.ts`, `test/debug-cli.test.mjs`, `STREAMING_OPTIMIZATION_PROGRESS.md`, `STREAMING_OPTIMIZATION_INSIGHTS.md`.
  - Commands/checks: `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && npm run build && node --test test/debug-cli.test.mjs'` passed; `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && npm run typecheck'` passed; `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && node --test test/debug-cli.test.mjs test/web-channel.test.mjs test/trace-live-reducer.test.mjs'` passed; `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && npm run --silent dev -- debug web scenario streaming-benchmark --backend-fixture --fixture-mix reasoning-text --runs 5 --assert --artifact'` passed with artifact `/root/.pibo/debug/web-render/2026-05-23T09-55-10-020Z/scenario-streaming-benchmark.json`.
  - Commit: `5920bdd` (`Normalize streaming benchmark live state ratios`).
  - Blockers: none.
  - Next recommended step: investigate whether live overlay enqueue/flushed counts intentionally exceed fixture text+reasoning expected count due boundary frames, and either normalize by all live frame classes or split preservation rows by text/reasoning vs lifecycle frames.

- 2026-05-23T10:05:05+00:00: Selected goal: split live pipeline benchmark denominators so frame pipeline preservation is not inflated by text+reasoning-only expected counts.
  - Baseline metrics: backend fixture `--runs 5 --assert --artifact` passed, but enqueue/flushed ratios were inflated because 22 live stream frames were divided by 16 text+reasoning inputs: enqueue/expected p50 1.375 and flushed/expected p50 1.375. Other baseline medians were healthy: DOM positive 12/12, DOM p90 gap 100.5ms, first visible 144ms, selected-live text/reasoning 12/4, selected-live events 22, SSE text/reasoning 12/4, longTaskMax 0ms.
  - Change: added an expected live pipeline frame count and normalized enqueue/flushed ratios against stream frames while keeping overlayEvents/currentText normalized against input deltas/bytes; updated compact/text reports and controlled overlay-drop expected regression labels.
  - Post-change metrics: backend fixture `--runs 5 --assert --artifact` passed with artifact `/root/.pibo/debug/web-render/2026-05-23T10-04-27-014Z/scenario-streaming-benchmark.json`. Frame-normalized live ratios are now stable and interpretable: frameExpected p50 22, enqueue/frameExpected p50 1, flushed/frameExpected p50 1, overlayEvents/inputExpected p50 1, currentText/expected p50 1. DOM/SSE health remained stable: DOM positive 12/12, DOM p90 gap 100.8ms, first visible 142ms, selected-live text/reasoning/events 12/4/22, SSE text/reasoning 12/4, longTaskMax 0ms.
  - Files changed: `src/debug/web.ts`, `test/debug-cli.test.mjs`, `docs/specs/chat-streaming-benchmark.md`, `STREAMING_OPTIMIZATION_PROGRESS.md`, `STREAMING_OPTIMIZATION_INSIGHTS.md`.
  - Commands/checks: `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && npm run build && node --test test/debug-cli.test.mjs'` initially failed one label expectation after build passed; fixed the test label. `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && node --test test/debug-cli.test.mjs'` passed. `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && npm run typecheck && node --test test/debug-cli.test.mjs test/web-channel.test.mjs test/trace-live-reducer.test.mjs'` passed. `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && npm run --silent dev -- debug web scenario streaming-benchmark --backend-fixture --fixture-mix reasoning-text --runs 5 --assert --artifact'` passed. `docker exec pibo-dev-streaming-optimization-ralph bash -lc 'cd /workspace && npm run --silent dev -- debug web scenario streaming-benchmark --negative-profile overlay-drop --artifact'` passed expected-regression matching with enqueue/flushed frame ratio 0.273 and overlay/current text ratio 0.
  - Commit: `029947c` (`Split streaming live pipeline ratios`).
  - Blockers: none.
  - Next recommended step: use the clearer frame/input split to tune actual live flush cadence or reduce trace refresh latency, and consider making debug group raw overlay/current state also display per-run windowed counts.
