"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, type ApiError } from "@/lib/api-client";
import { useAuthStore, type ActiveAccessContext } from "@/store/use-auth-store";
import { useEventStore } from "@/store/useEventStore";
import { useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { useUIStore } from "@/store/useUIStore";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/organizer/workspace/OrganiserPrimitives";

type Context = {
  organization_id: string;
  organization_name: string;
  organization_kind: "NORMAL" | "EMC" | "CLIENT";
  role: string;
  membership_version: number;
  access_mode: "DIRECT" | "DELEGATED";
  acting_organization_id: string | null;
  acting_organization_name: string;
  workspace_id: string | null;
  workspace_name: string | null;
  event_id: string | null;
  relationship_id: string | null;
  is_current: boolean;
  activation_available: boolean;
};
type ContextPage = { items: Context[]; next_cursor: string | null; delegation_available: boolean };
type WorkspacePage = { items: { id: string; name: string; status: "ACTIVE" | "ARCHIVED" }[]; next_cursor: string | null };
type Bootstrap = { role: string; actions: string[]; policy_revisions: number[] };
type ContextSelection = Pick<Context, "access_mode" | "organization_id" | "acting_organization_id" | "workspace_id" | "event_id" | "relationship_id">;
type ContextSelectionResult = { access_token: string; token_type: "bearer"; context: ActiveAccessContext };
export type OrganizationSelection = { organization_id: string; organization_name: string };
type SelectionHandler = (context: OrganizationSelection | null) => void;

function contextKey(context: Context) {
  return [context.access_mode, context.acting_organization_id, context.organization_id,
    context.workspace_id, context.event_id, context.relationship_id].join(":");
}

function Directory({ userId, homeId, onSelect }: { userId: string; homeId: string; onSelect?: SelectionHandler }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Context | null>(null);
  const [workspaceCursor, setWorkspaceCursor] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const contexts = useQuery({
    queryKey: ["access-contexts", userId, homeId, cursor], retry: false, staleTime: 0, refetchOnWindowFocus: true,
    queryFn: ({ signal }) => apiGet<ContextPage>("/access/contexts", {
      signal, params: { after: cursor ?? undefined, limit: 50 },
    }),
  });
  const workspaces = useQuery({
    queryKey: ["context-directory-workspaces", userId, selected?.organization_id,
      selected?.membership_version, workspaceCursor],
    enabled: selected?.access_mode === "DIRECT", retry: false, staleTime: 0,
    queryFn: ({ signal }) => apiGet<WorkspacePage>(`/organizations/${selected!.organization_id}/workspaces`, {
      signal, params: { after: workspaceCursor ?? undefined, limit: 50 },
    }),
  });
  const capabilities = useQuery({
    queryKey: ["context-directory-access", userId, selected?.organization_id, selected?.membership_version],
    enabled: selected?.access_mode === "DIRECT", retry: false, staleTime: 0,
    queryFn: ({ signal }) => apiGet<Bootstrap>("/access/bootstrap", {
      signal, params: { organization_id: selected!.organization_id },
    }),
  });
  const activation = useMutation({
    retry: false,
    mutationFn: (payload: ContextSelection) => apiPost<ContextSelectionResult>("/access/context", payload),
    onMutate: async () => {
      useAuthStore.getState().setContextSwitching(true);
      await queryClient.cancelQueries();
    },
    onError: () => useAuthStore.getState().setContextSwitching(false),
    onSuccess: (result) => {
      useEventStore.getState().resetForAccessContext();
      useSessionBuilderStore.getState().resetForAccessContext();
      useUIStore.getState().resetForAccessContext();
      queryClient.clear();
      useAuthStore.getState().setAccessContext(result.context, result.access_token);
      setSelected(null);
      onSelect?.(null);
      // Delegated staff have operational scope, not client organisation-wide
      // dashboard authority. Enter only the approved workspace/event surface.
      const destination = result.context.access_mode === "DELEGATED"
        ? result.context.event_id
          ? `/events/${encodeURIComponent(result.context.event_id)}/dashboard`
          : "/events"
        : "/dashboard";
      router.replace(destination);
      router.refresh();
    },
  });
  const failure = (activation.error || contexts.error || workspaces.error || capabilities.error) as ApiError | null;

  useEffect(() => {
    if (failure?.retryAfter) setRetryAt(Date.now() + failure.retryAfter * 1000);
  }, [failure?.retryAfter]);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    if (!retryAt) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const activate = (context: Context, workspaceId = context.workspace_id) => {
    activation.mutate({
      access_mode: context.access_mode,
      organization_id: context.organization_id,
      acting_organization_id: context.access_mode === "DELEGATED" ? context.acting_organization_id : null,
      workspace_id: workspaceId,
      event_id: context.event_id,
      relationship_id: context.relationship_id,
    });
  };

  return <Panel title="Organisation and workspace context">
    <p className="mb-3 text-sm text-[var(--text-secondary)]">
      Direct memberships and approved EMC delegations are listed separately. Selecting a context ends old requests and clears tenant-specific screen data before the new workspace loads.
    </p>
    {failure ? <p role="alert" className="mb-3 text-sm">
      {failure.status === 404 ? "This access is no longer available. Reload your contexts." : failure.message}
      {seconds ? ` Retry in ${seconds} seconds.` : ""}{failure.correlationId ? ` Reference: ${failure.correlationId}` : ""}
    </p> : null}
    {activation.isPending ? <p role="status" aria-live="polite">Switching context…</p> : null}
    {contexts.isPending ? <p role="status">Loading available contexts…</p> : null}
    {!contexts.error && contexts.data?.items.length === 0 ? <p>No accepted memberships or approved delegations are available.</p> : null}
    <ul className="divide-y divide-[var(--border-subtle)]">
      {contexts.data?.items.map((context) => <li key={contextKey(context)} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div>
          <p className="font-medium">{context.organization_name}{context.is_current ? " · Current context" : ""}</p>
          <p className="text-sm text-[var(--text-secondary)]">
            {context.access_mode === "DIRECT" ? `${context.organization_kind} · Direct membership · ${context.role}`
              : `CLIENT · Delegated by ${context.acting_organization_name} · ${context.workspace_name || "Workspace"}${context.event_id ? " · Event scope" : ""}`}
          </p>
        </div>
        {context.access_mode === "DIRECT" ? <Button variant="outline" disabled={activation.isPending || seconds > 0} onClick={() => {
          if (selected?.organization_id === context.organization_id && !workspaceCursor) {
            void workspaces.refetch(); void capabilities.refetch();
          }
          setSelected(context); setWorkspaceCursor(null); onSelect?.(context);
        }}>Choose workspace</Button> : <Button variant="outline" disabled={!context.activation_available || activation.isPending || seconds > 0}
          onClick={() => activate(context)}>Use delegated context</Button>}
      </li>)}
    </ul>
    <div className="my-3 flex flex-wrap gap-2">
      <Button variant="outline" disabled={!cursor || contexts.isFetching || activation.isPending || seconds > 0} onClick={() => {
        setCursor(null); setSelected(null); onSelect?.(null);
      }}>First page</Button>
      <Button variant="outline" disabled={!contexts.data?.next_cursor || contexts.isFetching || activation.isPending || seconds > 0}
        onClick={() => { setCursor(contexts.data?.next_cursor ?? null); setSelected(null); onSelect?.(null); }}>Next page</Button>
      <Button variant="outline" disabled={contexts.isFetching || activation.isPending || seconds > 0}
        onClick={() => { setSelected(null); onSelect?.(null); void contexts.refetch(); }}>Reload contexts</Button>
    </div>
    {selected?.access_mode === "DIRECT" ? <section key={selected.organization_id} className="border-t border-[var(--border-subtle)] pt-3" aria-label="Allowed workspaces">
      <h3 className="font-medium">{selected.organization_name} — allowed workspaces</h3>
      {workspaces.isFetching || capabilities.isFetching ? <p role="status">Checking workspace access…</p> : workspaces.error || capabilities.error ? null : <>
        {capabilities.data ? <p className="my-2 text-sm text-[var(--text-secondary)]">
          Verified role: {capabilities.data.role} · Policy revision {capabilities.data.policy_revisions.join(", ")} · {capabilities.data.actions.includes("workspace:create")
            ? "Organisation-wide workspace administration permitted." : "Only assigned workspace access is available."}
        </p> : null}
        {!workspaces.data?.items.length ? <p className="text-sm">No active workspaces are assigned to your membership.</p> :
          <ul>{workspaces.data.items.map((workspace) => <li key={workspace.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{workspace.name} · {workspace.status}</span>
            <Button variant="outline" disabled={workspace.status !== "ACTIVE" || activation.isPending || seconds > 0}
              onClick={() => activate(selected, workspace.id)}>Use workspace</Button>
          </li>)}</ul>}
        <div className="flex gap-2">
          <Button variant="outline" disabled={!workspaceCursor || seconds > 0} onClick={() => setWorkspaceCursor(null)}>First workspace page</Button>
          <Button variant="outline" disabled={!workspaces.data?.next_cursor || seconds > 0}
            onClick={() => setWorkspaceCursor(workspaces.data?.next_cursor ?? null)}>Next workspace page</Button>
        </div>
      </>}
    </section> : null}
  </Panel>;
}

export function ContextDirectory({ onSelect }: { onSelect?: SelectionHandler }) {
  const user = useAuthStore((state) => state.user);
  return user ? <Directory key={`${user.id}:${user.organization_id}`} userId={user.id} homeId={user.organization_id} onSelect={onSelect} /> : null;
}
