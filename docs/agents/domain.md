# Domain Docs

This repository uses a single domain context.

## Before exploring

- Read `CONTEXT.md` at the repository root.
- Read the relevant architectural decisions in `docs/adr/`.
- If either source is absent, proceed without treating its absence as an error.

## Consumer rules

- Use the domain terms defined in `CONTEXT.md` in issues, plans, tests, and implementation names.
- Avoid introducing synonyms for concepts that the glossary names explicitly.
- If a necessary concept is missing, note the domain-model gap instead of silently inventing a conflicting term.
- Surface any proposed change that contradicts an ADR and identify the ADR explicitly.

## Layout

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```
