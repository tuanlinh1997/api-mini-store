---
id: "005"
title: "Daily MySQL backup and tested restore (NF7)"
status: "todo"
area: "infra"
agent: "@cicd-engineer"
priority: "high"
created_at: "2026-10-02"
due_date: null
started_at: null
completed_at: null
prd_refs: ["SRS NF7"]
blocks: []
blocked_by: []
---

## Description

Configure a daily MySQL backup (mysqldump or physical) with retention, and document and rehearse the restore procedure before going live.

## Acceptance Criteria

- [ ] Scheduled daily backup with retention
- [ ] Restore rehearsed on a clean instance
- [ ] Runbook in docs/devops/DEVOPS.md

## Technical Notes

Retention period is part of task 003.

## History

| Date | Agent / Human | Event |
|------|--------------|-------|
| 2026-10-02 | @backend-developer | Task created |
