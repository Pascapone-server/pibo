# PRD: Pibo Workflow UI Authoring V2 — Workflow Registry, Catalog, and Draft Store

**Status:** Draft  
**Created:** 2026-05-11  
**Related docs:** `../spec.md`, `../design.md`, `../tasks.md`, `README.md`

## 1. Executive Summary

- **Problem Statement**: V1 has a code-oriented Workflow Registry, but V2 needs one catalog that can show code workflows, UI drafts, and UI-published versions with lifecycle actions and diagnostics.
- **Proposed Solution**: Extend the Workflow Registry/store model with global workflow records, explicit `source` and `status`, invalid draft support, version listing, missing-reference diagnostics, and editor picker metadata.
- **Success Criteria**:
  - SC-01: Catalog APIs list code workflows, UI drafts, and UI-published workflows with source/status metadata.
  - SC-02: A UI draft can be saved while incomplete or invalid, but invalid raw IR text cannot overwrite the last valid draft object.
  - SC-03: Each workflow/copy has at most one active draft.
  - SC-04: Missing handler, adapter, guard, profile, prompt asset, or nested workflow refs produce structured diagnostics with ids and locations.
  - SC-05: Workflow Library actions can be derived from record source/status without special-case UI guesses.

## 2. User Experience & Functionality

- **User Personas**:
  - Workflow author browsing available workflows and drafts.
  - Pibo user selecting a workflow for a Project session.
  - Developer registering handlers, adapters, guards, workflows, or prompt assets.
  - Reviewer debugging catalog and missing-reference errors.

- **User Stories**:
  - As a workflow author, I want one Workflow Library to show code and UI workflows so that I do not search multiple places.
  - As a workflow author, I want drafts to save before they are runnable so that I can build workflows incrementally.
  - As a workflow author, I want code workflows to be duplicable but not directly editable so that code-owned definitions stay stable.
  - As a reviewer, I want missing refs to identify the broken id and location so that I can fix the draft or registry.

- **Acceptance Criteria**:
  - Workflow records distinguish `source: "code" | "ui"` from `status: "draft" | "published" | "archived"`.
  - UI drafts live in the Workflow Registry/store, not in Project session state.
  - Draft definitions may be partial or invalid and include diagnostics.
  - Invalid raw IR parse results show a warning and preserve the last valid persisted draft object.
  - Catalog entries show id, title, description, tags, examples where present, source, status, versions, editability, validation state, missing refs, and actions.
  - Picker APIs expose registered handlers, adapters, guards, human actions, prompt assets, and non-archived Agent profiles.

- **Non-Goals**:
  - User-private workflow catalogs in V2.
  - Project-scoped workflow definitions in V2.
  - Editing code-registered workflow records directly.
  - Creating new executable handlers, adapters, or guards from UI.
  - Storing invalid raw text as the canonical workflow definition.

## 3. AI System Requirements (If Applicable)

- **Tool Requirements**:
  - Workflow Registry resolution for definitions, versions, handlers, adapters, guards, human actions, prompt assets, profiles, and nested workflows.
  - Existing workflow validation functions, including JSON Schema subset validation and graph validation.
  - Catalog/picker APIs consumable by Chat Web.

- **Evaluation Strategy**:
  - Catalog tests verify global visibility, source/status derivation, archived filtering, and version ordering.
  - Draft tests verify incomplete draft save, one-active-draft enforcement, duplicate-to-draft, and raw IR parse protection.
  - Registry-ref tests remove handlers/adapters/guards/profiles/nested workflows and verify structured missing-reference diagnostics.

## 4. Technical Specifications

- **Architecture Overview**:
  - Code workflows remain registered by TypeScript/plugin code and are read-only catalog records.
  - UI drafts and UI-published workflows are persisted in the Workflow Registry/store.
  - Published UI workflows are registry-resolvable by id/version and executable like code-registered workflows.
  - Drafts are editor objects until published; runtime never executes invalid drafts.

- **Entity Model Baseline**:
  - A workflow identity groups versions, draft state, archive state, delete/tombstone state, tags, title, and description.
  - A draft record is the one mutable UI editing track for a workflow/copy and may contain partial or invalid Workflow IR.
  - A published version record is immutable, has a version and definition hash, and is runnable when not hidden by archive/delete rules.
  - Archive state belongs to the workflow identity, not to one published version.
  - Delete may remove or tombstone the live catalog identity, but it must not remove snapshots needed by historical runs.

- **Permission Baseline**:

  | Action | Source-spec decision | V2 PRD contract |
  |---|---|---|
  | View global workflows | UI-authored workflows are global and visible to authenticated users | Require authentication and list visible code/UI records. |
  | Duplicate workflow | Users can duplicate existing workflows | Require authentication; exact cross-user ownership/edit semantics remain TBD. |
  | Create/edit/publish UI drafts | Normal users are the UI target, but detailed edit rights are not specified | Resolve and document exact permissions before implementation. |
  | Archive workflow | Any authenticated user may archive workflows in V2 | Require authentication; no additional V2 role. |
  | Delete workflow | Any authenticated user may delete workflows in V2 | Require authentication; no additional V2 role; preserve historical snapshots. |

- **Open Decisions**:
  - Exact Workflow Registry/store database tables and record shapes are TBD.
  - Exact create/edit/publish permissions are TBD beyond the authenticated-user archive/delete rule.

- **Integration Points**:
  - Workflow Registry/store for code workflow projection, UI drafts, UI-published versions, archive/delete markers, and metadata.
  - Chat Web Workflow Library and Builder for list, inspect, duplicate, edit, validate, publish, archive, and delete actions.
  - Agent Designer profile catalog for non-archived profile picker results.
  - Prompt asset store/editor where prompt assets are editable.

- **Security & Privacy**:
  - Catalog APIs require authentication.
  - UI-authored workflows are global in V2; callers must not imply private ownership.
  - Diagnostics should reveal missing ids and locations without dumping sensitive prompt/input/output payloads.
  - Code workflows stay code-owned to avoid UI mutation of plugin-defined behavior.

## 5. Risks & Roadmap

- **Phased Rollout**:
  - MVP: Catalog list/inspect, source/status metadata, duplicate-to-draft, draft save, and picker APIs.
  - v1.1: Missing-reference diagnostics, validation summaries, archived filters, and version history.
  - v1.2: Prompt asset integration, richer catalog search/filtering, and deleted-definition run states.

- **Technical Risks**:
  - Draft schema becomes a second workflow language; mitigate by wrapping `PartialWorkflowDefinition` and publishing only valid `WorkflowDefinition` IR.
  - Global workflows create accidental edits by any user; mitigate with immutable published versions, source/status actions, and explicit archive/delete affordances.
  - Missing refs surface only at runtime; mitigate by validating on draft load, picker render, publish, session creation, and run start.
