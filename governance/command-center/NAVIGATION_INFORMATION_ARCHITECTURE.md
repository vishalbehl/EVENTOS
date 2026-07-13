# Navigation and Information Architecture

## Canonical primary navigation

1. Dashboard
2. Organizations
3. Business: Sales, Pricing, CRM, Subscriptions and Revenue
4. Finance
5. Operations Center
6. Identity and Security
7. Developer Platform
8. AI Workspace
9. Support and Communications
10. Applications
11. Platform Settings
12. Builder and Marketplace

## Route rules

- Collection routes own search, filters, pagination, bulk actions and creation entry points.
- Detail routes own lifecycle, activity, related resources, audit history and contextual mutations.
- Refunds, credit notes, entitlements, CRM, workflows, communications and mobile management receive distinct routes; they must not masquerade as another page through a duplicate sidebar link.
- Existing `/super-admin` links remain valid. When a capability moves into the dashboard hierarchy, the old path uses a documented redirect and preserves deep links.
- Pages not ready for production are removed from production navigation behind a release flag; they do not display fake operational data.

## Navigation acceptance

Each route must have a unique label, visible active state, breadcrumb trail, keyboard access, permission-aware visibility, direct-link authorization, mobile behavior, and a destination represented in the feature matrix.
