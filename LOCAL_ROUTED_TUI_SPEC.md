# Local Routed TUI Spec

This document describes a local native-feeling Pibo TUI that uses the same routed runtime as the gateway, remote controller, and future channels.

## Goal

Pibo should be usable directly over SSH with a native terminal workflow:

```text
pibo tui <profile>
```

When the selected profile contains Pibo capabilities such as plugin tools, skills, subagents, or yielded runs, the TUI should still expose those capabilities without requiring a separate gateway or remote controller process.

The user experience should feel local and direct. The architecture should stay routed.

## Core Idea

The local TUI is a channel adapter, not a second runtime.

```text
Pi TUI shell
  -> local routed TUI extension
  -> PiboSessionRouter
  -> RoutedSession
  -> createPiboRuntime(profile, router controllers)
  -> Pi Coding Agent
```

The TUI only handles terminal input and rendering. It does not own tools, subagents, yielded runs, profile resolution, session bindings, or plugin behavior.

## Why Routing Is Required

Generated Pibo tools are not only static tool definitions. They depend on runtime state owned by `PiboSessionRouter`:

- parent and child `sessionKey` ownership
- subagent session creation and reuse
- run registry state
- tracked vs detached completion policy
- run completion notifications
- `pibo_run_read`, `pibo_run_ack`, `pibo_run_cancel`, and bounded waits
- cleanup when sessions or routers are disposed

A direct `createPiboRuntime` call can expose ordinary profile tools, but it cannot safely implement routed subagents and yielded runs unless the router controllers are provided.

The local TUI should therefore use an in-process router instead of duplicating router logic.

## Non-Goals

- Do not replace the existing gateway.
- Do not remove the remote controller proof of concept.
- Do not duplicate subagent or run-registry logic inside the TUI.
- Do not make Pi TUI the owner of Pibo plugin behavior.
- Do not reimplement Pi Coding Agent's session storage or model loop.
- Do not add a large UI framework or long-lived daemon for local use.

## Plugin Compatibility

The local routed TUI must consume capabilities through the existing plugin and profile path:

```text
PiboPluginRegistry
  -> profile
  -> tools
  -> skills
  -> context files
  -> subagents
  -> gateway actions / channel actions where applicable
  -> PiboSessionRouter
```

This means normal plugin additions should automatically work in local TUI mode:

- new tools become visible when the selected profile enables them
- new skills load through the profile
- new context files load through the profile
- new subagents become generated tools
- yielded run tools appear when the profile has yieldable work
- event listeners still receive routed output events

The local TUI must not maintain its own tool catalog. It should only pass a selected profile into the router.

## CLI Behavior

Recommended behavior:

```text
pibo tui <profile>
```

If the profile has no routed-only capabilities, this may continue to use the direct Pi TUI path.

If the profile has subagents or yielded-run support, `pibo tui` should automatically start local routed mode.

Optional explicit command for development and QA:

```text
pibo tui:routed <profile>
```

This command always uses the local routed path and is useful while the implementation is still being validated.

## Runtime Behavior

On startup:

1. Create a `PiboSessionRouter` in the current process.
2. Resolve the selected profile through the normal plugin registry.
3. Start a small Pi TUI controller profile with builtin tools disabled.
4. Register a TUI extension that intercepts user input.
5. Forward normal input to `router.emit({ type: "message", sessionKey, text })`.
6. Subscribe to router output events and render them in the TUI.

The local routed TUI should use a stable local session key, for example:

```text
local-tui:default
```

If profile/session selection is later added, the session key can include a user-provided name:

```text
local-tui:<sessionName>
```

## Event Flow

```text
User enters message
  -> TUI extension handles input
  -> router.emit(message)
  -> routed parent session runs
  -> parent may call pibo_run_start
  -> router starts child session
  -> parent continues or ends turn
  -> child completes
  -> router sends compact run notification
  -> parent can call pibo_run_read
  -> TUI renders assistant output
```

The local TUI should render router events, not raw child implementation details.

## Slash Commands

Pi TUI already owns local slash commands such as settings, model selection, import/export, session navigation, and quit.

The local routed TUI should start with a conservative rule:

- ordinary text goes to the routed Pibo session
- safe local Pi TUI commands stay local
- Pibo execution actions can be exposed only when they do not conflict with Pi TUI built-ins

This mirrors the existing remote-controller approach, where controller-local commands and routed commands are kept separate.

## Lifecycle

The local routed TUI owns the in-process router lifetime.

On TUI shutdown:

- unsubscribe from router events
- dispose the router
- cancel owned running runs through existing router cleanup
- release the controller runtime

The implementation should not leave background subagent runs alive after the local TUI exits.

## Implementation Shape

Minimal implementation:

- add a `runLocalRoutedTui` entry point
- create an in-process `PiboSessionRouter`
- reuse the remote TUI controller pattern for input interception and event rendering
- replace `RemoteAgentSessionClient` with a tiny local client that calls `router.emit` directly
- add a CLI command or auto-routing behavior in `pibo tui`

Cleaner follow-up:

- extract shared TUI rendering helpers from the remote controller
- share slash-command filtering between remote and local routed TUI
- keep transport-specific code small

## Acceptance Criteria

- `pibo tui pibo-minimal` still works.
- `pibo tui run-yield-qa` starts without requiring `pibo gateway`.
- The agent sees generated subagent and run-control tools for routed profiles.
- A tracked yielded subagent run can complete after the parent turn and notify the parent.
- `pibo_run_read` returns the completed result.
- A detached run does not automatically re-prompt the parent.
- New profile tools and skills registered through plugins are visible without local TUI-specific code.
- TUI shutdown disposes the router and does not leave running child sessions unmanaged.

## Risks

- Some Pi TUI slash commands act on the controller shell, not the routed Pibo session.
- Rendering streamed output and execution results needs to stay compact.
- If future plugins require custom terminal UI panels, Pibo will need a small UI extension boundary.
- If subagent or run logic is ever copied into the TUI, gateway and local TUI behavior will drift.

## Decision

Build local native use as a routed TUI adapter.

Do not make direct `createPiboRuntime` responsible for subagents or yielded runs by itself. The router remains the source of truth for Pibo runtime behavior, while the local TUI becomes another channel into that runtime.
