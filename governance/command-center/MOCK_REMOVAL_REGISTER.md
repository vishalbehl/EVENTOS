# Mock and Unsafe Fallback Removal Register

## Confirmed initial findings

| Area | Finding | Required disposition |
|---|---|---|
| Platform templates and marketplace | Mock catalogue/listing records | Replace with template/marketplace APIs or hide behind development fixtures |
| Header notifications | `MOCK_NOTIFICATIONS` | Use notification API with real unread and delivery state |
| Dashboard and AI pages | Mock filtering, charts or operational summaries | Bind to typed analytics/AI contracts with honest empty states |
| Vendor pricing and quote revisions | Local mock rates/comparisons | Persist through pricing and quote-version sources of truth |
| Support tickets and announcements | Seed records, local comments and fake success messages | Use separate support and announcement contracts |
| Knowledge base | Static mock records | Implement versioned knowledge APIs |
| Developer APIs/logs | Fallback keys and telemetry | Use developer platform and audit/log contracts |
| Proposal preview | Mock PDF frame | Render the persisted proposal artifact and validate downloads |

## Enforcement

- Development fixtures require an explicit test/development flag and cannot be bundled as production fallbacks.
- API failure renders a recoverable error or degraded state, never sample business data.
- CI scans production sources for prohibited mock markers; reviewed visual placeholders such as input placeholder text are excluded.
- Each register item closes only with route-level test evidence and feature-matrix updates.
