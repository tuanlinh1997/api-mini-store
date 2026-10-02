---
id: "007"
title: "CI pipeline: lint, typecheck, unit and e2e tests with MySQL service"
status: "done"
area: "infra"
agent: "@cicd-engineer"
priority: "normal"
created_at: "2026-10-02"
due_date: null
started_at: "2026-10-02"
completed_at: "2026-10-02"
prd_refs: []
blocks: []
blocked_by: []
---

## Description

GitHub Actions workflow running `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` against a MySQL 8 service container (`TEST_DATABASE_URL` ending in `_test`).

## Acceptance Criteria

- [x] Workflow runs on pull requests (`.github/workflows/ci.yml`)
- [x] MySQL 8 service with utf8mb4_unicode_ci (database created explicitly with that collation)
- [ ] Branch protection requires it (manual repo setting: require checks `Lint and typecheck`, `Unit tests`, `Build`, `E2E tests (MySQL 8)`; optionally `Prisma migration drift check`)

## Technical Notes

E2E tests apply migrations themselves (global setup).

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
| 2026-10-02 | @cicd-engineer | Added ci.yml (lint/typecheck, unit+coverage, build, MySQL e2e, migration drift). Not yet run on GitHub; branch protection pending (human) |
