"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Save, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { RecoverableError } from "@/components/super-admin/ui/AsyncState";
import { ConfirmDestructiveAction } from "@/components/super-admin/ui/ConfirmDestructiveAction";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useDeleteGlobalAnnouncement,
  useGlobalAnnouncement,
  useUpdateGlobalAnnouncement,
} from "@/services/platform-communications-service";

export default function AnnouncementDetailPage() {
  const router = useRouter();
  const params = useParams();
  const announcementId = String(params.ticketId || "");
  const announcementQuery = useGlobalAnnouncement(announcementId);
  const updateAnnouncement = useUpdateGlobalAnnouncement();
  const deleteAnnouncement = useDeleteGlobalAnnouncement();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!announcementQuery.data) return;
    setTitle(announcementQuery.data.title);
    setContent(announcementQuery.data.content);
    setIsActive(announcementQuery.data.is_active);
  }, [announcementQuery.data]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required.");
      return;
    }
    try {
      await updateAnnouncement.mutateAsync({
        announcementId,
        payload: {
          title: title.trim(),
          content: content.trim(),
          is_active: isActive,
        },
      });
      toast.success("Announcement updated.");
    } catch (error: any) {
      toast.error(error?.message || "Could not update announcement.");
    }
  };

  return (
    <PageContainer>
      <SectionHeader
        title={announcementQuery.data?.title || "Announcement"}
        description="Edit a global platform announcement."
        breadcrumb={["Console", "Support", "Announcements", announcementId.slice(0, 8)]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/support/announcements")}>
              <ArrowLeft className="mr-2 size-4" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => announcementQuery.refetch()}>
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
          </div>
        }
      />

      {announcementQuery.isError ? (
        <RecoverableError
          title="Announcement could not be loaded"
          description={(announcementQuery.error as Error)?.message || "The platform communications API rejected the request."}
          action={{ label: "Retry", onClick: () => announcementQuery.refetch() }}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Announcement Content</h2>
                <p className="text-xs text-[var(--text-secondary)]">Updates are saved to the global announcements table.</p>
              </div>
              {announcementQuery.data && <StatusBadge status={isActive ? "active" : "disabled"} />}
            </div>
            {announcementQuery.isLoading ? (
              <div className="space-y-4">
                <div className="h-10 animate-pulse rounded-md bg-surface-2" />
                <div className="h-48 animate-pulse rounded-md bg-surface-2" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="announcement-detail-title" className="text-xs font-medium text-[var(--text-secondary)]">Title</label>
                  <Input
                    id="announcement-detail-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="border border-border bg-surface-2"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="announcement-detail-content" className="text-xs font-medium text-[var(--text-secondary)]">Content</label>
                  <Textarea
                    id="announcement-detail-content"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    className="min-h-64 border-border bg-surface-2"
                    required
                  />
                </div>
                <label className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-[var(--text-secondary)]">
                  Active
                  <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                </label>
                <Button type="submit" disabled={updateAnnouncement.isPending}>
                  <Save className="mr-2 size-4" />
                  {updateAnnouncement.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}
          </form>

          <aside className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Record Details</h2>
            <dl className="mt-4 space-y-3 text-xs">
              <div>
                <dt className="text-[var(--text-tertiary)]">Announcement ID</dt>
                <dd className="mt-1 break-all font-mono text-[var(--text-secondary)]">{announcementId}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-tertiary)]">Created</dt>
                <dd className="mt-1 text-[var(--text-secondary)]">
                  {announcementQuery.data?.created_at ? new Date(announcementQuery.data.created_at).toLocaleString() : "Unknown"}
                </dd>
              </div>
            </dl>
            <Button
              type="button"
              variant="destructive"
              className="mt-6 w-full"
              onClick={() => setConfirmDelete(true)}
              disabled={!announcementQuery.data}
            >
              <Trash2 className="mr-2 size-4" />
              Delete Announcement
            </Button>
          </aside>
        </div>
      )}

      <ConfirmDestructiveAction
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete announcement"
        description="This removes the global announcement from the platform communications record."
        confirmLabel="Delete announcement"
        requireReason
        resourceName={announcementQuery.data?.title}
        pending={deleteAnnouncement.isPending}
        onConfirm={async () => {
          try {
            await deleteAnnouncement.mutateAsync(announcementId);
            toast.success("Announcement deleted.");
            router.push("/support/announcements");
          } catch (error: any) {
            toast.error(error?.message || "Could not delete announcement.");
          }
        }}
      />
    </PageContainer>
  );
}
