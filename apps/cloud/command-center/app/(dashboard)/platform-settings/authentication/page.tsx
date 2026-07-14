"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function PlatformAuthenticationSettingsPage() {
  return <UnavailableRouteState title="Authentication Policies" description="Manage enforced MFA, session, lockout, network, recovery, and privileged-assurance policies." breadcrumb={["Console", "Settings", "Authentication"]} removed={["Security policy toggles that were stored but not consumed by authentication or middleware enforcement paths.", "An IP allowlist setting without request-path enforcement or safe lockout recovery.", "High-risk security-policy mutation without step-up, reason, versioning, rollback, or audit evidence."]} required={["A canonical policy service consumed by login, token refresh, session, MFA, and privileged-action enforcement.", "Step-up authentication and protected break-glass recovery for policy changes.", "Validated network policy with proxy-aware client IP handling, preview, canary, and rollback.", "End-to-end tests proving each policy affects access and cannot lock out all authorized administrators."]} note="Privileged MFA must remain enforced directly in the authentication architecture; a persisted UI toggle alone is not evidence of enforcement." />;
}
