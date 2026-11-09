"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Calendar,
  Copy,
  Grid2X2,
  List,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useOrganiserNeedsAttention } from "@/hooks/useOrganiserDashboard";
import { useAccessBootstrap } from "@/hooks/useAccessBootstrap";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient, apiGet } from "@/lib/api-client";
import {
  DataTable,
  MetricCard,
  NeedsAttentionPane,
  OrganiserPage,
  Panel,
  PageTabs,
  ReadinessRing,
  StatusBadge,
} from "@/components/organizer/workspace/OrganiserPrimitives";

type EventRow = {
  id: string;
  version: number;
  name: string;
  short_code: string;
  start_date: string;
  end_date: string;
  venue?: string | null;
  timezone?: string | null;
  owner?: string | null;
  status: string;
  source_status: string;
  registrations: number;
  readiness_pct: number;
  banner_url?: string | null;
};
type EventPage = {
  items: EventRow[];
  total: number;
  page: number;
  page_size: number;
  summary: {
    total: number;
    live: number;
    upcoming: number;
    completed: number;
    draft: number;
    archived: number;
  };
};

export function EventsListTab({
  status = "all",
}: {
  status?:
    | "all"
    | "active"
    | "upcoming"
    | "drafts"
    | "archived"
    | "live"
    | "completed";
}) {
  const queryClient = useQueryClient();
  const access = useAccessBootstrap();
  const user = useAuthStore(state => state.user);
  const activeContext = useAuthStore(state => state.activeContext);
  const isContextSwitching = useAuthStore(state => state.isContextSwitching);
  const contextKey = accessContextCacheKey(activeContext, user?.organization_id);
  const hasAction = (action: string) => access.data?.actions.some(granted => granted.toUpperCase() === action) ?? false;
  const canCreate = hasAction("EVENTS:CREATE");
  const canEdit = hasAction("EVENTS:EDIT");
  const canDelete = hasAction("EVENTS:DELETE");
  const retryKeys = useRef(new Map<string, string>());
  const retryKey = (signature: string) => {
    const current = retryKeys.current.get(signature);
    if (current) return current;
    const next = crypto.randomUUID();
    retryKeys.current.set(signature, next);
    return next;
  };
  const [selectedStatus, setSelectedStatus] = useState<string>(status || "all");
  useEffect(() => {
    setSelectedStatus(status || "all");
    setPage(1);
  }, [status]);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => typeof window !== "undefined" && localStorage.getItem("organiser-events-view") === "grid" ? "grid" : "list");
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [lifecycle, setLifecycle] = useState<{
    event: EventRow;
    action: "archive" | "restore";
  } | null>(null);
  const [duplicateEvent, setDuplicateEvent] = useState<EventRow | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState("");
  const { data: attention = [] } = useOrganiserNeedsAttention();
  const events = useQuery({
    queryKey: ["organiser-events", user?.id, contextKey, selectedStatus, search, year, page, pageSize],
    enabled: Boolean(user) && !isContextSwitching,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (selectedStatus !== "all")
        params.set(
          "status",
          selectedStatus === "drafts"
            ? "draft"
            : selectedStatus === "active"
              ? "live"
              : selectedStatus,
        );
      if (search.trim()) params.set("search", search.trim());
      if (year) params.set("year", year);
      return apiGet<EventPage>(`/organiser/events?${params}`);
    },
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["organiser-events"] });
  const duplicate = useMutation({
    mutationFn: (event: EventRow) => {
      if (!canCreate) throw new Error("Your current access does not allow event creation.");
      return apiClient.post(
        `/organiser/events/${event.id}/duplicate`,
        {},
        { headers: { "Idempotency-Key": retryKey(`duplicate:${event.id}`) } },
      );
    },
    onSuccess: async (_, event) => {
      retryKeys.current.delete(`duplicate:${event.id}`);
      await refresh();
      setDuplicateEvent(null);
      toast.success("Event duplicated as a draft.");
    },
    onError: (error: any) =>
      toast.error(error?.message || "Event could not be duplicated."),
  });
  const archive = useMutation({
    mutationFn: ({ event, reason }: { event: EventRow; reason: string }) => {
      if (!canDelete) throw new Error("Your current access does not allow event archival.");
      return apiClient.delete(`/events/${event.id}`, {
        headers: {
          "Idempotency-Key": retryKey(`archive:${event.id}:${reason}`),
          "If-Match": String(event.version),
          "X-Change-Reason": reason,
        },
      });
    },
    onSuccess: async (_, variables) => {
      retryKeys.current.delete(`archive:${variables.event.id}:${variables.reason}`);
      await refresh();
      setLifecycle(null);
      setLifecycleReason("");
      toast.success("Event archived and remains recoverable.");
    },
    onError: async (error: any) => {
      if (error?.status === 412) {
        setLifecycle(null);
        setLifecycleReason("");
        await refresh();
        toast.error("This event changed elsewhere. The list has been refreshed.");
        return;
      }
      toast.error(error?.message || "Event could not be archived.");
    },
  });
  const restore = useMutation({
    mutationFn: ({ event, reason }: { event: EventRow; reason: string }) => {
      if (!canEdit) throw new Error("Your current access does not allow event restoration.");
      return apiClient.post(
        `/organiser/events/${event.id}/restore`,
        {},
        {
          headers: {
            "Idempotency-Key": retryKey(`restore:${event.id}:${reason}`),
            "If-Match": String(event.version),
            "X-Change-Reason": reason,
          },
        },
      );
    },
    onSuccess: async (_, variables) => {
      retryKeys.current.delete(`restore:${variables.event.id}:${variables.reason}`);
      await refresh();
      setLifecycle(null);
      setLifecycleReason("");
      toast.success("Event restored as a draft for review.");
    },
    onError: async (error: any) => {
      if (error?.status === 412) {
        setLifecycle(null);
        setLifecycleReason("");
        await refresh();
        toast.error("This event changed elsewhere. The list has been refreshed.");
        return;
      }
      toast.error(error?.message || "Event could not be restored.");
    },
  });
  const importEvents = useMutation({
    mutationFn: async () => {
      if (!canCreate) throw new Error("Your current access does not allow event imports.");
      if (!importFile) throw new Error("Select a CSV file.");
      const body = new FormData();
      body.append("file", importFile);
      return apiClient.post<{ created: number }>(
        "/organiser/events/import",
        body,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            "Idempotency-Key": retryKey(`import:${importFile.name}:${importFile.size}:${importFile.lastModified}`),
          },
        },
      );
    },
    onSuccess: async (result) => {
      if (importFile) retryKeys.current.delete(`import:${importFile.name}:${importFile.size}:${importFile.lastModified}`);
      await refresh();
      setImportOpen(false);
      setImportFile(null);
      toast.success(
        `${result.created} event${result.created === 1 ? "" : "s"} imported as drafts.`,
      );
    },
    onError: (error: any) =>
      toast.error(error?.message || "Events could not be imported."),
  });
  const data = isContextSwitching ? undefined : events.data;
  const summary = data?.summary;
  const years = Array.from(
    { length: 7 },
    (_, index) => new Date().getFullYear() - 2 + index,
  );

  return (
    <OrganiserPage
      title="Events"
      description="Create, manage and monitor all your events in one place."
      tabs={<PageTabs active={selectedStatus === "active" ? "Ongoing" : selectedStatus === "drafts" ? "Drafts" : selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1)} tabs={[
        { label: "All", href: "/events" },
        { label: "Upcoming", href: "/events?status=upcoming" },
        { label: "Ongoing", href: "/events?status=active" },
        { label: "Completed", href: "/events?status=completed" },
        { label: "Drafts", href: "/events?status=drafts" },
        { label: "Archived", href: "/events?status=archived" },
      ]} />}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" disabled={!canCreate} title={!canCreate ? "Event creation permission is required" : undefined} onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import events
          </Button>
          {canCreate ? <Button asChild><Link href="/events/new"><Plus className="mr-2 h-4 w-4" />Create event</Link></Button> : <Button disabled title="Event creation permission is required"><Plus className="mr-2 h-4 w-4" />Create event</Button>}
        </div>
      }
      attention={<NeedsAttentionPane items={attention} />}
    >
      <div className="op-metric-grid">
        <MetricCard
          label="Total Events"
          value={summary?.total ?? "Unavailable"}
          tone="purple"
          icon={<Calendar className="h-5 w-5" />}
        />
        <MetricCard
          label="Upcoming"
          value={summary?.upcoming ?? "Unavailable"}
          tone="blue"
          icon={<Calendar className="h-5 w-5" />}
        />
        <MetricCard
          label="Ongoing"
          value={summary?.live ?? "Unavailable"}
          tone="green"
          icon={<Calendar className="h-5 w-5" />}
        />
        <MetricCard
          label="Completed"
          value={summary?.completed ?? "Unavailable"}
          tone="purple"
          icon={<Calendar className="h-5 w-5" />}
        />
      </div>
      <Panel
        title={
          selectedStatus === "all"
            ? "All Events"
            : selectedStatus === "active"
              ? "Active Events"
              : selectedStatus === "upcoming"
                ? "Upcoming Events"
                : selectedStatus === "drafts"
                  ? "Draft Events"
                  : selectedStatus === "completed"
                    ? "Completed Events"
                    : selectedStatus === "archived"
                      ? "Archived Events"
                      : "Events"
        }
        className="p-0"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-subtle)] p-4">
          <div className="relative min-w-56 max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search events..."
              className="h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 pr-3 text-xs font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            />
          </div>
          <Select
            value={selectedStatus}
            onValueChange={(val) => {
              setSelectedStatus(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-52" aria-label="Filter by status">
              <SelectValue placeholder="All Events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="flex w-full items-center justify-between gap-3">
                  <span>All Events</span>
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)]">({summary?.total ?? 0})</span>
                </span>
              </SelectItem>
              <SelectItem value="active">
                <span className="flex w-full items-center justify-between gap-3">
                  <span>Active</span>
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)]">({summary?.live ?? 0})</span>
                </span>
              </SelectItem>
              <SelectItem value="upcoming">
                <span className="flex w-full items-center justify-between gap-3">
                  <span>Upcoming</span>
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)]">({summary?.upcoming ?? 0})</span>
                </span>
              </SelectItem>
              <SelectItem value="drafts">
                <span className="flex w-full items-center justify-between gap-3">
                  <span>Drafts</span>
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)]">({summary?.draft ?? 0})</span>
                </span>
              </SelectItem>
              <SelectItem value="completed">
                <span className="flex w-full items-center justify-between gap-3">
                  <span>Completed</span>
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)]">({summary?.completed ?? 0})</span>
                </span>
              </SelectItem>
              <SelectItem value="archived">
                <span className="flex w-full items-center justify-between gap-3">
                  <span>Archived</span>
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)]">({summary?.archived ?? 0})</span>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex rounded-full border border-[var(--org-border)] bg-[var(--org-surface)] p-1" aria-label="Event view">
            <button type="button" aria-label="Grid view" aria-pressed={viewMode === "grid"} onClick={() => { setViewMode("grid"); localStorage.setItem("organiser-events-view", "grid"); }} className={`grid size-8 place-items-center rounded-full ${viewMode === "grid" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}><Grid2X2 className="size-4" /></button>
            <button type="button" aria-label="List view" aria-pressed={viewMode === "list"} onClick={() => { setViewMode("list"); localStorage.setItem("organiser-events-view", "list"); }} className={`grid size-8 place-items-center rounded-full ${viewMode === "list" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}><List className="size-4" /></button>
          </div>
          <Select
            value={year || "all"}
            onValueChange={(val) => {
              setYear(val === "all" ? "" : val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36" aria-label="Filter by year">
              <SelectValue placeholder="All years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {viewMode === "grid" ? (
          <div className="p-4">
            {(data?.items || []).length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {(data?.items || []).map((event) => (
                  <article key={event.id} className="overflow-hidden rounded-[var(--org-card-radius)] border border-[var(--org-border)] bg-[var(--org-surface)] shadow-[var(--org-card-shadow)]">
                    <div className="relative h-36 bg-gradient-to-br from-[var(--org-purple)] to-[var(--org-blue)]">
                      {event.banner_url ? (
                        <img src={event.banner_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-2xl font-extrabold tracking-[0.16em] text-white/90">
                          {event.short_code.slice(0, 3)}
                        </div>
                      )}
                      <div className="absolute right-3 top-3"><StatusBadge status={event.status} /></div>
                    </div>
                    <div className="space-y-4 p-4">
                      <div>
                        <p className="text-base font-extrabold text-[var(--org-text)]">{event.name}</p>
                        <p className="mt-1 text-xs text-[var(--op-muted)]">{event.short_code}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-[var(--op-muted)]">
                        <span>{new Date(event.start_date).toLocaleDateString()} – {new Date(event.end_date).toLocaleDateString()}</span>
                        <span className="inline-flex items-center justify-end gap-1 text-right"><MapPin className="size-3.5" />{event.venue || "Venue not set"}</span>
                        <span><strong className="text-[var(--org-text)]">{event.registrations.toLocaleString()}</strong> registrations</span>
                        <span className="text-right"><strong className="text-[var(--org-text)]">{event.readiness_pct}%</strong> ready</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--org-track)]">
                        <div className="h-full rounded-full bg-[var(--org-purple)]" style={{ width: `${Math.max(0, Math.min(100, event.readiness_pct))}%` }} />
                      </div>
                      <div className="flex items-center gap-2 border-t border-[var(--org-border)] pt-3">
                        <Button asChild size="sm" className="flex-1"><Link href={`/events/${event.id}/dashboard`}>Open event</Link></Button>
                        {event.source_status?.toLowerCase() !== "archived" && (
                          <Button size="icon" variant="outline" aria-label={`Duplicate ${event.name}`} title={!canCreate ? "Event creation permission is required" : undefined} disabled={!canCreate || duplicate.isPending} onClick={() => setDuplicateEvent(event)}><Copy className="size-3.5" /></Button>
                        )}
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={`${event.source_status?.toLowerCase() === "archived" ? "Restore" : "Archive"} ${event.name}`}
                          disabled={event.source_status?.toLowerCase() === "archived" ? !canEdit : !canDelete}
                          title={event.source_status?.toLowerCase() === "archived" ? (!canEdit ? "Event edit permission is required" : undefined) : (!canDelete ? "Event delete permission is required" : undefined)}
                          onClick={() => {
                            setLifecycle({ event, action: event.source_status?.toLowerCase() === "archived" ? "restore" : "archive" });
                            setLifecycleReason("");
                          }}
                        >
                          {event.source_status?.toLowerCase() === "archived" ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-[var(--op-muted)]">
                {events.isError ? "Events are unavailable from the authoritative API." : events.isLoading ? "Loading events..." : "No events match these filters."}
              </div>
            )}
            {(data?.total || 0) > pageSize && (
              <div className="mt-5 flex items-center justify-between border-t border-[var(--org-border)] pt-4 text-xs text-[var(--op-muted)]">
                <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data?.total || 0)} of {data?.total || 0}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page * pageSize >= (data?.total || 0)} onClick={() => setPage((value) => value + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>
        ) : (
        <DataTable
          columns={[
            "Event",
            "Date",
            "Venue",
            "Owner / timezone",
            "Registrations",
            "Readiness",
            "Status",
            "Actions",
          ]}
          total={data?.total || 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          empty={
            events.isError
              ? "Events are unavailable from the authoritative API."
              : events.isLoading
                ? "Loading events..."
                : "No events match these filters."
          }
          rows={(data?.items || []).map((event) => [
            <div key="event" className="flex items-center gap-3">
              <div className="flex h-11 w-16 items-center justify-center overflow-hidden rounded-xl bg-[var(--org-purple)] text-xs font-extrabold text-white">
                {event.banner_url ? <img src={event.banner_url} alt="" className="h-full w-full object-cover" /> : event.short_code.slice(0, 3)}
              </div>
              <div>
                <p className="font-bold">{event.name}</p>
                <p className="text-[11px] text-[var(--op-muted)]">
                  {event.short_code}
                </p>
              </div>
            </div>,
            `${new Date(event.start_date).toLocaleDateString()} - ${new Date(event.end_date).toLocaleDateString()}`,
            <span key="venue" className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[var(--op-primary)]" />
              {event.venue || "Venue not set"}
            </span>,
            <span key="owner" className="text-xs">
              {event.owner || "Owner unavailable"}
              <br />
              <span className="text-[var(--op-muted)]">
                {event.timezone || "Timezone unavailable"}
              </span>
            </span>,
            event.registrations.toLocaleString(),
            <ReadinessRing key="readiness" value={event.readiness_pct} />,
            <StatusBadge key="status" status={event.status} />,
            <div key="actions" className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/events/${event.id}/dashboard`}>Open</Link>
              </Button>
              {event.source_status?.toLowerCase() !== "archived" && (
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={`Duplicate ${event.name}`}
                  disabled={!canCreate || duplicate.isPending}
                  title={!canCreate ? "Event creation permission is required" : "Duplicate event"}
                  onClick={() => setDuplicateEvent(event)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
              {event.source_status?.toLowerCase() === "archived" ? (
                <Button
                  size="icon"
                  variant="outline"
                  title={!canEdit ? "Event edit permission is required" : "Restore event"}
                  aria-label={`Restore ${event.name}`}
                  disabled={!canEdit || restore.isPending}
                  onClick={() => {
                    setLifecycle({ event, action: "restore" });
                    setLifecycleReason("");
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={`Archive ${event.name}`}
                  title={!canDelete ? "Event delete permission is required" : "Archive event"}
                  onClick={() => {
                    setLifecycle({ event, action: "archive" });
                    setLifecycleReason("");
                  }}
                  disabled={!canDelete || archive.isPending}
                >
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>,
          ])}
        />
        )}
      </Panel>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import events</DialogTitle>
            <DialogDescription>
              Upload a UTF-8 CSV. Required columns: name, short_code,
              start_date, end_date. Dates use YYYY-MM-DD. Imported events are
              created as drafts.
            </DialogDescription>
          </DialogHeader>
          <label className="block text-sm font-medium text-[var(--op-text)]">
            CSV file
            <input
              className="mt-2 block w-full rounded-md border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-2 text-sm"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) =>
                setImportFile(event.target.files?.[0] || null)
              }
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => importEvents.mutate()}
              disabled={!canCreate || !importFile || importEvents.isPending}
            >
              {importEvents.isPending ? "Importing..." : "Import events"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(lifecycle)}
        onOpenChange={(open) => !open && setLifecycle(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {lifecycle?.action === "restore"
                ? "Restore event"
                : "Archive event"}
            </DialogTitle>
            <DialogDescription>
              {lifecycle?.action === "restore"
                ? "The event will return as a draft so its setup and entitlements can be reviewed before publishing."
                : "The event will be removed from active work but remain recoverable during its retention period."}
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium">
            Reason
            <textarea
              className="op-textarea mt-2 min-h-24"
              value={lifecycleReason}
              onChange={(event) => setLifecycleReason(event.target.value)}
              placeholder="Provide an audit reason (minimum 12 characters)"
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLifecycle(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                lifecycleReason.trim().length < 12 ||
                archive.isPending ||
                restore.isPending ||
                (lifecycle?.action === "restore" ? !canEdit : !canDelete)
              }
              onClick={() => {
                if (!lifecycle) return;
                const payload = {
                  event: lifecycle.event,
                  reason: lifecycleReason.trim(),
                };
                lifecycle.action === "restore"
                  ? restore.mutate(payload)
                  : archive.mutate(payload);
              }}
            >
              {lifecycle?.action === "restore"
                ? "Restore as draft"
                : "Archive event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(duplicateEvent)}
        onOpenChange={(value) => {
          if (!value) setDuplicateEvent(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate event</DialogTitle>
            <DialogDescription>
              Create a new draft from {duplicateEvent?.name}. Registrations and
              captured payments are not copied.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateEvent(null)}>
              Cancel
            </Button>
            <Button
              disabled={!canCreate || !duplicateEvent || duplicate.isPending}
              onClick={() => duplicateEvent && duplicate.mutate(duplicateEvent)}
            >
              {duplicate.isPending ? "Duplicating..." : "Create draft copy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrganiserPage>
  );
}
