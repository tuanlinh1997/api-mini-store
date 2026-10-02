# TODO / Backlog

> **Governor**: @project-manager — invoke for sprint planning, prioritization, and feature breakdown
> **Agents**: May add items to "Backlog" and move completed items to "Completed". Preserve section order. Never reorder items within a section — priority position is set by humans or @project-manager when explicitly asked.

---

## In Progress

_(nothing in progress)_

---

## Up Next (prioritized)

- [ ] #003 — Owner confirmation of SRS section 4.1 open questions (points, discounts, payments, invoice format, permissions) [area: docs] → [.tasks/003-confirm-srs-open-questions.md](.tasks/003-confirm-srs-open-questions.md)
- [ ] #002 — Frontend web app (Next.js): POS, catalog, purchasing, reports [area: frontend] → [.tasks/002-frontend-app.md](.tasks/002-frontend-app.md)

---

## Backlog

- [ ] #004 — Sale cancellation / refund with stock reversal (BR2, out of scope for v1) [area: backend] → [.tasks/004-sale-cancellation-reversal.md](.tasks/004-sale-cancellation-reversal.md)
- [ ] #007 — CI pipeline: lint, typecheck, unit and e2e tests with a MySQL service [area: infra] → [.tasks/007-ci-pipeline.md](.tasks/007-ci-pipeline.md)
- [ ] #009 — Self-service password change for staff [area: backend] → [.tasks/009-self-service-password-change.md](.tasks/009-self-service-password-change.md)
- [ ] #010 — Shared rate-limit store (Redis) before running more than one API instance [area: backend] → [.tasks/010-shared-throttler-store.md](.tasks/010-shared-throttler-store.md)

---

## Completed

- [x] #000 — Initial project setup and template configuration → [.tasks/000-initial-project-setup.md](.tasks/000-initial-project-setup.md)
- [x] #001 — Backend REST API for the mini-supermarket (NestJS + Fastify, MySQL + Prisma) [area: backend] → [.tasks/001-backend-rest-api.md](.tasks/001-backend-rest-api.md)
- [x] #005 — Daily MySQL backup and tested restore (NF7) [area: infra] → [.tasks/005-mysql-backup-restore.md](.tasks/005-mysql-backup-restore.md)
- [x] #006 — Purge stale sessions, refresh-token reuse detection (shared rate-limit store split out to #010) [area: backend] → [.tasks/006-session-cleanup-and-token-hardening.md](.tasks/006-session-cleanup-and-token-hardening.md)
- [x] #008 — Dockerfile and deployment setup for the API [area: infra] → [.tasks/008-dockerfile-and-deployment.md](.tasks/008-dockerfile-and-deployment.md)

---

## Item Format Guide

When adding new items, use this format:

```
- [ ] #NNN — Brief description of the task [area: frontend|backend|database|qa|docs|infra|design] → [.tasks/NNN-short-title.md](.tasks/NNN-short-title.md)
```

Every TODO item must have a corresponding `.tasks/NNN-*.md` file. @project-manager creates both together.

**Area tags** help agents know which specialist to use:
- `frontend` → @frontend-developer
- `backend` → @backend-developer
- `database` → @database-expert
- `design` → @ui-ux-designer
- `qa` → @qa-engineer
- `docs` → @documentation-writer
- `infra` → @systems-architect
- `setup` → general

**Priority**: Items higher in "Up Next" are higher priority. Agents move completed items to "Completed" and may add new items to "Backlog". Only humans reorder items within a section to change priority, unless explicitly asked to reprioritize.
