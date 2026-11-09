import Link from "next/link";
import { ClipboardCheck, FileClock, KeyRound, Network, ShieldCheck } from "lucide-react";
import { AccessPage } from "@/components/organizer/workspace/access/shared";
import { Panel } from "@/components/organizer/workspace/OrganiserPrimitives";

const policies = [
  { label: "Capabilities", description: "Review entitlement-backed operational capabilities.", href: "/access-roles/capabilities", icon: KeyRound },
  { label: "Assignments", description: "Assign organisation and event-scoped roles.", href: "/access-roles/assignments", icon: Network },
  { label: "Permission Matrix", description: "Compare effective actions across bounded roles.", href: "/access-roles/permission-matrix", icon: ShieldCheck },
  { label: "Approval Rules", description: "Configure ordered approval chains for sensitive work.", href: "/access-roles/approval-rules", icon: ClipboardCheck },
  { label: "Access Audit", description: "Inspect role, permission and assignment changes.", href: "/access-roles/audit", icon: FileClock },
];

export default function Page() {
  return <AccessPage><Panel title="Access Policies" description="Manage the controls that govern roles and privileged actions."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{policies.map(({ label, description, href, icon: Icon }) => <Link key={href} href={href} className="rounded-[18px] border border-[var(--org-border)] bg-[var(--org-surface-soft)] p-5 transition-transform hover:-translate-y-0.5"><Icon className="size-5 text-[var(--org-purple)]" /><strong className="mt-6 block">{label}</strong><span className="mt-1 block text-sm leading-5 text-[var(--org-muted)]">{description}</span></Link>)}</div></Panel></AccessPage>;
}
