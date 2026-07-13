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

Regenerate the route inventory from repository truth:

```powershell
python governance/command-center/generate_inventory.py
python governance/command-center/generate_inventory.py --check
```

The CSV is intentionally conservative. A generated status is never `COMPLETE`; completion requires human-reviewed API, authorization, accessibility, test, and evidence fields.

## Completion rule

A route can be marked `COMPLETE` only when it has real source-of-truth data, server-side authorization, complete operational states, mutation audit coverage, accessibility review, responsive verification, and automated journey evidence. Production mock fallbacks are prohibited.
