"use client";

import { Fragment, useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Search,
  Filter,
  Mail,
  CheckCircle2,
  Clock,
  UserPlus,
  FileText,
  X,
  MapPin,
  Send,
  Calendar,
  Loader2,
  RefreshCw,
  Sparkles,
  RotateCcw,
  CheckSquare,
  Square,
  AlertCircle,
  FileUp,
} from "lucide-react";
import { apiPost } from "@/lib/api-client";
import { useSpeakers, SpeakerSummary } from "@/hooks/useSpeakers";
import { usePosters } from "@/hooks/usePosters";
import { useSessions } from "@/hooks/useSessions";
import { useRooms } from "@/hooks/useRooms";
import { useDashboardStats } from "@/hooks/useEvents";
import { SpeakerDrawer } from "@/components/organizer/speakers/SpeakerDrawer";
import { Portal } from "@/components/ui/portal";
import { EmailCampaignDialog } from "@/components/organizer/speakers/EmailCampaignDialog";
import { RegisterSpeakerDialog } from "@/components/organizer/speakers/RegisterSpeakerDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";
import { useOperationAccess } from "@/lib/capabilities";

export default function SpeakersPage() {
  const params = useParams();
  const eventIdStr = (params?.eventId as string) || "";
  const router = useRouter();
  const speakerSendAccess = useOperationAccess("communications.speaker.send");

  const [selectedSpeaker, setSelectedSpeaker] = useState<SpeakerSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

  // Selection & Email state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);

  const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);
  const [syncing, setSyncing] = useState(false);

  const handleSyncFromRegistration = async () => {
    try {
      setSyncing(true);
      const res = await apiPost<{ message: string }>(
        `/events/${eventIdStr}/speakers/fetch-from-registration`
      );
      toast.success(res.message || "Speakers synchronized from registration.");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to sync speakers from registration.");
    } finally {
      setSyncing(false);
    }
  };

  const { data: speakers, isLoading, refetch } = useSpeakers(eventIdStr, {
    search: searchQuery || undefined,
    upload_status: statusFilter || undefined,
    room_id: roomFilter || undefined,
    session_id: sessionFilter || undefined,
  });
  const { data: rooms } = useRooms(eventIdStr);
  const { data: sessions } = useSessions(eventIdStr);
  const { data: posters } = usePosters(eventIdStr);
  const { data: stats } = useDashboardStats(eventIdStr);

  // Deduplicate by Name + Email
  const uniqueSpeakers = useMemo(() => {
    if (!speakers) return [];
    const groups = new Map<string, SpeakerSummary[]>();
    for (const s of speakers) {
      const key = `${s.first_name.trim().toLowerCase()} ${s.last_name.trim().toLowerCase()} | ${s.email.trim().toLowerCase()}`;
      const group = groups.get(key) ?? [];
      group.push(s);
      groups.set(key, group);
    }
    const result = Array.from(groups.values()).map((group) => {
      const base = group.reduce(
        (best, s) => ((s.talks_count || 0) >= (best.talks_count || 0) ? s : best),
        group[0]
      );
      const totalTalks = group.reduce((sum, s) => sum + (s.talks_count || 0), 0);

      const earliestStart = group.reduce((earliest, s) => {
        if (!s.next_talk_start) return earliest;
        if (!earliest) return s.next_talk_start;
        return new Date(s.next_talk_start) < new Date(earliest) ? s.next_talk_start : earliest;
      }, undefined as string | undefined);

      return {
        ...base,
        talks_count: Math.max(base.talks_count || 0, totalTalks),
        next_talk_start: earliestStart,
      };
    });

    const filtered = showIncompleteOnly
      ? result.filter((s) => (s.profile_completeness ?? 0) < 80)
      : result;

    return filtered.sort((a, b) => {
      const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
      const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [speakers, showIncompleteOnly]);

  useEffect(() => {
    if (selectedIds.length > 0) {
      setToolbarActions([
        {
          label: `Email (${selectedIds.length})`,
          icon: Send,
          onClick: () => {
            if (!speakerSendAccess.enabled) {
              toast.error("Speaker messaging is not permitted.");
              return;
            }
            setTargetIds(selectedIds);
            setEmailDialogOpen(true);
          },
          color: "bg-[var(--pri)] text-[var(--primary-contrast)]",
        },
      ]);
    } else {
      setToolbarActions([
        {
          label: "Register Speaker",
          icon: UserPlus,
          onClick: () => setRegisterDialogOpen(true),
          color: "bg-[var(--pri)]/10",
        },
        {
          label: "Global Invite",
          icon: Mail,
          onClick: () => {
            if (!speakerSendAccess.enabled) {
              toast.error("Speaker messaging is not permitted.");
              return;
            }
            if (uniqueSpeakers.length > 0) {
              setTargetIds(uniqueSpeakers.map((s) => s.id));
              setEmailDialogOpen(true);
            }
          },
        },
        {
          label: "Export Roster",
          icon: FileText,
          onClick: () => router.push(`/events/${eventIdStr}/speakers/export`),
        },
      ]);
    }
  }, [
    eventIdStr,
    router,
    selectedIds,
    setToolbarActions,
    uniqueSpeakers,
    speakerSendAccess.enabled,
  ]);

  const toggleSelectAll = () => {
    if (selectedIds.length === uniqueSpeakers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(uniqueSpeakers.map((s) => s.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const approvedCount = uniqueSpeakers.filter((s) => (s.files_approved || 0) > 0).length;
  const pendingCount = uniqueSpeakers.filter((s) => (s.files_pending || 0) > 0).length;
  const incompleteCount = uniqueSpeakers.filter((s) => (s.profile_completeness ?? 0) < 80).length;

  return (
    <div className="w-full space-y-6 p-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="size-4 text-[var(--pri)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">
              Speaker Directory
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Speakers & Presenters Roster
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Manage keynote speakers, track presentation submissions, and dispatch invitations.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading || syncing}
            className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors shadow-sm cursor-pointer"
            title="Refresh speaker roster"
          >
            <RefreshCw className={cn("size-4", (isLoading || syncing) && "animate-spin")} />
          </button>

          <button
            type="button"
            onClick={handleSyncFromRegistration}
            disabled={syncing}
            className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors shadow-sm disabled:opacity-40 cursor-pointer"
          >
            <Sparkles className={cn("size-3.5 text-amber-500", syncing && "animate-spin")} />
            Sync Registrations
          </button>

          <button
            type="button"
            onClick={() => setRegisterDialogOpen(true)}
            className="flex h-9 items-center gap-2 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-all hover:opacity-90 cursor-pointer"
          >
            <UserPlus className="size-4" />
            Register Speaker
          </button>
        </div>
      </div>

      {/* ── KPI Metrics Bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Total Speakers
          </span>
          <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">
            {uniqueSpeakers.length}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">All registered presenters</span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Slides Approved
          </span>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {approvedCount}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Passed QA screening</span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Pending Submissions
          </span>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {pendingCount}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Awaiting file upload</span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Incomplete Profiles
          </span>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {incompleteCount}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">&lt;80% bio completion</span>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search by name, email, or affiliation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none shadow-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none shadow-sm cursor-pointer"
          >
            <option value="">All Rooms</option>
            {rooms?.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="h-9 max-w-48 truncate rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none shadow-sm cursor-pointer"
          >
            <option value="">All Sessions</option>
            {sessions?.map((s: any) => (
              <option key={s.id} value={s.id}>
                [{s.session_code}] {s.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none shadow-sm cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="uploaded">Uploaded</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <button
            type="button"
            onClick={() => setShowIncompleteOnly(!showIncompleteOnly)}
            className={cn(
              "h-9 rounded-lg border px-3 text-xs font-semibold transition-colors cursor-pointer",
              showIncompleteOnly
                ? "border-[var(--pri)] bg-[var(--pri)] text-[var(--primary-contrast)]"
                : "border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
            )}
          >
            Incomplete Only
          </button>

          {(roomFilter || sessionFilter || statusFilter || showIncompleteOnly) && (
            <button
              type="button"
              onClick={() => {
                setRoomFilter("");
                setSessionFilter("");
                setStatusFilter("");
                setShowIncompleteOnly(false);
              }}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors shadow-sm cursor-pointer"
            >
              <RotateCcw className="size-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Multi-Select Batch Actions Bar ── */}
      {selectedIds.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-[var(--pri)]/30 bg-[var(--pri)]/5 p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-[var(--pri)] text-[10px] font-bold text-[var(--primary-contrast)]">
              {selectedIds.length}
            </span>
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {selectedIds.length} speaker{selectedIds.length === 1 ? "" : "s"} selected
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setTargetIds(selectedIds);
              setEmailDialogOpen(true);
            }}
            disabled={speakerSendAccess.loading || !speakerSendAccess.enabled}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--pri)] px-3 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            <Mail className="size-3.5" />
            Bulk Email ({selectedIds.length})
          </button>
        </div>
      )}

      {/* ── Speakers Table ── */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[4%]" />
              <col className="w-[26%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] select-none">
                <th className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                    title="Select all"
                  >
                    {uniqueSpeakers.length > 0 && selectedIds.length === uniqueSpeakers.length ? (
                      <CheckSquare className="size-4 text-[var(--pri)]" />
                    ) : (
                      <Square className="size-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 truncate">Speaker</th>
                <th className="px-4 py-3 truncate">Access Code</th>
                <th className="px-4 py-3 text-center truncate">Sessions</th>
                <th className="px-4 py-3 truncate">Profile Status</th>
                <th className="px-4 py-3 truncate">File QA Status</th>
                <th className="px-4 py-3 text-right truncate">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-[var(--text-secondary)]">
                    <RefreshCw className="size-5 text-[var(--pri)] animate-spin mx-auto mb-2" />
                    Loading speakers roster...
                  </td>
                </tr>
              ) : uniqueSpeakers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-[var(--text-secondary)]">
                    <Users className="size-6 text-[var(--text-tertiary)] mx-auto mb-2" />
                    No speakers found matching your search filters.
                  </td>
                </tr>
              ) : (
                uniqueSpeakers.map((s) => {
                  const isSelected = selectedIds.includes(s.id);
                  const completeness = s.profile_completeness ?? 0;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedSpeaker(s)}
                      className={cn(
                        "hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer",
                        isSelected && "bg-[var(--pri)]/5"
                      )}
                    >
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleSelect(s.id)}
                          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="size-4 text-[var(--pri)]" />
                          ) : (
                            <Square className="size-4" />
                          )}
                        </button>
                      </td>

                      <td className="px-4 py-3 truncate">
                        <div className="flex items-center gap-2.5 truncate">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--pri)]/10 text-[var(--pri)] font-bold text-[10px] border border-[var(--pri)]/20 overflow-hidden">
                            {s.first_name?.[0]}
                            {s.last_name?.[0]}
                          </div>
                          <div className="flex flex-col truncate">
                            <span className="font-semibold text-[var(--text-primary)] truncate">
                              {s.first_name} {s.last_name}
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)] truncate">
                              {s.affiliation || s.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-[var(--pri)]">
                          {s.speaker_code || "---"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-primary)]">
                          {s.talks_count || 0} Talk{s.talks_count === 1 ? "" : "s"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 w-24">
                          <div className="flex items-center justify-between text-[10px] font-bold">
                            <span
                              className={cn(
                                completeness >= 80
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : completeness >= 50
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-rose-600 dark:text-rose-400"
                              )}
                            >
                              {completeness}%
                            </span>
                            <span className="text-[9px] text-[var(--text-tertiary)]">bio</span>
                          </div>
                          <div className="h-1 rounded-full bg-[var(--bg-surface-2)] overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                completeness >= 80
                                  ? "bg-emerald-500"
                                  : completeness >= 50
                                  ? "bg-amber-500"
                                  : "bg-rose-500"
                              )}
                              style={{ width: `${completeness}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-[10px]">
                          {(s.files_approved || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                              <CheckCircle2 className="size-3" /> Approved
                            </span>
                          ) : (s.files_uploaded || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold">
                              <FileUp className="size-3" /> Uploaded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                              <Clock className="size-3" /> Pending
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setTargetIds([s.id]);
                            setEmailDialogOpen(true);
                          }}
                          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                          title="Email speaker"
                        >
                          <Mail className="size-3.5" />
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

      {/* ── Slide-Over Speaker Details Drawer ── */}
      <AnimatePresence>
        {selectedSpeaker && (
          <Portal>
            <SpeakerDrawer
              speaker={selectedSpeaker}
              eventId={eventIdStr}
              onClose={() => setSelectedSpeaker(null)}
            />
          </Portal>
        )}
      </AnimatePresence>

      <Portal>
        <RegisterSpeakerDialog
          isOpen={registerDialogOpen}
          onClose={() => setRegisterDialogOpen(false)}
        />
      </Portal>

      <Portal>
        <EmailCampaignDialog
          isOpen={emailDialogOpen}
          onClose={() => {
            setEmailDialogOpen(false);
            setTargetIds([]);
          }}
          selectedSpeakerIds={targetIds}
          onSuccess={() => setSelectedIds([])}
        />
      </Portal>
    </div>
  );
}
