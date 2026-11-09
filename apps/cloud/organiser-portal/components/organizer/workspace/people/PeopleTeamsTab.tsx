"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiClient, apiGet, type ApiError } from "@/lib/api-client";
import { DataTable, Panel, ToolbarSearch } from "../OrganiserPrimitives";
import { PeoplePage, type TeamRecord } from "./shared";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import { useAccessBootstrap } from "@/hooks/useAccessBootstrap";

export function PeopleTeamsTab() {
  const userId = useAuthStore(state => state.user?.id);
  const userOrganizationId = useAuthStore(state => state.user?.organization_id);
  const context = useAuthStore(state => state.activeContext);
  const scopeKey = accessContextCacheKey(context, userOrganizationId);
  return <Teams key={`${userId}:${scopeKey}`} userId={userId} scopeKey={scopeKey} />;
}

function Teams({ userId, scopeKey }: { userId?: string; scopeKey: string }) {
  const client = useQueryClient();
  const bootstrap = useAccessBootstrap();
  const organizationId = bootstrap.data?.organization_id;
  const enabled = !!userId && bootstrap.isSuccess && !!organizationId;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["organisation", "teams", userId, scopeKey, bootstrap.data?.policy_revision, page, pageSize, search],
    enabled, retry: false, staleTime: 0,
    queryFn: ({ signal }) =>
      apiGet<{ items: TeamRecord[]; total: number }>(
        `/organiser/teams?page=${page}&page_size=${pageSize}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`,
        { signal },
      ),
  });
  const members = useQuery({
    queryKey: ["organisation", "team-owner-options", userId, scopeKey, bootstrap.data?.policy_revision],
    enabled: enabled && bootstrap.data.actions.includes("teams:manage"), retry: false, staleTime: 0,
    queryFn: ({ signal }) =>
      apiGet<{
        items: Array<{ id: string; name: string; is_active: boolean }>;
      }>("/organiser/members?page=1&page_size=100&status=active", { signal }),
  });
  const canManage = !bootstrap.isError && !bootstrap.isFetching && !!bootstrap.data?.actions.includes("teams:manage");
  const loading = query.isFetching || bootstrap.isFetching;
  const ownerNames = useMemo(() => new Map(members.data?.items.map(member => [member.id, member.name]) ?? []), [members.data?.items]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRecord | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerMemberId, setOwnerMemberId] = useState("");
  const [reason, setReason] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [staleMode, setStaleMode] = useState<"edit" | "archive" | null>(null);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const createReceipt = useRef<{ signature: string; key: string } | null>(null);
  const archiveReceipt = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => { if (problem?.retryAfter) setRetryAt(Date.now() + problem.retryAfter * 1000); }, [problem?.retryAfter]);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick(); if (!retryAt) return;
    const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [retryAt]);
  const [error, setError] = useState<string | null>(null);
  const [archiveTeam, setArchiveTeam] = useState<TeamRecord | null>(null);
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: ["organisation", "teams", userId, scopeKey] }),
    client.invalidateQueries({ queryKey: ["organisation", "team-owner-options", userId, scopeKey] }),
    client.invalidateQueries({ queryKey: ["access-bootstrap", userId] }),
  ]);
  const save = useMutation({
    retry: false,
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        owner_member_id: ownerMemberId || null,
        reason: reason.trim(),
      };
      const signature = JSON.stringify({ userId, organizationId, teamId: editing?.id, version: editing?.version, payload });
      if (createReceipt.current?.signature !== signature) createReceipt.current = { signature, key: crypto.randomUUID() };
      return editing
        ? apiClient.patch(`/organiser/teams/${editing.id}`, payload, {
            headers: { "If-Match": String(editing.version), "Idempotency-Key": createReceipt.current.key },
          })
        : apiClient.post("/organiser/teams", payload, {
            headers: { "Idempotency-Key": createReceipt.current.key },
          });
    },
    onSuccess: async () => {
      await refresh();
      setOpen(false);
      createReceipt.current = null; setProblem(null);
    },
    onError: (cause: unknown) => {
      const failure = cause as ApiError; setProblem(failure);
      if (editing && failure.status === 412) setStaleMode("edit");
      setError(failure.message || "The team could not be saved.");
      if ([401, 403, 404, 409, 412].includes(failure.status ?? 0)) void refresh();
    },
  });
  const remove = useMutation({
    retry: false,
    mutationFn: (team: TeamRecord) => {
      const payload = { reason: archiveReason.trim() };
      const signature = JSON.stringify({ userId, organizationId, teamId: team.id, version: team.version, payload });
      if (archiveReceipt.current?.signature !== signature) archiveReceipt.current = { signature, key: crypto.randomUUID() };
      return apiClient.delete(`/organiser/teams/${team.id}`, {
        headers: { "If-Match": String(team.version), "Idempotency-Key": archiveReceipt.current.key }, data: payload,
      });
    },
    onSuccess: async () => {
      await refresh();
      setArchiveTeam(null);
      setProblem(null); setStaleMode(null); archiveReceipt.current = null;
    },
    onError: (cause: unknown) => {
      const failure = cause as ApiError; setProblem(failure); setError(failure.message || "The team could not be archived.");
      if (failure.status === 412) setStaleMode("archive");
      if ([401, 403, 404, 409, 412].includes(failure.status ?? 0)) void refresh();
    },
  });
  const startCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setOwnerMemberId("");
    setReason(""); setProblem(null); setStaleMode(null); createReceipt.current = null;
    setError(null);
    setOpen(true);
  };
  const startEdit = (team: TeamRecord) => {
    setEditing(team);
    setName(team.name);
    setDescription(team.description || "");
    setOwnerMemberId(team.owner_member_id || "");
    setReason(""); setProblem(null); setStaleMode(null); createReceipt.current = null;
    setError(null);
    setOpen(true);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canManage || loading || save.isPending || members.isError || staleMode || seconds > 0 || reason.trim().length < 3) return;
    setError(null);
    if (!name.trim()) {
      setError("Enter a team name.");
      return;
    }
    save.mutate();
  };

  return (
    <PeoplePage
      actions={
        <Button disabled={!canManage || loading || save.isPending || remove.isPending} onClick={startCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create team
        </Button>
      }
    >
      <Panel title="Organiser teams" className="p-0">
        <div className="border-b border-[var(--op-border-soft)] p-4">
          <ToolbarSearch
            placeholder="Search teams..."
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
        </div>
        <DataTable
          columns={["Team", "Owner", "Members", "Events", "Updated", "Actions"]}
          rows={(loading || query.isError ? [] : query.data?.items || []).map((team) => [
            team.name,
            team.owner_member_id ? ownerNames.get(team.owner_member_id) ?? "Owner not in loaded choices" : "Unassigned",
            team.member_count,
            team.events.length,
            team.updated_at ? new Date(team.updated_at).toLocaleString() : "-",
            <div key={`${team.id}-actions`} className="flex gap-2">
              <Button
                size="icon"
                variant="outline"
                title="Edit team"
                aria-label={`Edit ${team.name}`}
                disabled={!canManage || loading || save.isPending || remove.isPending}
                onClick={() => startEdit(team)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                title="Archive team"
                aria-label={`Archive ${team.name}`}
                disabled={!canManage || loading || save.isPending || remove.isPending}
                onClick={() => { setArchiveTeam(team); setArchiveReason(""); setProblem(null); setError(null); setStaleMode(null); archiveReceipt.current = null; }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>,
          ])}
          empty={
            query.isError
              ? "Organiser teams are unavailable."
              : query.isLoading
                ? "Loading organiser teams..."
                : "No organiser teams found."
          }
          total={query.data?.total || 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Panel>
      {(problem || seconds > 0) && <div role="alert" className="p-4 text-sm">
        {problem?.message}{problem?.correlationId ? ` Reference: ${problem.correlationId}` : ""}
        {seconds > 0 && <p>Try again in {seconds} seconds. Your form has been kept.</p>}
      </div>}
      <Dialog open={open} onOpenChange={value => { if (!save.isPending) setOpen(value); }}>
        <DialogContent className="max-w-md">
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit organiser team" : "Create organiser team"}
              </DialogTitle>
              <DialogDescription>
                Organiser teams are separate from Command Center departments.
              </DialogDescription>
            </DialogHeader>
            <label className="block text-sm font-medium text-[var(--op-text)]">
              Team name
              <Input
                className="mt-2"
                value={name}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </label>
            <label className="block text-sm font-medium text-[var(--op-text)]">
              Owner
              <select
                className="op-select mt-2 w-full"
                value={ownerMemberId}
                onChange={(event) => setOwnerMemberId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {(members.data?.items || []).map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-[var(--op-text)]">
              Description
              <textarea
                className="mt-2 min-h-24 w-full rounded-md border border-[var(--op-border)] bg-[var(--op-panel-bg)] px-3 py-2 text-sm text-[var(--op-text)]"
                value={description}
                maxLength={2000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-[var(--op-text)]">Reason
              <Input className="mt-2" required minLength={3} maxLength={500} value={reason} disabled={save.isPending}
                onChange={event => setReason(event.target.value)} />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-[var(--op-danger)]">
                {error}
                {problem?.correlationId ? ` Reference: ${problem.correlationId}` : ""}
                {seconds > 0 ? ` Retry in ${seconds}s; your inputs are preserved.` : ""}
              </p>
            ) : null}
            {staleMode === "edit" && <Button type="button" variant="outline" disabled={loading || query.isError} onClick={() => {
              const current = query.data?.items.find(team => team.id === editing?.id);
              if (current) { setEditing(current); setStaleMode(null); setProblem(null); setError(null); createReceipt.current = null; }
            }}>Review current saved version: {query.data?.items.find(team => team.id === editing?.id)?.name ?? "Unavailable on this page"}</Button>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canManage || loading || members.isError || save.isPending || !!staleMode || seconds > 0 || reason.trim().length < 3}>
                {save.isPending
                  ? "Saving..."
                  : editing
                    ? "Save team"
                    : "Create team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(archiveTeam)}
        onOpenChange={(value) => {
          if (!value && !remove.isPending) setArchiveTeam(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archive organiser team</DialogTitle>
            <DialogDescription>
              {archiveTeam?.name} will be removed from active assignments while
              its audit history is retained.
            </DialogDescription>
          </DialogHeader>
          <label className="block text-sm">Reason<Input required minLength={3} maxLength={500} value={archiveReason} disabled={remove.isPending}
            onChange={event => setArchiveReason(event.target.value)} /></label>
          {problem && <p role="alert" className="text-sm">{problem.message}{problem.correlationId ? ` Reference: ${problem.correlationId}` : ""}{seconds > 0 ? ` Retry in ${seconds}s; your reason is preserved.` : ""}</p>}
          {staleMode === "archive" && <Button type="button" variant="outline" disabled={loading || query.isError} onClick={() => {
            const current = query.data?.items.find(team => team.id === archiveTeam?.id);
            if (current) { setArchiveTeam(current); setStaleMode(null); setProblem(null); setError(null); archiveReceipt.current = null; }
          }}>Review current saved version: {query.data?.items.find(team => team.id === archiveTeam?.id)?.name ?? "Unavailable on this page"}</Button>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTeam(null)}>
              Cancel
            </Button>
            <Button
              disabled={!canManage || loading || !archiveTeam || remove.isPending || !!staleMode || seconds > 0 || archiveReason.trim().length < 3}
              onClick={() => archiveTeam && remove.mutate(archiveTeam)}
            >
              {remove.isPending ? "Archiving..." : "Archive team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PeoplePage>
  );
}
