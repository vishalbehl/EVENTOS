"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRoundPlus, X } from "lucide-react";
import { toast } from "sonner";
import { orgApi } from "@/components/organizer/org/org-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEvents } from "@/hooks/useEvents";
import { apiClient, apiGet } from "@/lib/api-client";
import {
  DataTable,
  Panel,
  ToolbarSearch as SearchControl,
} from "../OrganiserPrimitives";
import { AccessPage, type RoleAssignment, type UserRole } from "./shared";

export function AccessAssignments({
  scope: fixedScope,
}: {
  scope?: "ORGANIZATION" | "EVENT";
}) {
  const client = useQueryClient();
  const [selectedScope, setSelectedScope] = useState<"ORGANIZATION" | "EVENT">(
    "ORGANIZATION",
  );
  const scope = fixedScope || selectedScope;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const assignments = useQuery({
    queryKey: ["user-role-assignments", scope, page, pageSize, search],
    queryFn: () =>
      apiGet<{ items: RoleAssignment[]; total: number }>(
        `/organiser/access/assignments?scope=${scope}&page=${page}&page_size=${pageSize}&search=${encodeURIComponent(search)}`,
      ),
  });
  const members = useQuery({
    queryKey: ["organisation", "members"],
    queryFn: orgApi.members,
  });
  const roles = useQuery({
    queryKey: ["user-roles"],
    queryFn: () => apiGet<UserRole[]>("/rbac/roles"),
  });
  const events = useEvents();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [eventId, setEventId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [revokeAssignment, setRevokeAssignment] =
    useState<RoleAssignment | null>(null);
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["user-role-assignments"] });
  const create = useMutation({
    mutationFn: () =>
      apiClient.post(
        "/rbac/assignments",
        {
          user_id: userId,
          role_id: roleId,
          event_id: scope === "EVENT" ? eventId : null,
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      ),
    onSuccess: async () => {
      await refresh();
      setOpen(false);
      setUserId("");
      setRoleId("");
      setEventId("");
    },
    onError: (reason: any) =>
      setError(reason?.message || "The role assignment could not be saved."),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/rbac/assignments/${id}`),
    onSuccess: async () => {
      await refresh();
      setRevokeAssignment(null);
      toast.success("Role access revoked.");
    },
    onError: (reason: any) =>
      toast.error(reason?.message || "Role access could not be revoked."),
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!userId || !roleId || (scope === "EVENT" && !eventId)) {
      setError("Select a member, role, and required scope.");
      return;
    }
    try {
      const result = await apiGet<any>(
        `/organiser/access/effective-preview?user_id=${userId}&role_id=${roleId}${scope === "EVENT" ? `&event_id=${eventId}` : ""}`,
      );
      setPreview(result);
      setOpen(false);
    } catch (cause: any) {
      setError(cause?.message || "Effective access could not be calculated.");
    }
  };
  const rows = assignments.data?.items || [];
  const isEvent = scope === "EVENT";
  return (
    <AccessPage
      actions={
        <Button onClick={() => setOpen(true)}>
          <UserRoundPlus className="mr-2 h-4 w-4" />
          Assign role
        </Button>
      }
    >
      <Panel
        title={isEvent ? "Event access" : "Workspace access"}
        className="p-0"
      >
        <div className="flex flex-wrap gap-3 border-b border-[var(--op-border-soft)] p-4">
          {!fixedScope ? (
            <select
              className="op-select"
              value={scope}
              onChange={(event) => {
                setSelectedScope(
                  event.target.value as "ORGANIZATION" | "EVENT",
                );
                setPage(1);
              }}
              aria-label="Assignment scope"
            >
              <option value="ORGANIZATION">Workspace access</option>
              <option value="EVENT">Event access</option>
            </select>
          ) : null}
          <SearchControl
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder={`Search ${isEvent ? "event" : "workspace"} access...`}
          />
        </div>
        <DataTable
          columns={
            isEvent
              ? ["Member", "Role", "Event", "Assigned", "Actions"]
              : ["Member", "Role", "Scope", "Assigned", "Actions"]
          }
          rows={rows.map((item) => [
            <span key={`${item.id}-member`}>
              <strong className="block">{item.user_name}</strong>
              <span className="text-xs text-[var(--op-muted)]">
                {item.user_email}
              </span>
            </span>,
            item.role_name,
            isEvent ? item.event_name || "Unavailable" : "Organisation",
            new Date(item.assigned_at).toLocaleString(),
            <Button
              key={`${item.id}-revoke`}
              size="icon"
              variant="outline"
              title="Revoke role"
              disabled={revoke.isPending}
              onClick={() => setRevokeAssignment(item)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>,
          ])}
          total={assignments.data?.total || 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          empty={
            assignments.isError
              ? `${isEvent ? "Event" : "Workspace"} access is unavailable.`
              : `No ${isEvent ? "event" : "workspace"} role assignments found.`
          }
        />
      </Panel>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>
                {isEvent ? "Assign event role" : "Assign workspace role"}
              </DialogTitle>
              <DialogDescription>
                Assign an organiser user role. Participant roles remain
                separate.
              </DialogDescription>
            </DialogHeader>
            <label className="block text-sm font-medium text-[var(--op-text)]">
              Member
              <select
                className="op-select mt-2 w-full"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
              >
                <option value="">Select member</option>
                {(members.data || [])
                  .filter((member) => member.is_active && member.user_id)
                  .map((member) => (
                    <option key={member.id} value={member.user_id!}>
                      {member.name} ({member.email})
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-[var(--op-text)]">
              User role
              <select
                className="op-select mt-2 w-full"
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
              >
                <option value="">Select role</option>
                {(roles.data || []).map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            {isEvent ? (
              <label className="block text-sm font-medium text-[var(--op-text)]">
                Event
                <select
                  className="op-select mt-2 w-full"
                  value={eventId}
                  onChange={(event) => setEventId(event.target.value)}
                >
                  <option value="">Select event</option>
                  {(events.data || []).map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-[var(--op-danger)]">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Assigning..." : "Assign role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(value) => {
          if (!value) setPreview(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review effective access</DialogTitle>
            <DialogDescription>
              {preview?.role_name} will be assigned at{" "}
              {preview?.scope === "EVENT" ? "event" : "organisation"} scope.
            </DialogDescription>
          </DialogHeader>
          {preview?.duplicate_assignment ? (
            <p className="rounded-md border border-[var(--op-warning)] p-3 text-sm text-[var(--op-warning)]">
              This exact role assignment already exists.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-[var(--op-border)] p-3">
              <strong>New permissions</strong>
              <p className="mt-2 text-sm text-[var(--op-muted)]">
                {preview?.added_permissions?.join(", ") ||
                  "No additional permissions"}
              </p>
            </div>
            <div className="rounded-md border border-[var(--op-border)] p-3">
              <strong>Effective permissions</strong>
              <p className="mt-2 text-sm text-[var(--op-muted)]">
                {preview?.effective_permissions?.join(", ") || "No permissions"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPreview(null);
                setOpen(true);
              }}
            >
              Back
            </Button>
            <Button
              disabled={preview?.duplicate_assignment || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Assigning..." : "Confirm assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(revokeAssignment)}
        onOpenChange={(value) => {
          if (!value) setRevokeAssignment(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke role assignment</DialogTitle>
            <DialogDescription>
              Remove {revokeAssignment?.role_name} from{" "}
              {revokeAssignment?.user_name}. Effective access changes
              immediately and remains auditable.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeAssignment(null)}>
              Cancel
            </Button>
            <Button
              disabled={!revokeAssignment || revoke.isPending}
              onClick={() =>
                revokeAssignment && revoke.mutate(revokeAssignment.id)
              }
            >
              {revoke.isPending ? "Revoking..." : "Revoke access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccessPage>
  );
}
