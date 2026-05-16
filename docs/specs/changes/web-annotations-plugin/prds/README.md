# PRD Catalog: Web Annotations Plugin

**Status:** Draft  
**Created:** 2026-05-16  
**Source change:** `docs/specs/changes/web-annotations-plugin/`  
**Source report:** `docs/reports/web-annotation-feedback-tools-agentation-open-design.md`

This directory translates the Web Annotations proposal, behavior spec, technical design, task list, and Agentation/Open Design analysis into implementation-grade Markdown PRDs and Ralph-ready `prd_*.json` files.

## Source Documents

- `../../../../reports/web-annotation-feedback-tools-agentation-open-design.md`
- `../proposal.md`
- `../spec.md`
- `../design.md`
- `../tasks.md`

## Product Position

Web Annotations is a Pibo-native human-to-agent reference channel for frontend work. It lets a user mark a live browser element, text selection, region, pin, or visual target and attach that structured reference to the current Pibo Session. It complements `pibo debug web` snapshots, diffs, watches, and browser scenarios; it does not replace them.

The V1 implementation is CDP-first and Chat Web driven. It should work for local development pages without source-code changes, while preserving richer source hints when target pages expose stable IDs, LocatorJS-compatible metadata, React development metadata, or future Pibo instrumentation.

## PRDs

| PRD | Scope | Primary implementers | Ralph JSON |
|---|---|---|---|
| `01-product-overview.md` | End-to-end product framing, personas, success criteria, rollout boundaries | Product, engineering leads | `prd_01_product_overview.json` |
| `02-store-session-binding.md` | Types, persistence, owner/session/room scoping, binding lifecycle, status transitions | Storage/backend engineers | `prd_02_store_session_binding.json` |
| `03-plugin-agent-tools.md` | Plugin registration, capability catalog, selectable native tools, lifecycle tool behavior | Plugin/runtime engineers | `prd_03_plugin_agent_tools.json` |
| `04-cdp-target-overlay-injection.md` | CDP target discovery/open/attach, overlay injection, stop/reinject, optional debug CLI hooks | Browser/CDP engineers | `prd_04_cdp_target_overlay_injection.json` |
| `05-overlay-runtime-source-hints.md` | Injected overlay UX, element/text/region/pin capture, selector strategy, source hints, redaction | Frontend/browser engineers | `prd_05_overlay_runtime_source_hints.json` |
| `06-chat-web-attachments.md` | Chat Web entry points, annotation panel/chips, message attachments, model-visible context | Chat Web engineers | `prd_06_chat_web_attachments.json` |
| `07-security-validation-rollout.md` | Auth, privacy, payload bounds, tests, Docker/dev validation, rollout checklist | Full-stack/QA/SRE engineers | `prd_07_security_validation_rollout.json` |

## Authoritative V1 Scope Matrix

| Capability | V1 scope | Later / optional |
|---|---|---|
| Entry point | Chat Web starts URL annotation or attaches an existing CDP target from an active session | Browser extension pairing |
| Browser control | CDP target discovery/open/attach and runtime-only overlay injection | Permanent extension or app-embedded SDK |
| Target kinds | Element and pin are mandatory; region or visual target must exist before V1 complete; text selection if feasible in same overlay | Pod/stroke multi-selection and screenshot drawing polish |
| Source hints | Best-effort stable IDs, test IDs, LocatorJS-compatible metadata, React/dev metadata, DOM fallback | Guaranteed source mapping for every framework |
| Store | Durable local store with owner scope, Pibo Session ID, Room ID, target URL, status, timestamps, and target metadata | Public sharing and remote collaboration stores |
| Agent access | Selectable native tool package: list, get, watch, acknowledge, resolve, dismiss | Auto-editing source directly from overlay |
| Chat integration | Annotation list/chips and explicit attach/detach to next message | Auto-attach by default unless separately approved |
| Prompt context | Concise structured attachment block plus persistent record references | Full DOM dumps or inline screenshot data |
| Debug CLI | Optional `pibo debug web annotate`/annotations helpers if they reuse the same store and follow progressive discovery | Separate tool silo outside plugin/store |
| Privacy | Size-limited, sanitized payloads; no full page HTML by default; screenshot paths not base64 in prompt | Broad page scraping or cloud sharing |

## Ralph Execution Order

1. `prd_01_product_overview.json` — documentation guardrails and final scope decisions.
2. `prd_02_store_session_binding.json` — types, schema/store, bindings, statuses, isolation tests.
3. `prd_03_plugin_agent_tools.json` — plugin registration and native tools on top of the store.
4. `prd_04_cdp_target_overlay_injection.json` — target binding APIs and reusable CDP injection path.
5. `prd_05_overlay_runtime_source_hints.json` — injected overlay runtime and metadata capture.
6. `prd_06_chat_web_attachments.json` — Chat Web entry points, panels, attachments, model-visible context.
7. `prd_07_security_validation_rollout.json` — security hardening, E2E/browser validation, docs, dev deployment checklist.

Each story is intended to fit into one Ralph iteration and includes `Typecheck passes` as a completion gate. Logic stories include tests. UI stories include browser verification.

## Shared QA Conventions

- Do not require source-code changes in target apps for basic annotation.
- Do not inject into a browser target unless the user selected that target or URL from an authenticated/session-bound flow.
- Do not trust owner scope, session id, Room id, or status updates from overlay payloads without server-side validation.
- Keep default model-visible context concise: IDs, URL, label, selector/source hint if available, position, short text, and note.
- Store screenshot artifacts as references; never inline base64 screenshots into model-visible text by default.
- Bound all list outputs and API responses that can grow with annotations, targets, threads, or source hints.
- Maintain progressive CLI discovery for any new `pibo debug web` commands.
- Validate root typecheck with `npm run typecheck`; for Chat Web-impacting changes also run Chat Web typecheck/build and browser checks in a Docker compute worker.

## Traceability Matrix

| Spec requirement | PRD coverage |
|---|---|
| Plugin capability is selectable | `01`, `03` |
| Chat Web can start URL annotation | `04`, `06` |
| Chat Web can attach existing target | `04`, `06` |
| Overlay captures runtime DOM annotations | `04`, `05` |
| Source hints are preserved when available | `05` |
| Records are session-scoped and inspectable | `02`, `03`, `06` |
| Chat Web surfaces annotations as message attachments | `06` |
| Agent tools manage lifecycle | `03` |
| Overlay can be removed or refreshed | `04`, `05` |
| Security, privacy, payload bounds, deployment validation | `02`, `05`, `07` |

## Assumptions / TBD

- **Initial persistence:** use a durable local store integrated with existing Pibo data paths. A plugin-owned SQLite table set is acceptable if it enforces owner/session/room scoping and survives gateway restarts.
- **Attachment default:** annotations require explicit attach/detach in Chat Web for V1. Auto-attach remains an open product decision.
- **Target binding:** a single CDP target should not be silently shared across sessions. If multiple sessions request the same target, V1 should require explicit binding and isolate annotations by binding id.
- **Watch behavior:** `web_annotations_watch` may start as a bounded wait/long-poll tool and later become a yielded watch if the run-control integration needs a larger loop.
- **Source metadata:** LocatorJS-compatible input shape should be verified during implementation; the PRDs require a layered source-hint interface, not a hard dependency on one package.
- **Visual target:** V1 must support element plus at least one non-element fallback (`pin`, `region`, or `visual`). Region/visual screenshot polish can be staged.
