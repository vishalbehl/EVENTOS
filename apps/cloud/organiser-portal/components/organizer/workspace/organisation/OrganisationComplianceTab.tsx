"use client";

import Link from "next/link";
import { Award, ChevronRight, FileCheck2, Files, ShieldCheck } from "lucide-react";
import { OrganisationPage } from "./shared";

const complianceAreas = [
  {
    title: "Terms & conditions",
    description: "Upload organisation-specific terms and contractual documents.",
    href: "/organisation/documents?type=LEGAL",
    icon: FileCheck2,
  },
  {
    title: "Privacy policy",
    description: "Maintain policies used for registration and participant data.",
    href: "/organisation/documents?type=PRIVACY",
    icon: ShieldCheck,
  },
  {
    title: "Data compliance",
    description: "Review retention, consent, and handling documentation.",
    href: "/organisation/documents?type=COMPLIANCE",
    icon: Files,
  },
  {
    title: "Certificates & verifications",
    description: "Store registrations, certificates, tax, and legal evidence.",
    href: "/organisation/documents",
    icon: Award,
  },
];

export function OrganisationComplianceTab() {
  return (
    <OrganisationPage>
      <section className="op-panel organisation-compliance-surface" aria-labelledby="compliance-heading">
        <div className="op-panel-header px-5 py-4">
          <div>
            <h2 id="compliance-heading">Compliance & legal</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Manage legal, privacy, and compliance information for your organisation.</p>
          </div>
        </div>
        <div className="organisation-preference-grid p-5">
          {complianceAreas.map(({ title, description, href, icon: Icon }) => (
            <Link key={title} href={href} className="organisation-preference-card">
              <span className="organisation-preference-icon"><Icon /></span>
              <span className="min-w-0 flex-1"><strong>{title}</strong><small>{description}</small></span>
              <ChevronRight className="size-4 shrink-0" aria-hidden />
            </Link>
          ))}
        </div>
      </section>
    </OrganisationPage>
  );
}
