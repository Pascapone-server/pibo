---
name: pibo-docker-dev
description: Use whenever you need to develop, modify, test, or debug the Pibo codebase. This includes building new features, fixing bugs, refactoring code, running tests, starting the gateway, building web UIs, or using browser automation to verify changes. Always use this skill when the task involves editing Pibo source files or running Pibo processes that could crash the live host gateway. Also trigger when the user asks to work on Pibo, improve Pibo, fix something in Pibo, or test Pibo changes in isolation.
---

# Pibo Docker Isolated Development

Develop Pibo inside a Docker container. Edit files on the host. Run builds, tests, and the gateway inside the container. This protects the live host gateway.

## The rule

Work only in a Git worktree. Never edit files in the main repository.

## Why

The host runs the live Pibo gateway. If you break it during development, the user loses their connection. A container isolates your experiments. The gateway can crash inside the container without affecting the host.

## Workflow

### 1. Spawn a container

Run:

```bash
pibo compute dev spawn --worktree <branch-name> --repo /root/code/pibo
```

The CLI prints progress at every step:
- Whether the Docker image is cached or needs a rebuild
- When the git worktree is created
- When the container starts and which ports it uses

This command:
1. Checks if `package.json`, `package-lock.json`, or `Dockerfile` changed since the last image build
2. Rebuilds the image only if dependencies changed (takes 1-2 minutes; cached otherwise)
3. Creates a Git worktree at `.worktrees/<branch-name>/`
4. Starts a container with the worktree mounted at `/workspace`
5. Mounts the host `node_modules` into the container so you never need `npm install`

The JSON output contains:
- `id` — container name
- `gatewayPort` — host port for the gateway
- `cdpPort` — host port for browser-use CDP
- `webUIPortChat` — host port for chat UI dev server
- `webUIPortContext` — host port for context-files UI dev server

### 2. Edit on the host

Use `read`, `edit`, and `write` inside `.worktrees/<branch-name>/`. The container sees changes instantly because the mount is live.

### 3. Run commands in the container

Prefix every build, test, or runtime command with `docker exec -w /workspace <id>`:

```bash
docker exec -w /workspace <id> npm run build
docker exec -w /workspace <id> npm run typecheck
docker exec -w /workspace <id> npm run test
docker exec -w /workspace <id> npm run dev
```

You do not need `npm install`. The container already has all dependencies through the mounted `node_modules`.

### 4. Start the gateway

```bash
docker exec -w /workspace <id> pibo gateway
```

The gateway binds to `0.0.0.0:4789` inside the container. Access it from the host through `gatewayHost:gatewayPort`.

### 5. Debug with browser-use

Browser-use runs inside the container. Use it to inspect the web UIs through the exposed host ports.

### 6. Iterate

Keep the container running. Edit on the host. Re-run commands in the container. You do not need to restart the container between iterations.

### 7. Finish

1. Commit in the worktree:
   ```bash
   cd /root/code/pibo/.worktrees/<branch-name>
   git add -A && git commit -m "your message"
   ```
2. Release the container:
   ```bash
   pibo compute release <id>
   ```
3. Merge the branch into main (the user handles this, but you can prepare it):
   ```bash
   cd /root/code/pibo
   git merge <branch-name>
   ```
4. Remove the worktree:
   ```bash
   git worktree remove <branch-name>
   git branch -d <branch-name>
   ```

## Port ranges

Each container gets a block of 10 ports. The spawn command assigns the next free block automatically.

| Block | Gateway | CDP | Chat UI | Context UI |
|-------|---------|-----|---------|------------|
| 480x  | 4800    | 4801| 4802    | 4803       |
| 481x  | 4810    | 4811| 4812    | 4813       |
| 482x  | 4820    | 4821| 4822    | 4823       |

This prevents port collisions when multiple agents work in parallel.

## Dependencies

The Docker image caches all `node_modules`. The host `node_modules` is mounted into the container, so builds and typechecks work immediately. If you add new dependencies to `package.json`, run `npm install` inside the container. The mounted `node_modules` updates on the host automatically.

## Reminders

- Work only in `.worktrees/<branch-name>/`. Never touch `/root/code/pibo/` directly.
- Run builds and tests inside the container.
- Keep the container alive until you finish.
- Commit to the worktree branch, not to `main`.
