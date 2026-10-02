# docs/design/ — Folder Rules

**Owner**: @ui-ux-designer
**Purpose**: The design system — the single source of truth for visual and interaction decisions.

| File | What it is | Who edits |
|------|-----------|-----------|
| `DESIGN_SYSTEM.md` | Design tokens, component specs, interaction patterns, key user flows, accessibility standards | @ui-ux-designer only |

## Rules

- Developers read tokens and specs from here — never invent CSS values in implementation; if a token is missing, request it from @ui-ux-designer.
- Design specs precede implementation: new UI work needs a spec here (or an explicit waiver) before the frontend task starts.
- @documentation-writer may fix typos, not specifications or tokens.
- Bigger features get their own `<feature_name>.md` in this folder (e.g. `inventory_management.md`) — start from `.claude/templates/docs/FEATURE_TEMPLATE.md`, use Mermaid diagrams where they clarify flows, and add the file to the table above.
- New files here require updating this table and the map in `docs/AGENTS.md`.
