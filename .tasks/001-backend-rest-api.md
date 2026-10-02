---
id: "001"
title: "Backend REST API for the mini-supermarket"
status: "completed"
area: "backend"
agent: "@backend-developer"
priority: "high"
created_at: "2026-10-02"
due_date: null
started_at: "2026-10-02"
completed_at: "2026-10-02"
prd_refs: ["SRS F1-F10", "SRS UC-01..UC-05", "SRS NF1-NF8"]
blocks: ["002"]
blocked_by: []
---

## Description

Build the complete backend from the SRS: NestJS 11 on Fastify, MySQL 8 with Prisma 6. Modules: auth (JWT + DB sessions), users, categories, products, suppliers, customers, purchases, sales (POS), inventory (stock counts, movements) and reports, with a transactional checkout/receive/count design, document numbering, RBAC and a consistent Vietnamese error envelope.

## Acceptance Criteria

- [x] Login/logout/refresh with immediate revocation, RBAC deny-by-default (F1, UC-01)
- [x] User management without hard delete (F2)
- [x] Catalog, suppliers, customers with the SRS constraints (F3, F4, F7)
- [x] Purchases: DRAFT -> RECEIVED with weighted-average cost and double-receive protection (F5, UC-03)
- [x] POS checkout in one transaction with row locks, discount caps, payments, points, receipt payload (F6, UC-02)
- [x] Inventory views, low-stock, movements and stock counts with conflict detection (F9, UC-04)
- [x] Reports: revenue, top products, gross profit, inventory (F8, UC-05)
- [x] Unit and e2e tests pass; lint, typecheck and build pass
- [x] API.md, BACKEND.md, DATABASE.md, DECISIONS.md and README updated

## Technical Notes

See docs/backend/BACKEND.md and docs/architecture/DECISIONS.md (ADR-001..007). Branch: feature/001-backend-api.

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Implemented and verified (lint, typecheck, unit and e2e tests, build, curl smoke test); marked completed |
