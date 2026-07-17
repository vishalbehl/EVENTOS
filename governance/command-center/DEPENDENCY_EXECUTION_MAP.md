# Dependency and Execution Map

```text
Phase 0 inventory
  -> Phase 1 design system and shell
  -> Phase 2 API, cache and test foundation
  -> Phase 3 critical defect closure
      -> Phase 4 commercial, subscriptions and finance
      -> Phase 5 operations and outsourced venue readiness
      -> Phase 6 developer platform and integrations
      -> Phase 7 support, communications and applications
      -> Phase 8 platform settings and identity/security
      -> AI, builder, platform templates, blueprints and marketplace [removed/out of scope]
  -> Phase 10 cross-domain release verification
```

## Blocking dependencies

| Capability | Must exist first |
|---|---|
| Any administrative mutation | authenticated API client, permission contract, audit insertion and error model |
| Commercial workflow | canonical pricing snapshots and idempotency |
| CRM administration | platform-support tenant access policy, typed pagination, lifecycle permissions and audit |
| Event entitlement UI | grant, consumption, activation and current snapshot APIs |
| Cross-tenant billing intelligence | reviewed privileged read service, RLS-safe role model, cursor contract and access audit |
| Finance mutation | internal ledger, verified provider event and reconciliation state |
| Report download | durable export record, server artifact, object authorization, expiry and download audit |
| Operations action | durable job state, authorization and retry/cancellation policy |
| Provider integration | secret lifecycle, webhook verification and redacted logs |
| Campaign dispatch | consent/suppression decision and durable job |
| Future AI privileged action | approved replacement ADR, approval policy, redaction and immutable audit |
| Venue supplier access | event-scoped machine identity and revocation |
| Production release | tenant isolation, accessibility, security and rollback gates |

Work may run in parallel only after its shared dependencies have passed their exit gates.

## Current Critical Path

```text
Phase 1 design-system and shell foundation [complete 2026-07-14]
  -> Phase 2 typed frontend contracts and CI gates [complete 2026-07-14]
  -> Phase 3 repository closure [complete 2026-07-16]
  -> Phase 4 repository closure [complete 2026-07-16]
  -> Phase 5 Operations Center repository closure [complete 2026-07-16]
      -> production broker/storage/database/venue telemetry evidence remains Phase 10
Durable report export and authorized download [implemented]
  -> tenant-scoped expiry and storage-outage retry [implemented and tested 2026-07-16]
  -> live broker/object-storage E2E remains release-environment evidence
Platform-support tenant read contract [implemented and isolation-tested]
Support ticket lifecycle, assignment, escalation and private notes [implemented and isolation-tested 2026-07-15]
Support attachment presign, quarantine, malware-scan handoff and READY-only download [implemented and isolation-tested 2026-07-15]
Durable scoped audit export, broker-failure persistence, retention cleanup and communications mutation assurance [implemented and tested 2026-07-16]
Access review and break-glass dual control [implemented and tested 2026-07-15]
Typed CRM and billing cursor pagination [implemented and tested]
CRM core record lifecycle [implemented and tested]
Subscription, grant and credit-note lifecycle [implemented and tested]
  -> controlled CRM lead conversion [implemented and tested 2026-07-15]
  -> CRM activities, tasks and notes [implemented and tested 2026-07-15]
  -> CRM account workspace [implemented and tested 2026-07-15]
  -> granular platform-staff CRM permission journeys
  -> activation/snapshot/usage administration [implemented 2026-07-14]
  -> activation transfer/deactivation administration [implemented and tested 2026-07-15]
  -> tenant invoice/payment reconciliation [implemented 2026-07-14]
  -> commercial refund lineage and reconciliation [implemented and tested 2026-07-15]
  -> version-bound invoice PDF artifact and audited download [implemented and tested 2026-07-15]
  -> verified provider webhook reconciliation and failure behavior [repository complete; sandbox evidence pending]
  -> invoice, payment and provider reconciliation [implemented and tested]
  -> Phase 4 browser/axe journeys [complete 2026-07-16]
```
