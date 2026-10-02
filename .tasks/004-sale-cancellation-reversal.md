---
id: "004"
title: "Sale cancellation / refund with stock reversal (BR2)"
status: "todo"
area: "backend"
agent: "@backend-developer"
priority: "normal"
created_at: "2026-10-02"
due_date: null
started_at: null
completed_at: null
prd_refs: ["SRS BR2", "SRS 1.2"]
blocks: []
blocked_by: ["003"]
---

## Description

Out of scope for v1. When required: a cancel/refund operation that never deletes the invoice, writes `REVERSAL` inventory movements, restores stock, reverses loyalty points, and records the acting user. Needs a new sale status and report treatment (revenue/profit exclusions).

## Acceptance Criteria

- [ ] Design agreed with the owner (full vs partial refunds)
- [ ] Transactional reversal with row locks
- [ ] Reports exclude or net cancelled sales
- [ ] Tests incl. double-cancel rejection

## Technical Notes

`MovementType.REVERSAL` already exists in the schema.

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
