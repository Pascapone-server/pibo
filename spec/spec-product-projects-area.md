---
title: Pibo Projects Area
version: 0.2
date_created: 2026-05-05
last_updated: 2026-05-07
owner: Pibo
status: draft
tags: [product, web-chat, projects, sessions, workflow, state-machine, docker, worktree]
---

# Introduction

This specification captures the proposed **Projects** area for the Pibo Chat Web App.

Projects are a coding-project-focused sibling concept to the existing `Sessions` area. The current `Sessions` area remains unchanged for now and can later evolve into a more general chat experience. The new `Projects` area reuses the proven room/session interaction model, but narrows the product language and workflow around coding projects, specs, plans, agent implementation work, human acceptance, Docker workers, worktrees, and cleanup.

## 1. Purpose & Scope

The purpose of the Projects area is to make agent-driven coding work easier to manage from idea to spec, plan, implementation, agent testing, human review, and cleanup.

In scope for the initial Projects concept:

- A new top-level `Projects` tab in the Chat Web App header/top bar.
- A project list and project detail experience structurally similar to the existing room/session UI.
- Project containers that replace the user-facing label `Rooms` with `Projects`.
- No personal/default chat project in the Projects area.
- Every Project must be linked to a concrete project folder/workspace path.
- Each Project can contain many Pibo Sessions.
- Each Project Session automatically receives its own isolated worktree and Docker compute worker.
- Each Project has an extensible workflow state machine for coding work.
- A required flow from discussion to specs, from specs to plan, from plan to implementation.
- Agent-side implementation/test loops with bounded retries.
- Human review actions such as approve, send back with reason, or discard.
- Cleanup-oriented actions that help decide what to keep, push, merge, or discard after agent work.

Out of scope for the initial concept:

- Removing or changing the existing `Sessions` area.
- Full Git hosting integration design.
- Full CI/CD pipeline orchestration.
- Multi-user/team permissions beyond the existing owner-scope model.
- Complete knowledge/document management design, except as a future extension direction.

## 2. Definitions

- **Projects Area**: The top-level Chat Web App area reached through the `Projects` tab.
- **Pibo Project**: A user-facing coding-work container that groups Pibo Sessions and is always linked to one project folder.
- **Project Folder**: The local workspace/root path associated with a Pibo Project. It is the source project folder from which isolated worktrees are created.
- **Project Session**: A Pibo Session associated with a Pibo Project.
- **Project Session Workspace**: The isolated worktree and Docker compute worker assigned to one Project Session.
- **Project State**: The current workflow phase of a Pibo Project or project work item.
- **Project State Class**: A code-level state implementation that owns the behavior, available actions, validation, prompts, and side effects for one state.
- **Project State Machine**: The orchestration layer that owns allowed transitions between Project States but does not embed state-specific behavior.
- **Spec Phase**: The phase where user discussion is converted into durable specs.
- **Plan Phase**: The phase where an executable implementation plan is derived from the accepted specs.
- **Implementation Phase**: The phase where agents perform the coding work in the isolated Docker worker/worktree.
- **Agent Test Phase**: The automated/self-test phase run by the agent before work is handed to the user.
- **Human Review Phase**: The phase where the agent has already tested its own work and the human user reviews, tests, accepts, rejects, or asks for changes.
- **Cleanup Phase**: The phase where Pibo helps the user decide what to keep, discard, push, merge, or otherwise finalize.

## 3. Product Model

### 3.1 Projects vs Sessions

The existing `Sessions` area remains the general conversation/session surface.

The new `Projects` area is optimized for coding work:

- The left-side grouping concept is called `Projects`, not `Rooms`.
- A Project must have a project folder.
- A Project can contain multiple sessions for spec work, planning, implementation attempts, subagent work, review discussion, and cleanup.
- A Project has workflow status and project-specific actions.
- A Project may later collect knowledge, documentation, project files, acceptance notes, and operational history.

### 3.2 Relationship to Pibo Rooms

Implementation may initially reuse the existing Pibo Room/session infrastructure, but the product concept should remain separate:

- A Pibo Room is a general Chat Web container.
- A Pibo Project is a coding-focused product container.
- If Projects are backed by rooms in the first implementation, that should be treated as a storage bridge, not as the permanent product language.
- UI labels in the Projects area must consistently say `Project`/`Projects`, not `Room`/`Rooms`.

### 3.3 Project Folder Requirement

Every Project must be linked to one project folder before it can be used for agent coding work.

The folder link should provide:

- Display name/path in the Project header.
- Source workspace context for new Project Sessions.
- A stable basis for cleanup checks such as Git status, worktree state, branch, changed files, and test commands.

### 3.4 Project Session Isolation

Every Project Session must automatically create and use an isolated execution workspace:

- A new worktree is created for the session.
- A Docker compute worker is spawned for the session.
- The agent works only inside that worktree and Docker worker.
- Browser checks, builds, tests, gateway restarts, and implementation commands run inside the worker context.
- The host checkout must not be used as the experimental workspace.
- The Project Session should persist the worker id, worktree path, branch name, web port, CDP port, and lifecycle status when available.

This keeps each coding attempt reviewable, disposable, and safe to clean up.

## 4. Project Workflow

### 4.1 Required Flow

A Project work item should follow this flow:

```text
discussion -> specs -> plan -> implementation -> agent_test
                                      ^              |
                                      |              v
                              needs_changes <- agent_test_failed
                                                     |
                                                     v
                                               human_review
                                                     |
                      +------------------------------+------------------------------+
                      v                              v                              v
                  cleanup                    implementation                    discarded
                      |
                      v
                  completed
```

The important product rule is:

- Anything discussed as a desired change should first become a spec update.
- The implementation plan is derived from the specs.
- Execution follows the plan.
- The agent tests its own work before handing it to the user.
- The user reviews only after the agent believes the work is ready.

### 4.2 States

Required states:

- `discussion`: The user and agent clarify the desired change.
- `specs`: The desired change is converted into durable specs.
- `plan`: The agent derives an execution plan from the specs.
- `implementation`: The agent executes the plan in the session worktree/Docker worker.
- `agent_test`: The agent runs its own tests and checks.
- `needs_changes`: The work needs another implementation iteration after failed tests or explicit feedback.
- `human_review`: The work is ready for the user to test and accept or reject.
- `cleanup`: The user approved the direction and Pibo helps finalize the working tree.
- `completed`: The Project's current work item is finalized.
- `failed`: The agent reached the retry limit or determines it cannot complete the work.
- `discarded`: The Project's current work item is intentionally abandoned.

### 4.3 Retry Loop

The implementation/test loop must support bounded retries:

```text
implementation -> agent_test -> needs_changes -> implementation
```

- The Project should track `retryCount` and `maxRetries`.
- `agent_test` may transition to `human_review` when checks pass.
- `agent_test` may transition to `needs_changes` when checks fail and retries remain.
- `agent_test` may transition to `failed` when retries are exhausted.
- The agent may also mark the work as `failed` when it determines the requested work cannot be completed safely or correctly.
- Each failed test iteration should produce a durable reason and summary.

### 4.4 Human Review Actions

In the `human_review` state, the user must have clear decision actions:

- **Approve / Release**: Move the Project to `cleanup`.
- **Send back**: Move the Project back to `needs_changes` or `implementation` with a required reason.
- **Discard**: Move the Project to `discarded`, preferably with an optional reason.

The send-back reason must become durable project context so the next agent iteration can see what was rejected or missing.

### 4.5 Cleanup Actions

In the `cleanup` state, Pibo should help answer:

- What changed in the project folder/worktree?
- Which files should be kept?
- Which files should be reverted or deleted?
- Are tests still passing?
- Should this be committed, pushed, merged to `main`, or left as a branch/worktree?
- Should the Docker worker be released?

Initial UI actions may be lightweight wrappers around inspectable operations:

- Show Git status.
- Show changed files.
- Show diffs.
- Run configured test command.
- Mark files/changes as keep or discard.
- Create a cleanup summary.
- Release the Docker compute worker after confirmation.
- Mark cleanup as completed.

Potential later actions:

- Create commit.
- Push branch.
- Open pull request.
- Merge to main.
- Delete or archive worktree.

## 5. State Machine Architecture

The state system should be extensible. The state machine defines flow; state classes define behavior.

### 5.1 Design Principle

- The **Project State Machine** owns allowed transitions and transition history.
- Each **Project State Class** owns the functionality of that state.
- Adding a new state should not require rewriting one large state-machine function.
- UI actions should be derived from the active state class where possible.
- State-specific prompts, validation, side effects, and completion criteria should live with the state class.

### 5.2 Draft Interfaces

```ts
export type PiboProjectStateName =
  | "discussion"
  | "specs"
  | "plan"
  | "implementation"
  | "agent_test"
  | "needs_changes"
  | "human_review"
  | "cleanup"
  | "completed"
  | "failed"
  | "discarded";

export type PiboProjectTransition = {
  from: PiboProjectStateName;
  to: PiboProjectStateName;
  action: string;
  reason?: string;
};

export type PiboProjectAction = {
  id: string;
  label: string;
  kind: "user" | "agent" | "system";
  requiresReason?: boolean;
  destructive?: boolean;
};

export interface PiboProjectStateHandler {
  readonly name: PiboProjectStateName;

  getAvailableActions(context: PiboProjectStateContext): PiboProjectAction[];

  canEnter?(context: PiboProjectStateContext): Promise<boolean> | boolean;
  onEnter?(context: PiboProjectStateContext): Promise<void> | void;
  onExit?(context: PiboProjectStateContext): Promise<void> | void;

  handleAction(
    actionId: string,
    context: PiboProjectStateContext,
    input?: Record<string, unknown>,
  ): Promise<PiboProjectTransition | void> | PiboProjectTransition | void;
}

export interface PiboProjectStateMachine {
  canTransition(from: PiboProjectStateName, to: PiboProjectStateName): boolean;
  transition(projectId: string, transition: PiboProjectTransition): Promise<void>;
}
```

The exact interface can change during implementation, but the separation should remain: state handlers own behavior; the state machine owns flow and transition persistence.

## 6. UI Requirements

- **REQ-001**: The Chat Web App top bar MUST include a new `Projects` tab.
- **REQ-002**: The existing `Sessions` tab and behavior MUST remain unchanged for the initial Projects work.
- **REQ-003**: The Projects area MUST not create or show a personal/default chat project.
- **REQ-004**: Creating a Project MUST require selecting or entering a project folder.
- **REQ-005**: The Projects sidebar SHOULD resemble the Sessions room/session layout but use Project language.
- **REQ-006**: A selected Project MUST show its workflow state prominently.
- **REQ-007**: Project Sessions MUST be listed under the selected Project.
- **REQ-008**: New sessions created inside a Project MUST automatically create a worktree and Docker compute worker.
- **REQ-009**: New sessions created inside a Project MUST inherit the Project's folder/workspace context but MUST execute only in the session worktree.
- **REQ-010**: The UI SHOULD show the active worktree path, worker status, and relevant worker ports when available.
- **REQ-011**: The Specs phase MUST make spec changes visible and durable.
- **REQ-012**: The Plan phase MUST show the plan derived from the specs before execution.
- **REQ-013**: The Agent Test phase MUST show test attempts, failures, retry count, and max retries.
- **REQ-014**: The Human Review phase MUST expose approve, send-back-with-reason, and discard actions.
- **REQ-015**: The Cleanup phase SHOULD expose project-folder/worktree inspection and cleanup helper actions.
- **REQ-016**: State transitions MUST be visible in the Project timeline or activity history.

## 7. Data Contract Draft

```ts
export type PiboProjectStateName =
  | "discussion"
  | "specs"
  | "plan"
  | "implementation"
  | "agent_test"
  | "needs_changes"
  | "human_review"
  | "cleanup"
  | "completed"
  | "failed"
  | "discarded";

export type PiboProject = {
  id: string;
  ownerScope: string;
  name: string;
  description?: string;
  projectFolder: string;
  state: PiboProjectStateName;
  currentSessionId?: string;
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PiboProjectSessionWorkspace = {
  projectId: string;
  piboSessionId: string;
  sourceProjectFolder: string;
  worktreePath: string;
  branchName?: string;
  dockerWorkerId?: string;
  webPort?: number;
  cdpPort?: number;
  status: "creating" | "ready" | "running" | "released" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type PiboProjectEvent = {
  id: string;
  projectId: string;
  piboSessionId?: string;
  actorId?: string;
  type:
    | "project.created"
    | "project.updated"
    | "project.state_changed"
    | "project.spec_updated"
    | "project.plan_created"
    | "project.agent_test_started"
    | "project.agent_test_failed"
    | "project.agent_test_passed"
    | "project.review_sent_back"
    | "project.review_approved"
    | "project.failed"
    | "project.discarded"
    | "project.cleanup_summary_created"
    | "project.workspace_created"
    | "project.workspace_released";
  payload: Record<string, unknown>;
  createdAt: string;
};
```

Project Sessions may initially be associated through `PiboSession.metadata.projectId`, but long-term implementations may introduce a first-class relation table if needed.

## 8. Future Extensions

Projects are intended to become more than session groups. Future versions may add:

- Project knowledge and documentation.
- Project-scoped context files.
- Acceptance criteria tracking.
- Agent-generated implementation plans.
- Test plans and manual test checklists.
- Git branch/worktree lifecycle management.
- Docker worker lifecycle tracking.
- Project-level summaries across many sessions.
- Reusable cleanup playbooks.
- GitHub/GitLab pull request integration.
- CI result integration.

## 9. Open Questions

- Should a Project represent one long-lived repository, or one concrete work item inside a repository?
- Should Project states apply to the whole Project or to individual work items/milestones inside a Project?
- Should the spec/plan/implementation flow be mandatory for every Project Session or only for top-level work items?
- Should project folders be limited to local paths, or can they later represent remote repositories?
- Which cleanup operations should be UI-only confirmations vs direct executable actions?
- How much Git automation is safe before explicit user confirmation is required?
- What should the default `maxRetries` be for the agent implementation/test loop?
