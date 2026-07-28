"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MonitorPlay, CheckCircle2, AlertCircle, Clock, BarChart3,
  Download, X, Eye, MousePointer2, Zap, Layout, Search, Filter,
  User, FileText, ChevronRight, Info, ScreenShare, LayoutGrid,
  MoreHorizontal, Calendar, Tag, CheckSquare, Square, Trash2, Save, Loader2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDateInTZ, formatDateTimeInTZ } from "@/lib/utils";
import { 
  usePosters, 
  PosterSummary, 
  useSchedulePoster, 
  useUnschedulePoster, 
  useUpdatePoster, 
  useBatchUpdatePostersStatus,
  useDeletePoster,
  useBatchDeletePosters,
  useDownloadPoster
} from "@/hooks/usePosters";
import { useRooms } from "@/hooks/useRooms";
import { useSpeakers } from "@/hooks/useSpeakers";
import { useSessions } from "@/hooks/useSessions";
import { Portal } from "@/components/ui/portal";
import { ManageScreensDialog } from "@/components/organizer/eposters/ManageScreensDialog";
import { CapabilityAction } from "@/lib/capabilities";

export default function EPostersPage() {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;

  const [selectedPoster, setSelectedPoster] = useState<PosterSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("all");
  const [selectedPosterIds, setSelectedPosterIds] = useState<Set<string>>(new Set());
  const [isManageScreensOpen, setIsManageScreensOpen] = useState(false);

  // Data fetching
  const { data: posters, isLoading: postersLoading } = usePosters(eventIdStr);
  const { data: rooms, isLoading: roomsLoading } = useRooms(eventIdStr);
  const { data: speakers, isLoading: speakersLoading } = useSpeakers(eventIdStr);
  const { data: sessions, isLoading: sessionsLoading } = useSessions(eventIdStr);

  const batchUpdateStatus = useBatchUpdatePostersStatus(eventIdStr);

  // Individual loading states for better UX
  const isTableLoading = postersLoading || speakersLoading;

  const getSpeakerName = (poster?: PosterSummary) => {
    if (!poster) return "N/A";
    
    // 1. Direct speaker_name from backend (Most robust)
    if (poster.speaker_name) return poster.speaker_name;

    // 2. Direct speaker_id lookup (Legacy fallback)
    if (poster.speaker_id) {
      const speaker = speakers?.find(s => s.id === poster.speaker_id);
      if (speaker) return `${speaker.first_name} ${speaker.last_name}`;
    }
    
    // 2. Fallback to session speakers if linked to a session
    if (poster.session_id && sessions) {
      const session = sessions.find(s => s.id === poster.session_id);
      if (session && session.speakers && session.speakers.length > 0) {
        return session.speakers.map(s => s.full_name).join(", ");
      }
    }

    // 3. Authors string
    if (poster.authors && poster.authors.trim() !== "") return poster.authors;
    
    return poster.speaker_id ? "Unknown" : "N/A";
  };

  // Derived data
  const eposterRooms = useMemo(() => rooms?.filter(r => r.room_type.toLowerCase().includes('poster')) || [], [rooms]);
  const totalScreens = useMemo(() => eposterRooms.reduce((sum, r) => sum + (r.screen_count || 1), 0), [eposterRooms]);
  
  const eposterSessions = useMemo(() => {
    return sessions?.filter(s => s.session_type?.toLowerCase().includes('poster')) || [];
  }, [sessions]);

  const uniqueDays = useMemo(() => {
    const days = new Set(eposterSessions.map(s => formatDateInTZ(s.start_time, s.event_timezone || 'UTC')));
    return Array.from(days);
  }, [eposterSessions]);

  const categories = useMemo(() => {
    const cats = new Set(posters?.map(p => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [posters]);

  const filteredPosters = useMemo(() => {
    if (!posters) return [];
    return posters.filter(p => {
      const speakerName = getSpeakerName(p).toLowerCase();
      const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           speakerName.includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
      
      let matchesDay = true;
      if (dayFilter !== "all" && sessions) {
        const session = sessions.find(s => s.id === p.session_id);
        if (session) {
          const sessionDay = formatDateInTZ(session.start_time, session.event_timezone || 'UTC');
          matchesDay = sessionDay === dayFilter;
        } else {
          matchesDay = false;
        }
      }

      return matchesSearch && matchesStatus && matchesCategory && matchesDay;
    });
  }, [posters, searchQuery, statusFilter, categoryFilter, dayFilter, speakers, sessions]);

  const stats = useMemo(() => [
    { label: "Assigned Screens", val: roomsLoading ? "..." : totalScreens.toString(), icon: MonitorPlay, color: "text-[var(--pri)]" },
    { label: "No of Days", val: sessionsLoading ? "..." : uniqueDays.length.toString(), icon: Clock, color: "text-[var(--sec)]" },
    { label: "No of ePosters", val: postersLoading ? "..." : posters?.length.toString() || "0", icon: LayoutGrid, color: "text-[var(--success)]" },
    { label: "Speakers Count", val: postersLoading ? "..." : (new Set(posters?.map(p => p.speaker_id).filter(Boolean)).size.toString()), icon: User, color: "text-[var(--warn)]" },
  ], [roomsLoading, totalScreens, sessionsLoading, uniqueDays, postersLoading, posters]);

  const handleSelectAll = () => {
    if (selectedPosterIds.size === filteredPosters.length) {
      setSelectedPosterIds(new Set());
    } else {
      setSelectedPosterIds(new Set(filteredPosters.map(p => p.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedPosterIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPosterIds(next);
  };

  const batchDelete = useBatchDeletePosters(eventIdStr);

  const handleBatchStatusChange = async (status: string) => {
    if (selectedPosterIds.size === 0) return;
    try {
      await batchUpdateStatus.mutateAsync({
        poster_ids: Array.from(selectedPosterIds),
        status
      });
      setSelectedPosterIds(new Set());
    } catch (err) {
      console.error("Batch update failed", err);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedPosterIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedPosterIds.size} posters? This cannot be undone.`)) return;
    
    try {
      await batchDelete.mutateAsync(Array.from(selectedPosterIds));
      setSelectedPosterIds(new Set());
    } catch (err) {
      console.error("Batch delete failed", err);
    }
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col space-y-6 max-w-[1600px] mx-auto pb-6 animate-fade-in perspective-1000 overflow-hidden">
      <header className="flex flex-col md:flex-row items-center justify-between gap-6 px-2 shrink-0">
        <div>
           <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2 text-glow-indigo">
             ePoster <span className="text-[var(--sec)]">Management</span>
           </h1>
           <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">Orchestrate the digital knowledge wall</p>
        </div>
        <div className="flex items-center gap-4">
           <CapabilityAction operation="eposters.manage">
             <Button 
               onClick={() => setIsManageScreensOpen(true)}
               className="h-12 px-8 font-black uppercase tracking-widest text-[11px] rounded-full shadow-lg border-0 transition-all bg-[var(--pri)] text-[var(--text)] hover:bg-[var(--sec)]"
             >
               <Layout className="mr-2 h-4 w-4" /> Manage Screens
             </Button>
           </CapabilityAction>
        </div>
      </header>

      <section className="grid grid-cols-4 gap-6 shrink-0">
         {stats.map((s, i) => (
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

      <section className="flex items-center justify-between gap-4 px-2 shrink-0">
        <div className="flex items-center gap-3 glass-3d p-2 rounded-2xl border-default flex-1 max-w-4xl">
            <div className="flex items-center gap-2 px-3 border-r border-default flex-1">
               <Search className="h-4 w-4 text-[var(--pri)]" />
               <Input 
                  placeholder="Search posters or speakers..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 bg-transparent border-0 text-[12px] font-bold w-full focus-visible:ring-0" 
               />
            </div>
            
            <div className="flex items-center gap-6 px-3">
               <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted" />
                  <select 
                     value={statusFilter} 
                     onChange={(e) => setStatusFilter(e.target.value)}
                     className="bg-transparent text-[10px] font-black uppercase tracking-widest text-[var(--text)] outline-none cursor-pointer hover:text-[var(--pri)] transition-colors w-24"
                  >
                     <option value="all" className="bg-[var(--base)]">Status</option>
                     <option value="pending" className="bg-[var(--base)]">Pending</option>
                     <option value="submitted" className="bg-[var(--base)]">Submitted</option>
                     <option value="under_review" className="bg-[var(--base)]">Under Review</option>
                     <option value="approved" className="bg-[var(--base)]">Approved</option>
                     <option value="rejected" className="bg-[var(--base)]">Rejected</option>
                  </select>
               </div>

               <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted" />
                  <select 
                     value={categoryFilter} 
                     onChange={(e) => setCategoryFilter(e.target.value)}
                     className="bg-transparent text-[10px] font-black uppercase tracking-widest text-[var(--text)] outline-none cursor-pointer hover:text-[var(--pri)] transition-colors w-24"
                  >
                     <option value="all" className="bg-[var(--base)]">Category</option>
                     {categories.map(cat => (
                       <option key={cat} value={cat} className="bg-[var(--base)]">{cat}</option>
                     ))}
                  </select>
               </div>

               <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted" />
                  <select 
                     value={dayFilter} 
                     onChange={(e) => setDayFilter(e.target.value)}
                     className="bg-transparent text-[10px] font-black uppercase tracking-widest text-[var(--text)] outline-none cursor-pointer hover:text-[var(--pri)] transition-colors w-24"
                  >
                     <option value="all" className="bg-[var(--base)]">Day</option>
                     {uniqueDays.map(day => (
                       <option key={day} value={day} className="bg-[var(--base)]">{day}</option>
                     ))}
                  </select>
               </div>

               {(statusFilter !== "all" || categoryFilter !== "all" || dayFilter !== "all") && (
                  <>
                     <div className="h-4 w-px bg-default" />
                     <button 
                        onClick={() => {
                          setStatusFilter("all");
                          setCategoryFilter("all");
                          setDayFilter("all");
                        }}
                        className="text-[10px] font-black text-[var(--dan)] uppercase tracking-widest hover:scale-105 transition-transform"
                     >
                        Reset
                     </button>
                  </>
               )}
            </div>
        </div>

        <AnimatePresence>
          {selectedPosterIds.size > 0 && (
            <motion.div 
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="flex items-center gap-3 bg-[var(--pri)]/10 border border-[var(--pri)]/30 p-2 rounded-2xl"
            >
              <span className="text-[11px] font-black uppercase tracking-widest px-3 border-r border-[var(--pri)]/30 text-[var(--pri)]">
                {selectedPosterIds.size} Selected
              </span>
              <CapabilityAction operation="eposters.manage">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleBatchDelete}
                  disabled={batchDelete.isPending}
                  className="h-8 w-8 p-0 rounded-lg text-[var(--dan)] hover:bg-[var(--dan)]/10"
                >
                  {batchDelete.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </CapabilityAction>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedPosterIds(new Set())}
                className="h-8 w-8 p-0 rounded-lg text-muted hover:bg-[var(--text)]/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className="flex-1 overflow-hidden min-h-0 px-2">
        <section className="glass-3d rounded-[2.5rem] border-default overflow-hidden flex flex-col h-full">
            <div className="overflow-auto h-full no-scrollbar">
              <table className="w-full border-collapse sticky-header">
                <thead className="sticky top-0 z-10 bg-[color-mix(in_srgb,var(--base)_90%,transparent)] backdrop-blur-md">
                  <tr className="border-b border-default">
                    <th className="py-3 px-6 text-left w-12">
                      <button 
                        onClick={handleSelectAll}
                        className={cn(
                          "h-5 w-5 rounded-md border flex items-center justify-center transition-all",
                          selectedPosterIds.size === filteredPosters.length && filteredPosters.length > 0
                            ? "bg-[var(--pri)] border-[var(--pri)] text-white" 
                            : "border-default hover:border-[var(--pri)]"
                        )}
                      >
                        {selectedPosterIds.size === filteredPosters.length && filteredPosters.length > 0 && <CheckSquare className="h-3 w-3" />}
                      </button>
                    </th>
                    <th className="py-3 px-6 text-left text-[10px] font-black text-muted uppercase tracking-widest">ID</th>
                    <th className="py-3 px-6 text-left text-[10px] font-black text-muted uppercase tracking-widest">Poster Title</th>
                    <th className="py-3 px-6 text-left text-[10px] font-black text-muted uppercase tracking-widest">Speaker</th>
                    <th className="py-3 px-6 text-left text-[10px] font-black text-muted uppercase tracking-widest">Date & Time</th>
                    <th className="py-3 px-6 text-left text-[10px] font-black text-muted uppercase tracking-widest">Status</th>
                    <th className="py-3 px-6 text-right text-[10px] font-black text-muted uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default">
                  {isTableLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="py-3 px-6"><Skeleton className="h-10 w-full" /></td>
                      </tr>
                    ))
                  ) : filteredPosters.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-20 text-center text-muted font-bold">No posters found matching your filters.</td>
                    </tr>
                  ) : (
                    filteredPosters.map((poster, index) => (
                      <tr key={poster.id} className={cn(
                         "group hover:bg-[var(--pri)]/5 transition-all",
                         selectedPosterIds.has(poster.id) && "bg-[var(--pri)]/10"
                      )}>
                        <td className="py-3 px-6">
                           <button 
                            onClick={() => handleToggleSelect(poster.id)}
                            className={cn(
                              "h-5 w-5 rounded-md border flex items-center justify-center transition-all",
                              selectedPosterIds.has(poster.id) 
                                ? "bg-[var(--pri)] border-[var(--pri)] text-white" 
                                : "border-default opacity-0 group-hover:opacity-100"
                            )}
                          >
                            {selectedPosterIds.has(poster.id) && <CheckSquare className="h-3 w-3" />}
                          </button>
                        </td>
                        <td className="py-3 px-6">
                          <span className="text-[11px] font-mono font-black text-muted">EP{100 + index + 1}</span>
                        </td>
                        <td className="py-3 px-6">
                          <div className="max-w-[400px]">
                            <p className="text-[14px] font-black text-[var(--text)] line-clamp-1">{poster.title}</p>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-tighter">{poster.category}</p>
                          </div>
                        </td>
                        <td className="py-3 px-6">
                          <div className="flex items-center gap-3">
                            {(() => {
                              const name = getSpeakerName(poster);
                              const initial = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                              return (
                                <div
                                  className="h-9 w-9 rounded-full bg-[color-mix(in_srgb,var(--pri)_15%,transparent)] border-2 border-[var(--base)] flex items-center justify-center text-[12px] font-black text-[var(--pri)] shadow-sm cursor-help"
                                  title={name}
                                >
                                  {initial}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="py-3 px-6">
                          <div className="flex flex-col">
                            {poster.session_id ? (
                              <>
                                <span className="text-[12px] font-bold text-[var(--text)]">
                                  {(() => {
                                    const session = sessions?.find(s => s.id === poster.session_id);
                                    return session ? formatDateInTZ(session.start_time, session.event_timezone || 'UTC') : "N/A";
                                  })()}
                                </span>
                                <span className="text-[10px] font-medium text-muted">
                                  {(() => {
                                    const session = sessions?.find(s => s.id === poster.session_id);
                                    return session ? formatDateTimeInTZ(session.start_time, session.event_timezone || 'UTC').split(',')[1] : "";
                                  })()}
                                </span>
                              </>
                            ) : (
                              <span className="text-[12px] font-bold text-muted">Not Scheduled</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-6">
                          <Badge className={cn(
                            "px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest border-0",
                            poster.status === 'approved' ? "bg-[var(--success)]/20 text-[var(--success)]" : 
                            poster.status === 'rejected' ? "bg-[var(--dan)]/20 text-[var(--dan)]" : 
                            poster.status === 'under_review' ? "bg-[var(--warn)]/20 text-[var(--warn)]" : 
                            poster.status === 'submitted' ? "bg-[var(--pri)]/20 text-[var(--pri)]" :
                            poster.status === 'pending' ? "bg-muted text-muted-foreground" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {poster.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-3 px-6 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setSelectedPoster(poster)}
                            className="h-9 px-4 rounded-xl border border-default hover:bg-[var(--pri)]/10 text-[11px] font-black uppercase tracking-widest"
                          >
                            <Eye className="h-4 w-4 mr-2" /> View
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
      </div>

      <AnimatePresence>
        {selectedPoster && (
          <Portal>
            <PosterDrawer 
              poster={selectedPoster} 
              speaker={speakers?.find(s => s.id === selectedPoster.speaker_id)}
              eventId={eventIdStr}
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
          rooms={eposterRooms}
          posters={posters || []}
          speakers={speakers || []}
          sessions={sessions || []}
        />
      </Portal>
    </div>
  );
}

function PosterDrawer({ poster, speaker, eventId, onClose }: { poster: PosterSummary, speaker?: any, eventId: string, onClose: () => void }) {
  const updatePoster = useUpdatePoster(eventId);
  const deletePoster = useDeletePoster(eventId);
  const downloadPoster = useDownloadPoster(eventId);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({
    title: poster.title,
    category: poster.category || "",
    abstract: poster.abstract || "",
    authors: poster.authors || "",
    status: poster.status
  });

  const handleApprove = async () => {
    try {
      await updatePoster.mutateAsync({ posterId: poster.id, data: { status: "approved" } as any });
      onClose();
    } catch (err) { console.error("Approve failed", err); }
  };

  const handleReject = async () => {
    const reason = prompt("Rejection reason (optional):");
    try {
      await updatePoster.mutateAsync({ posterId: poster.id, data: { status: "rejected", rejection_reason: reason || undefined } as any });
      onClose();
    } catch (err) { console.error("Reject failed", err); }
  };

  const handleSave = async () => {
    try {
      await updatePoster.mutateAsync({
        posterId: poster.id,
        data: editedData as any
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
        className="fixed inset-0 bg-[var(--base)]/80 backdrop-blur-md z-[90]" 
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed right-0 top-0 h-full w-[600px] glass-3d border-l border-default z-[100] p-10 flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between mb-10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/20 flex items-center justify-center">
              <MonitorPlay className="h-6 w-6 text-[var(--pri)]" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[var(--text)] tracking-tighter">Poster Details</h2>
              <p className="text-[11px] font-black text-muted uppercase tracking-widest">ID: {poster.id.slice(0, 8)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsEditing(!isEditing)} 
              className={cn(
                "h-10 px-4 rounded-full border flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all",
                isEditing ? "bg-[var(--pri)] text-white border-[var(--pri)]" : "border-default text-muted hover:text-[var(--text)]"
              )}
            >
              {isEditing ? "Cancel" : "Edit"}
            </button>
            <button 
              onClick={handleDelete}
              disabled={deletePoster.isPending}
              className="h-10 w-10 rounded-full glass-3d border-default flex items-center justify-center text-[var(--dan)] hover:bg-[var(--dan)]/10 transition-all"
            >
              {deletePoster.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="h-10 w-10 rounded-full glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--text)] transition-all">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-10">
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Poster Title</label>
              {isEditing ? (
                <Input 
                  value={editedData.title}
                  onChange={e => setEditedData({...editedData, title: e.target.value})}
                  className="h-12 glass-3d border-default text-[14px] font-bold"
                />
              ) : (
                <div className="p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default">
                  <p className="text-[14px] font-bold text-[var(--text)] leading-relaxed">{poster.title}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Category</label>
                {isEditing ? (
                  <Input 
                    value={editedData.category}
                    onChange={e => setEditedData({...editedData, category: e.target.value})}
                    className="h-10 glass-3d border-default text-[12px] font-bold"
                  />
                ) : (
                  <div className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default">
                    <p className="text-[13px] font-bold text-[var(--text)]">{poster.category || "General"}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Status</label>
                {isEditing ? (
                  <select 
                    value={editedData.status}
                    onChange={e => setEditedData({...editedData, status: e.target.value as any})}
                    className="w-full h-10 glass-3d border-default rounded-xl px-4 text-[12px] font-bold text-[var(--text)] appearance-none outline-none"
                  >
                    <option value="pending">Pending</option>
                    <option value="submitted">Submitted</option>
                    <option value="under_review">Under Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                ) : (
                  <div className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default">
                    <Badge className={cn(
                      "px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest border-0",
                      poster.status === 'approved' ? "bg-[var(--success)]/20 text-[var(--success)]" : 
                      poster.status === 'rejected' ? "bg-[var(--dan)]/20 text-[var(--dan)]" : 
                      poster.status === 'under_review' ? "bg-[var(--warn)]/20 text-[var(--warn)]" : 
                      poster.status === 'submitted' ? "bg-[var(--pri)]/20 text-[var(--pri)]" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {poster.status.toUpperCase()}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">Primary Speaker</h4>
            <div className="p-6 rounded-[2rem] glass-3d border-default flex items-center gap-6">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[var(--pri)]/20 to-[var(--sec)]/20 flex items-center justify-center text-xl font-black">
                {speaker ? `${speaker.first_name[0]}${speaker.last_name[0]}` : "?"}
              </div>
              <div>
                <p className="text-[16px] font-black text-[var(--text)]">{speaker ? `${speaker.first_name} ${speaker.last_name}` : "Unknown Speaker"}</p>
                <p className="text-[12px] font-bold text-muted">{speaker?.email || "No email available"}</p>
                <p className="text-[11px] font-black text-[var(--pri)] uppercase tracking-widest mt-1">{speaker?.affiliation || "Independent"}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Authors</label>
            {isEditing ? (
              <Input 
                value={editedData.authors}
                onChange={e => setEditedData({...editedData, authors: e.target.value})}
                className="h-12 glass-3d border-default text-[13px] font-bold"
              />
            ) : (
              <div className="p-6 rounded-2xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default">
                <p className="text-[13px] font-bold text-[var(--text)]">{poster.authors || "N/A"}</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Abstract</label>
            {isEditing ? (
              <textarea 
                value={editedData.abstract}
                onChange={e => setEditedData({...editedData, abstract: e.target.value})}
                className="w-full min-h-[150px] glass-3d border-default rounded-2xl p-4 text-[13px] font-bold text-[var(--text)] focus:outline-none resize-none"
              />
            ) : (
              <p className="text-[13px] text-muted leading-relaxed font-bold neomorphic-inset p-6 rounded-[2rem]">
                {poster.abstract || "No abstract provided."}
              </p>
            )}
          </div>
        </div>

        <div className="mt-10 pt-10 border-t border-default shrink-0 space-y-3">
          {/* Quick approve/reject actions for files awaiting review */}
          {(poster.status === "under_review" || poster.status === "submitted") && !isEditing && (
            <div className="flex gap-3">
              <Button
                onClick={handleReject}
                disabled={updatePoster.isPending}
                className="flex-1 h-12 bg-[var(--dan)]/10 hover:bg-[var(--dan)]/20 text-[var(--dan)] border border-[var(--dan)]/30 font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all"
              >
                <X className="h-4 w-4 mr-2" /> Reject
              </Button>
              <Button
                onClick={handleApprove}
                disabled={updatePoster.isPending}
                className="flex-[2] h-12 bg-[var(--success)]/90 hover:bg-[var(--success)] text-white font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-lg border-0 transition-all"
              >
                {updatePoster.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Approve ePoster
              </Button>
            </div>
          )}
          <div className="flex gap-4">
          {isEditing ? (
            <Button 
              onClick={handleSave}
              disabled={updatePoster.isPending}
              className="flex-1 h-14 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-lg border-0"
            >
              {updatePoster.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          ) : (
            <>
              <Button 
                disabled={!poster.storage_path || downloadPoster.isPending}
                onClick={() => downloadPoster.mutate(poster.id)}
                className="flex-1 h-14 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-2xl border border-default transition-all"
              >
                {downloadPoster.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="mr-2 h-4 w-4" />}
                View ePoster
              </Button>
              <Button 
                disabled={!poster.storage_path || downloadPoster.isPending}
                onClick={() => downloadPoster.mutate(poster.id)}
                className="flex-[1.5] h-14 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-lg border-0"
              >
                {downloadPoster.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="mr-2 h-4 w-4" />}
                Download Original
              </Button>
            </>
          )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
