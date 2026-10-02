# docs/backend/ — Folder Rules

**Owner**: @backend-developer
**Purpose**: How the backend works — services, business logic, and the API contract.

| File | What it is | Who edits |
|------|-----------|-----------|
| `BACKEND.md` | Module layout, auth flow, business logic domains, jobs, integrations | @backend-developer |
| `API.md` | Full endpoint reference — request/response contracts | @backend-developer |

## Rules

- `API.md` is updated in the same task that adds or changes an endpoint — an undocumented endpoint is an unfinished task.
- Database schema lives in `docs/database/DATABASE.md` — link, don't duplicate.
- @documentation-writer may improve readability, not endpoints, schemas, or status codes.
- Bigger features get their own `<feature_name>.md` in this folder (e.g. `inventory_management.md`) — start from `.claude/templates/docs/FEATURE_TEMPLATE.md`, use Mermaid diagrams where they clarify flows, and add the file to the table above.
- New files here require updating this table and the map in `docs/AGENTS.md`.
