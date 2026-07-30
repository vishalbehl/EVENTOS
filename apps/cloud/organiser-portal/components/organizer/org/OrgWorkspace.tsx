"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BadgeCheck, Building2, CalendarPlus, Check, ChevronRight, ExternalLink, Loader2,
  Mail, Palette, PartyPopper, Plus, Save, Shield, Trash2, UserPlus, CreditCard,
  Info, Coins, Percent, Receipt, Sliders, Sparkles, CheckCircle2, ArrowLeft, X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlansAddonsManagement } from "@/components/organizer/billing/PlansAddonsManagement";
import { countries, Organization, OrgMember, orgApi, OrgMe, OrgRole, timezones, usageTone, slugify } from "@/components/organizer/org/org-api";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { cn } from "@/lib/utils";
import { useOrganizationLimitAccess } from "@/lib/capabilities";

export { OnboardingWizard } from "@/components/organizer/onboarding/OnboardingWizard";

export function OrgSettingsPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<OrgMe | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", org_role: "member" as OrgRole });
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const user = useAuthStore((state) => state.user);
  const userLimitAccess = useOrganizationLimitAccess("max_users");

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const load = async () => {
    const [org, memberList] = await Promise.all([orgApi.me(), orgApi.members()]);
    setData(org);
    setMembers(memberList);
  };

  useEffect(() => { load(); }, []);
  if (!data) return <LoadingSurface />;

  const org = data.organization;
  const save = async (patch: Partial<OrgMe["organization"]>) => {
    const result = await orgApi.updateMe(patch);
    setData({ ...data, organization: result.organization });
    toast.success("Organisation updated.");
  };

  const sendInvite = async () => {
    await orgApi.invite(invite.email, invite.org_role);
    toast.success(`Invitation sent to ${invite.email}`);
    setInviteOpen(false);
    setInvite({ email: "", org_role: "member" });
    load();
  };

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-full">
        <div className="flex items-center justify-between gap-4">
          <PageTitle icon={Building2} title="Organisation Settings" subtitle={`${org.name} Â· ${org.slug}`} />
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="profile"><ProfileTab org={org} onSave={save} /></TabsContent>
        <TabsContent value="branding"><BrandingTab org={org} onSave={save} /></TabsContent>
        <TabsContent value="team">
          <TeamTab members={members} currentUserId={user?.id} data={data} onInvite={() => setInviteOpen(true)} onChanged={load} />
        </TabsContent>
      </Tabs>
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="border-default bg-[var(--surf)] text-[var(--text)]">
          <DialogHeader><DialogTitle>Invite Member</DialogTitle></DialogHeader>
          <Input placeholder="name@company.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" />
          <RoleSelect value={invite.org_role} onChange={(org_role) => setInvite({ ...invite, org_role })} />
          <Button
            onClick={sendInvite}
            disabled={userLimitAccess.loading || !userLimitAccess.enabled}
            title={
              userLimitAccess.enabled
                ? undefined
                : `Unavailable: ${(userLimitAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}`
            }
            className="h-12 rounded-xl bg-[var(--pri)]"
          >
            Send Invitation
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="border-default bg-[var(--surf)] text-[var(--text)]">
          <DialogHeader><DialogTitle>Upgrade Plan</DialogTitle></DialogHeader>
          <p className="text-sm text-muted">Contact us at hello@Event.in to upgrade your workspace plan.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PlatformAdminPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAuth = useAuthStore((state) => state.setAuth);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<any | null>(null);
  const [edit, setEdit] = useState<Organization | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (user && !user.is_platform_admin && user.role !== "super_admin") router.replace("/dashboard");
  }, [router, user]);

  const load = async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filter === "suspended") params.set("is_active", "false");
    const result = await orgApi.platformOrgs(`?${params.toString()}`);
    setOrgs(result.items);
  };

  useEffect(() => { if (user?.is_platform_admin || user?.role === "super_admin") load(); }, [filter, search, user]);

  const stats = useMemo(() => ({
    total: orgs.length,
    active: orgs.filter((o) => o.is_active).length,
    events: orgs.reduce((sum, o) => sum + (o.event_count || 0), 0),
    members: orgs.reduce((sum, o) => sum + (o.member_count || 0), 0),
    files: 0,
    storage: orgs.reduce((sum, o) => sum + (o.storage_used_gb || 0), 0),
  }), [orgs]);

  const impersonate = async (org: Organization) => {
    if (!accessToken || !user) return;
    localStorage.setItem("eventos_original_token", accessToken);
    localStorage.setItem("eventos_impersonating_org", org.name);
    const result = await orgApi.impersonate(org.id);
    setAuth(user, result.access_token);
    window.location.reload();
  };

  return (
    <Tabs defaultValue="orgs">
      <div className="flex items-center justify-between gap-4">
        <PageTitle icon={Shield} title="Platform Admin" subtitle="Operate organisations, plans, limits, and impersonation." />
        <TabsList><TabsTrigger value="orgs">Organisations</TabsTrigger><TabsTrigger value="stats">Platform Stats</TabsTrigger></TabsList>
      </div>
      <TabsContent value="orgs" className="space-y-5">
        <div className="flex flex-wrap gap-3">
          <Input placeholder="Search name, slug, email" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 max-w-sm rounded-xl bg-white/5 border-default" />
          {["all", "trial", "starter", "pro", "enterprise", "suspended"].map((item) => <Button key={item} variant={filter === item ? "primary" : "outline"} onClick={() => setFilter(item)} className="h-11 rounded-xl border-default capitalize">{item}</Button>)}
        </div>
        <div className="overflow-hidden rounded-2xl border border-default">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-widest text-muted"><tr><th className="p-4 text-left">Organisation</th><th>Plan</th><th>Events</th><th>Members</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-t border-default">
                  <td className="p-4"><div className="font-black">{org.name}</div><div className="text-xs text-muted">{org.slug}</div></td>
                  <td><span className="text-xs text-muted">Managed in Command Center</span></td>
                  <td>{org.event_count || 0}</td>
                  <td>{org.member_count || 0}</td>
                  <td><Badge className={org.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-[var(--dan)]/20 text-[var(--dan)]"}>{org.is_active ? "Active" : "Suspended"}</Badge></td>
                  <td>{formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}</td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={async () => setSelected(await orgApi.platformOrg(org.id))} className="rounded-xl border-default">Details</Button>
                      <Button size="sm" onClick={() => impersonate(org)} className="rounded-xl bg-[var(--pri)]">Impersonate</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>
      <TabsContent value="stats"><div className="grid gap-4 md:grid-cols-3">{[
        ["Total Organisations", stats.total], ["Active This Month", stats.active], ["Total Events", stats.events],
        ["Total Participants", stats.members], ["Total Files Processed", stats.files], ["Storage Used", `${stats.storage.toFixed(1)} GB`],
      ].map(([label, value]) => <Metric key={label} label={String(label)} value={String(value)} />)}</div></TabsContent>
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-3xl border-default bg-[var(--surf)] text-[var(--text)]">
          <DialogHeader><DialogTitle>{selected?.organization?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <InfoBlock title="Members" items={(selected?.members || []).map((m: OrgMember) => `${m.name} Â· ${m.org_role}`)} />
            <InfoBlock title="Events" items={(selected?.events || []).map((e: any) => `${e.name} Â· ${e.start_date}`)} />
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!edit} onOpenChange={() => setEdit(null)}>
        <DialogContent className="border-default bg-[var(--surf)] text-[var(--text)]">
          <DialogHeader><DialogTitle>Change Plan</DialogTitle></DialogHeader>
          {edit && <PlatformEdit org={edit} reason={reason} setReason={setReason} onSaved={() => { setEdit(null); load(); }} />}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

function ProfileTab({ org, onSave }: { org: OrgMe["organization"]; onSave: (patch: Partial<OrgMe["organization"]>) => void }) {
  const [form, setForm] = useState(org);
  return <FormGrid><Field label="Organisation Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" /></Field><Field label="Slug"><Input value={form.slug} readOnly className="h-12 rounded-xl bg-white/5 border-default opacity-70" /><p className="text-xs text-muted mt-2">Contact support to change</p></Field><Field label="Billing Email"><Input value={form.billing_email || ""} onChange={(e) => setForm({ ...form, billing_email: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" /></Field><Field label="Country"><Select value={form.country} onValueChange={(country) => setForm({ ...form, country })}><SelectTrigger className="h-12 rounded-xl bg-white/5 border-default"><SelectValue /></SelectTrigger><SelectContent>{countries.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></Field><Field label="Timezone"><Select value={form.timezone} onValueChange={(timezone) => setForm({ ...form, timezone })}><SelectTrigger className="h-12 rounded-xl bg-white/5 border-default"><SelectValue /></SelectTrigger><SelectContent>{timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent></Select></Field><Button onClick={() => onSave(form)} className="h-12 rounded-xl bg-[var(--pri)]"><Save className="mr-2 h-4 w-4" />Save Changes</Button></FormGrid>;
}

function BrandingTab({ org, onSave }: { org: OrgMe["organization"]; onSave: (patch: Partial<OrgMe["organization"]>) => void }) {
  const [brand, setBrand] = useState({ logo_url: org.logo_url || "", primary_color: org.primary_color, secondary_color: org.secondary_color });
  return <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><FormGrid><BrandFields brand={brand} setBrand={setBrand} /><Button onClick={() => onSave(brand as Partial<OrgMe["organization"]>)} className="h-12 rounded-xl bg-[var(--pri)]">Save Branding</Button></FormGrid><div className="rounded-2xl border border-default bg-white/[0.04] p-5"><div className="rounded-xl p-4" style={{ border: `1px solid ${brand.primary_color}` }}><div className="mb-4 h-10 w-10 rounded-xl" style={{ background: brand.primary_color }} /><h3 className="font-black">Live Preview</h3><p className="text-sm text-muted">Conference operations card</p><button className="mt-5 rounded-full px-4 py-2 text-xs font-black text-white" style={{ background: brand.primary_color }}>Primary Action</button><span className="ml-3 rounded-full px-3 py-2 text-xs font-black text-white" style={{ background: brand.secondary_color }}>Badge</span></div></div></div>;
}

function TeamTab({ members, currentUserId, data, onInvite, onChanged }: { members: OrgMember[]; currentUserId?: string; data: OrgMe; onInvite: () => void; onChanged: () => void }) {
  const remove = async (id: string) => { await orgApi.removeMember(id); onChanged(); };
  const used = members.filter((m) => m.is_active).length;
  const memberLimit = data.plan_limits.users;
  return <div className="space-y-5"><div className="flex items-center justify-between"><h3 className="text-xl font-black">{used} members</h3><Button disabled={memberLimit == null} onClick={onInvite} className="rounded-xl bg-[var(--pri)]"><Plus className="mr-2 h-4 w-4" />Invite Member</Button></div><div className="overflow-hidden rounded-2xl border border-default"><table className="w-full text-sm"><tbody>{members.map((m) => <tr key={m.id} className={cn("border-b border-default last:border-0", m.user_id === currentUserId && "bg-[var(--pri)]/10")}><td className="p-4 font-black">{m.name} {m.user_id === currentUserId && <Badge className="ml-2 bg-[var(--pri)]/20 text-[var(--pri)]">(you)</Badge>}</td><td>{m.email}</td><td className="capitalize">{m.org_role}</td><td><Badge className={m.accepted_at ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}>{m.accepted_at ? "Active" : "Pending"}</Badge></td><td>{m.accepted_at ? formatDistanceToNow(new Date(m.accepted_at), { addSuffix: true }) : "-"}</td><td className="p-4 text-right">{m.user_id !== currentUserId && data.org_role === "owner" && <Button size="sm" variant="outline" onClick={() => remove(m.id)} className="rounded-xl border-default text-[var(--dan)]"><Trash2 className="h-4 w-4" /></Button>}</td></tr>)}</tbody></table></div>{memberLimit == null ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">Team allowance is unavailable. Invites are disabled until capability resolution recovers.</div> : <UsageBar label={`${used} / ${memberLimit} team members`} value={used} max={memberLimit} />}</div>;
}

function PlanUsageTab({ data, onRefresh }: { data: OrgMe; onRefresh: () => void }) {
  return <PlansAddonsManagement />;
}

function PlatformEdit({ org, reason, setReason, onSaved }: { org: Organization; reason: string; setReason: (value: string) => void; onSaved: () => void }) {
  return <div className="space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5"><h3 className="font-black">Commercial controls are unavailable in Organizer Portal</h3><p className="text-sm text-muted">Plan assignments, event limits, suspensions, grants, resets, and their authoritative values are governed and audited exclusively in Command Center.</p></div>;
}

function BrandFields({ brand, setBrand }: { brand: { logo_url: string; primary_color: string; secondary_color: string }; setBrand: (value: { logo_url: string; primary_color: string; secondary_color: string }) => void }) {
  return <div className="grid gap-4 md:grid-cols-2"><Field label="Logo URL"><Input value={brand.logo_url} onChange={(e) => setBrand({ ...brand, logo_url: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" /></Field><Field label="Primary Colour"><ColorInput value={brand.primary_color} onChange={(primary_color) => setBrand({ ...brand, primary_color })} /></Field><Field label="Secondary Colour"><ColorInput value={brand.secondary_color} onChange={(secondary_color) => setBrand({ ...brand, secondary_color })} /></Field></div>;
}

function ColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="flex gap-2"><Input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-14 rounded-xl bg-white/5 border-default p-1" /><Input value={value} onChange={(e) => onChange(e.target.value)} className="h-12 rounded-xl bg-white/5 border-default" /></div>;
}

function RoleSelect({ value, onChange }: { value: OrgRole; onChange: (value: OrgRole) => void }) {
  return <Select value={value} onValueChange={(value) => onChange(value as OrgRole)}><SelectTrigger className="h-12 rounded-xl bg-white/5 border-default"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="member">Member</SelectItem><SelectItem value="billing_only">Billing Only</SelectItem></SelectContent></Select>;
}

function PageTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return <div className="flex items-center gap-3"><div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center"><Icon className="h-5 w-5" /></div><div><h1 className="text-2xl font-black tracking-tighter">{title}</h1><p className="text-sm text-muted">{subtitle}</p></div></div>;
}

function Stack({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return <div className="space-y-6"><PageTitle icon={Icon} title={title} subtitle="Complete this step to shape the workspace." />{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-muted">{label}</span>{children}</label>;
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 md:grid-cols-2 max-w-4xl">{children}</div>;
}

function PlanBadge({ plan }: { plan: string }) {
  const color = plan === "enterprise" ? "bg-fuchsia-500/20 text-fuchsia-300" : plan === "pro" ? "bg-[var(--pri)]/20 text-[var(--pri)]" : plan === "starter" ? "bg-cyan-500/20 text-cyan-300" : "bg-amber-500/20 text-amber-300";
  return <Badge className={cn("capitalize", color)}>{plan}</Badge>;
}

function UsageBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, max ? (value / max) * 100 : 0);
  return <div className="space-y-2"><div className="flex justify-between text-xs font-black uppercase tracking-widest text-muted"><span>{label}</span><span>{Math.round(pct)}%</span></div><div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className={cn("h-full rounded-full", usageTone(value, max))} style={{ width: `${pct}%` }} /></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-default bg-white/[0.04] p-5"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{label}</p><p className="mt-3 text-3xl font-black tracking-tighter">{value}</p></div>;
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-2xl border border-default p-4"><h3 className="mb-3 font-black">{title}</h3>{items.length ? items.map((item) => <p key={item} className="border-t border-default py-2 text-sm text-muted">{item}</p>) : <p className="text-sm text-muted">No records</p>}</div>;
}

function LoadingSurface() {
  return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--pri)]" /></div>;
}
