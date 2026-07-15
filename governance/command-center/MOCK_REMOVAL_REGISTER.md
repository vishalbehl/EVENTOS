# Mock and Unsafe Fallback Removal Register

## Confirmed initial findings

| Area | Finding | Required disposition |
|---|---|---|
| Platform templates and marketplace | Mock catalogue/listing records | Replace with template/marketplace APIs or hide behind development fixtures |
| Header notifications | `MOCK_NOTIFICATIONS` | Use notification API with real unread and delivery state |
| Dashboard and AI pages | Mock filtering, charts or operational summaries | Bind to typed analytics/AI contracts with honest empty states |
| Vendor pricing and quote revisions | Local mock rates/comparisons | Persist through pricing and quote-version sources of truth |
| Support tickets and announcements | **Repository contract closed 2026-07-15:** tenant-scoped ticket lifecycle uses real support contracts; attachments use presigned upload, authoritative metadata verification, quarantine, malware-scan handoff, readiness gating, scoped download and audit; announcements and maintenance mutations require step-up and reasons | Live object-storage/scanner and manual critical-journey evidence remain incomplete |
| Knowledge base | **Fabricated records removed 2026-07-15:** route renders an explicit unavailable state and the mock gate/browser regression prohibit fake knowledge and SLA telemetry | Implement versioned knowledge APIs before changing the route from unavailable to functional |
| Developer APIs/logs | Fallback keys and telemetry | Use developer platform and audit/log contracts |
| Proposal preview | Mock PDF frame | Render the persisted proposal artifact and validate downloads |
| Reports exports | Browser-generated demo CSV rows and local success toast | **Closed 2026-07-14:** replaced with RLS-scoped durable jobs, worker-generated XLSX/CSV/PDF artifacts, authorization-gated downloads, audit events, and focused tests |
| CRM workspace | **Core, engagement, and controlled conversion lifecycle closed 2026-07-15:** accounts, contacts, leads, opportunities, activities, tasks, notes, and qualified lead conversion use typed APIs, idempotency, versions, reason capture, step-up, audit, dependency checks, and tests | Keep `PARTIAL`; add account detail, granular permissions, full browser journeys, WCAG review, and forced-RLS deployment evidence |
| Billing intelligence | **Activation, refund, and invoice artifact gaps closed 2026-07-15:** subscriptions, grants, consumptions, activations, snapshots, transfers, deactivation, credit notes, refunds, and version-bound invoice PDFs preserve audited lineage, idempotency, step-up, private storage and reconciliation checks | Add verified provider reconciliation, provider outage tests and full browser E2E |
| Financial and entitlement pages | **Lifecycle, explainability, activation control, manual reconciliation and refund lineage closed 2026-07-15** for core subscription, activation, invoice, payment and credit-note flows | Keep `PARTIAL` until verified provider webhook/reconciliation, PDF/export, provider outage, full browser journeys and WCAG review exist |
| Payment gateway controls | Fake Command Center Save/Toggle controls removed from `/finance/payments`; the page now represents the real commercial payment ledger | Gateway credential lifecycle belongs to Developer Platform and remains unavailable until encrypted secret, rotation, health-check and audit contracts exist |
| Identity roles and permissions | **Wrong-scope contract closed 2026-07-15:** Command Center no longer uses the current session tenant implicitly; explicit organization-scoped access APIs, reasons, step-up, audit, version conflicts, and isolation tests are in place | Keep `PARTIAL` until assignment/membership UI, browser denial journeys, and deployment cache evidence are complete |
| Organization administration | **Unsafe/fabricated behavior closed 2026-07-15:** public signup is no longer presented as privileged provisioning, hard deletion fails closed, absent health/MRR is shown as not measured, and provisioning/membership/event assignment are tenant-scoped and audited | Add complete pagination, invitation delivery/acceptance, and browser/accessibility evidence |
| Access reviews and break-glass | **Local-policy ambiguity closed 2026-07-15:** requests and decisions persist in a versioned tenant-scoped register with dual control and immutable audit | Add scheduled certification, expiry/reconciliation workflow, and dedicated browser denial evidence |

## Enforcement

- Development fixtures require an explicit test/development flag and cannot be bundled as production fallbacks.
- API failure renders a recoverable error or degraded state, never sample business data.
- CI scans production sources for prohibited mock markers; reviewed visual placeholders such as input placeholder text are excluded.
- Each register item closes only with route-level test evidence and feature-matrix updates.
- Locally generated exports containing sample business rows are fake production output even when the browser downloads a real file.
- Explicit unavailable states are safer than fabricated behavior but do not close a feature-completion item.
