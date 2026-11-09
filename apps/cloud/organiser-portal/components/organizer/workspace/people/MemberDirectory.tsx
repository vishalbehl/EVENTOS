"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import { useAccessBootstrap } from "@/hooks/useAccessBootstrap";
import {
  DataTable,
  Panel,
  StatusBadge,
  ToolbarSearch,
} from "../OrganiserPrimitives";
import { PeoplePage } from "./shared";

export function MemberDirectory({
  invitationsOnly = false,
  memberInviteEnabled = true,
}: { invitationsOnly?: boolean; memberInviteEnabled?: boolean }) {
  const user = useAuthStore(state => state.user);
  const context = useAuthStore(state => state.activeContext);
  const contextKey = accessContextCacheKey(context, user?.organization_id);
  return <ScopedMemberDirectory key={`${user?.id}:${contextKey}`} contextKey={contextKey} invitationsOnly={invitationsOnly} memberInviteEnabled={memberInviteEnabled} />;
}

function ScopedMemberDirectory({
  invitationsOnly = false,
  memberInviteEnabled = true,
  contextKey,
}: {
  invitationsOnly?: boolean;
  memberInviteEnabled?: boolean;
  contextKey: string;
}) {
  const client = useQueryClient();
  const user = useAuthStore(state => state.user);
  const access = useAccessBootstrap();
  const canManage = access.isSuccess && !access.isError && access.data.actions.includes("members:manage");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: [
      "organisation",
      "member-directory",
      user?.id,
      contextKey,
      access.data?.policy_revision,
      invitationsOnly,
      page,
      pageSize,
      search,
    ],
    enabled: !!user && canManage,
    retry: false,
    queryFn: ({ signal }) =>
      apiGet<{ items: any[]; total: number }>(
        `/organiser/members?page=${page}&page_size=${pageSize}&status=${invitationsOnly ? "pending" : "accepted"}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`,
        { signal },
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
  const [issuedLink, setIssuedLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const inviteCommand = useRef<{ signature: string; key: string } | null>(null);
  const resendCommand = useRef<{ signature: string; key: string } | null>(null);
  const mutationCommands = useRef(new Map<string, string>());
  const commandKey = (signature: string) => {
    const current = mutationCommands.current.get(signature);
    if (current) return current;
    const key = crypto.randomUUID();
    mutationCommands.current.set(signature, key);
    return key;
  };
  const rememberLink = (result: { invite_token?: string | null; expires_at: string }) => {
    if (result.invite_token) setIssuedLink({ url: `${window.location.origin}/accept-invite#token=${encodeURIComponent(result.invite_token)}`, expiresAt: result.expires_at });
    else toast.info("The invitation exists, but its link is shown only once. Refresh and replace the link if you did not save it.");
  };
  const [retryAt, setRetryAt] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [correlationId, setCorrelationId] = useState<string | undefined>();
  useEffect(() => {
    const tick = () => setRetrySeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    if (!retryAt) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const ensureReady = () => {
    if (!canManage) throw new Error("Current organisation membership does not allow this action.");
    if (retryAt > Date.now()) throw new Error("Please wait for the retry countdown. Your form has been kept.");
  };
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["access-bootstrap", user?.id] }),
      client.invalidateQueries({ queryKey: ["permissions"] }),
      client.invalidateQueries({ queryKey: ["organisation", "members"] }),
      client.invalidateQueries({ queryKey: ["organisation", "member-summary", user?.id, contextKey] }),
      client.invalidateQueries({
        queryKey: ["organisation", "member-directory"],
      }),
    ]);
  };
  const mutationError = (cause: any, fallback: string) => {
    if (cause?.status === 429 || cause?.status === 503) {
      setRetryAt(Date.now() + Math.max(1, cause.retryAfter || 5) * 1000);
      setCorrelationId(cause.correlationId);
      toast.error(cause.status === 429 ? "Too many requests. Your form has been kept." : "Access protection is unavailable. Your form has been kept; try again later.");
    } else if (cause?.status === 412) {
      void refresh();
      toast.error("This membership changed. Review the refreshed record before submitting again. Your reason has been kept.");
    } else toast.error(cause?.message || fallback);
  };
  const invite = useMutation({
    onMutate: ensureReady,
    mutationFn: () => {
      const signature = JSON.stringify([email.trim().toLowerCase(), role]);
      if (inviteCommand.current?.signature !== signature) inviteCommand.current = { signature, key: crypto.randomUUID() };
      return orgApi.invite(email.trim(), role, inviteCommand.current.key);
    },
    onSuccess: async (result) => {
      rememberLink(result); inviteCommand.current = null;
      await refresh();
      setEmail("");
      setRole("member");
      setError(null);
      setOpen(false);
    },
    onError: (reason: any) => {
      setError(reason?.message || "The invitation could not be sent.");
      mutationError(reason, "The invitation could not be sent.");
    },
  });
  const update = useMutation({
    onMutate: ensureReady,
    mutationFn: ({ member, nextRole }: { member: any; nextRole: OrgRole }) => {
      const signature = JSON.stringify(["role", member.id, member.version, nextRole, reason.trim()]);
      return apiClient.patch(
        `/organiser/members/${member.id}/role`,
        { org_role: nextRole, reason: reason.trim() },
        { headers: { "If-Match": String(member.version), "Idempotency-Key": commandKey(signature) } },
      );
    },
    onSuccess: async (_, variables) => {
      mutationCommands.current.delete(JSON.stringify(["role", variables.member.id, variables.member.version, variables.nextRole, reason.trim()]));
      await refresh();
      setRoleChange(null);
      setReason("");
      toast.success("Member role updated.");
    },
    onError: (cause: any) =>
      mutationError(cause, "The member role could not be updated."),
  });
  const revoke = useMutation({
    onMutate: ensureReady,
    mutationFn: (member: any) => {
      const signature = JSON.stringify(["revoke-invitation", member.id, member.version]);
      return apiClient.delete(`/organiser/invitations/${member.id}`, {
        headers: { "If-Match": String(member.version), "Idempotency-Key": commandKey(signature) },
      });
    },
    onSuccess: async (_, member) => {
      mutationCommands.current.delete(JSON.stringify(["revoke-invitation", member.id, member.version]));
      await refresh();
      setRevokeMember(null);
      toast.success("Invitation revoked.");
    },
    onError: (cause: any) =>
      mutationError(cause, "The invitation could not be revoked."),
  });
  const resend = useMutation({
    onMutate: ensureReady,
    mutationFn: (member: any) => {
      const signature = JSON.stringify([member.id, member.version]);
      if (resendCommand.current?.signature !== signature) resendCommand.current = { signature, key: crypto.randomUUID() };
      return apiClient.post<{ invite_token?: string | null; expires_at: string }>(`/organiser/invitations/${member.id}/resend`, undefined, {
        headers: { "If-Match": String(member.version), "Idempotency-Key": resendCommand.current.key },
      });
    },
    onSuccess: async (result) => {
      rememberLink(result); resendCommand.current = null;
      await refresh();
      toast.success("Invitation link replaced. Share the new link with the recipient.");
    },
    onError: (cause: any) =>
      mutationError(cause, "Invitation could not be resent."),
  });
  const statusMutation = useMutation({
    onMutate: ensureReady,
    mutationFn: (member: any) => {
      const nextActive = !member.is_active;
      const signature = JSON.stringify(["status", member.id, member.version, nextActive, reason.trim()]);
      return apiClient.patch(
        `/organiser/members/${member.id}/status`,
        { is_active: nextActive, reason: reason.trim() },
        { headers: { "If-Match": String(member.version), "Idempotency-Key": commandKey(signature) } },
      );
    },
    onSuccess: async (_, member) => {
      mutationCommands.current.delete(JSON.stringify(["status", member.id, member.version, !member.is_active, reason.trim()]));
      await refresh();
      setStatusMember(null);
      setReason("");
      toast.success("Member status updated.");
    },
    onError: (cause: any) =>
      mutationError(cause, "Member status could not be updated."),
  });
  const bulkStatus = useMutation({
    onMutate: ensureReady,
    mutationFn: () => {
      const members = records
        .filter((member) => selected.has(member.id))
        .map((member) => ({ id: member.id, version: member.version }));
      const signature = JSON.stringify(["bulk-status", members, bulkActive, reason.trim()]);
      return apiClient.patch("/organiser/members-bulk/status", {
        members,
        is_active: bulkActive,
        reason: reason.trim(),
      }, { headers: { "Idempotency-Key": commandKey(signature) } });
    },
    onSuccess: async (result: any) => {
      mutationCommands.current.clear();
      await refresh();
      setSelected(new Set());
      setBulkActive(null);
      setReason("");
      toast.success(`${result.updated} members updated.`);
    },
    onError: (cause: any) =>
      mutationError(cause, "Bulk member update could not be completed."),
  });
  const records = canManage && !query.isError ? query.data?.items || [] : [];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter an email address.");
      return;
    }
    invite.mutate();
  };

  if (!canManage) {
    return (
      <PeoplePage>
        <Panel title={invitationsOnly ? "Invitations" : "Team members"}>
          <p role={access.isPending ? "status" : "alert"} className="p-4 text-sm">
            {access.isPending
              ? "Checking membership access..."
              : access.isError
                ? "Current access could not be verified. Member records and changes are unavailable."
                : "You do not have permission to view or manage organisation members."}
          </p>
        </Panel>
      </PeoplePage>
    );
  }

  return (
    <PeoplePage
      actions={
        <Button onClick={() => setOpen(true)} disabled={!memberInviteEnabled || !canManage || retrySeconds > 0}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite member
        </Button>
      }
    >
      <Panel
        title={invitationsOnly ? "Invitations" : "Team members"}
        className="p-0"
      >
        {access.isError && <p role="alert" className="p-4 text-sm">Current access could not be verified. Member records and changes are unavailable.</p>}
        {access.isSuccess && !canManage && <p role="alert" className="p-4 text-sm">You do not have permission to view or manage organisation members.</p>}
        {retrySeconds > 0 && (
          <p role="status" className="border-b border-[var(--op-border-soft)] p-4 text-sm">
            Try again in {retrySeconds}s. Your form contents are preserved.
            {correlationId ? ` Reference: ${correlationId}` : ""}
          </p>
        )}
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
                disabled={!canManage || update.isPending || retrySeconds > 0 || !member.accepted_at || (member.org_role === "owner" && access.data?.role !== "owner")}
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
                    : member.invitation_state === "EXPIRED" ? "Expired" : member.invitation_state === "REVOKED" ? "Revoked" : "Pending"
                }
              />,
              <div key={`${member.id}-actions`} className="flex gap-2">
                {member.accepted_at ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !canManage || retrySeconds > 0 || member.org_role === "owner" || statusMutation.isPending
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
                      disabled={!canManage || retrySeconds > 0 || resend.isPending}
                      onClick={() => resend.mutate(member)}
                    >
                      Replace link
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canManage || retrySeconds > 0 || revoke.isPending}
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
                    disabled={!canManage || member.org_role === "owner"}
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
            access.isPending
              ? "Checking membership access..."
              : !canManage
                ? "Membership administration is unavailable."
                : query.isError
              ? "Member records are unavailable."
              : query.isLoading
                ? "Loading member records..."
                : invitationsOnly
                  ? "No pending invitations."
                  : "No members found."
          }
          total={canManage && !query.isError ? query.data?.total || 0 : 0}
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
                The invitation is scoped to this organisation. Share the one-time link after creation; this action does not send an email.
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
                {invite.isPending ? "Creating..." : "Create invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={issuedLink !== null} onOpenChange={value => { if (!value) setIssuedLink(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Share invitation link</DialogTitle>
            <DialogDescription>This link is shown only once. Share it privately with the invited email owner. Replacing it invalidates the previous link.</DialogDescription></DialogHeader>
          <label className="block text-sm">One-time invitation link<Input readOnly value={issuedLink?.url || ""} autoComplete="off" /></label>
          <p className="text-sm">Expires {issuedLink ? new Date(issuedLink.expiresAt).toLocaleString() : ""}.</p>
          <DialogFooter><Button onClick={async () => {
            if (!issuedLink) return;
            try { await navigator.clipboard.writeText(issuedLink.url); toast.success("Invitation link copied."); }
            catch { toast.error("Copy the link from the field above."); }
          }}>Copy link</Button><Button variant="outline" onClick={() => setIssuedLink(null)}>Done</Button></DialogFooter>
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
                ? "Suspend access to this organisation. Their account and access to other organisations are preserved, along with team ownership and audit history."
                : "Restore access to this organisation only."}
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
