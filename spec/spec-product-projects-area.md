---
title: Pibo Projects Area
version: 0.1
date_created: 2026-05-05
last_updated: 2026-05-05
owner: Pibo
status: draft
tags: [product, web-chat, projects, sessions, workflow, state-machine]
---

# Introduction

This specification captures the proposed **Projects** area for the Pibo Chat Web App.

Projects are a coding-project-focused sibling concept to the existing `Sessions` area. The current `Sessions` area remains unchanged for now and can later evolve into a more general chat experience. The new `Projects` area reuses the proven room/session interaction model, but narrows the product language and workflow around coding projects, working directories, agent implementation work, human acceptance, and cleanup.

## 1. Purpose & Scope

The purpose of the Projects area is to make agent-driven coding work easier to manage from planning through implementation, user acceptance, and cleanup.

In scope for the initial Projects concept:

- A new top-level `Projects` tab in the Chat Web App header/top bar.
- A project list and project detail experience structurally similar to the existing room/session UI.
- Project containers that replace the user-facing label `Rooms` with `Projects`.
- No personal/default chat project in the Projects area.
- Every Project must be linked to a concrete project folder/workspace path.
- Each Project can contain many Pibo Sessions.
- Each Project has a workflow state machine for coding work.
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
- **Project Folder**: The local workspace/root path associated with a Pibo Project. It is the folder agents work against and the folder cleanup actions inspect.
- **Project Session**: A Pibo Session associated with a Pibo Project.
- **Project State**: The current workflow phase of a Pibo Project.
- **Planning Phase**: The phase where the desired coding task, approach, risks, and acceptance criteria are clarified.
- **Implementation Phase**: The phase where agents perform the coding work, often in an isolated Docker worker or worktree.
- **Review/Test Phase**: The phase where the agent has already tested its own work and the human user reviews, tests, accepts, rejects, or asks for changes.
- **Cleanup Phase**: The phase where Pibo helps the user decide what to keep, discard, push, merge, or otherwise finalize.

## 3. Product Model

### 3.1 Projects vs Sessions

The existing `Sessions` area remains the general conversation/session surface.

The new `Projects` area is optimized for coding work:

- The left-side grouping concept is called `Projects`, not `Rooms`.
- A Project must have a project folder.
- A Project can contain multiple sessions for planning, implementation attempts, subagent work, review discussion, and cleanup.
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
- Workspace context for new Project Sessions.
- A stable basis for cleanup checks such as Git status, worktree state, branch, changed files, and test commands.

## 4. Workflow State Machine

### 4.1 States

A Project should move through these primary states:

```text
planning -> implementation -> review -> cleanup -> completed
                         \-> discarded
review -> implementation
review -> discarded
cleanup -> implementation
cleanup -> discarded
```

Required states:

- `planning`: The task is being shaped. Pibo should encourage clear goals, constraints, and acceptance criteria.
- `implementation`: Agents are actively building or iterating on the requested work.
- `review`: Agent work is ready for human acceptance. The user tests and decides whether to approve, request changes, or discard.
- `cleanup`: The user approved the direction and Pibo helps finalize the working tree.
- `completed`: The Project's current work item is finalized.
- `discarded`: The Project's current work item is intentionally abandoned.

### 4.2 Review Actions

In the `review` state, the user must have clear decision actions:

- **Approve / Release**: Move the Project to `cleanup`.
- **Send back**: Move the Project back to `implementation` with a required reason.
- **Discard**: Move the Project to `discarded`, preferably with an optional reason.

The send-back reason should become durable project context so the next agent iteration can see what was rejected or missing.

### 4.3 Cleanup Actions

In the `cleanup` state, Pibo should help answer:

- What changed in the project folder?
- Which files should be kept?
- Which files should be reverted or deleted?
- Are tests still passing?
- Should this be committed, pushed, merged to `main`, or left as a branch/worktree?

Initial UI actions may be lightweight wrappers around inspectable operations:

- Show Git status.
- Show changed files.
- Show diffs.
- Run configured test command.
- Mark files/changes as keep or discard.
- Create a cleanup summary.
- Mark cleanup as completed.

Potential later actions:

- Create commit.
- Push branch.
- Open pull request.
- Merge to main.
- Release Docker worker/worktree resources.

## 5. UI Requirements

- **REQ-001**: The Chat Web App top bar MUST include a new `Projects` tab.
- **REQ-002**: The existing `Sessions` tab and behavior MUST remain unchanged for the initial Projects work.
- **REQ-003**: The Projects area MUST not create or show a personal/default chat project.
- **REQ-004**: Creating a Project MUST require selecting or entering a project folder.
- **REQ-005**: The Projects sidebar SHOULD resemble the Sessions room/session layout but use Project language.
- **REQ-006**: A selected Project MUST show its workflow state prominently.
- **REQ-007**: Project Sessions MUST be listed under the selected Project.
- **REQ-008**: New sessions created inside a Project MUST inherit the Project's folder/workspace context.
- **REQ-009**: The Review/Test phase MUST expose approve, send-back-with-reason, and discard actions.
- **REQ-010**: The Cleanup phase SHOULD expose project-folder inspection and cleanup helper actions.
- **REQ-011**: State transitions MUST be visible in the Project timeline or activity history.

## 6. Data Contract Draft

```ts
export type PiboProjectState =
  | "planning"
  | "implementation"
  | "review"
  | "cleanup"
  | "completed"
  | "discarded";

export type PiboProject = {
  id: string;
  ownerScope: string;
  name: string;
  description?: string;
  projectFolder: string;
  state: PiboProjectState;
  currentSessionId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PiboProjectEvent = {
  id: string;
  projectId: string;
  actorId?: string;
  type:
    | "project.created"
    | "project.updated"
    | "project.state_changed"
    | "project.review_sent_back"
    | "project.review_approved"
    | "project.discarded"
    | "project.cleanup_summary_created";
  payload: Record<string, unknown>;
  createdAt: string;
};
```

Project Sessions may initially be associated through `PiboSession.metadata.projectId`, but long-term implementations may introduce a first-class relation table if needed.

## 7. Future Extensions

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

## 8. Open Questions

- Should a Project represent one long-lived repository, or one concrete work item inside a repository?
- Should Project states apply to the whole Project or to individual work items/milestones inside a Project?
- Should project folders be limited to local paths, or can they later represent remote repositories?
- Which cleanup operations should be UI-only confirmations vs direct executable actions?
- How much Git automation is safe before explicit user confirmation is required?
