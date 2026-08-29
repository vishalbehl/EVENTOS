"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MonitorPlay,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  X,
  Eye,
  Search,
  Filter,
  FileText,
  Calendar,
  Tag,
  CheckSquare,
  Square,
  Trash2,
  Save,
  Loader2,
  Sparkles,
  RefreshCw,
  ScreenShare,
  Pencil,
} from "lucide-react";
import {
  usePosters,
  PosterSummary,
  useUpdatePoster,
  useDeletePoster,
  useBatchDeletePosters,
  useDownloadPoster,
} from "@/hooks/usePosters";
import { useRooms } from "@/hooks/useRooms";
import { useSpeakers } from "@/hooks/useSpeakers";
import { useSessions } from "@/hooks/useSessions";
import { Portal } from "@/components/ui/portal";
import { ManageScreensDialog } from "@/components/organizer/eposters/ManageScreensDialog";
import { CapabilityAction } from "@/lib/capabilities";
import { cn, formatDateInTZ } from "@/lib/utils";

export default function EPostersPage() {
  const params = useParams();
  const eventIdStr = (params?.eventId as string) || "";

  const [selectedPoster, setSelectedPoster] = useState<PosterSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("all");
  const [selectedPosterIds, setSelectedPosterIds] = useState<Set<string>>(new Set());
  const [isManageScreensOpen, setIsManageScreensOpen] = useState(false);

  // Data fetching
  const { data: posters, isLoading: postersLoading, refetch } = usePosters(eventIdStr);
  const { data: rooms } = useRooms(eventIdStr);
  const { data: speakers } = useSpeakers(eventIdStr);
  const { data: sessions } = useSessions(eventIdStr);

  const batchDelete = useBatchDeletePosters(eventIdStr);
  const isTableLoading = postersLoading;

  const getSpeakerName = (poster?: PosterSummary) => {
    if (!poster) return "N/A";
    if (poster.speaker_name) return poster.speaker_name;
    if (poster.speaker_id) {
      const speaker = speakers?.find((s) => s.id === poster.speaker_id);
      if (speaker) return `${speaker.first_name} ${speaker.last_name}`;
    }
    if (poster.session_id && sessions) {
      const session = sessions.find((s) => s.id === poster.session_id);
      if (session && session.speakers && session.speakers.length > 0) {
        return session.speakers.map((s) => s.full_name).join(", ");
      }
    }
    if (poster.authors && poster.authors.trim() !== "") return poster.authors;
    return poster.speaker_id ? "Unknown" : "N/A";
  };

  const eposterRooms = useMemo(
    () => rooms?.filter((r) => r.room_type.toLowerCase().includes("poster")) || [],
    [rooms]
  );
  const totalScreens = useMemo(
    () => eposterRooms.reduce((sum, r) => sum + (r.screen_count || 1), 0),
    [eposterRooms]
  );

  const eposterSessions = useMemo(() => {
    return sessions?.filter((s) => s.session_type?.toLowerCase().includes("poster")) || [];
  }, [sessions]);

  const uniqueDays = useMemo(() => {
    const days = new Set(
      eposterSessions.map((s) => formatDateInTZ(s.start_time, s.event_timezone || "UTC"))
    );
    return Array.from(days);
  }, [eposterSessions]);

  const categories = useMemo(() => {
    const cats = new Set(posters?.map((p) => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [posters]);

  const filteredPosters = useMemo(() => {
    if (!posters) return [];
    return posters.filter((poster) => {
      const matchesSearch =
        searchQuery === "" ||
        poster.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        poster.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        getSpeakerName(poster).toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || poster.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || poster.category === categoryFilter;

      let matchesDay = true;
      if (dayFilter !== "all" && poster.session_id) {
        const session = sessions?.find((s) => s.id === poster.session_id);
        if (session) {
          matchesDay =
            formatDateInTZ(session.start_time, session.event_timezone || "UTC") === dayFilter;
        } else {
          matchesDay = false;
        }
      }

      return matchesSearch && matchesStatus && matchesCategory && matchesDay;
    });
  }, [posters, searchQuery, statusFilter, categoryFilter, dayFilter, sessions]);

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedPosterIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedPosterIds(next);
  };

  const handleSelectAll = () => {
    if (selectedPosterIds.size === filteredPosters.length) {
      setSelectedPosterIds(new Set());
    } else {
      setSelectedPosterIds(new Set(filteredPosters.map((p) => p.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedPosterIds.size} posters?`)) return;
    await batchDelete.mutateAsync(Array.from(selectedPosterIds));
    setSelectedPosterIds(new Set());
  };

  const approvedCount = posters?.filter((p) => p.status === "approved").length || 0;
  const pendingCount =
    posters?.filter((p) => p.status === "pending" || p.status === "submitted" || p.status === "under_review").length || 0;

  return (
    <div className="w-full space-y-6 p-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MonitorPlay className="size-4 text-[var(--pri)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">
              Digital Presentations
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            ePosters & Presentations
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Monitor digital slide decks, manage interactive screen assignments, and review submissions.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={postersLoading}
            className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors shadow-sm cursor-pointer"
            title="Refresh ePosters"
          >
            <RefreshCw className={cn("size-4", postersLoading && "animate-spin")} />
          </button>

          <button
            type="button"
            onClick={() => setIsManageScreensOpen(true)}
            className="flex h-9 items-center gap-2 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-all hover:opacity-90 cursor-pointer"
          >
            <ScreenShare className="size-4" />
            Manage Display Screens ({totalScreens})
          </button>
        </div>
      </div>

      {/* ── KPI Stat Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Total Submissions
          </span>
          <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">
            {posters?.length || 0}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Registered digital posters</span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Display Ready
          </span>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {approvedCount}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Approved for digital kiosks</span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Awaiting Review
          </span>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {pendingCount}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Under verification review</span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Active Screens
          </span>
          <div className="text-2xl font-bold text-[var(--pri)] mt-1">{totalScreens}</div>
          <span className="text-[11px] text-[var(--text-secondary)]">Hardware display nodes</span>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search by title, presenter, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none shadow-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none shadow-sm cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none shadow-sm cursor-pointer"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={dayFilter}
            onChange={(e) => setDayFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none shadow-sm cursor-pointer"
          >
            <option value="all">All Days</option>
            {uniqueDays.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>

          {(statusFilter !== "all" || categoryFilter !== "all" || dayFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setCategoryFilter("all");
                setDayFilter("all");
              }}
              className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors shadow-sm cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Multi-Select Batch Actions Bar ── */}
      {selectedPosterIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--pri)]/30 bg-[var(--pri)]/5 p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-[var(--pri)] text-[10px] font-bold text-[var(--primary-contrast)]">
              {selectedPosterIds.size}
            </span>
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {selectedPosterIds.size} ePoster{selectedPosterIds.size === 1 ? "" : "s"} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <CapabilityAction operation="eposters.manage">
              <button
                type="button"
                onClick={handleBatchDelete}
                disabled={batchDelete.isPending}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-bold text-rose-600 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
              >
                <Trash2 className="size-3.5" />
                Delete Selected
              </button>
            </CapabilityAction>
            <button
              type="button"
              onClick={() => setSelectedPosterIds(new Set())}
              className="flex h-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── ePosters Table ── */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[4%]" />
              <col className="w-[10%]" />
              <col className="w-[36%]" />
              <col className="w-[20%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] select-none">
                <th className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                    title="Select all"
                  >
                    {filteredPosters.length > 0 && selectedPosterIds.size === filteredPosters.length ? (
                      <CheckSquare className="size-4 text-[var(--pri)]" />
                    ) : (
                      <Square className="size-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Poster Title & Category</th>
                <th className="px-4 py-3">Presenter</th>
                <th className="px-4 py-3">Review Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {isTableLoading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-xs text-[var(--text-secondary)]">
                    <RefreshCw className="size-5 text-[var(--pri)] animate-spin mx-auto mb-2" />
                    Loading digital ePosters...
                  </td>
                </tr>
              ) : filteredPosters.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-xs text-[var(--text-secondary)]">
                    <MonitorPlay className="size-6 text-[var(--text-tertiary)] mx-auto mb-2" />
                    No digital ePosters found matching the active filters.
                  </td>
                </tr>
              ) : (
                filteredPosters.map((poster, index) => {
                  const isSelected = selectedPosterIds.has(poster.id);
                  const speakerName = getSpeakerName(poster);
                  return (
                    <tr
                      key={poster.id}
                      onClick={() => setSelectedPoster(poster)}
                      className={cn(
                        "hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer",
                        isSelected && "bg-[var(--pri)]/5"
                      )}
                    >
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(poster.id)}
                          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="size-4 text-[var(--pri)]" />
                          ) : (
                            <Square className="size-4" />
                          )}
                        </button>
                      </td>

                      <td className="px-4 py-3 font-mono text-xs font-bold text-[var(--pri)]">
                        EP{100 + index + 1}
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--text-primary)] line-clamp-1">
                          {poster.title}
                        </p>
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          {poster.category || "General"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--pri)]/10 text-[var(--pri)] text-[10px] font-bold border border-[var(--pri)]/20">
                            {speakerName?.[0] || "P"}
                          </div>
                          <span className="text-xs text-[var(--text-primary)] truncate">
                            {speakerName}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            poster.status === "approved"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : poster.status === "rejected"
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : poster.status === "under_review"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          )}
                        >
                          {poster.status.replace("_", " ")}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedPoster(poster)}
                          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                          title="Inspect ePoster"
                        >
                          <Eye className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Slide-Over Detail Drawer ── */}
      <AnimatePresence>
        {selectedPoster && (
          <Portal>
            <PosterDrawer
              poster={selectedPoster}
              eventId={eventIdStr}
              speakerName={getSpeakerName(selectedPoster)}
              onClose={() => setSelectedPoster(null)}
            />
          </Portal>
        )}
      </AnimatePresence>

      <Portal>
        <ManageScreensDialog
          isOpen={isManageScreensOpen}
          onClose={() => setIsManageScreensOpen(false)}
          eventId={eventIdStr}
          rooms={rooms || []}
          posters={posters || []}
          speakers={speakers || []}
          sessions={sessions || []}
        />
      </Portal>
    </div>
  );
}

/* ── Poster Slide-over Drawer Component ── */
function PosterDrawer({
  poster,
  eventId,
  speakerName,
  onClose,
}: {
  poster: PosterSummary;
  eventId: string;
  speakerName: string;
  onClose: () => void;
}) {
  const updatePoster = useUpdatePoster(eventId);
  const deletePoster = useDeletePoster(eventId);
  const downloadPoster = useDownloadPoster(eventId);

  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({
    title: poster.title,
    category: poster.category,
    status: poster.status,
    authors: poster.authors || "",
    abstract: poster.abstract || "",
  });

  const handleApprove = async () => {
    try {
      await updatePoster.mutateAsync({
        posterId: poster.id,
        data: { status: "approved" } as any,
      });
      onClose();
    } catch (err) {
      console.error("Approve failed", err);
    }
  };

  const handleReject = async () => {
    const reason = prompt("Rejection reason (optional):");
    try {
      await updatePoster.mutateAsync({
        posterId: poster.id,
        data: { status: "rejected", rejection_reason: reason || undefined } as any,
      });
      onClose();
    } catch (err) {
      console.error("Reject failed", err);
    }
  };

  const handleSave = async () => {
    try {
      await updatePoster.mutateAsync({
        posterId: poster.id,
        data: editedData as any,
      });
      setIsEditing(false);
      onClose();
    } catch (err) {
      console.error("Update failed", err);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this poster? This cannot be undone.")) return;
    try {
      await deletePoster.mutateAsync(poster.id);
      onClose();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 z-[90]"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed right-0 top-0 h-full w-[600px] max-w-full bg-[var(--card)] border-l border-[var(--border-default)] z-[100] p-6 flex flex-col shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
              <MonitorPlay className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">ePoster Review</h2>
              <p className="text-[11px] text-[var(--text-secondary)]">ID: {poster.id.slice(0, 8)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="h-8 px-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
            >
              {isEditing ? "Cancel" : "Edit"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deletePoster.isPending}
              className="flex size-8 items-center justify-center rounded-md border border-rose-500/20 bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
              title="Delete poster"
            >
              {deletePoster.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Poster Title</label>
            {isEditing ? (
              <input
                value={editedData.title}
                onChange={(e) => setEditedData({ ...editedData, title: e.target.value })}
                className="h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] font-semibold focus:border-[var(--pri)] focus:outline-none"
              />
            ) : (
              <div className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] text-xs font-semibold text-[var(--text-primary)] leading-relaxed">
                {poster.title}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Category</label>
              {isEditing ? (
                <input
                  value={editedData.category}
                  onChange={(e) => setEditedData({ ...editedData, category: e.target.value })}
                  className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              ) : (
                <div className="p-2.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] font-medium">
                  {poster.category || "General"}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Status</label>
              {isEditing ? (
                <select
                  value={editedData.status}
                  onChange={(e) => setEditedData({ ...editedData, status: e.target.value as any })}
                  className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                >
                  <option value="pending">Pending</option>
                  <option value="submitted">Submitted</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              ) : (
                <div className="p-2.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      poster.status === "approved"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : poster.status === "rejected"
                        ? "bg-rose-500/10 text-rose-600"
                        : "bg-amber-500/10 text-amber-600"
                    )}
                  >
                    {poster.status.replace("_", " ")}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-1">
            <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">Primary Presenter</span>
            <p className="text-xs font-bold text-[var(--text-primary)]">{speakerName}</p>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Authors</label>
            {isEditing ? (
              <input
                value={editedData.authors}
                onChange={(e) => setEditedData({ ...editedData, authors: e.target.value })}
                className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
              />
            ) : (
              <div className="p-2.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] text-xs text-[var(--text-primary)]">
                {poster.authors || "—"}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Abstract Summary</label>
            {isEditing ? (
              <textarea
                value={editedData.abstract}
                onChange={(e) => setEditedData({ ...editedData, abstract: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none resize-none"
              />
            ) : (
              <div className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] text-xs text-[var(--text-secondary)] leading-relaxed italic">
                {poster.abstract || "No abstract provided."}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-[var(--border-subtle)] pt-4 space-y-2 shrink-0">
          {(poster.status === "under_review" || poster.status === "submitted") && !isEditing && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReject}
                disabled={updatePoster.isPending}
                className="flex-1 h-9 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 font-bold text-xs hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={updatePoster.isPending}
                className="flex-[2] h-9 rounded-lg bg-emerald-600 text-white font-bold text-xs shadow-sm hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-1.5"
              >
                {updatePoster.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                Approve ePoster
              </button>
            </div>
          )}

          <div className="flex gap-2">
            {isEditing ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={updatePoster.isPending}
                className="flex-1 h-9 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs shadow-sm hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-1.5"
              >
                {updatePoster.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Save Changes
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!poster.storage_path || downloadPoster.isPending}
                  onClick={() => downloadPoster.mutate(poster.id)}
                  className="flex-1 h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Eye className="size-3.5" /> Preview Slide
                </button>
                <button
                  type="button"
                  disabled={!poster.storage_path || downloadPoster.isPending}
                  onClick={() => downloadPoster.mutate(poster.id)}
                  className="flex-1 h-9 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs shadow-sm hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download className="size-3.5" /> Download File
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
