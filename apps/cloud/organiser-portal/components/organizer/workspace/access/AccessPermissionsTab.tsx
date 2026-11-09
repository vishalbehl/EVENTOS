"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPut, type ApiError } from "@/lib/api-client";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import { useAccessBootstrap } from "@/hooks/useAccessBootstrap";
import { DataTable, Panel } from "../OrganiserPrimitives";
import { AccessPage, type Permission, type UserRole } from "./shared";

type RolePage = { items: UserRole[]; next_cursor: string | null };
type PermissionPage = { items: Permission[]; next_cursor: string | null };
type Change = { code: string; allowed: boolean; version: number };
type Result = { role_id: string; permission_code: string; allowed: boolean; version: number; policy_revision: number };

export function AccessPermissionsTab() {
  const userId = useAuthStore(state => state.user?.id);
  const userOrganizationId = useAuthStore(state => state.user?.organization_id);
  const context = useAuthStore(state => state.activeContext);
  const scopeKey = accessContextCacheKey(context, userOrganizationId);
  return <Matrix key={`${userId}:${scopeKey}`} userId={userId} scopeKey={scopeKey} />;
}

function Matrix({ userId, scopeKey }: { userId?: string; scopeKey: string }) {
  const client = useQueryClient();
  const bootstrap = useAccessBootstrap();
  const [roleCursor, setRoleCursor] = useState<string | null>(null);
  const [permissionCursor, setPermissionCursor] = useState<string | null>(null);
  const [roleId, setRoleId] = useState("");
  const [change, setChange] = useState<Change | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const inFlight = useRef(false);
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  const enabled = !!userId && bootstrap.isSuccess;
  const roles = useQuery({ queryKey: ["access-role-page", userId, scopeKey, bootstrap.data?.policy_revision, roleCursor], enabled,
    staleTime: 0, retry: false, queryFn: ({ signal }) => apiGet<RolePage>("/rbac/roles/page",
      { signal, params: { after: roleCursor ?? undefined, limit: 50 } }) });
  const permissions = useQuery({ queryKey: ["access-permission-page", userId, scopeKey, bootstrap.data?.policy_revision, permissionCursor], enabled,
    staleTime: 0, retry: false, queryFn: ({ signal }) => apiGet<PermissionPage>("/rbac/permissions/page",
      { signal, params: { after: permissionCursor ?? undefined, limit: 50 } }) });
  const granted = useQuery({ queryKey: ["access-role-grants", userId, scopeKey, bootstrap.data?.policy_revision, roleId], enabled: enabled && !!roleId,
    staleTime: 0, retry: false, queryFn: ({ signal }) => apiGet<string[]>(`/rbac/roles/${roleId}/permissions`, { signal }) });
  const role = roles.data?.items.find(item => item.id === roleId);
  const allows = useMemo(() => new Set(granted.data ?? []), [granted.data]);
  const error = problem ?? roles.error as ApiError | null ?? permissions.error as ApiError | null
    ?? granted.error as ApiError | null ?? bootstrap.error as ApiError | null;
  const loading = roles.isFetching || permissions.isFetching || granted.isFetching || bootstrap.isFetching;
  const canManage = !bootstrap.isError && !bootstrap.isFetching && bootstrap.data?.actions.includes("roles:manage");
  useEffect(() => { if (error?.retryAfter) setRetryAt(Date.now() + error.retryAfter * 1000); }, [error?.retryAfter]);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    if (!retryAt) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["access-role-page", userId, scopeKey] }),
      client.invalidateQueries({ queryKey: ["access-role-grants", userId, scopeKey] }),
      client.invalidateQueries({ queryKey: ["access-bootstrap", userId] }),
      client.invalidateQueries({ queryKey: ["access-summary", userId, scopeKey] }),
      client.invalidateQueries({ queryKey: ["permissions"] }),
      client.invalidateQueries({ queryKey: ["user-roles"] }),
      client.invalidateQueries({ queryKey: ["user-roles-directory"] }),
      client.invalidateQueries({ queryKey: ["me", "permissions"] }),
    ]);
  }

  async function save() {
    if (!change || !role || !canManage || busy || loading || seconds || inFlight.current || reason.trim().length < 3) return;
    const payload = { allowed: change.allowed, reason: reason.trim() };
    const signature = JSON.stringify({ roleId, ...change, ...payload });
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setProblem(null); setNotice("");
    try {
      await apiPut<Result>(`/rbac/roles/${roleId}/permissions/${encodeURIComponent(change.code)}`, payload,
        { headers: { "If-Match": String(change.version), "Idempotency-Key": receipt.current.key } });
      setChange(null); setReason(""); receipt.current = null;
      setNotice("Direct permission saved. Inherited permissions are unchanged.");
      await refresh();
    } catch (value) {
      const failure = value as ApiError; setProblem(failure);
      if ([401, 403, 404, 409, 412].includes(failure.status ?? 0)) {
        setChange(null); receipt.current = null;
        await refresh();
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <AccessPage><Panel title="Permission matrix" className="p-0">
    <div className="space-y-3 border-b border-[var(--op-border-soft)] p-4">
      <label className="block text-sm font-medium">Custom role
        <select className="op-select ml-3 min-w-56" value={roleId} disabled={busy || roles.isFetching} onChange={event => {
          setRoleId(event.target.value); setChange(null); setProblem(null); receipt.current = null;
        }}>
          <option value="">Select role</option>
          {(roles.data?.items ?? []).filter(item => !item.is_system_role).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <p className="text-sm text-[var(--op-muted)]">Direct grants only. Removing a direct grant does not remove permissions inherited from another role.</p>
      {roles.data?.next_cursor && <Button variant="outline" disabled={busy || loading} onClick={() => {
        setRoleCursor(roles.data!.next_cursor); setRoleId(""); setChange(null);
      }}>Next roles</Button>}
      {roleCursor && <Button variant="outline" disabled={busy || loading} onClick={() => {
        setRoleCursor(null); setRoleId(""); setChange(null);
      }}>First roles</Button>}
      {error && <p role="alert" className="text-sm">{error.message}{error.correlationId ? ` Reference: ${error.correlationId}` : ""}</p>}
      {seconds > 0 && <p role="status">Try again in {seconds} seconds. Your reason has been kept.</p>}
      {notice && <p role="status">{notice}</p>}
      {change && <div className="space-y-2">
        <p>{change.allowed ? "Grant" : "Remove"} {change.code} on {role?.name}?</p>
        <label className="block text-sm">Reason<Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} disabled={busy} /></label>
        <Button onClick={() => void save()} disabled={busy || loading || !canManage || seconds > 0 || reason.trim().length < 3}>Save permission</Button>
        <Button variant="outline" disabled={busy} onClick={() => setChange(null)}>Cancel</Button>
      </div>}
      <Button variant="outline" disabled={busy || seconds > 0} onClick={() => { setProblem(null); setChange(null); void refresh(); }}>Reload access</Button>
    </div>
    <DataTable columns={["Domain", "Permission", "Direct grant", "Action"]} rows={(permissions.data?.items ?? []).map(permission => [
      permission.module ?? "General", permission.name ?? permission.code,
      roleId && !granted.isError && !granted.isFetching ? allows.has(permission.code) ? "Granted" : "Not granted" : "Not checked",
      <Button key={permission.code} variant="outline" size="sm" disabled={!role || role.is_system_role || !canManage || loading || !!error || busy || seconds > 0}
        onClick={() => { setChange({ code: permission.code, allowed: !allows.has(permission.code), version: role!.version }); setNotice(""); }}>
        {allows.has(permission.code) ? "Remove direct grant" : "Grant"}
      </Button>,
    ])} empty={permissions.isFetching ? "Loading permissions…" : permissions.isError ? "Permissions are unavailable." : "No permissions on this page."} />
    <div className="flex gap-2 p-4">
      {permissionCursor && <Button variant="outline" disabled={busy || loading} onClick={() => { setPermissionCursor(null); setChange(null); }}>First permissions</Button>}
      {permissions.data?.next_cursor && <Button variant="outline" disabled={busy || loading} onClick={() => { setPermissionCursor(permissions.data!.next_cursor); setChange(null); }}>Next permissions</Button>}
    </div>
  </Panel></AccessPage>;
}
