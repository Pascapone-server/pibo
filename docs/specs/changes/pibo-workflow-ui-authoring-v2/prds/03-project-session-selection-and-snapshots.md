# PRD: Pibo Workflow UI Authoring V2 — Project Session Selection and Snapshots

**Status:** Draft  
**Created:** 2026-05-11  
**Related docs:** `../spec.md`, `../design.md`, `../tasks.md`, `README.md`

## 1. Executive Summary

- **Problem Statement**: Users need to configure a workflow-backed Project session before execution, but V1 links workflow runs to Projects after runtime start and does not define a normal-user creation flow.
- **Proposed Solution**: Add a Project session creation flow that selects a workflow version, captures allowed session-scoped values, creates an immutable configuration/effective-definition snapshot, and starts the workflow only after explicit user action.
- **Success Criteria**:
  - SC-01: Session creation lets the user set a session name, workflow id/version, input values, prompt overrides, model, thinking level, and fast mode.
  - SC-02: Creating the session persists a configured/not-started Project session and does not create a workflow run.
  - SC-03: Start creates exactly one workflow run for that Project session.
  - SC-04: The selected workflow cannot be changed after Project session creation.
  - SC-05: The run remains inspectable through a snapshot if the workflow definition later changes or is deleted.

## 2. User Experience & Functionality

- **User Personas**:
  - Pibo user creating a workflow-backed Project session.
  - Project collaborator inspecting why a run used specific prompts/model settings.
  - Runtime developer preserving execution and replay invariants.
  - QA engineer testing session lifecycle and immutability.

- **User Stories**:
  - As a Pibo user, I want to configure workflow input before start so that I can review the session setup.
  - As a Pibo user, I want workflow start to be explicit so that creating a session is safe.
  - As a collaborator, I want the run to show the workflow version and effective settings so that I can understand historical behavior.
  - As a runtime developer, I want an immutable snapshot so that deletion or edits do not break run inspection.

- **Acceptance Criteria**:
  - The Project session creation view appears in the main Project session content area.
  - The user selects a published workflow version from the global catalog.
  - The user can configure only allowed V2 session-scoped values: input, prompt overrides, model, thinking level, and fast mode.
  - Session-scoped configuration does not persist back to the workflow definition.
  - V2 rejects agent profile overrides, retry limit overrides, and arbitrary option overrides.
  - The selected workflow is immutable after session creation.
  - The Project session has states equivalent to configured, running, waiting, completed, failed, and cancelled.
  - The one-run-per-session rule does not forbid parallel node execution inside that run when the workflow definition allows it.
  - The runtime executes the effective snapshot, not a mutable live draft.
  - A configured/not-started Project session shows selected workflow id/version, configuration summary, validation state, explicit Start action, and empty run-history state.
  - If validation fails before Project session creation or before start, the UI blocks that action and shows diagnostics linked to the invalid input, override, schema, or missing reference.

- **Non-Goals**:
  - Project-wide workflow defaults.
  - Relinking an existing Project session to another workflow.
  - Multiple primary workflow runs per Project session.
  - Starting workflows from normal Sessions tab.
  - Workflow slash commands for start/run.
  - Session-scoped handler, adapter, guard, retry, or profile overrides in V2.

## 3. AI System Requirements (If Applicable)

- **Tool Requirements**:
  - Workflow catalog/version APIs for selectable published workflows.
  - Input validation against workflow input ports and JSON Schema subset.
  - Prompt override editor and model/thinking/fast-mode selectors.
  - Project Session API to create configured workflow sessions.
  - Workflow runtime API to start a run from a snapshot.

- **Evaluation Strategy**:
  - Integration tests cover configured-session creation without run creation.
  - Start tests assert one run per Project session and reject second-start attempts while preserving allowed parallel node execution inside the run.
  - Immutability tests reject workflow id/version changes after session creation.
  - Snapshot tests verify base workflow id/version/hash, effective definition hash, inputs, prompt overrides, model, thinking level, fast mode, Project id, Pibo Session id, and timestamp are persisted.
  - Create/start validation tests verify blocked actions show diagnostics and leave the session in the correct pre-run state.
  - Deleted-definition tests verify the historical run still renders snapshot data.

## 4. Technical Specifications

- **Architecture Overview**:
  - Project session creation resolves a published workflow version and prepares a configuration snapshot.
  - The snapshot records base workflow identity plus allowed session overrides and effective definition hash.
  - Explicit start validates the snapshot and creates the single workflow run.
  - Nested workflow runs and agent node sessions are linked below the primary Project session when execution creates them.
  - Prompt overrides are stored as node-id-keyed session configuration for nodes that are eligible for prompt override.
  - Exact prompt override eligibility rules are TBD; implementation must not allow arbitrary node prompt mutation without a documented rule.
  - Whether allowed session fields remain editable between configured-session creation and first start is TBD; implementation must resolve this before coding the pre-run UX.

- **Integration Points**:
  - Project service/session APIs for session name, Project id, Pibo Session id, workflow metadata, and configured state.
  - Workflow Registry for version lookup and definition hash.
  - Workflow runtime/store for start, run id, status, output, errors, events, and snapshots.
  - Chat Web Projects UI for creation, configuration review, start button, and run view.

- **Security & Privacy**:
  - Session creation and start require authenticated access to the Project/session context.
  - Snapshot payloads may include prompts, inputs, model settings, and outputs and must follow existing Project/Pibo Session visibility rules.
  - Snapshots should preserve inspectability without granting access to deleted live definitions beyond what the run already recorded.

## 5. Risks & Roadmap

- **Phased Rollout**:
  - MVP: Select published workflow, create configured session, snapshot base/effective data, explicit start.
  - v1.1: Prompt overrides, model/thinking/fast-mode selectors, richer input validation UI.
  - v1.2: Deleted-definition display, nested workflow links, and historical snapshot diff/inspection.

- **Technical Risks**:
  - Snapshot fields are incomplete; mitigate by defining a required snapshot contract and testing deleted-definition inspection.
  - Start accidentally runs twice; mitigate with unique run-per-session constraints and idempotent start behavior.
  - Session-scoped overrides mutate shared definitions; mitigate by storing overrides only in configuration snapshots.
