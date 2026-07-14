"use client";

import { FormEvent, useMemo, useState } from "react";
import { Megaphone, Plus, RefreshCw, Search, ServerCog, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { RecoverableError } from "@/components/super-admin/ui/AsyncState";
import { ConfirmDestructiveAction } from "@/components/super-admin/ui/ConfirmDestructiveAction";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  GlobalAnnouncement,
  MaintenanceWindowPayload,
  useCreateGlobalAnnouncement,
  useCreateMaintenanceWindow,
  useDeleteGlobalAnnouncement,
  useDeleteMaintenanceWindow,
  useGlobalAnnouncements,
  useMaintenanceWindows,
  useUpdateGlobalAnnouncement,
  useUpdateMaintenanceWindow,
} from "@/services/platform-communications-service";

const defaultMaintenance: MaintenanceWindowPayload = {
  title: "",
  description: "",
  starts_at: "",
  ends_at: "",
  affected_services: [],
  status: "SCHEDULED",
};

function toLocalInputValue(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toIsoFromLocal(value: string) {
  return value ? new Date(value).toISOString() : "";
}

export default function PlatformAnnouncementsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [announcementActive, setAnnouncementActive] = useState(true);
  const [maintenanceDraft, setMaintenanceDraft] = useState<MaintenanceWindowPayload>(defaultMaintenance);
  const [deleteAnnouncement, setDeleteAnnouncement] = useState<GlobalAnnouncement | null>(null);
  const [deleteWindowId, setDeleteWindowId] = useState<string | null>(null);

  const announcementsQuery = useGlobalAnnouncements();
  const maintenanceQuery = useMaintenanceWindows();
  const createAnnouncement = useCreateGlobalAnnouncement();
  const updateAnnouncement = useUpdateGlobalAnnouncement();
  const deleteAnnouncementMutation = useDeleteGlobalAnnouncement();
  const createMaintenance = useCreateMaintenanceWindow();
  const updateMaintenance = useUpdateMaintenanceWindow();
  const deleteMaintenance = useDeleteMaintenanceWindow();

  const announcements = announcementsQuery.data || [];
  const maintenanceWindows = maintenanceQuery.data || [];
  const activeAnnouncements = announcements.filter((item) => item.is_active).length;
  const activeWindows = maintenanceWindows.filter((item) => item.status === "IN_PROGRESS" || item.status === "SCHEDULED").length;

  const filteredAnnouncements = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return announcements;
    return announcements.filter((item) => `${item.title} ${item.content}`.toLowerCase().includes(needle));
  }, [announcements, search]);

  const metrics = [
    { label: "Global announcements", value: announcements.length, icon: Megaphone },
    { label: "Active announcements", value: activeAnnouncements, icon: Megaphone },
    { label: "Maintenance windows", value: maintenanceWindows.length, icon: ServerCog },
    { label: "Upcoming or active", value: activeWindows, icon: RefreshCw },
  ];

  const submitAnnouncement = async (event: FormEvent) => {
    event.preventDefault();
    if (!announcementTitle.trim() || !announcementContent.trim()) {
      toast.error("Announcement title and content are required.");
      return;
    }
    try {
      await createAnnouncement.mutateAsync({
        title: announcementTitle.trim(),
        content: announcementContent.trim(),
        is_active: announcementActive,
      });
      setAnnouncementTitle("");
      setAnnouncementContent("");
      setAnnouncementActive(true);
      toast.success("Global announcement published.");
    } catch (error: any) {
      toast.error(error?.message || "Could not publish announcement.");
    }
  };

  const submitMaintenance = async (event: FormEvent) => {
    event.preventDefault();
    if (!maintenanceDraft.title.trim() || !maintenanceDraft.starts_at || !maintenanceDraft.ends_at) {
      toast.error("Maintenance title, start, and end are required.");
      return;
    }
    try {
      await createMaintenance.mutateAsync({
        ...maintenanceDraft,
        title: maintenanceDraft.title.trim(),
        description: maintenanceDraft.description?.trim() || null,
        starts_at: toIsoFromLocal(maintenanceDraft.starts_at),
        ends_at: toIsoFromLocal(maintenanceDraft.ends_at),
        affected_services: maintenanceDraft.affected_services?.filter(Boolean) || [],
      });
      setMaintenanceDraft(defaultMaintenance);
      toast.success("Maintenance window scheduled.");
    } catch (error: any) {
      toast.error(error?.message || "Could not schedule maintenance.");
    }
  };

  const hasError = announcementsQuery.isError || maintenanceQuery.isError;
  const error = announcementsQuery.error || maintenanceQuery.error;

  return (
    <PageContainer>
      <SectionHeader
        title="Announcements and Maintenance"
        description="Publish global platform messages and coordinate planned service maintenance."
        breadcrumb={["Console", "Support", "Announcements"]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              announcementsQuery.refetch();
              maintenanceQuery.refetch();
            }}
          >
            <RefreshCw className={cn("mr-2 size-4", (announcementsQuery.isFetching || maintenanceQuery.isFetching) && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <MetricRow metrics={metrics} />

      {hasError ? (
        <RecoverableError
          title="Platform communications could not be loaded"
          description={(error as Error)?.message || "The platform communications API rejected the request."}
          action={{
            label: "Retry",
            onClick: () => {
              announcementsQuery.refetch();
              maintenanceQuery.refetch();
            },
          }}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-4">
              <label htmlFor="announcement-search" className="sr-only">Search announcements</label>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <Input
                  id="announcement-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search announcements..."
                  className="border border-border bg-surface-2 pl-9"
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Global Announcements</h2>
                <p className="text-xs text-[var(--text-secondary)]">Messages visible across the platform control surfaces.</p>
              </div>
              <div className="divide-y divide-border/60">
                {announcementsQuery.isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="m-4 h-24 animate-pulse rounded-lg bg-surface-2" />
                  ))
                ) : filteredAnnouncements.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">No announcements found</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">Create the first global announcement from the composer.</p>
                  </div>
                ) : (
                  filteredAnnouncements.map((announcement) => (
                    <article key={announcement.id} className="p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <button
                          type="button"
                          onClick={() => router.push(`/support-center/announcements/${announcement.id}`)}
                          className="min-w-0 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{announcement.title}</h3>
                            <StatusBadge status={announcement.is_active ? "active" : "disabled"} />
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{announcement.content}</p>
                          <p className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">
                            {new Date(announcement.created_at).toLocaleString()}
                          </p>
                        </button>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                await updateAnnouncement.mutateAsync({
                                  announcementId: announcement.id,
                                  payload: { is_active: !announcement.is_active },
                                });
                                toast.success(announcement.is_active ? "Announcement disabled." : "Announcement enabled.");
                              } catch (error: any) {
                                toast.error(error?.message || "Could not update announcement.");
                              }
                            }}
                          >
                            {announcement.is_active ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[var(--status-danger)]"
                            onClick={() => setDeleteAnnouncement(announcement)}
                            aria-label={`Delete ${announcement.title}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Maintenance Windows</h2>
                <p className="text-xs text-[var(--text-secondary)]">Planned downtime and service-impact windows.</p>
              </div>
              <div className="divide-y divide-border/60">
                {maintenanceQuery.isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="m-4 h-20 animate-pulse rounded-lg bg-surface-2" />
                  ))
                ) : maintenanceWindows.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">No maintenance windows scheduled</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">Schedule maintenance from the side panel.</p>
                  </div>
                ) : (
                  maintenanceWindows.map((window) => (
                    <article key={window.id} className="p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{window.title}</h3>
                            <StatusBadge
                              status={
                                window.status === "COMPLETED"
                                  ? "active"
                                  : window.status === "CANCELLED"
                                    ? "disabled"
                                    : "pending"
                              }
                            />
                          </div>
                          {window.description && (
                            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{window.description}</p>
                          )}
                          <p className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">
                            {new Date(window.starts_at).toLocaleString()} to {new Date(window.ends_at).toLocaleString()}
                          </p>
                          {window.affected_services && window.affected_services.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {window.affected_services.map((service) => (
                                <span key={service} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                                  {service}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <select
                            aria-label={`Status for ${window.title}`}
                            value={window.status}
                            onChange={async (event) => {
                              try {
                                await updateMaintenance.mutateAsync({
                                  windowId: window.id,
                                  payload: { status: event.target.value as MaintenanceWindowPayload["status"] },
                                });
                                toast.success("Maintenance status updated.");
                              } catch (error: any) {
                                toast.error(error?.message || "Could not update maintenance window.");
                              }
                            }}
                            className="h-9 rounded-md border border-border bg-surface-2 px-2 text-xs text-[var(--text-primary)]"
                          >
                            <option value="SCHEDULED">SCHEDULED</option>
                            <option value="IN_PROGRESS">IN_PROGRESS</option>
                            <option value="COMPLETED">COMPLETED</option>
                            <option value="CANCELLED">CANCELLED</option>
                          </select>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[var(--status-danger)]"
                            onClick={() => setDeleteWindowId(window.id)}
                            aria-label={`Delete ${window.title}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <form onSubmit={submitAnnouncement} className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Publish Announcement</h2>
                <p className="text-xs text-[var(--text-secondary)]">Global platform messages are not support tickets.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="announcement-title" className="text-xs font-medium text-[var(--text-secondary)]">Title</label>
                  <Input
                    id="announcement-title"
                    value={announcementTitle}
                    onChange={(event) => setAnnouncementTitle(event.target.value)}
                    className="border border-border bg-surface-2"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="announcement-content" className="text-xs font-medium text-[var(--text-secondary)]">Content</label>
                  <Textarea
                    id="announcement-content"
                    value={announcementContent}
                    onChange={(event) => setAnnouncementContent(event.target.value)}
                    className="border-border bg-surface-2"
                    required
                  />
                </div>
                <label className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-[var(--text-secondary)]">
                  Active immediately
                  <input
                    type="checkbox"
                    checked={announcementActive}
                    onChange={(event) => setAnnouncementActive(event.target.checked)}
                  />
                </label>
                <Button type="submit" disabled={createAnnouncement.isPending} className="w-full">
                  <Plus className="mr-2 size-4" />
                  {createAnnouncement.isPending ? "Publishing..." : "Publish Announcement"}
                </Button>
              </div>
            </form>

            <form onSubmit={submitMaintenance} className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Schedule Maintenance</h2>
                <p className="text-xs text-[var(--text-secondary)]">Track planned downtime separately from announcements.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="maintenance-title" className="text-xs font-medium text-[var(--text-secondary)]">Title</label>
                  <Input
                    id="maintenance-title"
                    value={maintenanceDraft.title}
                    onChange={(event) => setMaintenanceDraft((draft) => ({ ...draft, title: event.target.value }))}
                    className="border border-border bg-surface-2"
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="maintenance-start" className="text-xs font-medium text-[var(--text-secondary)]">Starts</label>
                    <Input
                      id="maintenance-start"
                      type="datetime-local"
                      value={toLocalInputValue(maintenanceDraft.starts_at)}
                      onChange={(event) => setMaintenanceDraft((draft) => ({ ...draft, starts_at: event.target.value }))}
                      className="border border-border bg-surface-2"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="maintenance-end" className="text-xs font-medium text-[var(--text-secondary)]">Ends</label>
                    <Input
                      id="maintenance-end"
                      type="datetime-local"
                      value={toLocalInputValue(maintenanceDraft.ends_at)}
                      onChange={(event) => setMaintenanceDraft((draft) => ({ ...draft, ends_at: event.target.value }))}
                      className="border border-border bg-surface-2"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="maintenance-services" className="text-xs font-medium text-[var(--text-secondary)]">Affected services</label>
                  <Input
                    id="maintenance-services"
                    value={(maintenanceDraft.affected_services || []).join(", ")}
                    onChange={(event) =>
                      setMaintenanceDraft((draft) => ({
                        ...draft,
                        affected_services: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                      }))
                    }
                    placeholder="api, registration, billing"
                    className="border border-border bg-surface-2"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="maintenance-description" className="text-xs font-medium text-[var(--text-secondary)]">Description</label>
                  <Textarea
                    id="maintenance-description"
                    value={maintenanceDraft.description || ""}
                    onChange={(event) => setMaintenanceDraft((draft) => ({ ...draft, description: event.target.value }))}
                    className="border-border bg-surface-2"
                  />
                </div>
                <Button type="submit" disabled={createMaintenance.isPending} className="w-full">
                  <Plus className="mr-2 size-4" />
                  {createMaintenance.isPending ? "Scheduling..." : "Schedule Maintenance"}
                </Button>
              </div>
            </form>
          </aside>
        </div>
      )}

      <ConfirmDestructiveAction
        open={Boolean(deleteAnnouncement)}
        onOpenChange={(open) => !open && setDeleteAnnouncement(null)}
        title="Delete announcement"
        description="This removes the global announcement from the platform communications record."
        confirmLabel="Delete announcement"
        requireReason
        resourceName={deleteAnnouncement?.title}
        pending={deleteAnnouncementMutation.isPending}
        onConfirm={async (reason) => {
          if (!deleteAnnouncement) return;
          if (!reason) {
            toast.error("A reason is required to delete an announcement.");
            return;
          }
          try {
            await deleteAnnouncementMutation.mutateAsync({ announcementId: deleteAnnouncement.id, reason });
            toast.success("Announcement deleted.");
            setDeleteAnnouncement(null);
          } catch (error: any) {
            toast.error(error?.message || "Could not delete announcement.");
          }
        }}
      />

      <ConfirmDestructiveAction
        open={Boolean(deleteWindowId)}
        onOpenChange={(open) => !open && setDeleteWindowId(null)}
        title="Delete maintenance window"
        description="This removes the maintenance window record."
        confirmLabel="Delete window"
        requireReason
        pending={deleteMaintenance.isPending}
        onConfirm={async (reason) => {
          if (!deleteWindowId) return;
          if (!reason) {
            toast.error("A reason is required to delete a maintenance window.");
            return;
          }
          try {
            await deleteMaintenance.mutateAsync({ windowId: deleteWindowId, reason });
            toast.success("Maintenance window deleted.");
            setDeleteWindowId(null);
          } catch (error: any) {
            toast.error(error?.message || "Could not delete maintenance window.");
          }
        }}
      />
    </PageContainer>
  );
}
