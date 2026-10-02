# docs/database/ — Folder Rules

**Owner**: @database-expert
**Purpose**: The data model and how to change it safely.

| File | What it is | Who edits |
|------|-----------|-----------|
| `DATABASE.md` | Schema reference, relationships, indexing strategy, migration log | @database-expert; @backend-developer may append migration entries |

## Rules

- Schema changes and `DATABASE.md` updates land together — the doc must always match the latest migration.
- Migration files follow `.claude/rules/migrations.md` (reversible, naming convention, guarded destructive ops).
- Bigger features get their own `<feature_name>.md` in this folder (e.g. `inventory_management.md`) — start from `.claude/templates/docs/FEATURE_TEMPLATE.md`, use Mermaid diagrams where they clarify flows, and add the file to the table above.
- New files here require updating this table and the map in `docs/AGENTS.md`.
