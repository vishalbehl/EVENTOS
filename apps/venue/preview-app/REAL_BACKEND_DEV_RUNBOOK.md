# SRR Preview Real Backend Dev Runbook

This app is wired to `services/venue-server`. The Preview UI no longer uses mock
speaker, station, file, or admin data.

## 1. Start Venue Server

From `services/venue-server`:

```powershell
$env:VENUE_AUTH_SECRET="dev-venue-auth-secret-change-before-production-12345"
$env:VENUE_AUTH_KEY="dev-venue-device-key-change-before-prod"
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe scripts\seed_srr_preview_dev.py
.\.venv\Scripts\uvicorn.exe app.main:app_fastapi --host 127.0.0.1 --port 8001
```

## 2. Start Electron Preview

From the repo root:

```powershell
npm.cmd run desktop:dev --workspace apps/venue/preview-app
```

Use:

- Username: `srradmin`
- Password: `ChangeMe12345!`
- Speaker check-in/search: `speaker@example.local`
- Station number: `1`

## 3. Expected Real Flow

1. Login succeeds only through Venue Server auth.
2. Scanning mode calls `POST /api/v1/srr/checkin`.
3. Workstation mode calls `GET /api/v1/srr/stations/1/context`.
4. Upload sends a real file to `POST /api/v1/srr/files/upload`.
5. Venue Server writes the file to the configured content path, stores checksum,
   and returns `download_url`.
6. Native open downloads/caches the real binary before launching the OS app.
7. Finalize fails if the stored binary is missing.

No default mock credentials, fake speakers, fake files, or fake station rows
should appear in this flow.
