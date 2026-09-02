"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type VenueUserItem = {
  id: string;
  username: string;
  email: string;
  name: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  allowed_modes: string[];
  created_at: string;
};

export default function UsersAndRolesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);

  // Form State
  const [formUsername, setFormUsername] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("operator");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["venue-users-list"],
    queryFn: () => apiClient.get<{ items: VenueUserItem[] }>("/venue/admin/control/users"),
    refetchInterval: 10000,
  });

  const users = data?.items || [];

  const createUserMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/venue/admin/control/users", {
        username: formUsername.trim().toLowerCase(),
        email: formEmail.trim().toLowerCase(),
        first_name: formFirstName.trim(),
        last_name: formLastName.trim(),
        password: formPassword,
        role: formRole,
      }),
    onSuccess: () => {
      toast.success("Venue User created successfully");
      setModalOpen(false);
      setFormUsername("");
      setFormEmail("");
      setFormFirstName("");
      setFormLastName("");
      setFormPassword("");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create user");
    },
  });

  const toggleUserMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      apiClient.patch(`/venue/admin/control/users/${userId}`, {
        is_active: isActive,
      }),
    onSuccess: () => {
      toast.success("User status updated");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update user");
    },
  });

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    const q = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.name && u.name.toLowerCase().includes(q))
    );
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUsername || !formEmail || !formPassword || !formFirstName) {
      toast.error("Please fill in all required fields.");
      return;
    }
    createUserMutation.mutate();
  };

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[var(--acc)]" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              ADMINISTRATION · OPERATIONAL IDENTITY & ROLES
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Users & Roles Management
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Manage local venue workstation operators, administrators, access credentials, and scoped role permissions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setModalOpen(true)}
            className="flex h-10 items-center gap-2 rounded-xl bg-[var(--acc)] px-4 text-xs font-bold text-[var(--acc-fg,#000)] hover:opacity-90 transition-opacity"
          >
            <UserPlus className="size-4" />
            <span>Add Venue Operator</span>
          </button>

          <button
            onClick={() => refetch()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RefreshCw className="size-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">TOTAL ACCOUNTS</span>
          <div className="mt-1 text-2xl font-black text-[var(--text)]">{users.length} Users</div>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-emerald-400">ACTIVE OPERATORS</span>
          <div className="mt-1 text-2xl font-black text-emerald-300">
            {users.filter((u) => u.is_active).length} Active
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/15 p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-cyan-400">ADMINISTRATORS</span>
          <div className="mt-1 text-2xl font-black text-cyan-300">
            {users.filter((u) => u.role === "administrator" || u.role === "admin").length} Admins
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">AUTHENTICATION</span>
          <div className="mt-1 text-2xl font-black text-[var(--text)]">Local DB / PBKDF2</div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div className="relative min-w-72 flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-[var(--muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, username, or email..."
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-9 pr-3 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--acc)]"
          />
        </div>

        <div className="flex items-center gap-2">
          {["all", "administrator", "operator", "viewer"].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={cn(
                "rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all capitalize",
                roleFilter === r
                  ? "tab-active shadow-sm"
                  : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              {r === "all" ? "All Roles" : r}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text)]">
            <thead className="border-b border-[var(--border)] bg-[var(--surf)] font-mono text-[10px] font-black uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Operator / User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Allowed Workspaces</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[var(--muted)]">
                    Loading venue users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[var(--muted)]">
                    No venue users found matching the query.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--raised)]/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-[var(--text)]">{u.name || `${u.first_name} ${u.last_name}`}</div>
                      <div className="font-mono text-[11px] text-[var(--muted)]">
                        @{u.username} · {u.email}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase",
                          u.role === "administrator" || u.role === "admin"
                            ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                            : u.role === "operator"
                            ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                            : "bg-[var(--surf)] text-[var(--muted)] border border-[var(--border)]"
                        )}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {(u.allowed_modes?.length ? u.allowed_modes : ["admin", "registration", "scanning"]).map((m) => (
                          <span
                            key={m}
                            className="rounded bg-[var(--surf)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--muted)] border border-[var(--border)]"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-mono text-[11px] font-bold",
                          u.is_active ? "text-emerald-400" : "text-rose-400"
                        )}
                      >
                        {u.is_active ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                        {u.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-[var(--muted)]">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => toggleUserMutation.mutate({ userId: u.id, isActive: !u.is_active })}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 font-mono text-[10px] font-bold transition-all",
                          u.is_active
                            ? "border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                            : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        )}
                      >
                        {u.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surf)] px-5 py-4">
              <div className="flex items-center gap-2">
                <UserPlus className="size-4 text-[var(--acc)]" />
                <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
                  Provision Venue Operator
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-bold uppercase text-[var(--muted)]">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formFirstName}
                    onChange={(e) => setFormFirstName(e.target.value)}
                    placeholder="e.g. Stage"
                    className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--acc)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-bold uppercase text-[var(--muted)]">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={formLastName}
                    onChange={(e) => setFormLastName(e.target.value)}
                    placeholder="e.g. Lead"
                    className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--acc)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-bold uppercase text-[var(--muted)]">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="e.g. stage.manager"
                    className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--acc)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-bold uppercase text-[var(--muted)]">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g. stage@eventos.com"
                    className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--acc)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-bold uppercase text-[var(--muted)]">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--acc)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-bold uppercase text-[var(--muted)]">
                    Assigned Role *
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--acc)]"
                  >
                    <option value="operator">Operator (Workstation Access)</option>
                    <option value="administrator">Administrator (Full NOC Authority)</option>
                    <option value="viewer">Viewer (Read Only)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="rounded-xl bg-[var(--acc)] px-4 py-2 text-xs font-bold text-[var(--acc-fg,#000)] hover:opacity-90 disabled:opacity-50"
                >
                  {createUserMutation.isPending ? "Creating..." : "Save Operator"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
