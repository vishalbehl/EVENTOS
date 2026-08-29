"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { orgApi, type OrgRole } from "@/components/organizer/org/org-api";
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
import { apiClient, apiGet } from "@/lib/api-client";
import {
  DataTable,
  Panel,
  StatusBadge,
  ToolbarSearch,
} from "../OrganiserPrimitives";
import { PeoplePage } from "./shared";

export function MemberDirectory({
  invitationsOnly = false,
}: {
  invitationsOnly?: boolean;
}) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: [
      "organisation",
      "member-directory",
      invitationsOnly,
      page,
      pageSize,
      search,
    ],
    queryFn: () =>
      apiGet<{ items: any[]; total: number }>(
        `/organiser/members?page=${page}&page_size=${pageSize}&status=${invitationsOnly ? "pending" : "accepted"}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`,
      ),
  });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [statusMember, setStatusMember] = useState<any | null>(null);
  const [roleChange, setRoleChange] = useState<{
    member: any;
    nextRole: OrgRole;
  } | null>(null);
  const [revokeMember, setRevokeMember] = useState<any | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkActive, setBulkActive] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["organisation", "members"] }),
      client.invalidateQueries({
        queryKey: ["organisation", "member-directory"],
      }),
    ]);
  };
  const invite = useMutation({
    mutationFn: () => orgApi.invite(email.trim(), role),
    onSuccess: async () => {
      await refresh();
      setEmail("");
      setRole("member");
      setError(null);
      setOpen(false);
    },
    onError: (reason: any) =>
      setError(reason?.message || "The invitation could not be sent."),
  });
  const update = useMutation({
    mutationFn: ({ member, nextRole }: { member: any; nextRole: OrgRole }) =>
      apiClient.patch(
        `/organiser/members/${member.id}/role`,
        { org_role: nextRole, reason: reason.trim() },
        { headers: { "If-Match": String(member.version) } },
      ),
    onSuccess: async () => {
      await refresh();
      setRoleChange(null);
      setReason("");
      toast.success("Member role updated.");
    },
    onError: (cause: any) =>
      toast.error(cause?.message || "The member role could not be updated."),
  });
  const revoke = useMutation({
    mutationFn: (member: any) =>
      apiClient.delete(`/organiser/invitations/${member.id}`, {
        headers: { "If-Match": String(member.version) },
      }),
    onSuccess: async () => {
      await refresh();
      setRevokeMember(null);
      toast.success("Invitation revoked.");
    },
    onError: (cause: any) =>
      toast.error(cause?.message || "The invitation could not be revoked."),
  });
  const resend = useMutation({
    mutationFn: (member: any) =>
      apiClient.post(`/organiser/invitations/${member.id}/resend`, undefined, {
        headers: { "If-Match": String(member.version) },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Invitation resent.");
    },
    onError: (cause: any) =>
      toast.error(cause?.message || "Invitation could not be resent."),
  });
  const statusMutation = useMutation({
    mutationFn: (member: any) =>
      apiClient.patch(
        `/organiser/members/${member.id}/status`,
        { is_active: !member.is_active, reason: reason.trim() },
        { headers: { "If-Match": String(member.version) } },
      ),
    onSuccess: async () => {
      await refresh();
      setStatusMember(null);
      setReason("");
      toast.success("Member status updated.");
    },
    onError: (cause: any) =>
      toast.error(cause?.message || "Member status could not be updated."),
  });
  const bulkStatus = useMutation({
    mutationFn: () =>
      apiClient.patch("/organiser/members-bulk/status", {
        members: records
          .filter((member) => selected.has(member.id))
          .map((member) => ({ id: member.id, version: member.version })),
        is_active: bulkActive,
        reason: reason.trim(),
      }),
    onSuccess: async (result: any) => {
      await refresh();
      setSelected(new Set());
      setBulkActive(null);
      setReason("");
      toast.success(`${result.updated} members updated.`);
    },
    onError: (cause: any) =>
      toast.error(
        cause?.message || "Bulk member update could not be completed.",
      ),
  });
  const records = query.data?.items || [];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter an email address.");
      return;
    }
    invite.mutate();
  };

  return (
    <PeoplePage
      actions={
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite member
        </Button>
      }
    >
      <Panel
        title={invitationsOnly ? "Invitations" : "Team members"}
        className="p-0"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--op-border-soft)] p-4">
          <ToolbarSearch
            placeholder={
              invitationsOnly ? "Search invitations..." : "Search members..."
            }
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
              setSelected(new Set());
            }}
          />
          {!invitationsOnly ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setSelected(
                  selected.size
                    ? new Set()
                    : new Set(
                        records
                          .filter((member) => member.org_role !== "owner")
                          .map((member) => member.id),
                      ),
                )
              }
            >
              {selected.size ? "Clear selection" : "Select page"}
            </Button>
          ) : null}
          {!invitationsOnly && selected.size ? (
            <>
              <span className="text-sm text-[var(--op-muted)]">
                {selected.size} selected
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setBulkActive(false);
                  setReason("");
                }}
              >
                Suspend
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setBulkActive(true);
                  setReason("");
                }}
              >
                Reactivate
              </Button>
            </>
          ) : null}
        </div>
        <DataTable
          columns={
            invitationsOnly
              ? ["Member", "Email", "Role", "Status", "Actions"]
              : ["Select", "Member", "Email", "Role", "Status", "Actions"]
          }
          rows={records.map((member) => {
            const cells = [
              member.name,
              member.email,
              <select
                key={`role-${member.id}`}
                aria-label={`Role for ${member.name}`}
                className="op-select h-8"
                value={member.org_role}
                disabled={update.isPending || !member.accepted_at}
                onChange={(event) => {
                  setRoleChange({
                    member,
                    nextRole: event.target.value as OrgRole,
                  });
                  setReason("");
                }}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="billing_only">Billing only</option>
                {member.org_role === "owner" ? (
                  <option value="owner">Owner</option>
                ) : null}
              </select>,
              <StatusBadge
                key={`${member.id}-status`}
                status={
                  member.accepted_at
                    ? member.is_active
                      ? "Active"
                      : "Suspended"
                    : "Pending"
                }
              />,
              <div key={`${member.id}-actions`} className="flex gap-2">
                {member.accepted_at ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      member.org_role === "owner" || statusMutation.isPending
                    }
                    onClick={() => {
                      setStatusMember(member);
                      setReason("");
                    }}
                  >
                    {member.is_active ? "Suspend" : "Reactivate"}
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resend.isPending}
                      onClick={() => resend.mutate(member)}
                    >
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={revoke.isPending}
                      onClick={() => setRevokeMember(member)}
                    >
                      Revoke
                    </Button>
                  </>
                )}
              </div>,
            ];
            return invitationsOnly
              ? cells
              : [
                  <input
                    key={`${member.id}-selected`}
                    type="checkbox"
                    aria-label={`Select ${member.name}`}
                    disabled={member.org_role === "owner"}
                    checked={selected.has(member.id)}
                    onChange={(event) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(member.id);
                        else next.delete(member.id);
                        return next;
                      })
                    }
                  />,
                  ...cells,
                ];
          })}
          empty={
            query.isError
              ? "Member records are unavailable."
              : query.isLoading
                ? "Loading member records..."
                : invitationsOnly
                  ? "No pending invitations."
                  : "No members found."
          }
          total={query.data?.total || 0}
          page={page}
          pageSize={pageSize}
          onPageChange={(value) => {
            setPage(value);
            setSelected(new Set());
          }}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setSelected(new Set());
          }}
        />
      </Panel>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Invite organiser member</DialogTitle>
              <DialogDescription>
                The invitation is scoped to this organisation.
              </DialogDescription>
            </DialogHeader>
            <label className="block text-sm font-medium text-[var(--op-text)]">
              Email address
              <Input
                className="mt-2"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoFocus
              />
            </label>
            <label className="block text-sm font-medium text-[var(--op-text)]">
              Organisation role
              <select
                className="op-select mt-2 w-full"
                value={role}
                onChange={(event) => setRole(event.target.value as OrgRole)}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="billing_only">Billing only</option>
              </select>
            </label>
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
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? "Sending..." : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(statusMember)}
        onOpenChange={(value) => {
          if (!value) setStatusMember(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusMember?.is_active ? "Suspend member" : "Reactivate member"}
            </DialogTitle>
            <DialogDescription>
              {statusMember?.is_active
                ? "Sessions will be revoked immediately. Team ownership and audit history are preserved."
                : "Restore this member's organiser access."}
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium">
            Reason
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-3"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusMember(null)}>
              Cancel
            </Button>
            <Button
              disabled={reason.trim().length < 3 || statusMutation.isPending}
              onClick={() => statusMutation.mutate(statusMember)}
            >
              {statusMutation.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(roleChange)}
        onOpenChange={(value) => {
          if (!value) setRoleChange(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change member role</DialogTitle>
            <DialogDescription>
              Change {roleChange?.member.name} from{" "}
              {roleChange?.member.org_role} to {roleChange?.nextRole}. Effective
              access updates immediately and is recorded in the access audit.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium">
            Reason
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-3"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleChange(null)}>
              Cancel
            </Button>
            <Button
              disabled={reason.trim().length < 3 || update.isPending}
              onClick={() => roleChange && update.mutate(roleChange)}
            >
              {update.isPending ? "Saving..." : "Confirm role change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={bulkActive !== null}
        onOpenChange={(value) => {
          if (!value) setBulkActive(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bulkActive
                ? "Reactivate selected members"
                : "Suspend selected members"}
            </DialogTitle>
            <DialogDescription>
              This atomic operation updates {selected.size} explicitly selected
              members. A version conflict prevents the entire update.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium">
            Reason
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-3"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkActive(null)}>
              Cancel
            </Button>
            <Button
              disabled={reason.trim().length < 3 || bulkStatus.isPending}
              onClick={() => bulkStatus.mutate()}
            >
              {bulkStatus.isPending
                ? "Saving..."
                : `Confirm ${selected.size} members`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(revokeMember)}
        onOpenChange={(value) => {
          if (!value) setRevokeMember(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke invitation</DialogTitle>
            <DialogDescription>
              The invitation for {revokeMember?.email} will stop working
              immediately. Its audit record remains available.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeMember(null)}>
              Cancel
            </Button>
            <Button
              disabled={!revokeMember || revoke.isPending}
              onClick={() => revokeMember && revoke.mutate(revokeMember)}
            >
              {revoke.isPending ? "Revoking..." : "Revoke invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PeoplePage>
  );
}
