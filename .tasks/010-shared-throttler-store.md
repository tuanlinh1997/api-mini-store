---
id: "010"
title: "Shared rate-limit store for multi-instance deployments"
status: "todo"
area: "backend"
agent: "@backend-developer"
priority: "low"
created_at: "2026-10-02"
due_date: null
started_at: null
completed_at: null
prd_refs: ["SRS NF2"]
blocks: []
blocked_by: []
---

## Description

`@nestjs/throttler` keeps its counters in process memory, so each API instance counts separately and a restart resets them. Before running more than one instance, move the storage to a shared store (for example Redis) and make it configurable by environment variable.

## Acceptance Criteria

- [ ] Storage selected by env (in-memory by default, shared store when configured)
- [ ] Login throttle verified across two instances
- [ ] BACKEND.md configuration table updated

## Technical Notes

Split out of task #006, whose other items (session cleanup, token-reuse detection) are done. Not needed while a single instance runs.

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created (split from #006) |
