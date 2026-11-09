import type { ReactNode } from "react";

// Compatibility-only route group. All customer-facing billing experiences now
// live inside Commercial; child routes issue permanent in-app redirects.
export default function BillingCompatibilityLayout({ children }: { children: ReactNode }) {
  return children;
}
