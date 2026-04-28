---
name: glossary
description: Create or maintain a shared glossary for a project, feature, plan, document, or discussion so humans and AI agents use consistent wording and avoid misunderstandings. Use when the user wants to define terms, align language, resolve ambiguous wording, or keep terminology consistent.
---

# Glossary

Build and maintain a shared glossary with the user. The glossary is the source of truth for wording: one concept gets one preferred name, clear meaning, and known aliases to avoid.

## Workflow

1. Choose the smallest useful glossary document:
   - Whole project: create or update `GLOSSARY.md` at the repo root.
   - Scoped area: create or update a nested glossary document, e.g. `features/billing/GLOSSARY.md` or `docs/billing/GLOSSARY.md`.
   - Unclear scope: ask before creating files.

Do not embed glossary sections inside plans, specs, issues, or other artifacts. Keep glossary content in dedicated glossary documents.

2. Extract candidate terms from the conversation, code, docs, issue, or plan.

3. For each important term, record:

```md
**Preferred Term**:
One precise sentence defining what it is.
```

4. Record relationships when they prevent confusion:

```md
## Relationships

- A **Customer** owns many **Projects**.
- A **Project** belongs to exactly one **Customer**.
```

5. Record resolved ambiguity:

```md
## Ambiguities

- "account" was used for both **Customer** and **User**. Use **Customer** for the paying organization and **User** for a login identity.
```

## Rules

- Prefer the user's domain language over technical implementation names.
- Keep definitions short: define what the term is, not every behavior it has.
- Include only terms that matter for shared understanding.
- When wording conflicts, point it out and propose a canonical term.
- Update the glossary as soon as a term is resolved; do not wait until the end.
- Use the glossary vocabulary in all later explanations, plans, issues, and code discussions.
