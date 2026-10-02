---
id: "008"
title: "Dockerfile and deployment setup for the API"
status: "todo"
area: "infra"
agent: "@docker-expert"
priority: "low"
created_at: "2026-10-02"
due_date: null
started_at: null
completed_at: null
prd_refs: []
blocks: []
blocked_by: []
---

## Description

Multi-stage Dockerfile for the API (build, `prisma migrate deploy` on start, non-root user, healthcheck on GET /api/v1/health) and extend docker-compose.yml with the API service.

## Acceptance Criteria

- [ ] Small production image
- [ ] Migrations applied on start
- [ ] Healthcheck configured

## Technical Notes

docker-compose.yml currently has only MySQL.

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
