# Incident Playbooks

## Room PC Failure

Target recovery: under 60 seconds.

1. Technician Dashboard -> Room -> Panic Panel -> Switch to Shadow PC.
2. If no shadow PC is configured, load the latest room snapshot on the spare laptop.
3. Confirm the audience screen shows the current slide.
4. Record the incident notes with room, time, and operator name.

Success indicator: playback resumes on the room display within 60 seconds.

Escalation: Technical Manager.

## Emergency File Replacement

Target recovery: under 3 minutes.

1. Technician Dashboard -> Stations -> Speaker -> Unlock File.
2. Confirm the operator has Technical Manager or Super Admin role.
3. Upload the replacement file from the station or technician console.
4. Confirm validation passes and sync priority is set to critical.
5. Send the replacement to the room and record the override reason.

Success indicator: the room queue shows the replacement deck as current.

Escalation: Technical Manager and Session Manager.

## Venue Server Failure

Target recovery: under 2 minutes.

1. Confirm room apps continue from their local snapshot/cache.
2. If a secondary server is configured, promote it from the failover control.
3. If no secondary exists, restart the venue server with `docker-compose restart venue-server`.
4. Verify `/health` returns `{"status":"ok"}`.
5. Confirm room devices reconnect and file sync resumes.

Success indicator: all active rooms show online status and keep playing cached content.

Escalation: Platform Engineer.

## Power Outage Recovery

1. Restore UPS or venue power.
2. Boot the venue server and room PCs.
3. Verify local cache availability before network-dependent sync.
4. Open Technician Dashboard -> Rooms and confirm online status.
5. Resume sessions from the latest snapshots and log any delayed talks.

Success indicator: rooms can open the latest cached presentation package.

Escalation: Venue IT Lead and Technical Manager.
