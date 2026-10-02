# docs/architecture/ — Folder Rules

**Owner**: @systems-architect
**Purpose**: System design and the decisions behind it.

| File | What it is | Who edits |
|------|-----------|-----------|
| `ARCHITECTURE.md` | System design, component overview, data flow | @systems-architect; @frontend-developer and @backend-developer may append to their own sections |
| `DECISIONS.md` | Architecture Decision Records (append-only log) | @systems-architect only |

## Rules

- `DECISIONS.md` is append-only: never rewrite or delete an accepted ADR — supersede it with a new one.
- Design before code: significant components get an ADR before implementation starts.
- Bigger features get their own `<feature_name>.md` in this folder (e.g. `inventory_management.md`) — start from `.claude/templates/docs/FEATURE_TEMPLATE.md`, use Mermaid diagrams where they clarify flows, and add the file to the table above.
- New files here require updating this table and the map in `docs/AGENTS.md`.
