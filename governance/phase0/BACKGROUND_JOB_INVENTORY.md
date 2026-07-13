# Background Job Inventory

Status: SEEDED, OWNER REVIEW REQUIRED

Snapshot:

- Date: 2026-07-11
- Static task scan: 64 task, beat, send, or delay matches across backend and workers

## Inventory Method

Command:

```powershell
rg -n "@(celery_app|app)\.task|beat_schedule|send_task|\.delay\(" services/backend/app services/workers -g "*.py"
```

## Current Job Surface

| Job/task area | Module | Observed matches | Scope type | Required scope payload | Idempotent | Retry policy | Side effects | Status |
|---|---|---:|---|---|---|---|---|---|
| API usage flush | `services/backend/app/tasks/platform_tasks.py` | 1 | CONTROL_PLANE to tenant writes | Redis tenant keys | Partial | Periodic | Writes API usage metrics | Enabled |
| Notification tasks | `services/workers/tasks/notification_tasks.py` | 8 | TENANT/EVENT | `organization_id`, event/message identifiers | Required | Worker retry/DLQ target | Email/channel dispatch | Needs owner review |
| File tasks | `services/workers/tasks/file_tasks.py` | 5 | TENANT/EVENT | `organization_id`, file id, bucket/key | Required | Worker retry/DLQ target | File processing/storage updates | Needs owner review |
| Sync tasks | `services/workers/tasks/sync_tasks.py` | 3 | EVENT | `organization_id`, `event_id`, venue/device context | Required | Worker retry/DLQ target | Venue sync updates | Needs owner review |
| Video tasks | `services/workers/tasks/video_tasks.py` | 3 | EVENT | `organization_id`, presentation/video id | Required | Worker retry/DLQ target | Media processing | Needs owner review |
| Report tasks | `services/workers/tasks/report_tasks.py` | 3 | EVENT/TENANT | `organization_id`, report/export id | Required | Worker retry/DLQ target | Report/export generation | Phase 1 boundary completed |
| Search tasks | `services/workers/tasks/search_tasks.py` | 2 | TENANT/EVENT | `organization_id`, index target | Required | Worker retry/DLQ target | Search projection updates | Phase 1 boundary completed |
| Import tasks | `services/workers/tasks/import_tasks.py` | 2 | EVENT | `organization_id`, import job id | Required | Worker retry/DLQ target | Registration/data import | Needs owner review |
| Platform builder jobs | `services/backend/app/tasks/platform_builder_tasks.py` | 7 | CONTROL_PLANE | Approved tenant fanout contract | Required before scheduling | Disabled/fail-closed until contract | Platform tenant jobs | Dormant/future |
| Platform commercial jobs | `services/backend/app/tasks/platform_commercial_tasks.py` | 4 | CONTROL_PLANE | Approved tenant fanout contract | Required before scheduling | Disabled/fail-closed until contract | Commercial/billing operations | Dormant/future |
| Workflow jobs | `services/backend/app/tasks/workflow_jobs.py` | 3 | CONTROL_PLANE/TENANT | Explicit scope contract | Required before scheduling | Disabled/fail-closed until contract | Workflow side effects | Dormant/future |
| Operations jobs | `services/backend/app/tasks/operations_jobs.py` | 3 | CONTROL_PLANE/TENANT | Explicit scope contract | Required before scheduling | Disabled/fail-closed until contract | Operational jobs | Dormant/future |
| Audit tasks | `services/backend/app/tasks/audit_tasks.py` | 2 | TENANT/SECURITY | Audit scope and actor context | Required | Must not lose events | Audit/event processing | Needs owner review |

## Scope Types

- `TENANT`: requires `organization_id`.
- `EVENT`: requires `organization_id` and `event_id`.
- `CONTROL_PLANE`: may enumerate tenants only through an approved control-plane
  role/contract.
- `DISABLED`: must fail closed or not be scheduled.

## Current Phase 1 Rule

Tenant-owned jobs must require explicit organization scope or fail closed. Redis,
queue payloads, and worker local state are not authoritative for tenant identity,
authorization, licensing, consent, payment, or file safety.
