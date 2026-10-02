# docs/ — Structure Rules

All project documentation lives in this tree. Root-level exceptions: `README.md`, `CHANGELOG.md`, `TODO.md`. Never create documentation files anywhere else.

## Folder Map

| Folder | Contents | Owner |
|--------|----------|-------|
| `docs/PRD.md` | Product requirements — **read-only without human approval** | Human |
| `docs/architecture/` | System design, ADRs | @systems-architect |
| `docs/frontend/` | Frontend architecture & conventions | @frontend-developer |
| `docs/backend/` | Backend services, API reference, generated OpenAPI contract + TypeScript types, frontend integration guide (Vietnamese) | @backend-developer |
| `docs/database/` | Schema, migrations, query patterns | @database-expert |
| `docs/design/` | Design system, UX specs | @ui-ux-designer |
| `docs/devops/` | Environments, pipeline, deployment, containers | @cicd-engineer (+ @docker-expert) |
| `docs/user/` | End-user documentation | @documentation-writer |
| `docs/stakeholders/` | Plain-language status for non-technical stakeholders | @documentation-writer |
| `docs/content/` | Content strategy, brand voice, SEO | @copywriter-seo |

## Rules

1. Every folder has its own `AGENTS.md` declaring its files, owner, and rules — read it before writing in that folder.
2. New documentation goes into the matching domain folder. If no folder fits, ask the human before creating a new one.
3. Adding a file to a folder requires updating that folder's `AGENTS.md` file table and, for new folders, this map.
4. Documents describe current state only — history belongs in `CHANGELOG.md`.
5. @documentation-writer may improve readability anywhere except `PRD.md`; technical content belongs to the folder's owner.

## Feature Documents

Bigger features get their own `<feature_name>.md` (snake_case) inside the domain folder that owns the aspect being documented — e.g. inventory management's API endpoints and third-party integrations both belong to the backend, so they live together in `docs/backend/inventory_management.md`. A feature that spans domains gets one file per domain aspect (its UI conventions in `docs/frontend/`, its schema notes in `docs/database/`), not one giant cross-domain file.

- Start from `.claude/templates/docs/FEATURE_TEMPLATE.md`.
- Use Mermaid diagrams where a picture beats prose (flows, sequences, state).
- Canonical documents stay authoritative: feature files summarize and link to `API.md` / `DATABASE.md` contracts, never fork them.
- List the new file in the folder's `AGENTS.md` table (rule 3 applies).
