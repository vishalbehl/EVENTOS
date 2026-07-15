# Command Center Completion Governance

This directory is the authoritative implementation control surface for completing the EventX OS Command Center.

## Phase 0 artifacts

- `COMMAND_CENTER_FEATURE_MATRIX.csv`: generated inventory of every current `page.tsx` route and its completion evidence.
- `BACKEND_CAPABILITY_INVENTORY.csv`: generated inventory of backend route decorators requiring UI/authorization/test mapping.
- `ROUTE_API_CONTRACTS.md`: frontend-to-backend contract ownership and rules.
- `NAVIGATION_INFORMATION_ARCHITECTURE.md`: canonical navigation and route treatment.
- `SHARED_COMPONENT_INVENTORY.md`: approved shared UI foundations and identified gaps.
- `MOCK_REMOVAL_REGISTER.md`: production mock/static/fallback closure register.
- `DEPENDENCY_EXECUTION_MAP.md`: implementation order and cross-domain dependencies.
- `PHASE3_CHANGE_MANIFEST.md`: active guardrail for Phase 3 batch implementation, including allowed files, banned production patterns, high-risk mutation rules, verification gates, and manifest expansion rules.
- `PHASES_1_4_INTEGRATED_COMPLETION_PLAN.md`: continuous Codex-owned execution plan, work-package status ledger, estimate, evidence log, and final acceptance gate for Phases 1-4.
- `CURRENT_PHASE_STATUS.md`: dated evidence-based phase percentages, latest change review, blockers, and immediate execution order.
- `FRONTEND_CONTRACT_FOUNDATION.md`: authenticated API, generated DTO, test, and CI boundary.
- `QUERY_INVALIDATION_CONTRACTS.md`: canonical tenant/platform keys, invalidation ownership, cursor pagination, and optimistic concurrency.

Regenerate the route inventory from repository truth:

```powershell
python governance/command-center/generate_inventory.py
python governance/command-center/generate_inventory.py --check
```

The generator refreshes repository-discovered structure while preserving human-reviewed evidence fields already present in the CSV. A newly generated status is never `COMPLETE`; completion requires human-reviewed API, authorization, accessibility, test, and evidence fields.

## Completion rule

A route can be marked `COMPLETE` only when it has real source-of-truth data, server-side authorization, complete operational states, mutation audit coverage, accessibility review, responsive verification, and automated journey evidence. Production mock fallbacks are prohibited.

The current status document is a planning snapshot, not a substitute for feature-matrix evidence. Percentages change only after repository verification and acceptance evidence are updated.
