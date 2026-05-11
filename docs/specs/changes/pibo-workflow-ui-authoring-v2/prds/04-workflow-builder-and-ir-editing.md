# PRD: Pibo Workflow UI Authoring V2 — Workflow Builder and IR Editing

**Status:** Draft  
**Created:** 2026-05-11  
**Related docs:** `../spec.md`, `../design.md`, `../tasks.md`, `README.md`

## 1. Executive Summary

- **Problem Statement**: Users can inspect workflow graphs in V1, but they cannot create, edit, validate, or publish workflow definitions from Chat Web.
- **Proposed Solution**: Add a Workflow Builder in the Workflows tab that edits Pibo Workflow IR through a visual graph editor, inspectors, raw Workflow IR toggle, raw JSON schema editors, prompt editors, prompt asset editor, validation panel, and publish/version panel.
- **Success Criteria**:
  - SC-01: A user can duplicate an existing workflow into a UI draft and open it in the builder.
  - SC-02: A user can add, delete, connect, move, inspect, and configure workflow nodes and edges.
  - SC-03: A user can edit raw Workflow IR; invalid raw text cannot corrupt the last valid draft object.
  - SC-04: A valid draft with at least one node plus workflow input/output contracts can be published.
  - SC-05: Layout metadata affects only display and never changes runtime execution.

## 2. User Experience & Functionality

- **User Personas**:
  - Workflow author editing definitions visually.
  - Advanced user editing raw Workflow IR for fields not exposed visually.
  - Prompt author editing prompt templates and prompt assets.
  - QA engineer testing graph editing and validation behavior.

- **User Stories**:
  - As a workflow author, I want a visual canvas so that I can understand and compose workflow structure.
  - As an advanced user, I want raw Workflow IR behind a toggle so that I can fix advanced fields without a custom form.
  - As a prompt author, I want prompt assets editable with the Markdown editor pattern so that workflow prompt text can be maintained without leaving the builder.
  - As a workflow author, I want validation diagnostics linked to graph elements so that I know what blocks publish.

- **Acceptance Criteria**:
  - The builder lives under the Workflows main-nav tab.
  - Main panels include graph canvas, node inspector, edge inspector, workflow settings, raw JSON schema editor, prompt editor, prompt asset Markdown editor, state read/write selector, validation panel, raw IR editor toggle, and publish/version panel.
  - The graph supports drag-and-drop node positions and automatic layout for workflows without saved positions.
  - The builder edits Pibo Workflow IR fields: workflow metadata, ports, nodes, edges, adapters, guards, state, prompts, prompt assets, and UI metadata.
  - The raw editor exposes Workflow IR only and never raw XState JSON.
  - Schema editors are raw JSON only and validate against the existing workflow JSON Schema subset.
  - Prompt asset editing uses the existing Markdown editor pattern; whether asset edits mutate the current asset or create asset versions is TBD.
  - Draft save is allowed with validation errors; publish and run are blocked by error diagnostics.
  - Drafts with zero nodes can be saved, but a published/runnable workflow requires at least one node plus workflow input and output contracts.

- **Non-Goals**:
  - Form-builder JSON Schema editor.
  - Raw XState editing.
  - Inline nested workflow graph expansion.
  - New executable code authoring.
  - Templates as a creation path.
  - TypeScript export from UI-authored workflows.

## 3. AI System Requirements (If Applicable)

- **Tool Requirements**:
  - Workflow validation and serialization APIs.
  - XState projection for display only.
  - Graph/canvas library selected by implementation.
  - Markdown editor pattern from Context Files for prompt assets.
  - Raw JSON editor for schemas and raw Workflow IR.

- **Evaluation Strategy**:
  - UI tests cover duplicate, open builder, add node, connect edge, save layout, edit prompt, edit schema, validate, and publish.
  - Prompt asset tests verify editor wiring without assuming mutation-versus-versioning until that open decision is resolved.
  - Publish tests reject zero-node drafts and drafts missing workflow input or output contracts.
  - Raw IR tests cover valid edit sync, invalid JSON warning, invalid workflow diagnostics, and preservation of last valid draft object.
  - Layout tests verify automatic layout appears for definitions without positions and saved positions persist without changing serialized runtime semantics.
  - Schema tests verify allowed subset schemas pass and unsupported schemas show diagnostics.

## 4. Technical Specifications

- **Architecture Overview**:
  - The builder stores a draft wrapper around partial Pibo Workflow IR.
  - Visual edits mutate the draft IR object and trigger validation.
  - Raw IR edits parse into the same draft IR object after successful parse.
  - XState projection is regenerated from Pibo IR for display and run visualization.
  - Publish normalizes and validates a full `WorkflowDefinition` before creating an immutable version.

- **Integration Points**:
  - Workflow Registry/store for draft load/save/publish.
  - Workflow validation package for structured diagnostics.
  - Chat Web Workflows tab for navigation and editor panels.
  - Prompt asset store/editor and Context Files Markdown editor pattern.
  - Project session creation flow for “create Project session/run” links from published workflow records.

- **Security & Privacy**:
  - The builder must not provide JavaScript, TypeScript, shell, or eval entry points.
  - Prompt and schema editing may expose sensitive workflow context and must follow existing authenticated UI visibility rules.
  - Raw IR editor must not bypass the registered-capability-only execution boundary.

## 5. Risks & Roadmap

- **Phased Rollout**:
  - MVP: Open/duplicate draft, graph display, basic node/edge editing, validation panel, and publish block.
  - v1.1: Drag/drop layout persistence, raw IR editor, raw JSON schema editors, and prompt template editor.
  - v1.2: Prompt asset Markdown editor, state read/write selector, publish/version panel, and richer diagnostics linking.

- **Technical Risks**:
  - Visual editor and raw editor diverge; mitigate by using one draft IR object and deterministic serialization.
  - Invalid raw text corrupts drafts; mitigate with parse-before-save and last-valid-object preservation.
  - Graph library imposes incompatible model assumptions; mitigate by keeping layout metadata separate from workflow execution semantics.
