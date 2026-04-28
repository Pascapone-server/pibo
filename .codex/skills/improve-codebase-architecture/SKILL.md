---
name: improve-codebase-architecture
description: Improve code quality by finding and implementing architectural refactorings that create clear interfaces and deep modules. Use when the user wants better architecture, cleaner boundaries, simpler call sites, more testable code, or a codebase review focused on module design.
---

# Improve Codebase Architecture

Improve the codebase by moving complexity behind clear interfaces. Prefer **deep modules**: small, stable interfaces with meaningful behavior behind them.

## Vocabulary

- **Module**: code with an interface and an implementation. Can be a function, class, package, feature slice, or subsystem.
- **Interface**: everything callers must know to use the module correctly: types, invariants, ordering, errors, configuration, and performance expectations.
- **Deep module**: a module that gives callers a lot of useful behavior through a small interface.
- **Shallow module**: a module whose interface is almost as complex as its implementation.
- **Seam**: the place where callers cross into a module through its interface.
- **Adapter**: code that connects a module to an external dependency or alternate implementation.

## Workflow

1. Read the relevant glossary first:
   - Prefer `GLOSSARY.md` at the repo root.
   - Also read nested `GLOSSARY.md` files near the code being discussed.
   - If important terminology is missing or ambiguous, update the appropriate glossary document using the glossary skill.

2. Explore the codebase and look for architectural friction:
   - Callers must know too many implementation details.
   - The same rules or branching logic appear in multiple places.
   - Many tiny modules only pass data through.
   - Tests must mock internals or inspect private state.
   - A change in one concept requires edits across unrelated files.
   - Integration code is mixed with domain behavior.

3. Propose concrete improvement candidates. For each candidate, include:
   - **Files** involved.
   - **Problem** in the current design.
   - **Proposed interface** the code should expose.
   - **Hidden implementation** that should move behind the interface.
   - **Dependency strategy** from the categories below.
   - **Benefit** for readability, testability, and change locality.

4. For a chosen candidate, design the interface before editing code:
   - State the constraints the interface must satisfy.
   - Classify dependencies.
   - Sketch 2-3 meaningfully different interface options.
   - Compare them by depth, ease of use, testability, and change locality.
   - Recommend one option or a small hybrid.

5. Implement in small vertical refactors:
   - Preserve behavior first.
   - Add or keep tests at the public interface.
   - Move one responsibility behind the new interface.
   - Update callers to use the deeper module.
   - Remove pass-through modules and duplicated rules after tests pass.

## Deepening Modules

Use the deletion test: if deleting a module makes complexity disappear, it was probably shallow indirection. If deleting it spreads complexity across callers, it was earning its place.

Good deepening candidates usually:

- collect repeated rules behind one named operation;
- turn scattered ordering constraints into one safe call path;
- hide integration details from domain code;
- replace many caller decisions with one explicit policy;
- make tests shorter because they can assert behavior through one interface.

Avoid deepening when the new module only renames a call, forwards data unchanged, or exists only because an architecture diagram wants another layer.

## Dependency Strategy

Classify dependencies before choosing the seam:

- **In-process**: pure computation or in-memory state. Merge shallow pieces and test directly through the new interface. No adapter needed.
- **Local-substitutable**: dependencies with local test stand-ins, such as an in-memory filesystem or local database substitute. Keep the external interface simple; use the stand-in inside tests.
- **Remote but owned**: your own service across a network boundary. Define a port at the seam, keep logic in the deep module, and provide production plus test adapters.
- **True external**: third-party services. Inject a narrow port that represents what the module needs, and test with a fake or mock adapter.

Seam discipline:

- One adapter is usually hypothetical indirection. Two meaningful adapters make a seam real.
- Do not expose internal seams just because tests use them.
- Keep transport, persistence, and vendor details out of the domain-facing interface.

## Interface Design

A good interface is small, explicit, and hard to misuse. It should make the common path simple while still making important constraints visible.

When designing an interface, specify:

- entry points, parameters, and return values;
- invariants callers must respect;
- ordering requirements, if any;
- error modes and retry behavior;
- configuration required to use it;
- performance expectations when they affect callers.

Compare alternative designs:

- **Minimal interface**: 1-3 operations with high leverage.
- **Caller-optimized interface**: makes the most common caller trivial.
- **Flexible interface**: supports known variation without leaking implementation details.
- **Adapter-based interface**: useful when owned remote services or external dependencies sit behind the seam.

Prefer the design that removes the most caller knowledge without hiding important domain facts. Be opinionated; do not present a menu without a recommendation.

## Testing Strategy

- The interface is the test surface.
- Test observable behavior through the same interface callers use.
- Tests should survive internal refactors.
- Replace old shallow-module tests once stronger tests exist at the deeper interface.
- Do not test private state, internal call order, or adapter details unless those are the public contract of that adapter.

## Design Rules

- Use project glossary terms for module names and explanations.
- Keep interfaces boring, explicit, and hard to misuse.
- Prefer fewer, deeper modules over many shallow wrappers.
- Do not introduce a seam unless it hides real complexity or supports meaningful variation.
- Keep external dependency details behind adapters.
- If a proposed refactor changes an important architectural decision, ask before implementing.
