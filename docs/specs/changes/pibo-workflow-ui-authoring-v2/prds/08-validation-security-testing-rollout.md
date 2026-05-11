# PRD: Pibo Workflow UI Authoring V2 — Validation, Security, Testing, and Rollout

**Status:** Draft  
**Created:** 2026-05-11  
**Related docs:** `../spec.md`, `../design.md`, `../tasks.md`, `README.md`, `../../pibo-workflow-system-v1/prds/08-security-observability-testing-rollout.md`

## 1. Executive Summary

- **Problem Statement**: V2 exposes workflow authoring to normal users, which increases risk around invalid definitions, missing registry refs, unsafe execution paths, confusing diagnostics, and UI/runtime drift.
- **Proposed Solution**: Define validation gates, structured diagnostics, security boundaries, observability requirements, automated tests, manual validation flows, and rollout phases that keep V2 aligned with V1 runtime contracts.
- **Success Criteria**:
  - SC-01: Draft validation runs after load, graph, node, edge, schema, prompt, state, raw IR, publish, session creation, and start events.
  - SC-02: Publish and run/start are blocked while error diagnostics remain.
  - SC-03: No UI path creates inline TypeScript, arbitrary executable code, raw XState source, or Zod schema definitions.
  - SC-04: Missing refs and validation errors appear in the Workflow Library, Builder, and runtime failure state with actionable ids and locations.
  - SC-05: Typecheck, unit, integration, and UI tests cover registry lifecycle, builder editing, Project session creation, run inspection, human actions, and V2 explicit deferrals.

## 2. User Experience & Functionality

- **User Personas**:
  - Workflow author fixing draft diagnostics.
  - Security reviewer verifying execution boundaries.
  - QA engineer validating V2 behavior before rollout.
  - Developer debugging UI/runtime mismatch.

- **User Stories**:
  - As a workflow author, I want diagnostics grouped by workflow element so that I can fix errors quickly.
  - As a security reviewer, I want proof that UI workflows can only compose registered capabilities so that V2 does not become a code execution surface.
  - As a QA engineer, I want automated tests for the main flows and explicit non-goals so that regressions are caught.
  - As a developer, I want consistent diagnostics from editor, publish, session creation, and runtime start so that bugs are not hidden until execution.

- **Acceptance Criteria**:
  - Diagnostics include code, message, optional path, nodeId, edgeId, severity, and hint where applicable.
  - Diagnostics group by workflow, node, edge, schema path, state path, registry ref, and severity.
  - Draft save allows warnings/errors, but publish and run/start reject error diagnostics.
  - Raw IR parse errors show warnings and do not persist invalid raw text.
  - Runtime executes only valid published workflows or valid session snapshots.
  - Lifecycle and failure signals are visible for draft save, validation, publish, archive, delete, configured-session creation, start blocked, start accepted, run status changes, and human action submission.
  - V2 explicit deferrals are tested or reviewed: templates, TypeScript export, workflow slash commands, workflow tools for agents, YAML/JSON product import/export, inline TypeScript, Zod schema authoring, and inline nested workflow expansion.

- **Non-Goals**:
  - New general compliance/audit product beyond workflow events and diagnostics.
  - New role model beyond authenticated archive/delete rules in V2.
  - Replacing V1 workflow validation with Zod, AJV, or a new validation stack.
  - Treating XState projection as the source of truth.

## 3. AI System Requirements (If Applicable)

- **Tool Requirements**:
  - Existing workflow validation functions and JSON Schema subset validator.
  - Registry-ref validation for handlers, adapters, guards, profiles, prompt assets, human actions, and nested workflows.
  - Event/run inspection APIs for observability.
  - Lifecycle event or audit-equivalent records for validation, publish, archive, delete, configured-session creation, run start, run start rejection, and human action submission.
  - Test harnesses for workflow package, Chat Web UI, Project session APIs, and human actions.

- **Evaluation Strategy**:
  - Unit tests: Registry draft/publish lifecycle, catalog APIs, source/status action derivation, validation diagnostics, version bumps, archive/delete.
  - Integration tests: Project session workflow selection, delayed start, snapshot creation, workflow immutability, one-run enforcement, start validation.
  - UI tests: duplicate/edit/validate/publish, raw IR invalid warning, incompatible edge adapter requirement, missing ref diagnostics, sidebar/view routing, human action submission.
  - Negative boundary tests: no inline TypeScript, no raw XState editing, no Zod authoring, no templates, no slash commands, no agent workflow tools.
  - Release gate: `npm run typecheck` plus relevant workflow/package and Chat Web tests pass.

## 4. Technical Specifications

- **Architecture Overview**:
  - Validation is event-driven from editor and lifecycle transitions and uses V1 validation logic where possible.
  - Structured diagnostics are shared by Builder, Workflow Library, Project session creation, run start, and runtime failure state.
  - Security boundaries are enforced through registered refs, picker constraints, publish validation, start validation, and runtime executor policy.
  - Observability remains event/run/snapshot based; XState is visual-only.
  - UI and API failures must surface the same diagnostic families for blocked publish, blocked session creation, blocked run start, missing refs, and invalid human actions.

- **Integration Points**:
  - `packages/workflows/src/validation` for schema, port, graph, registry, and state checks.
  - Workflow Registry/store for source/status, drafts, versions, missing refs, and lifecycle events.
  - Chat Web Workflows and Projects surfaces for diagnostics, links, and run views.
  - Existing auth, owner scope, Project session, Pibo Session, profile, tool, skill, context, and compute-worker policies.

- **Security & Privacy**:
  - V2 must not bypass normal session, tool, skill, context, auth, profile, Project, or compute-worker policies.
  - Code nodes, adapters, and guards must be registered trusted refs only.
  - Inputs, outputs, prompts, prompt assets, state, edge payloads, and human action payloads are sensitive workflow data.
  - Diagnostics should reveal enough to fix errors without leaking hidden payloads in normal UI.

## 5. Risks & Roadmap

- **Phased Rollout**:
  - MVP gate: registry/store lifecycle tests, Project selection/delayed-start tests, and no-code-boundary review.
  - v1.1 gate: builder editing tests, raw IR tests, validation panel tests, and publish/version tests.
  - v1.2 gate: run inspection, sidebar/view routing, human actions, deleted-definition historical inspection, and archive/delete tests.
  - Release gate: typecheck and relevant automated/manual V2 flows pass before main deployment.

- **Technical Risks**:
  - Validation differs between editor and runtime; mitigate by reusing validation functions and testing at edit, publish, session creation, and start.
  - UI introduces hidden executable paths; mitigate by picker-only registered refs and negative tests.
  - Diagnostics leak sensitive payloads; mitigate with redaction and existing visibility rules.
  - Scope creep destabilizes V2; mitigate by explicit non-goals and deferral tests.
