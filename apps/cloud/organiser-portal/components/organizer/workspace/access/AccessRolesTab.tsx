"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  ToolbarSearch as SearchControl,
} from "../OrganiserPrimitives";
import { AccessPage, type UserRole } from "./shared";

export function AccessRolesTab() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["user-roles-directory", page, pageSize, search],
    queryFn: () =>
      apiGet<{ items: UserRole[]; total: number }>(
        `/organiser/access/roles?page=${page}&page_size=${pageSize}&search=${encodeURIComponent(search)}`,
      ),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRole | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cloneRole, setCloneRole] = useState<UserRole | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [deleteRole, setDeleteRole] = useState<UserRole | null>(null);
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["user-roles"] }),
      client.invalidateQueries({ queryKey: ["user-roles-directory"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () =>
      apiClient.post("/rbac/roles", {
        name: name.trim(),
        description: description.trim() || null,
        is_system_role: false,
      }),
    onSuccess: async () => {
      await refresh();
      setOpen(false);
    },
    onError: (reason: any) =>
      setError(reason?.message || "The role could not be created."),
  });
  const update = useMutation({
    mutationFn: () =>
      apiClient.patch(
        `/rbac/roles/${editing?.id}`,
        { name: name.trim(), description: description.trim() || null },
        { headers: { "If-Match": String(editing?.version) } },
      ),
    onSuccess: async () => {
      await refresh();
      setOpen(false);
    },
    onError: (reason: any) =>
      setError(reason?.message || "The role could not be updated."),
  });
  const clone = useMutation({
    mutationFn: ({ role, nextName }: { role: UserRole; nextName: string }) =>
      apiClient.post(`/rbac/roles/${role.id}/clone`, {
        name: nextName,
        description: role.description || null,
      }),
    onSuccess: async () => {
      await refresh();
      setCloneRole(null);
      setCloneName("");
      toast.success("Role cloned.");
    },
    onError: (reason: any) =>
      toast.error(reason?.message || "The role could not be cloned."),
  });
  const remove = useMutation({
    mutationFn: (role: UserRole) =>
      apiClient.delete(`/rbac/roles/${role.id}`, {
        headers: { "If-Match": String(role.version) },
      }),
    onSuccess: async () => {
      await refresh();
      setDeleteRole(null);
      toast.success("Role archived.");
    },
    onError: (reason: any) =>
      toast.error(reason?.message || "The role could not be archived."),
  });
  const begin = (role?: UserRole) => {
    setEditing(role || null);
    setName(role?.name || "");
    setDescription(role?.description || "");
    setError(null);
    setOpen(true);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Enter a role name.");
      return;
    }
    editing ? update.mutate() : create.mutate();
  };
  return (
    <AccessPage
      actions={
        <Button onClick={() => begin()}>
          <Plus className="mr-2 h-4 w-4" />
          Create role
        </Button>
      }
    >
      <Panel title="User roles" className="p-0">
        <div className="border-b border-[var(--op-border-soft)] p-4">
          <SearchControl
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search user roles..."
          />
        </div>
        <DataTable
          columns={[
            "Role",
            "Description",
            "Members",
            "Scope",
            "Type",
            "Actions",
          ]}
          rows={(query.data?.items || []).map((role) => [
            role.name,
            role.description || "-",
            role.users_count ?? 0,
            role.scope || "Organisation",
            <StatusBadge
              key={`${role.id}-type`}
              status={role.is_system_role ? "System" : "Custom"}
            />,
            <div key={`${role.id}-actions`} className="flex gap-2">
              <Button
                size="icon"
                variant="outline"
                title="Edit role"
                disabled={role.is_system_role}
                onClick={() => begin(role)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                title="Clone role"
                onClick={() => {
                  setCloneRole(role);
                  setCloneName(`${role.name} Copy`);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                title="Delete role"
                disabled={role.is_system_role || Boolean(role.users_count)}
                onClick={() => setDeleteRole(role)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>,
          ])}
          total={query.data?.total || 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          empty={
            query.isError
              ? "User roles are unavailable."
              : "No user roles found."
          }
        />
      </Panel>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit user role" : "Create user role"}
              </DialogTitle>
              <DialogDescription>
                This role belongs only to the current organisation. Participant
                roles remain separate.
              </DialogDescription>
            </DialogHeader>
            <label className="block text-sm font-medium text-[var(--op-text)]">
              Role name
              <Input
                className="mt-2"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </label>
            <label className="block text-sm font-medium text-[var(--op-text)]">
              Description
              <textarea
                className="mt-2 min-h-24 w-full rounded-md border border-[var(--op-border)] bg-[var(--op-panel-bg)] px-3 py-2 text-sm text-[var(--op-text)]"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
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
              <Button
                type="submit"
                disabled={create.isPending || update.isPending}
              >
                {create.isPending || update.isPending
                  ? "Saving..."
                  : editing
                    ? "Save role"
                    : "Create role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(cloneRole)}
        onOpenChange={(value) => {
          if (!value) setCloneRole(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clone user role</DialogTitle>
            <DialogDescription>
              Create an organisation-owned copy of {cloneRole?.name}. Review its
              capabilities before assigning it.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium">
            New role name
            <Input
              className="mt-2"
              value={cloneName}
              onChange={(event) => setCloneName(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneRole(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                !cloneRole || cloneName.trim().length < 2 || clone.isPending
              }
              onClick={() =>
                cloneRole &&
                clone.mutate({ role: cloneRole, nextName: cloneName.trim() })
              }
            >
              {clone.isPending ? "Cloning..." : "Clone role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleteRole)}
        onOpenChange={(value) => {
          if (!value) setDeleteRole(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archive user role</DialogTitle>
            <DialogDescription>
              {deleteRole?.name} will no longer be assignable. Protected roles
              and roles with active members cannot be archived.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRole(null)}>
              Cancel
            </Button>
            <Button
              disabled={!deleteRole || remove.isPending}
              onClick={() => deleteRole && remove.mutate(deleteRole)}
            >
              {remove.isPending ? "Archiving..." : "Archive role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccessPage>
  );
}
