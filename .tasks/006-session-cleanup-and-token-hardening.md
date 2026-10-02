---
id: "006"
title: "Purge stale sessions, refresh-token reuse detection, shared rate-limit store"
status: "completed"
area: "backend"
agent: "@backend-developer"
priority: "normal"
created_at: "2026-10-02"
due_date: null
started_at: "2026-10-02"
completed_at: "2026-10-02"
prd_refs: ["SRS NF2"]
blocks: []
blocked_by: []
---

## Description

Add a scheduled job deleting expired/revoked `user_sessions` rows; optionally revoke the whole session when an already-rotated refresh token is presented (reuse detection); move the throttler to a shared store (e.g. Redis) before running more than one API instance.

## Acceptance Criteria

- [x] Scheduled cleanup job with logging (`@nestjs/schedule`, `SESSION_CLEANUP_ENABLED` / `SESSION_CLEANUP_CRON` / `SESSION_RETENTION_DAYS`)
- [x] Reuse detection with tests (unit and e2e; whole session revoked, warning logged)
- [ ] Throttler storage configurable: split out to task #010 (needs a Redis decision; only relevant with more than one instance)

## Technical Notes

See ADR-003 consequences and ADR-009 (reuse detection design). Reuse detection needed one new column, `user_sessions.previous_refresh_token_hash` (migration `20261002100100`); only the immediately previous token is remembered.

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
| 2026-10-02 | @backend-developer | Cleanup job and reuse detection implemented and tested; shared throttler store moved to #010; completed |
