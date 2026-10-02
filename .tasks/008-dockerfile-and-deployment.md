---
id: "008"
title: "Dockerfile and deployment setup for the API"
status: "done"
area: "infra"
agent: "@docker-expert"
priority: "low"
created_at: "2026-10-02"
due_date: null
started_at: "2026-10-02"
completed_at: "2026-10-02"
prd_refs: []
blocks: []
blocked_by: []
---

## Description

Multi-stage Dockerfile for the API (build, `prisma migrate deploy` on start, non-root user, healthcheck on GET /api/v1/health) and extend docker-compose.yml with the API service.

## Acceptance Criteria

- [x] Small production image (multi-stage, prod deps only, non-root; about 445 MB, see DEVOPS.md size note)
- [x] Migrations applied on start (one-shot `migrate` compose service)
- [x] Healthcheck configured

## Technical Notes

docker-compose.yml currently has only MySQL.

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
| 2026-10-02 | @docker-expert | Added Dockerfile, .dockerignore, compose stack (mysql + migrate + api), docs/devops/DEVOPS.md. Verified with a real build and `docker compose up`: migration applied, API healthy. |
