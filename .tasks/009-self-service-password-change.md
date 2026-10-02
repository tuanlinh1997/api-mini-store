---
id: "009"
title: "Self-service password change for staff"
status: "todo"
area: "backend"
agent: "@backend-developer"
priority: "low"
created_at: "2026-10-02"
due_date: null
started_at: null
completed_at: null
prd_refs: ["SRS F1", "SRS F2"]
blocks: []
blocked_by: []
---

## Description

Only an admin can reset passwords today. Add `POST /auth/change-password` (current + new password), revoking the user's other sessions.

## Acceptance Criteria

- [ ] Endpoint with validation and rate limiting
- [ ] Other sessions revoked
- [ ] Tests and API.md updated

## Technical Notes



## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
