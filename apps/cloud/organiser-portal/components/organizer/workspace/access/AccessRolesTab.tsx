"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Crown, MoreVertical, MonitorCog, Search, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiClient, apiGet, type ApiError } from "@/lib/api-client";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import { useAccessBootstrap } from "@/hooks/useAccessBootstrap";
import { AccessPage, type UserRole } from "./shared";
import { RoleParentEditor } from "./RoleParentEditor";

type Mode = "create" | "update" | "clone" | "archive";
type Page = { items: UserRole[]; next_cursor: string | null };

export function AccessRolesTab() {
  const userId = useAuthStore(state => state.user?.id);
  const userOrganizationId = useAuthStore(state => state.user?.organization_id);
  const context = useAuthStore(state => state.activeContext);
  const scopeKey = accessContextCacheKey(context, userOrganizationId);
  return <Roles key={`${userId}:${scopeKey}`} userId={userId} scopeKey={scopeKey} />;
}

function Roles({ userId, scopeKey }: { userId?: string; scopeKey: string }) {
  const client = useQueryClient();
  const bootstrap = useAccessBootstrap();
  const organizationId = bootstrap.data?.organization_id;
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleType, setRoleType] = useState<"ALL" | "SYSTEM" | "CUSTOM">("ALL");
  const [detailTab, setDetailTab] = useState<"permissions" | "members" | "settings">("permissions");
  const [debounced, setDebounced] = useState("");
  const [mode, setMode] = useState<Mode>("create");
  const [target, setTarget] = useState<UserRole | null>(null);
  const [parentRole, setParentRole] = useState<UserRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  const inFlight = useRef(false);
  const enabled = !!userId && bootstrap.isSuccess && !!organizationId;
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(search.trim()); setCursor(null); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const page = useQuery({ queryKey: ["access-role-page", userId, scopeKey, bootstrap.data?.policy_revision, cursor, debounced], enabled,
    staleTime: 0, retry: false, queryFn: ({ signal }) => apiGet<Page>("/rbac/roles/page",
      { signal, params: { after: cursor ?? undefined, search: debounced, limit: 50 } }) });
  const selectedPermissions = useQuery({
    queryKey: ["access-role-detail", userId, scopeKey, bootstrap.data?.policy_revision, selectedRole?.id],
    enabled: enabled && Boolean(selectedRole), staleTime: 0, retry: false,
    queryFn: ({ signal }) => apiGet<string[]>(`/rbac/roles/${selectedRole!.id}/permissions`, { signal }),
  });
  const canManage = !bootstrap.isError && !bootstrap.isFetching && bootstrap.data?.actions.includes("roles:manage");
  const error = problem ?? page.error as ApiError | null ?? bootstrap.error as ApiError | null;
  useEffect(() => { if (error?.retryAfter) setRetryAt(Date.now() + error.retryAfter * 1000); }, [error?.retryAfter]);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    if (!retryAt) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const loading = page.isFetching || bootstrap.isFetching;
  const visibleRoles = useMemo(() => (page.data?.items ?? []).filter(role =>
    roleType === "ALL" || (roleType === "SYSTEM" ? role.is_system_role : !role.is_system_role)
  ), [page.data?.items, roleType]);
  useEffect(() => {
    if (!selectedRole && visibleRoles.length) setSelectedRole(visibleRoles[0]);
    if (selectedRole && !visibleRoles.some(role => role.id === selectedRole.id)) setSelectedRole(visibleRoles[0] ?? null);
  }, [selectedRole, visibleRoles]);
  const permissionGroups = useMemo(() => (selectedPermissions.data ?? []).reduce<Record<string, string[]>>((groups, permission) => {
    const category = permission.includes(":") ? permission.split(":", 1)[0] : "GENERAL";
    (groups[category] ??= []).push(permission);
    return groups;
  }, {}), [selectedPermissions.data]);

  function begin(nextMode: Mode, role?: UserRole) {
    setMode(nextMode); setTarget(role ?? null);
    setName(nextMode === "clone" ? `${role?.name ?? ""} copy` : role?.name ?? "");
    setDescription(role?.description ?? ""); setReason(""); setProblem(null); setNotice("");
    receipt.current = null; setOpen(true);
  }

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["access-role-page", userId, scopeKey] }),
      client.invalidateQueries({ queryKey: ["access-summary", userId, scopeKey] }),
      client.invalidateQueries({ queryKey: ["access-bootstrap", userId] }),
      client.invalidateQueries({ queryKey: ["access-role-grants", userId, scopeKey] }),
      client.invalidateQueries({ queryKey: ["access-role-parents", userId, scopeKey] }),
      client.invalidateQueries({ queryKey: ["user-roles"] }),
      client.invalidateQueries({ queryKey: ["user-roles-directory"] }),
      client.invalidateQueries({ queryKey: ["me", "permissions"] }),
    ]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || inFlight.current || loading || !canManage || seconds || reason.trim().length < 3 ||
        (mode !== "archive" && (!name.trim() || name.trim().length > 100))) return;
    if (mode !== "create" && !target) return;
    const payload = mode === "archive" ? { reason: reason.trim() } :
      { name: name.trim(), description: description.trim() || null, reason: reason.trim(),
        ...(mode === "create" ? { is_system_role: false } : {}) };
    const signature = JSON.stringify({ mode, id: target?.id, version: target?.version, payload });
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    const headers = { "Idempotency-Key": receipt.current.key,
      ...(mode !== "create" ? { "If-Match": String(target!.version) } : {}) };
    inFlight.current = true; setBusy(true); setProblem(null);
    try {
      if (mode === "create") await apiClient.post("/rbac/roles", payload, { headers });
      else if (mode === "update") await apiClient.patch(`/rbac/roles/${target!.id}`, payload, { headers });
      else if (mode === "clone") await apiClient.post(`/rbac/roles/${target!.id}/clone`, payload, { headers });
      else await apiClient.delete(`/rbac/roles/${target!.id}`, { headers, data: payload });
      setOpen(false); receipt.current = null;
      setNotice(mode === "archive" ? "Role archived." : mode === "clone" ? "Role cloned. Review its permissions before assigning it." : "Role saved.");
      await refresh();
    } catch (value) {
      const failure = value as ApiError; setProblem(failure);
      if ([401, 403, 404, 409, 412].includes(failure.status ?? 0)) await refresh();
    } finally { inFlight.current = false; setBusy(false); }
  }

  const failureMessage = <>{error && <p role="alert" className="text-sm">{error.message}{error.correlationId ? ` Reference: ${error.correlationId}` : ""}</p>}
    {seconds > 0 && <p role="status">Try again in {seconds} seconds. Your form has been kept.</p>}</>;
  return <AccessPage>
    <div className="grid min-h-[560px] gap-4 xl:grid-cols-[minmax(0,1.38fr)_minmax(340px,.72fr)]">
      <section className="op-panel overflow-hidden" aria-label="Roles">
        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center">
          <h2 className="mr-auto text-lg font-semibold text-[var(--text-primary)]">Roles</h2>
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 sm:max-w-[260px]">
            <Search className="size-4 text-[var(--text-tertiary)]" aria-hidden />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search roles…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <select aria-label="Role type" value={roleType} onChange={event => setRoleType(event.target.value as typeof roleType)} className="h-10 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 text-sm outline-none">
            <option value="ALL">All roles</option><option value="SYSTEM">System roles</option><option value="CUSTOM">Custom roles</option>
          </select>
          <Button className="rounded-full px-5" disabled={!canManage || busy || loading || seconds > 0} onClick={() => begin("create")}>+ Create role</Button>
        </div>
        {!open && error ? <div className="px-4 pt-3 text-sm text-[var(--danger)]">{failureMessage}</div> : null}
        {notice ? <p className="px-4 pt-3 text-sm text-[var(--success)]" role="status">{notice}</p> : null}
        <div className="overflow-x-auto px-4 pb-2 pt-3">
          <table className="w-full min-w-[620px] border-collapse text-left text-sm">
            <thead><tr className="border-b border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)]"><th className="px-3 py-3">Role name</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Members</th><th className="px-3 py-3">Status</th><th className="w-12 px-3 py-3" /></tr></thead>
            <tbody>{visibleRoles.map(role => {
              const selected = selectedRole?.id === role.id;
              return <tr key={role.id} onClick={() => setSelectedRole(role)} className={`cursor-pointer border-b border-[var(--border-subtle)] transition ${selected ? "bg-[var(--org-purple-soft)]" : "hover:bg-[var(--bg-surface-hover)]"}`}>
                <td className="px-3 py-3"><span className="flex items-center gap-3 font-medium text-[var(--text-primary)]">{role.name === "Event Organizer" ? <Crown className="size-4" /> : role.name.includes("Session") ? <MonitorCog className="size-4" /> : <UserRound className="size-4" />}{role.name}</span></td>
                <td className="px-3 py-3"><span className={`rounded-full px-3 py-1 text-xs font-medium ${role.is_system_role ? "bg-[var(--org-purple-soft)] text-[var(--org-purple)]" : "bg-[var(--info-muted)] text-[var(--info)]"}`}>{role.is_system_role ? "System" : "Custom"}</span></td>
                <td className="px-3 py-3">{role.users_count ?? 0}</td>
                <td className="px-3 py-3"><span className="inline-flex items-center gap-2 rounded-full bg-[var(--status-success-muted)] px-3 py-1 text-xs text-[var(--status-success)]"><span className="size-1.5 rounded-full bg-current" />Active</span></td>
                <td className="px-3 py-3" onClick={event => event.stopPropagation()}><details className="relative"><summary className="grid size-8 cursor-pointer list-none place-items-center rounded-full hover:bg-[var(--bg-surface-hover)]"><MoreVertical className="size-4" /></summary><div className="absolute right-0 top-9 z-30 w-44 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 shadow-xl">
                  <button className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-[var(--bg-surface-hover)]" disabled={role.is_system_role || !canManage} onClick={() => begin("update", role)}>Edit role</button>
                  <button className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-[var(--bg-surface-hover)]" disabled={role.is_system_role || !canManage} onClick={() => setParentRole(role)}>Inherited roles</button>
                  <button className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-[var(--bg-surface-hover)]" disabled={!canManage} onClick={() => begin("clone", role)}>Clone role</button>
                  <button className="w-full rounded-xl px-3 py-2 text-left text-xs text-[var(--danger)] hover:bg-[var(--danger-muted)]" disabled={role.is_system_role || !canManage || !!role.users_count} onClick={() => begin("archive", role)}>Archive role</button>
                </div></details></td>
              </tr>;
            })}</tbody>
          </table>
          {!visibleRoles.length ? <p className="py-16 text-center text-sm text-[var(--text-secondary)]">{loading ? "Loading roles…" : page.isError ? "Roles are unavailable." : "No roles match this filter."}</p> : null}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)]"><span>{visibleRoles.length} roles on this page</span><div className="flex gap-2">{cursor ? <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCursor(null)}>First</Button> : null}{page.data?.next_cursor ? <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCursor(page.data!.next_cursor)}>Next</Button> : null}</div></div>
      </section>
      <section className="op-panel p-4" aria-label="Role details">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Role Details</h2>{selectedRole && !selectedRole.is_system_role ? <Button size="sm" variant="outline" className="rounded-full" disabled={!canManage} onClick={() => begin("update", selectedRole)}>Edit role</Button> : null}</div>
        {!selectedRole ? <p className="py-16 text-center text-sm text-[var(--text-secondary)]">Select a role to inspect it.</p> : <>
          <div className="mt-4 flex gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--org-purple-soft)] text-[var(--org-purple)]"><ShieldCheck /></span><div><div className="flex flex-wrap items-center gap-2"><strong>{selectedRole.name}</strong><span className="rounded-full bg-[var(--info-muted)] px-2 py-1 text-[10px] font-medium text-[var(--info)]">{selectedRole.is_system_role ? "System role" : "Custom role"}</span></div><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{selectedRole.description || "No role description has been provided."}</p></div></div>
          <div className="mt-5 grid grid-cols-3 gap-2">{(["permissions", "members", "settings"] as const).map(tab => <button key={tab} onClick={() => setDetailTab(tab)} className={`rounded-full px-3 py-2 text-xs font-medium capitalize ${detailTab === tab ? "bg-[var(--text-primary)] text-[var(--bg-surface)]" : "border border-[var(--border-default)]"}`}>{tab === "members" ? `Assigned (${selectedRole.users_count ?? 0})` : tab}</button>)}</div>
          {detailTab === "permissions" ? <div className="mt-4 space-y-2">{selectedPermissions.isLoading ? <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Loading permissions…</p> : selectedPermissions.isError ? <p className="py-8 text-center text-sm text-[var(--danger)]">Permissions are unavailable.</p> : Object.entries(permissionGroups).map(([category, permissions], index) => <details key={category} open={index === 0} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium"><span>{category.replaceAll("_", " ")}</span><span className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">{permissions.length} / {permissions.length}<ChevronDown className="size-4" /></span></summary><div className="space-y-2 border-t border-[var(--border-subtle)] px-4 py-3">{permissions.map(permission => <div key={permission} className="flex items-center gap-2 text-xs"><span className="grid size-4 place-items-center rounded bg-[var(--org-purple)] text-[10px] text-white">✓</span>{permission.split(":").at(-1)?.replaceAll("_", " ")}</div>)}</div></details>)}</div> : null}
          {detailTab === "members" ? <div className="mt-4 rounded-2xl border border-[var(--border-default)] p-5 text-sm text-[var(--text-secondary)]">{selectedRole.users_count ?? 0} accepted members currently hold this role. Open Assignments in Access Policies to manage scoped assignments.</div> : null}
          {detailTab === "settings" ? <div className="mt-4 space-y-3 rounded-2xl border border-[var(--border-default)] p-5 text-sm"><div className="flex justify-between"><span>Role type</span><strong>{selectedRole.is_system_role ? "Protected system role" : "Organisation custom role"}</strong></div><div className="flex justify-between"><span>Version</span><strong>{selectedRole.version}</strong></div><Button variant="outline" className="w-full rounded-full" onClick={() => setParentRole(selectedRole)}>Review inheritance</Button></div> : null}
        </>}
      </section>
    </div>
    {parentRole && <RoleParentEditor key={parentRole.id} role={parentRole} userId={userId} organizationId={organizationId} canManage={!!canManage}
      close={() => setParentRole(null)} saved={refresh} />}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-w-md">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader><DialogTitle>{mode === "create" ? "Create role" : mode === "update" ? "Edit role" : mode === "clone" ? "Clone role" : "Archive role"}</DialogTitle>
            <DialogDescription>{mode === "archive" ? `Archive ${target?.name}? Assigned roles and inherited parent roles cannot be archived.` :
              "This role belongs to the current organisation. System templates remain protected."}</DialogDescription></DialogHeader>
          {mode !== "archive" && <>
            <label className="block text-sm">Role name<Input value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)} /></label>
            <label className="block text-sm">Description<textarea className="op-input mt-2 min-h-24 w-full" value={description} maxLength={2000} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
          </>}
          <label className="block text-sm">Reason<Input value={reason} maxLength={500} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
          {failureMessage}
          {error?.status === 412 && <p className="text-sm">Current saved role: {page.data?.items.find(role => role.id === target?.id)?.name ?? "Not on this page"}. Review it before applying your retained changes.</p>}
          {error?.status === 412 && <Button type="button" variant="outline" disabled={busy || loading} onClick={() => {
            const fresh = page.data?.items.find(role => role.id === target?.id);
            if (fresh) { setTarget(fresh); setProblem(null); receipt.current = null; }
          }}>Review current version</Button>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || loading || !canManage || seconds > 0 || reason.trim().length < 3 ||
              (mode !== "archive" && !name.trim()) || error?.status === 412}>{busy ? "Saving…" : mode === "archive" ? "Archive role" : "Save role"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </AccessPage>;
}
