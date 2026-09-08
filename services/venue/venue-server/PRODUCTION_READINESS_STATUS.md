# Venue Server and SRR production-readiness status

Last verified: 2026-09-04

This report records evidence for the Venue Server/SRR production-readiness
plan. A passing local test or build is not treated as proof of real-device
certification.

## Verified locally

| Area | Evidence | Result |
| --- | --- | --- |
| Backend regression suite | Venue Server virtual-environment test run | 108 passed; 1 existing test warning |
| Database migration | `alembic current` in the running container | `20260904_1500 (head)` |
| Database shape | `python scripts/schema_preflight.py --check` in the running container | Ready; no missing tables or columns; 53 owned tables |
| Runtime health | `GET /readyz` against the running container | `{"status":"ready"}` |
| SRR bootstrap | Generated SQLite opened by `NodeReplica` | Schema version 4 and station operations verified |
| Stage App | TypeScript and Vite production build | Passed |
| Technical App | TypeScript and Vite production build | Passed |
| Delivery integrity | Backend tests for claim, resumable progress, checksum/size acknowledgement, replay, and obsolete versions | Passed |
| Device identity | Backend tests and runtime implementation | Event/room-scoped credentials, revocation, heartbeat evidence, and safe enrollment responses present |
| Operator state truthfulness | SRR fleet, attention queue, and performance telemetry UI review; Venue App type-check | Unknown, offline, stale, failed, and not-configured states remain visibly distinct from verified healthy/synced states; unavailable latency/resource telemetry is rendered as unavailable rather than fabricated |
| Realtime event scope | SRR/WebSocket regression tests and client type-checks | SRR runtime events are tagged and emitted to the configured event room instead of globally broadcast |

## Implemented contract coverage

- Venue Server owns event, room, session, speaker presentation, device,
  station, command, runtime-event, and delivery state.
- Presentation versions are immutable and linked to event, room, session,
  session speaker, speaker, source node, size, format, checksum, and upload
  state.
- Uploads reject a session assignment from a different event before a new
  authoritative version or delivery intent can be created.
- Delivery is target-specific. SRR stations receive event files; Stage and
  Technical Apps receive only files for their session room.
- Socket.IO SRR events are emitted to the authenticated/configured event room;
  production external clients cannot connect anonymously or join an arbitrary
  event room.
- SRR station heartbeats persist hostname and agent version so fleet upgrade
  and health views can distinguish missing metadata from a reported value.
- A delivery is verified only after the target acknowledges the exact file ID,
  version, size, and SHA-256 checksum.
- Device access uses short-lived access tokens issued from stored,
  revocable device enrollment credentials.
- Room commands, heartbeats, runtime snapshots, and delivery acknowledgements
  are scoped to the enrolled event and room.
- SRR local replicas contain versioned schema metadata, an outbox, incoming
  server events, conflicts, delivery acknowledgements, and verified file
  cache metadata.
- SRR workstation replica replacement is blocked while local mutations are
  pending or conflicted, and existing SQLite files are backed up before a
  local schema migration.

## Release gates still requiring external certification

These items are intentionally not marked complete by the local evidence above:

- Multi-device Windows LAN/Wi-Fi acceptance with at least three SRR stations,
  one master, one check-in node, Stage App, and Technical App.
- Physical offline check-in, file edit, reconnect reconciliation, and station
  conflict handling.
- Physical target disconnect, resumable delivery, disk-full, and checksum
  mismatch recovery.
- Load and soak testing with event-sized data and concurrent room traffic.
- Verified database backup/restore and appliance recovery procedure.
- TLS, credential rotation, revocation, and network-boundary security review.
- Signed Windows installers and upgrade testing from the previous release.
- Full 20-step end-to-end acceptance flow with recorded evidence.

## Current decision

The codebase is implementation-ready for controlled staging. It must not be
labelled production-certified until the external release gates above have
recorded evidence.
