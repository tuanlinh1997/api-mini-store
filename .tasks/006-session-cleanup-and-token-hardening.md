---
id: "006"
title: "Purge stale sessions, refresh-token reuse detection, shared rate-limit store"
status: "todo"
area: "backend"
agent: "@backend-developer"
priority: "normal"
created_at: "2026-10-02"
due_date: null
started_at: null
completed_at: null
prd_refs: ["SRS NF2"]
blocks: []
blocked_by: []
---

## Description

Add a scheduled job deleting expired/revoked `user_sessions` rows; optionally revoke the whole session when an already-rotated refresh token is presented (reuse detection); move the throttler to a shared store (e.g. Redis) before running more than one API instance.

## Acceptance Criteria

- [ ] Scheduled cleanup job with logging
- [ ] Reuse detection with tests
- [ ] Throttler storage configurable

## Technical Notes

See ADR-003 consequences.

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
