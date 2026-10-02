---
id: "002"
title: "Frontend web app (Next.js): POS, catalog, purchasing, reports"
status: "todo"
area: "frontend"
agent: "@frontend-developer"
priority: "high"
created_at: "2026-10-02"
due_date: null
started_at: null
completed_at: null
prd_refs: ["SRS 7.1", "SRS NF3", "SRS NF6"]
blocks: []
blocked_by: ["001"]
---

## Description

Vietnamese UI for desktop and tablet (Chrome, Edge, Firefox): login, POS screen with barcode scan, customer lookup, receipt printing, product/category/supplier management, purchasing and receiving, stock counts, user management and reports. Consume the API in docs/backend/API.md (Bearer token kept in memory, refresh on 401, error envelope `code` mapped to Vietnamese hints).

## Acceptance Criteria

- [ ] Login/logout and refresh handling
- [ ] POS flow incl. INSUFFICIENT_STOCK handling that refreshes the cart
- [ ] Role-based navigation matching docs/backend/BACKEND.md
- [ ] Printable receipt from GET /sales/:id/print

## Technical Notes

Needs a UX pass from @ui-ux-designer first.

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
