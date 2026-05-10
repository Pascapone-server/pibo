# Spec: Docker Compute Workers

**Status:** Draft  
**Created:** 2026-05-10  
**Owner / Source:** Current Pibo codebase  
**Related docs:** `GLOSSARY.md`, `AGENTS.md`, `docs/specs/README.md`, `docs/specs/capabilities/web-auth-and-same-origin-host.md`

## Why

Pibo development and browser testing need an isolated runtime that can run gateways, Chat Web, browser automation, and end-to-end checks without mutating or restarting the host production gateway. Docker compute workers provide that boundary.

The compute system is an operator-facing capability. It builds the Pibo image from the current workspace, starts short-lived worker containers, creates development worktrees when requested, exposes gateway and browser ports, and supports cleanup through the Pibo CLI.

## Goal

Pibo MUST let operators create, inspect, connect to, and release Docker compute workers while keeping development gateways, dev auth, browser automation, and worktree state isolated from the host checkout and host gateway.

## Background / Current State

The current implementation is centered on `src/compute/cli.ts`, `src/compute/docker.ts`, `Dockerfile`, `scripts/docker-entrypoint.sh`, and web-gateway dev-auth selection in `src/gateway/web.ts` and `src/plugins/dev-auth.ts`.

`pibo compute spawn` creates a one-time worker container from image `pibo:latest` and starts `gateway:web` through the Docker entrypoint. `pibo compute dev spawn --worktree <name>` creates `.worktrees/<name>`, starts a long-running container mounted on that worktree, and prints stable port assignments. The image includes Node, Python, Chromium, Xvfb, Browser Use, and the built Pibo CLI.

## Scope

### In Scope

- `pibo compute` CLI discovery and worker lifecycle commands.
- Docker image build, rebuild, and hash-based rebuild checks.
- One-time worker spawn with dynamic Docker-assigned ports.
- Development worker spawn with Git worktree creation and deterministic port blocks.
- Container labels for role, created time, owner, port block, and worktree metadata.
- Worker release and old one-time-worker reaping.
- Docker entrypoint behavior for gateway, web gateway, shell, and CLI commands.
- Worker-only dev auth and browser automation prerequisites.

### Out of Scope

- Host gateway lifecycle management — host gateways are managed by `pibo gateway ...` commands.
- Production deployment flow after worker validation.
- Distributed worker scheduling across machines.
- Automatic removal of Git worktrees after container release.
- Rich UI management for compute workers.

## Requirements

### Requirement: Compute CLI is discoverable and scoped

The `pibo compute` CLI MUST expose worker lifecycle actions without requiring operators to call Docker directly.

#### Current

`runComputeCli()` registers `spawn`, `dev spawn`, `rebuild`, `list`, `release`, and `reap` commands through Commander.

#### Acceptance

- `pibo compute --help` lists the immediate compute commands and next-step examples.
- `pibo compute spawn --help` explains that the command creates a worker and prints JSON with ports.
- `pibo compute dev --help` points to `pibo compute dev spawn --help`.
- `pibo compute dev spawn --worktree <name>` requires a worktree name.
- Unknown compute commands fail through the CLI help/error path rather than silently doing nothing.

#### Scenario: Discover development worker command

- GIVEN an operator does not know the dev-worker syntax
- WHEN the operator runs `pibo compute dev --help`
- THEN the output points to `pibo compute dev spawn --help`.

### Requirement: Image builds are cached by source or dependency hashes

The compute system MUST rebuild `pibo:latest` only when the selected command's rebuild predicate says the image is missing or stale.

#### Current

One-time `spawn` checks `imageExists()` and `shouldRebuild()` using a source hash stored at `~/.pibo/compute-image-hash`. Dev `spawn` checks `shouldRebuildDeps()` using package and Dockerfile hashes stored at `~/.pibo/compute-dep-hash`. `rebuild` always builds and saves both hashes.

#### Acceptance

- Missing image `pibo:latest` triggers a build before spawn.
- One-time spawn rebuilds when TypeScript/TSX source, package files, or Dockerfile hashes differ from the saved source hash.
- Dev spawn rebuilds when `package.json`, `package-lock.json`, or `Dockerfile` hashes differ from the saved dependency hash.
- `pibo compute rebuild` forces a Docker build and refreshes both hash files.
- Hash files are stored under `~/.pibo/` and their parent directory is created when needed.

#### Scenario: Dependency change before dev spawn

- GIVEN `package-lock.json` changed since the last dev-worker build
- WHEN an operator runs `pibo compute dev spawn --worktree fix-a`
- THEN Pibo rebuilds `pibo:latest` before creating the worktree container.

### Requirement: One-time workers start the web gateway with dynamic ports

`pibo compute spawn` MUST create a short-lived worker container that starts the web gateway and returns connection details.

#### Current

`spawnWorker()` runs `docker run -d`, labels the container with role `worker`, exposes container ports `4789`, `56663`, and `4788` on Docker-assigned host ports, starts the image command `gateway:web`, then reads the assigned ports with `docker port`.

#### Acceptance

- The returned JSON includes `id`, `image`, `gatewayHost`, `gatewayPort`, `cdpPort`, `webPort`, and `connect`.
- Container names default to `pibo-worker-<random>` when no name is supplied.
- Custom `--name` and `--owner` values are applied to the container name or labels.
- `gatewayPort` maps container port `4789`.
- `cdpPort` maps container port `56663`.
- `webPort` maps container port `4788`.
- The connect command uses `docker exec -it <id> bash`.

#### Scenario: Spawn isolated worker

- GIVEN Docker is available and the image is current
- WHEN an operator runs `pibo compute spawn --owner alice`
- THEN Pibo starts a worker container, prints JSON with mapped ports, and labels the container with owner `alice`.

### Requirement: Development workers use Git worktrees and deterministic port blocks

`pibo compute dev spawn` MUST isolate code changes in a Git worktree and assign a non-overlapping block of host ports.

#### Current

`spawnDevWorker()` creates `.worktrees/<name>` with `git worktree add`, selects the first unused `pibo.compute.portBlock` among running dev containers, maps ports from base `4800 + block * 10`, mounts the worktree at `/workspace`, and keeps the container alive with `tail -f /dev/null`.

#### Acceptance

- Dev spawn creates or attaches the named Git worktree under `.worktrees/<name>`.
- Dev worker ids use `pibo-dev-<worktree>`.
- The returned JSON includes `worktree`, `gatewayPort`, `cdpPort`, `webPort`, `webUIPortChat`, `webUIPortContext`, and `connect`.
- The container is labeled with role `dev`, created time, port block, worktree name, and optional owner.
- Port blocks do not overlap with currently running dev containers that carry a port-block label.
- Host `node_modules` is mounted into `/workspace/node_modules` when it exists.

#### Scenario: Two dev workers do not collide

- GIVEN a dev worker is already running with port block `0`
- WHEN an operator spawns another dev worker
- THEN the second worker receives the next unused port block and different host ports.

### Requirement: Worker entrypoint prepares browser-capable runtime

Every compute container MUST start with the environment needed for Pibo gateway and browser automation tasks.

#### Current

The Docker image installs Chromium, Chromium Driver, Xvfb, Python, uv, Browser Use, build tools, and fonts. `scripts/docker-entrypoint.sh` starts Xvfb on `DISPLAY=:99`, prepares the Browser Use wrapper when missing, updates `PATH`, sets `BROWSER_USE_HOME`, and dispatches commands.

#### Acceptance

- Container startup ensures Xvfb is running before gateway or CLI commands continue.
- `DISPLAY` is set to `:99`.
- Browser Use binaries are available on `PATH`.
- `BROWSER_USE_HOME` points to the worker's Browser Use home directory.
- `gateway` starts the local gateway on `0.0.0.0:4789`.
- `gateway:web` starts the web gateway with worker dev auth on `0.0.0.0`.
- `shell`, `bash`, and `sh` open a shell instead of starting a gateway.
- Other entrypoint arguments are passed to the built Pibo CLI.

#### Scenario: Browser automation dependency is available

- GIVEN a compute container starts with the default entrypoint
- WHEN a Pibo browser-use tool runs inside the worker
- THEN Chromium and the Browser Use wrapper are available in the container environment.

### Requirement: Dev auth remains worker-only

The compute web gateway MUST use dev auth only inside Docker workers and MUST NOT make dev auth available to normal host gateways.

#### Current

The Docker entrypoint starts `gateway:web` with the internal `{ devAuth: true }` option. `resolveWebGatewayAuthMode()` accepts dev auth only when Docker/container runtime detection succeeds. The dev-auth plugin accepts only loopback auth-route requests.

#### Acceptance

- A compute worker web gateway registers dev auth instead of Better Auth.
- A non-Docker process requesting dev auth fails before server startup.
- Setting `PIBO_DEV_AUTH=1` for a normal host gateway fails closed with an explicit error.
- Dev auth sign-in routes reject non-loopback host or forwarded-host context.
- Successful worker dev auth maps the browser session to the fixed dev user identity.

#### Scenario: Host cannot enable dev auth by accident

- GIVEN Pibo is not running inside Docker
- AND `PIBO_DEV_AUTH=1` is set
- WHEN the host web gateway starts
- THEN startup fails and does not serve a dev-auth gateway.

### Requirement: Worker cleanup is explicit and bounded

The compute CLI MUST let operators stop workers explicitly and remove old one-time workers by age.

#### Current

`releaseWorker()` stops a named container with a 10-second timeout and removes it. `reapWorkers()` lists role `worker` containers, compares their created-time label to the requested maximum age, and releases old ones. `listWorkers()` currently lists role `worker` containers.

#### Acceptance

- `pibo compute release <id>` stops and removes the named container or id.
- Releasing an already stopped container still attempts removal.
- `pibo compute reap --max-age-minutes <n>` removes one-time workers older than the requested age.
- The default reap age is 60 minutes.
- `pibo compute list` shows running one-time workers with name, status, ports, and created time, or an empty-state message.
- Releasing a dev worker container does not remove its Git worktree automatically.

#### Scenario: Reap old one-time worker

- GIVEN a running one-time worker has a created-at label older than 60 minutes
- WHEN an operator runs `pibo compute reap`
- THEN Pibo stops and removes that worker container.

## Edge Cases

- Existing Git branches or worktrees can make `git worktree add -b <name>` fail; the current code retries by adding the existing branch name.
- Docker port parsing can return `0` if Docker returns no parseable host port; callers should treat that as unusable connection data.
- `pibo compute list` and `reap` currently inspect role `worker` containers, while dev containers use role `dev`.
- `release` removes containers but intentionally does not delete worktree directories.

## Constraints

- **Isolation:** Pibo development and browser checks should run in compute workers, not against the host production gateway.
- **Security / Auth:** Dev auth is Docker-only and loopback-restricted.
- **Compatibility:** The Docker image name is currently `pibo:latest`; changing it requires updating CLI and Docker operations together.
- **Dependencies:** Docker, Git, Node, and network access for image build/package installation are required for full operation.
- **Performance:** Dev-worker spawning avoids full source-hash rebuilds and only rebuilds on dependency/Dockerfile changes.

## Success Criteria

- [ ] SC-001: `pibo compute spawn` returns usable JSON with gateway, web, CDP, and connect fields.
- [ ] SC-002: `pibo compute dev spawn --worktree <name>` creates a worktree, starts a dev container, and returns deterministic non-overlapping ports.
- [ ] SC-003: Worker `gateway:web` exposes Chat Web with Docker-only dev auth and rejects host dev-auth activation.
- [ ] SC-004: `pibo compute release <id>` removes the target container without deleting source worktrees.
- [ ] SC-005: `pibo compute reap` removes old one-time worker containers and leaves newer workers running.

## Assumptions and Open Questions

### Assumptions

- Operators have permission to run Docker and create Git worktrees in the repository.
- One-time workers and dev workers intentionally have different lifecycle shapes.
- Dev worker worktree cleanup is a separate human or future workflow decision.

### Open Questions

- Should `pibo compute list` and `reap` include dev workers, or should dev workers receive separate list/reap commands?
- Should release optionally delete the associated worktree after confirmation?
- Should one-time workers mount the current workspace or remain image-only after build?

## Traceability

| Requirement | Scenario / Story | Plan / Task | Status |
|---|---|---|---|
| REQ-001 Compute CLI is discoverable and scoped | Discover development worker command | None | Draft |
| REQ-002 Image builds are cached by source or dependency hashes | Dependency change before dev spawn | None | Draft |
| REQ-003 One-time workers start the web gateway with dynamic ports | Spawn isolated worker | None | Draft |
| REQ-004 Development workers use Git worktrees and deterministic port blocks | Two dev workers do not collide | None | Draft |
| REQ-005 Worker entrypoint prepares browser-capable runtime | Browser automation dependency is available | None | Draft |
| REQ-006 Dev auth remains worker-only | Host cannot enable dev auth by accident | None | Draft |
| REQ-007 Worker cleanup is explicit and bounded | Reap old one-time worker | None | Draft |
