"use client";

import { FormEvent, useState } from "react";
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
import { apiClient, apiGet } from "@/lib/api-client";
import { DataTable, Panel, ToolbarSearch } from "../OrganiserPrimitives";
import { PeoplePage, type TeamRecord } from "./shared";

export function PeopleTeamsTab() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["organisation", "teams", page, pageSize, search],
    queryFn: () =>
      apiGet<{ items: TeamRecord[]; total: number }>(
        `/organiser/teams?page=${page}&page_size=${pageSize}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`,
      ),
  });
  const members = useQuery({
    queryKey: ["organisation", "team-owner-options"],
    queryFn: () =>
      apiGet<{
        items: Array<{ id: string; name: string; is_active: boolean }>;
      }>("/organiser/members?page=1&page_size=100&status=active"),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRecord | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerMemberId, setOwnerMemberId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [archiveTeam, setArchiveTeam] = useState<TeamRecord | null>(null);
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["organisation", "teams"] });
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        owner_member_id: ownerMemberId || null,
      };
      return editing
        ? apiClient.patch(`/organiser/teams/${editing.id}`, payload, {
            headers: { "If-Match": String(editing.version) },
          })
        : apiClient.post("/organiser/teams", payload, {
            headers: { "Idempotency-Key": crypto.randomUUID() },
          });
    },
    onSuccess: async () => {
      await refresh();
      setOpen(false);
    },
    onError: (reason: any) =>
      setError(reason?.message || "The team could not be saved."),
  });
  const remove = useMutation({
    mutationFn: (team: TeamRecord) =>
      apiClient.delete(`/organiser/teams/${team.id}`, {
        headers: { "If-Match": String(team.version) },
      }),
    onSuccess: async () => {
      await refresh();
      setArchiveTeam(null);
    },
    onError: (reason: any) =>
      setError(reason?.message || "The team could not be deleted."),
  });
  const startCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setOwnerMemberId("");
    setError(null);
    setOpen(true);
  };
  const startEdit = (team: TeamRecord) => {
    setEditing(team);
    setName(team.name);
    setDescription(team.description || "");
    setOwnerMemberId(team.owner_member_id || "");
    setError(null);
    setOpen(true);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
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
        <Button onClick={startCreate}>
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
          rows={(query.data?.items || []).map((team) => [
            team.name,
            members.data?.items.find(
              (member) => member.id === team.owner_member_id,
            )?.name || "Unassigned",
            team.member_count,
            team.events.length,
            team.updated_at ? new Date(team.updated_at).toLocaleString() : "-",
            <div key={`${team.id}-actions`} className="flex gap-2">
              <Button
                size="icon"
                variant="outline"
                title="Edit team"
                aria-label={`Edit ${team.name}`}
                onClick={() => startEdit(team)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                title="Archive team"
                aria-label={`Archive ${team.name}`}
                disabled={remove.isPending}
                onClick={() => setArchiveTeam(team)}
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
      <Dialog open={open} onOpenChange={setOpen}>
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
              <Button type="submit" disabled={save.isPending}>
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
          if (!value) setArchiveTeam(null);
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTeam(null)}>
              Cancel
            </Button>
            <Button
              disabled={!archiveTeam || remove.isPending}
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
