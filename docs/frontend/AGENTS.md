# docs/frontend/ — Folder Rules

**Owner**: @frontend-developer
**Purpose**: How the frontend is built — architecture, conventions, state, routing.

| File | What it is | Who edits |
|------|-----------|-----------|
| `FRONTEND.md` | Frontend architecture, routing, state management, component conventions, performance notes | @frontend-developer (@react-native-developer for shared patterns) |

## Rules

- Update `FRONTEND.md` in the same task that changes the patterns it describes — not later.
- Visual specs and design tokens live in `docs/design/DESIGN_SYSTEM.md` — link, don't duplicate.
- @documentation-writer may improve readability, not technical content.
- Bigger features get their own `<feature_name>.md` in this folder (e.g. `inventory_management.md`) — start from `.claude/templates/docs/FEATURE_TEMPLATE.md`, use Mermaid diagrams where they clarify flows, and add the file to the table above.
- New files here require updating this table and the map in `docs/AGENTS.md`.
