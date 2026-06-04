"use client";

import { Fragment, useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Search, Filter, Mail, MoreHorizontal, CheckCircle2,
  Clock, UserPlus, LayoutList, Columns, FileText, X,
  ChevronDown, MapPin, Presentation, Phone, Trash2, Send, Calendar, Loader2, RefreshCw,
} from "lucide-react";
import { apiPost } from "@/lib/api-client";
import { useSpeakers, SpeakerSummary } from "@/hooks/useSpeakers";
import { usePosters } from "@/hooks/usePosters";
import { useSessions } from "@/hooks/useSessions";
import { useRooms } from "@/hooks/useRooms";
import { useEvent, useDashboardStats } from "@/hooks/useEvents";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SpeakerDrawer } from "@/components/speakers/SpeakerDrawer";
import { Portal } from "@/components/ui/portal";
import { EmailCampaignDialog } from "@/components/speakers/EmailCampaignDialog";
import { RegisterSpeakerDialog } from "@/components/speakers/RegisterSpeakerDialog";
import { toast } from "sonner";
import { cn, formatDateInTZ, formatTimeInTZ } from "@/lib/utils";
import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";

export default function SpeakersPage() {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;

  const [view, setView] = useState<"table" | "kanban">("table");
  const [selectedSpeaker, setSelectedSpeaker] = useState<SpeakerSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [roomFilter, setRoomFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Selection & Email state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);

  const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);

  useEffect(() => {
    if (selectedIds.length > 0) {
      setToolbarActions([
        {
          label: `Email (${selectedIds.length})`,
          icon: Send,
          onClick: () => { setTargetIds(selectedIds); setEmailDialogOpen(true); },
          color: "bg-[var(--pri)] text-[var(--text)]"
        },
        { label: "Delete", icon: Trash2, onClick: () => console.log("Delete"), color: "bg-[var(--dan)]/10 text-[var(--dan)]" },
      ]);
    } else {
      setToolbarActions([
        { label: "Register Speaker", icon: UserPlus, onClick: () => setRegisterDialogOpen(true), color: "bg-[var(--pri)]/10" },
        {
          label: "Global Invite", icon: Mail, onClick: () => {
            if (uniqueSpeakers.length > 0) {
              setTargetIds(uniqueSpeakers.map(s => s.id));
              setEmailDialogOpen(true);
            }
          }
        },
        { label: "Export Roster", icon: FileText, onClick: () => console.log("Export") },
      ]);
    }
  }, [selectedIds, setToolbarActions]);

  const [syncing, setSyncing] = useState(false);

  const handleSyncFromRegistration = async () => {
    try {
      setSyncing(true);
      const res = await apiPost<{ message: string }>(`/events/${eventIdStr}/speakers/fetch-from-registration`);
      toast.success(res.message || "Sync completed successfully.");
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

  // Deduplicate by Name + Email to keep distinct people with same name separate
  const uniqueSpeakers = useMemo(() => {
    if (!speakers) return [];
    const groups = new Map<string, SpeakerSummary[]>();
    for (const s of speakers) {
      const key = `${s.first_name.trim().toLowerCase()} ${s.last_name.trim().toLowerCase()} | ${s.email.trim().toLowerCase()}`;
      const group = groups.get(key) ?? [];
      group.push(s);
      groups.set(key, group);
    }
    return Array.from(groups.values()).map((group) => {
      const base = group.reduce((best, s) => (s.talks_count || 0) >= (best.talks_count || 0) ? s : best, group[0]);
      const totalTalks = group.reduce((sum, s) => sum + (s.talks_count || 0), 0);
      
      const earliestStart = group.reduce((earliest, s) => {
        if (!s.next_talk_start) return earliest;
        if (!earliest) return s.next_talk_start;
        return new Date(s.next_talk_start) < new Date(earliest) ? s.next_talk_start : earliest;
      }, undefined as string | undefined);

      return { 
        ...base, 
        talks_count: Math.max(base.talks_count || 0, totalTalks), 
        next_talk_start: earliestStart 
      };
    }).sort((a, b) => {
      const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
      const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [speakers, posters]);

  // LIVE STATS
  const stats = useMemo(() => {
    const totalTalks = uniqueSpeakers.reduce((acc, s) => acc + (s.talks_count || 0), 0);
    const readyStatuses = ["uploaded", "approved", "valid", "pending_validation", "processing"];
    const readyCount = uniqueSpeakers.filter(s => readyStatuses.includes(s.upload_status || "")).length;
    const pendingCount = uniqueSpeakers.filter(s => s.upload_status === "pending" || !s.upload_status).length;
    const rejectedCount = uniqueSpeakers.filter(s => s.upload_status === "rejected").length;

    return [
      { label: "Total Speakers", val: uniqueSpeakers.length, icon: Users, color: "text-[var(--pri)]" },
      { label: "Total Talks", val: totalTalks, icon: Presentation, color: "text-[var(--sec)]" },
      { label: "Waiting for Files", val: pendingCount, icon: Clock, color: "text-[var(--warn)]" },
      { label: "Need Changes", val: rejectedCount, icon: X, color: "text-[var(--dan)]" },
    ];
  }, [uniqueSpeakers]);

  const activeFilters = [roomFilter, sessionFilter, statusFilter].filter(Boolean).length;

  const toggleSelectAll = () => {
    if (selectedIds.length === uniqueSpeakers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(uniqueSpeakers.map(s => s.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col gap-8 animate-fade-in overflow-hidden">
      <header className="flex-shrink-0 flex flex-col md:flex-row items-center justify-between gap-6 px-2">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2 text-glow-indigo">
            Speaker <span className="text-[var(--sec)]">List</span>
          </h1>
          <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">Manage your speakers</p>
        </div>
        <div className="flex items-center gap-4">
          <AnimatePresence>
            {selectedIds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <Button
                  onClick={() => { setTargetIds(selectedIds); setEmailDialogOpen(true); }}
                  className="h-12 px-8 bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-lg border-0 hover:scale-105 transition-all"
                >
                  <Mail className="mr-2 h-4 w-4" /> Bulk Email ({selectedIds.length})
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full p-1 border border-default">
            <button
              onClick={() => setView("table")}
              className={cn(
                "p-2.5 rounded-full transition-all",
                view === "table" ? "bg-[var(--pri)] text-[var(--text)] shadow-lg" : "text-muted hover:text-muted"
              )}
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("kanban")}
              className={cn(
                "p-2.5 rounded-full transition-all",
                view === "kanban" ? "bg-[var(--pri)] text-[var(--text)] shadow-lg" : "text-muted hover:text-muted"
              )}
            >
              <Columns className="h-4 w-4" />
            </button>
          </div>
          <Button
            onClick={handleSyncFromRegistration}
            disabled={syncing}
            className="h-12 px-6 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default hover-lift-3d"
          >
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Sync Registrations
          </Button>
          <Button
            onClick={() => setRegisterDialogOpen(true)}
            className="h-12 px-8 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] border-0 hover-lift-3d"
          >
            <UserPlus className="mr-2 h-4 w-4" /> Register Speaker
          </Button>
        </div>
      </header>

      {/* Metrics Bar */}
      <section className="flex-shrink-0 grid grid-cols-4 gap-6">
        {stats.map((s) => (
          <div key={s.label} className="glass-3d p-6 rounded-[2rem] border-default flex items-center gap-6 group hover-lift-3d">
            <div className="h-12 w-12 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center group-hover:bg-[var(--pri)]/10 transition-all">
              <s.icon className={cn("h-6 w-6", s.color)} />
            </div>
            <div>
              <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-1">{s.label}</p>
              <p className="text-2xl font-black text-[var(--text)] tracking-tighter">{s.val}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Search and Filter Bar */}
      <section className="flex-shrink-0 flex items-center gap-4 px-2">
        <div className="flex-1 max-w-md relative group">
          <div className="absolute inset-0 bg-[var(--pri)]/5 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
          <div className="relative neomorphic-inset rounded-2xl p-0.5 border border-default focus-within:border-[var(--pri)]/50 transition-all">
            <Search className="absolute left-5 top-3.5 h-4 w-4 text-muted group-focus-within:text-[var(--pri)]" />
            <Input
              placeholder="Search by name, email or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 bg-transparent border-0 pl-14 text-[13px] font-bold text-[var(--text)] placeholder:text-muted focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 glass-3d p-1.5 rounded-2xl border-default">
           <div className="flex items-center gap-2 px-3 border-r border-default">
              <Filter className="h-4 w-4 text-[var(--pri)]" />
              <span className="text-[10px] font-black text-muted uppercase tracking-widest">Filters</span>
           </div>
           
           <div className="flex items-center gap-4 px-3">
              {/* Room Filter */}
              <div className="flex items-center gap-2">
                 <MapPin className="h-3 w-3 text-muted" />
                 <select 
                    value={roomFilter} 
                    onChange={(e) => setRoomFilter(e.target.value)}
                    className="bg-transparent text-[11px] font-black uppercase tracking-widest text-[var(--text)] outline-none cursor-pointer hover:text-[var(--pri)] transition-colors"
                 >
                    <option value="" className="bg-[var(--base)]">All Rooms</option>
                    {rooms?.map((r: any) => (
                       <option key={r.id} value={r.id} className="bg-[var(--base)]">{r.name}</option>
                    ))}
                 </select>
              </div>

              <div className="h-4 w-px bg-default" />

              {/* Session Filter */}
              <div className="flex items-center gap-2">
                 <Calendar className="h-3 w-3 text-muted" />
                 <select 
                    value={sessionFilter} 
                    onChange={(e) => setSessionFilter(e.target.value)}
                    className="bg-transparent text-[11px] font-black uppercase tracking-widest text-[var(--text)] outline-none cursor-pointer hover:text-[var(--pri)] transition-colors max-w-[150px] truncate"
                 >
                    <option value="" className="bg-[var(--base)]">All Sessions</option>
                    {sessions?.map((s: any) => (
                       <option key={s.id} value={s.id} className="bg-[var(--base)]">[{s.session_code}] {s.name}</option>
                    ))}
                 </select>
              </div>

              <div className="h-4 w-px bg-default" />

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                 <CheckCircle2 className="h-3 w-3 text-muted" />
                 <select 
                    value={statusFilter} 
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-transparent text-[11px] font-black uppercase tracking-widest text-[var(--text)] outline-none cursor-pointer hover:text-[var(--pri)] transition-colors"
                 >
                    <option value="" className="bg-[var(--base)]">Any Status</option>
                    <option value="pending" className="bg-[var(--base)]">Pending</option>
                    <option value="uploaded" className="bg-[var(--base)]">Uploaded</option>
                    <option value="approved" className="bg-[var(--base)]">Approved</option>
                    <option value="rejected" className="bg-[var(--base)]">Rejected</option>
                 </select>
              </div>

              {(roomFilter || sessionFilter || statusFilter) && (
                 <>
                    <div className="h-4 w-px bg-default" />
                    <button 
                       onClick={() => { setRoomFilter(""); setSessionFilter(""); setStatusFilter(""); }}
                       className="text-[10px] font-black text-[var(--dan)] uppercase tracking-widest hover:scale-105 transition-transform"
                    >
                       Reset
                    </button>
                 </>
              )}
           </div>
        </div>
      </section>

      {/* Main Table View */}
      <AnimatePresence mode="wait">
        {view === "table" ? (
          <motion.div
            key="table-view"
            initial={{ rotateX: -10, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ rotateX: 10, opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="flex-1 min-h-0 glass-3d rounded-[2.5rem] border-default overflow-hidden flex flex-col"
          >
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-20 glass-3d border-b border-default shadow-sm">
                  <tr>
                    <th className="w-14 p-6">
                      <button
                        onClick={toggleSelectAll}
                        className={cn(
                          "h-5 w-5 rounded border-2 flex items-center justify-center transition-all",
                          selectedIds.length === uniqueSpeakers.length
                            ? "bg-[var(--pri)] border-[var(--pri)] text-[var(--text)]"
                            : "border-default hover:border-[var(--pri)]/50"
                        )}
                      >
                        {selectedIds.length === uniqueSpeakers.length && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                    </th>
                    <th className="text-left p-6 text-[10px] font-black text-muted uppercase tracking-[0.2em]">Speaker</th>
                    <th className="text-left p-6 text-[10px] font-black text-muted uppercase tracking-[0.2em]">Access Code</th>
                    <th className="text-left p-6 text-[10px] font-black text-muted uppercase tracking-[0.2em]">Contact</th>
                    <th className="text-center p-6 text-[10px] font-black text-muted uppercase tracking-[0.2em]">Talks</th>
                    <th className="text-left p-6 text-[10px] font-black text-muted uppercase tracking-[0.2em]">File Status</th>
                    <th className="text-right p-6 text-[10px] font-black text-muted uppercase tracking-[0.2em]">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                  {isLoading ? (
                    [1, 2, 3, 4, 5].map((i) => (
                      <tr key={i}>
                        <td colSpan={7} className="p-6"><Skeleton className="h-12 w-full rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" /></td>
                      </tr>
                    ))
                  ) : uniqueSpeakers.length === 0 ? (
                    <tr><td colSpan={7} className="p-20 text-center text-muted font-bold">No speakers found matching your criteria.</td></tr>
                  ) : (
                    uniqueSpeakers.map((s, idx) => {
                      const isSelected = selectedIds.includes(s.id);
                      return (
                        <tr
                          key={s.id || `speaker-${idx}`}
                          className={cn(
                            "group hover:bg-[var(--pri)]/5 transition-all cursor-pointer",
                            isSelected && "bg-[var(--pri)]/10"
                          )}
                          onClick={() => setSelectedSpeaker(s)}
                        >
                          <td className="p-6" onClick={(e) => { e.stopPropagation(); toggleSelect(s.id); }}>
                            <div className={cn(
                              "h-5 w-5 rounded border-2 flex items-center justify-center transition-all",
                              isSelected
                                ? "bg-[var(--pri)] border-[var(--pri)] text-[var(--text)]"
                                : "border-default group-hover:border-[var(--pri)]/30"
                            )}>
                              {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </div>
                          </td>
                          <td className="p-6">
                            <div>
                              <p className="text-[14px] font-black text-[var(--text)] tracking-tight">{s.first_name} {s.last_name}</p>
                              <p className="text-[10px] font-black text-muted uppercase tracking-widest">{s.affiliation || "Independent"}</p>
                            </div>
                          </td>
                          <td className="p-6">
                            <code className="px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default text-[13px] font-black tracking-widest text-[var(--pri)]">
                              {s.speaker_code || "---"}
                            </code>
                          </td>
                          <td className="p-6">
                            <div className="space-y-1">
                              <p className="text-[12px] font-bold text-muted flex items-center gap-1.5"><Mail className="h-3 w-3 text-[var(--pri)]" /> {s.email}</p>
                              {s.phone && <p className="text-[12px] font-bold text-muted flex items-center gap-1.5"><Phone className="h-3 w-3 text-[var(--sec)]" /> {s.phone}</p>}
                            </div>
                          </td>
                          <td className="p-6 text-center">
                            <Badge className="bg-[var(--sec)]/10 text-[var(--sec)] border-0 font-black text-[10px] px-3 py-1">
                              {s.talks_count} TALK{s.talks_count !== 1 ? "S" : ""}
                            </Badge>
                          </td>

                          <td className="p-6">
                            <div className="w-56">
                              <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1">
                                {(() => {
                                  const total = s.files_total || 1;
                                  const uploaded = s.files_uploaded || 0;
                                  const approved = s.files_approved || 0;
                                  
                                  const isFullyApproved = approved >= total && total > 0;
                                  const isPartiallyApproved = approved > 0 && !isFullyApproved;
                                  const isFullyUploaded = uploaded >= total && total > 0;
                                  const isPartiallyUploaded = uploaded > 0 && !isFullyUploaded;

                                  const activeColor = isFullyApproved
                                    ? "bg-[var(--pri)]"
                                    : isPartiallyApproved || isFullyUploaded || isPartiallyUploaded
                                      ? "bg-[var(--success)]"
                                      : "bg-[var(--warn)]";
                                  
                                  const activeText = isFullyApproved
                                    ? "text-[var(--pri)]"
                                    : isPartiallyApproved || isFullyUploaded || isPartiallyUploaded
                                      ? "text-[var(--success)]"
                                      : "text-[var(--warn)]";

                                  const steps = [
                                    { key: 'pending', label: 'Pending', active: true },
                                    { 
                                      key: 'uploaded', 
                                      label: isPartiallyUploaded ? `${uploaded}/${total} Uploaded` : 'Uploaded', 
                                      active: uploaded > 0 
                                    },
                                    { 
                                      key: 'approved', 
                                      label: isPartiallyApproved ? `${approved}/${total} Approved` : 'Approved', 
                                      active: isFullyApproved 
                                    },
                                  ];

                                  return steps.map((step, idx, arr) => (
                                  <Fragment key={step.key}>
                                    <div className="flex flex-col items-center gap-1 min-w-0">
                                      <div className={cn(
                                        "h-3 w-3 rounded-full border transition-all",
                                        step.active ? `${activeColor} border-transparent shadow-sm` : "bg-transparent border-default"
                                      )} />
                                      <span className={cn(
                                        "text-[8px] font-black uppercase tracking-widest truncate max-w-[80px]",
                                        step.active ? activeText : "text-muted"
                                      )}>
                                        {step.label}
                                      </span>
                                    </div>
                                    {idx < arr.length - 1 && (
                                      <div className={cn(
                                        "h-0.5 w-10 rounded-full transition-all",
                                        arr[idx + 1].active ? activeColor : "bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                                      )} />
                                    )}
                                  </Fragment>
                                  ));
                                })()}
                              </div>
                            </div>
                          </td>
                          <td className="p-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); setTargetIds([s.id]); setEmailDialogOpen(true); }}
                                className="h-9 w-9 rounded-xl glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--pri)] transition-all"
                              >
                                <Mail className="h-4 w-4" />
                              </button>
                              <button className="h-9 w-9 rounded-xl glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--text)] transition-all">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* Kanban placeholder */}
            <div className="p-20 text-center col-span-full glass-3d rounded-3xl border-default text-muted font-black uppercase tracking-widest">
              Board view coming soon
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Modals */}
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
          onClose={() => { setEmailDialogOpen(false); setTargetIds([]); }}
          selectedSpeakerIds={targetIds}
          onSuccess={() => setSelectedIds([])}
        />
      </Portal>
    </div>
  );
}
