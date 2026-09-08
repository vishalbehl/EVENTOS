# Phase 3A Command-Level Inventory

This inventory is the implementation and acceptance map for the Phase 3A
command-reliability batch. It records the authorization boundary, authoritative
version, durable idempotency operation, transaction owner, and side effects.
Compatibility routes retain their existing response bodies; version discovery
uses existing version fields and/or `If-Match` headers.

| Command family | Authorization boundary | Version mechanism | Durable idempotency | Transaction owner and side effects | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| Registration form config and fields | Event-scoped registration-management capability | Locked config row; `If-Match`; version increment | `registration.form.update` | `RegistrationFormCommandService`; role bootstrap, form fields, event registration settings, cache invalidation | `test_phase3a_registration_settings_commands.py`, registration portal suite |
| Form categories | Platform admin for system rows; organization ownership for custom rows | Locked category row; `If-Match`; version increment | `registration.form_category.create/update/delete` | `FormCategoryCommandService`; soft delete and response replay | Phase 3A command suite and form route contracts |
| Form templates | Platform admin or owning organization; global templates are read-only to organizers | Locked template row; `If-Match`; version increment | `registration.form_template.create/update/duplicate/delete` | `FormTemplateCommandService`; template persistence and soft delete | Phase 3A command suite and form route contracts |
| Pricing tiers and matrix | Event-scoped pricing-management capability | Locked event; `If-Match`; event version increment | `registration.pricing.tiers.save`, `registration.pricing.matrix.save` | `PricingCommandService`; pricing replacement and cache invalidation | `test_phase3a_payment_commands.py` and pricing contracts |
| Payment configuration | Organization/event payment-management capability | Locked event (`FOR UPDATE OF events`); `If-Match`; event version increment | `registration.payment.config.update` | `PaymentCommandService`; encrypted secret update and pricing/cache invalidation | `test_phase3a_payment_commands.py`, payment suite |
| Promo codes | Organization/event pricing-management capability | Locked promo row; `If-Match`; promo version increment | `registration.promo.create/update/delete` | `PromoCodeCommandService`; soft delete and cache invalidation | `test_phase3a_payment_commands.py`, payment suite |
| Participant create/update/archive/restore | Event participant-management capability | Locked participant; `If-Match`; participant version increment | `registration.participant.create/update/archive/restore` | `ParticipantCommandService`; registration-number/payment state, audit, projection refresh, cache invalidation | participant update and Phase 3A suites |
| Participant bulk/import | Event participant-management capability | Locked event and durable import job versions | `registration.participant.<source>`, `import_job.create` | participant/import command services; durable job/upload dispatch and recovery | import task, upload recovery, Phase 3A suites |
| Registration submission/review | Public submission or event reviewer capability | Locked registration; registration version increment | `registration.submit`, `registration.approve/reject/waitlist` | `RegistrationCommandService`; capacity/metering, audit, projection refresh | registration portal suite |
| Checkout/payment verification | Public checkout/payment callback boundary plus event ownership | Locked payment transaction and related registration/participant; versions increment | `registration.checkout.create`, `registration.payment.verify` | registration portal command path; provider double, payment state, projection refresh | registration portal and payment suites |
| Participant roles | Event ticket-type management capability | Command transaction; durable logical outcome | `registration.role.create/update/delete/bulk_toggle` | `ParticipantRoleCommandService`; usage reservation and role-cache invalidation | participant-role contracts |
| Email campaign lifecycle | Organization/event notification-management capability | Locked campaign; `If-Match`; campaign version increment | `email_campaign.create/update/archive/restore/send` | notification command service; campaign claim, audit, durable task dispatch | `test_phase3a_command_completion.py`, notification/provider suite |
| Email campaign worker | Notifications queue and tenant metadata | Locked campaign claim; worker version increment | Stable campaign/task identity and recovery scan | Celery task; send, failure state, recovery re-publication | worker recovery and task failure suites |
| Durable upload completion | Organization/event upload capability | Locked upload; `If-Match`; upload version increment | `files.upload.complete` | upload command and worker state machine; integrity/scanner checks and recovery dispatch | upload/provider and retry suites |
| Venue Ops request update/submit/approve | Organization/event Venue Ops capability | Locked request; `If-Match`; request version increment | `venue_ops.request.update/submit/approve` | command service; audit, outbox/recommendation invalidation | `test_phase3a_venue_ops_commands.py` |
| Organizer organization profile | Organization owner/admin boundary | Locked organization profile version; `If-Match` | `organiser.organization.profile.update` | organizer command service; audit and organization-cache invalidation | organizer organization command contracts |
| Organizer member lifecycle | Organization owner/admin boundary | Locked member; `If-Match`; member version increment | `organiser.member.invitation.resend/revoke`, `organiser.member.role/status.update` | member command service; user/session changes, audit, cache invalidation | organizer member command contracts |
| Organizer security and branding | Organization owner/admin boundary | Locked policy/profile rows; `If-Match`; version increment | `organiser.organization.security/branding.update` | organizer command services; audit and organization-cache invalidation | organizer security/branding contracts |
| Organizer billing profile | Organization owner/admin boundary | Locked billing profile; `If-Match`; version increment | `organiser.organization.billing.update` | organizer billing command service; audit and organization-cache invalidation | organizer billing command contracts |

## Shared acceptance requirements

- Authorization and organization/event ownership are evaluated before exposing
  a resource version.
- Durable idempotency records are organization-scoped and fingerprint the full
  logical request, including the expected version where applicable.
- Replays return the stored logical result without repeating business side
  effects; payload changes with the same key are rejected.
- Command services own commits and rollbacks. Routers do not commit business
  mutations.
- Broker publication happens only after the business transaction commits or is
  recoverable from a durable committed intent.
- Version checks use the shared `RESOURCE_VERSION_CONFLICT` contract on the
  migrated command paths; older compatibility contracts remain unchanged until
  their coordinated migration.

## Evidence boundary

The source and grouped contract suites cover the command paths listed here.
The Phase 3A acceptance-gate suite now also proves separate-database-session
race handling, broker-outage recovery, expiry/reuse and bounded purge behavior,
and old-writer INSERT compatibility for the newly-added version columns. The
weighted Phase 3A row is accepted at the current checkout; broader query,
repository, pagination, cache, worker-family, scale, and local-release rows
remain separate tracker work.

## Phase 3A acceptance evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Separate-session concurrency | PASS | Two committed PostgreSQL sessions raced the same versioned promo mutation; exactly one committed and the stale session received `409 RESOURCE_VERSION_CONFLICT`. |
| Broker-failure recovery | PASS | A controlled broker double failed the first campaign publication; the committed `sending` intent remained durable and the next recovery scan republished the same campaign operation. |
| Expiry and purge | PASS | An expired key was reusable, a completed response replayed, and bounded purge removed one expired record while retaining the next record for the following batch. |
| Old-writer compatibility | PASS | Raw INSERT statements omitted `version` for `content.durable_uploads` and `communications.email_campaigns`; PostgreSQL returned `version = 1` for both. |
| Consolidated Phase 3A suite | PASS | `15 passed, 0 failed, 0 skipped` in `25.20s`; three non-failing dependency deprecation warnings. |

Runtime evidence: source and staging migration heads are both
`20260909_1100`; migration graph validation reports one head and 196 revisions;
staging `/health` and `/metrics` both returned `200`. Only the backend image
was refreshed for the model/test change; PostgreSQL, Redis, MinIO, ClamAV, and
all workers were not recreated.
