---
id: "007"
title: "CI pipeline: lint, typecheck, unit and e2e tests with MySQL service"
status: "todo"
area: "infra"
agent: "@cicd-engineer"
priority: "normal"
created_at: "2026-10-02"
due_date: null
started_at: null
completed_at: null
prd_refs: []
blocks: []
blocked_by: []
---

## Description

GitHub Actions workflow running `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` against a MySQL 8 service container (`TEST_DATABASE_URL` ending in `_test`).

## Acceptance Criteria

- [ ] Workflow runs on pull requests
- [ ] MySQL 8 service with utf8mb4_unicode_ci
- [ ] Branch protection requires it

## Technical Notes

E2E tests apply migrations themselves (global setup).

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
