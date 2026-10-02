# docs/devops/ — Folder Rules

**Owner**: @cicd-engineer · Containers section co-owned by @docker-expert
**Purpose**: How the project is built, shipped, and operated.

| File | What it is | Who edits |
|------|-----------|-----------|
| `DEVOPS.md` | Environments, CI/CD pipeline, deployment & rollback, secrets management, containers, monitoring, runbook | @cicd-engineer; Containers section by @docker-expert |

## Rules

- The rollback procedure must always be current — verify it whenever the deploy process changes.
- Secrets are documented by name and location only — never values.
- Pipeline changes and `DEVOPS.md` updates land in the same task.
- Bigger features get their own `<feature_name>.md` in this folder (e.g. `inventory_management.md`) — start from `.claude/templates/docs/FEATURE_TEMPLATE.md`, use Mermaid diagrams where they clarify flows, and add the file to the table above.
- New files here require updating this table and the map in `docs/AGENTS.md`.
