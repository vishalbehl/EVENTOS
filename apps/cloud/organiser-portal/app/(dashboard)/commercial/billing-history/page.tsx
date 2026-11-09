import Link from "next/link";
import { BadgeIndianRupee, FileCheck2, FileClock, Landmark, ReceiptText, Scale } from "lucide-react";
import { CommercialPage } from "@/components/organizer/commercial/billing/shared";
import { Panel } from "@/components/organizer/workspace/OrganiserPrimitives";

const views = [
  { label: "Transactions", description: "Payment attempts, provider references and reconciliation state.", href: "/commercial/transactions", icon: BadgeIndianRupee },
  { label: "Receipts", description: "Paid invoice receipts and downloadable PDF records.", href: "/commercial/receipts", icon: ReceiptText },
  { label: "Credits", description: "Available, applied and expired organisation credits.", href: "/commercial/credits", icon: FileCheck2 },
  { label: "Tax & GST", description: "Billing identity, GST number, country and settlement currency.", href: "/commercial/tax", icon: Landmark },
  { label: "Contracts", description: "Immutable Workspace, Event, EMC and add-on contract history.", href: "/commercial/contracts", icon: Scale },
  { label: "Commercial history", description: "Effective-dated plan changes, cancellations and renewals.", href: "/commercial/history", icon: FileClock },
];

export default function Page() {
  return (
    <CommercialPage>
      <Panel title="History & tax" description="Open an authoritative financial, tax or contract record.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {views.map(({ label, description, href, icon: Icon }) => (
            <Link key={href} href={href} className="group flex min-h-32 items-start gap-4 rounded-[18px] border border-[var(--org-border)] bg-[var(--org-surface-soft)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--org-purple)]/40 hover:shadow-[var(--org-shadow)]">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--org-purple-soft)] text-[var(--org-purple)]"><Icon className="size-5" /></span>
              <span><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs leading-5 text-[var(--org-muted)]">{description}</span></span>
            </Link>
          ))}
        </div>
      </Panel>
    </CommercialPage>
  );
}
