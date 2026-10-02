---
id: "005"
title: "Daily MySQL backup and tested restore (NF7)"
status: "completed"
area: "infra"
agent: "@backend-developer"
priority: "high"
created_at: "2026-10-02"
due_date: null
started_at: "2026-10-02"
completed_at: "2026-10-02"
prd_refs: ["SRS NF7"]
blocks: []
blocked_by: []
---

## Description

Configure a daily MySQL backup (mysqldump or physical) with retention, and document and rehearse the restore procedure before going live.

## Acceptance Criteria

- [x] Scheduled daily backup with retention (`npm run db:backup`, `BACKUP_RETENTION_COUNT`; Windows Task Scheduler and cron commands documented)
- [x] Restore rehearsed on a clean instance (scratch database `mini_store_restore_check`: 24/24 demo checks, identical row counts in 15 tables)
- [x] Runbook written in docs/backend/BACKEND.md, section "Backup & restore" (docs/devops/ was owned by another workstream; @cicd-engineer may link or move it into DEVOPS.md)

## Technical Notes

Retention period is part of task 003; the default is the newest 14 backups (`BACKUP_RETENTION_COUNT`).

Implemented as Node CLIs in `scripts/` (`db:backup`, `db:restore`, `db:compare`) using `mysqldump` / `mysql` from PATH or `MYSQLDUMP_PATH` / `MYSQL_PATH`; the password only travels in `MYSQL_PWD`. Not done: automatic off-machine copy of the backups (documented as a recommendation) and registering the scheduled task on the production host (needs the host).

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
| 2026-10-02 | @backend-developer | Implemented backup/restore/compare CLIs, rehearsed a restore, documented schedule and runbook; completed |
