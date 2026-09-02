# Venue Server

Main optional on-site server for broad venue execution.

This service must remain broader than registration. A dedicated
`services/registration-server` now exists for the focused desktop Registration
Software backend, but Venue Server remains the future hub for all on-site apps.

## Scope

Venue Server owns or will own:

- Registration data cache when a full venue server is present.
- Speaker/SRR workflows.
- Room technician workflows.
- Room app playback and queue workflows.
- Moderator workflows.
- Signage and display coordination.
- Hardware, printer, network, and device health.
- Cross-app source sync from the cloud backend.
- Source snapshots for app-specific servers, including Registration Server.

## Relationship with Registration Server

`services/registration-server` is the installable registration-only backend.

Venue Server may still expose registration data and accept registration outbox
updates because large sites may deploy Venue Server as the main local authority.
Do not delete registration-related source/sync support from Venue Server unless
there is a shared package or replacement endpoint already used by
Registration Server.

## Boundary rule

If a feature belongs only to desks, badges, kits, companions, check-in gates, or
registration reports, it belongs in Registration Server first.

If a feature coordinates multiple on-site apps, rooms, speakers, signage,
technicians, moderators, hardware, or the overall event network, it belongs in
Venue Server.

Shared contracts should move into `packages/registration-schema-contract` or a
future shared server package rather than being hand-copied between services.
