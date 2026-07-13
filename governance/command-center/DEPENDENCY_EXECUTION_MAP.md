# Dependency and Execution Map

```text
Phase 0 inventory
  -> Phase 1 design system and shell
  -> Phase 2 API, cache and test foundation
  -> Phase 3 critical defect closure
      -> Phase 4 commercial, subscriptions and finance
      -> Phase 5 operations and outsourced venue readiness
      -> Phase 6 developer platform and integrations
      -> Phase 7 support, communications, AI and applications
      -> Phase 8 platform settings and identity/security
      -> Phase 9 builder, marketplace and missing modules
  -> Phase 10 cross-domain release verification
```

## Blocking dependencies

| Capability | Must exist first |
|---|---|
| Any administrative mutation | authenticated API client, permission contract, audit insertion and error model |
| Commercial workflow | canonical pricing snapshots and idempotency |
| Event entitlement UI | grant, consumption, activation and current snapshot APIs |
| Finance mutation | internal ledger, verified provider event and reconciliation state |
| Operations action | durable job state, authorization and retry/cancellation policy |
| Provider integration | secret lifecycle, webhook verification and redacted logs |
| Campaign dispatch | consent/suppression decision and durable job |
| AI privileged action | approval policy, redaction and immutable audit |
| Venue supplier access | event-scoped machine identity and revocation |
| Production release | tenant isolation, accessibility, security and rollback gates |

Work may run in parallel only after its shared dependencies have passed their exit gates.
