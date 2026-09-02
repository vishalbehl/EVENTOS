# Registration Server

Dedicated local backend for the desktop Registration Software.

This service was split from `services/venue-server` so registration can run as
an installable, focused product even when the full Venue Server is not present
on site.

## Scope

Included:

- Admin registration dashboard APIs.
- Registration desk APIs.
- Scanning/check-in gate APIs.
- Badge printing APIs.
- Companion and kit distribution data.
- Registration reports.
- Registration workstation binding.
- Shared registration PostgreSQL bootstrap.
- SQLite fallback snapshot support.
- Registration source fetch and outbox sync.

Excluded from this service boundary:

- Speaker/SRR application workflows.
- Room technician workflows.
- Room app playback.
- Presentation file and queue handling.
- Digital signage.
- Broad venue infrastructure management outside registration workstations.

Those broader on-site features belong in `services/venue-server`.

## Development

For now this service reuses the Venue Server Python environment while the split
is in progress:

```powershell
D:\DEV\conf-platform\services\venue-server\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8012
```

Run from:

```powershell
D:\DEV\conf-platform\services\registration-server
```

The production dependency/runtime split will be finalized after the remaining
API-key, sync, desktop, and contract-test phases are complete.
