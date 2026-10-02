---
id: "003"
title: "Owner confirmation of SRS section 4.1 open questions"
status: "todo"
area: "docs"
agent: "human"
priority: "high"
created_at: "2026-10-02"
due_date: null
started_at: null
completed_at: null
prd_refs: ["SRS 4.1", "SRS section 8"]
blocks: []
blocked_by: []
---

## Description

The backend runs on defaults (ADR-005, ADR-007). The store owner must confirm or change: (1) loyalty points rule, maximum discount and who may approve discounts; (2) weighed goods, batches/expiry, returns in v1; (3) supported payment methods; (4) invoice number format, data retention and backup policy; plus the stockkeeper product-management permission and whether admins may sell.

## Acceptance Criteria

- [ ] Each question has a recorded answer
- [ ] Env vars (`POINTS_PER_VND`, `MAX_DISCOUNT_PERCENT_*`) and `src/common/permissions/permissions.ts` updated to match
- [ ] DECISIONS.md gets a superseding ADR if a default changes

## Technical Notes

Defaults: 1 point per 10,000 VND; cashier discount <= 10%; admin <= 100% but < subtotal; CASH/CARD/TRANSFER/OTHER; invoice `HD`+yyyyMMdd+4 digits.

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
