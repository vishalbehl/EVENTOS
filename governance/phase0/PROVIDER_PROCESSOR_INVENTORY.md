# Provider and Processor Inventory

Status: SEEDED, PRIVACY/LEGAL REVIEW REQUIRED

Snapshot:

- Date: 2026-07-11
- Evidence source: config/static scan and product architecture docs

| Provider | Purpose | Data shared | Data class | Tenant configurable | Region/residency | Contract/DPA status | Failure behavior |
|---|---|---|---|---|---|---|---|
| PostgreSQL provider | Primary relational data | Tenant/event/user/billing records | Restricted/Confidential/Security | No | Requires production decision | Pending | Restore from backup; fail closed |
| Redis/cache provider | Cache, queues, rate limits | Tenant-scoped keys, job state, non-authoritative cache data | Internal/Confidential | No | Requires production decision | Pending | Cache loss cannot grant access; delayed jobs |
| Object storage/R2/S3 | File storage, exports, generated assets | Files, exports, thumbnails, presentations | Confidential/Restricted Personal | No | Requires production decision | Pending | Keep unavailable files inaccessible; retry |
| Email provider such as Resend/SMTP | Transactional/campaign email | Email, name, message metadata/content | Restricted Personal | Yes, if tenant/provider settings are enabled | Requires selection | Pending | Delayed/retry/suppression aware |
| WhatsApp provider | WhatsApp messages | Phone, template data, message metadata | Restricted Personal | Yes, if tenant/provider settings are enabled | Requires provider review | Pending | Delayed/retry/suppression aware |
| Payment provider such as Stripe/Razorpay | Hosted/tokenized payments | Hosted payment state, references, provider event ids | Payment Data | Yes, if provider settings are enabled | Requires provider review | Pending | Idempotent reconciliation |
| AI provider such as Gemini | Embeddings/generation | Prompt/content depending on feature | Confidential/Restricted depending on input | No/controlled | Requires provider review | Pending | Feature degrades; no core-event block |
| Malware scanner | File safety | Uploaded file bytes or hashes | Confidential/Restricted | No | Requires production decision | Pending | Keep files quarantined |
| Venue sync providers/devices | Venue operations | Event/session/badge/sync data | Confidential/Restricted | Per event/site/device | Venue hardware vendors vary by event | Vendor contract required per event | Retry/reconcile; no direct DB access |
| Observability/error tracking | Logs, metrics, traces, errors | Redacted telemetry, request metadata | Internal/Security/Restricted if mishandled | No | Requires production decision | Pending | Telemetry loss cannot block core operations |

## Venue Hardware Outsourcing Rule

Venue hardware vendors may differ by event, for example Event A using Company A
and Event B using Company B. Event OS does not need to manage the vendor's
internal hardware inventory to close cloud Phase 0/1, but it must maintain cloud
records for any machine identity, event scope, sync permission, credential
expiry, revocation, and audit trail used to connect that outsourced venue setup
to Event OS.

## Closure Requirement

- Identify subprocessors and data categories.
- Confirm whether personal data leaves the approved region.
- Define retention and deletion behavior.
- Define outage/degradation behavior.
- Record contract, DPA, and security-review status where personal or restricted
  data is processed.
