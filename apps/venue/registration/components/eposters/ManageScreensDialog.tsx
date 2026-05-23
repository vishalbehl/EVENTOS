"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MonitorPlay, Save, CheckCircle2, Circle, ChevronDown, CheckSquare, Square, Users, Search, Loader2, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PosterSummary, useBatchSchedulePosters } from "@/hooks/usePosters";
import { RoomSummary } from "@/hooks/useRooms";
import { SpeakerSummary } from "@/hooks/useSpeakers";
import { SessionSummary } from "@/hooks/useSessions";
import { cn } from "@/lib/utils";

interface ManageScreensDialogProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  rooms: RoomSummary[];
  posters: PosterSummary[];
  speakers: SpeakerSummary[];
  sessions: SessionSummary[];
}

export function ManageScreensDialog({ isOpen, onClose, eventId, rooms, posters, speakers, sessions }: ManageScreensDialogProps) {
  const [selectedScreenIds, setSelectedScreenIds] = useState<string[]>([]);
  const [screenAssignments, setScreenAssignments] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [syncAllScreens, setSyncAllScreens] = useState(false);

  // Generate virtual screens based on room screen_count
  const virtualScreens = useMemo(() => {
    const screens: { id: string; name: string; roomName: string }[] = [];
    let screenIndex = 1;
    rooms.forEach(room => {
      const count = room.screen_count || 1;
      for (let i = 1; i <= count; i++) {
        screens.push({
          id: screenIndex.toString(),
          name: count === 1 ? room.name : `${room.name} - Screen ${i}`,
          roomName: room.name,
        });
        screenIndex++;
      }
    });
    return screens;
  }, [rooms]);

  const activePosters = useMemo(() => {
    return posters.filter(p => p.status !== 'rejected' && p.status !== 'withdrawn');
  }, [posters]);

  const getSpeakerName = (poster?: PosterSummary) => {
    if (!poster) return "N/A";
    if (poster.speaker_name) return poster.speaker_name;
    if (poster.speaker_id) {
      const speaker = speakers.find(s => s.id === poster.speaker_id);
      if (speaker) return `${speaker.first_name} ${speaker.last_name}`;
    }
    if (poster.session_id && sessions) {
      const session = sessions.find(s => s.id === poster.session_id);
      if (session && session.speakers && session.speakers.length > 0) {
        return session.speakers.map(s => s.full_name).join(", ");
      }
    }
    if (poster.authors && poster.authors.trim() !== "") return poster.authors;
    return poster.speaker_id ? "Unknown" : "N/A";
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      const initialAssignments: Record<string, string[]> = {};
      virtualScreens.forEach(s => {
        initialAssignments[s.id] = posters
          .filter(p => {
            if (!p.display_screen) return false;
            const screens = p.display_screen.split(',').map(str => str.trim());
            return screens.includes(s.id);
          })
          .map(p => p.id);
      });
      setScreenAssignments(initialAssignments);
    } else {
      document.body.style.overflow = "unset";
      setSelectedScreenIds([]);
      setSearchQuery("");
      setSyncAllScreens(false);
    }
  }, [isOpen, virtualScreens, posters]);

  const handleSelectScreen = (id: string) => {
    if (isMultiSelectMode) {
      setSelectedScreenIds(prev => {
        const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
        // Keep syncAllScreens in sync with the actual selection
        setSyncAllScreens(next.length === virtualScreens.length);
        return next;
      });
    } else {
      setSelectedScreenIds([id]);
      setSyncAllScreens(virtualScreens.length === 1); // Only true if there's only one screen
    }
  };

  const handleTogglePoster = (screenIds: string[], posterId: string) => {
    setScreenAssignments(prev => {
      const next = { ...prev };
      const targetIds = syncAllScreens ? virtualScreens.map(s => s.id) : screenIds;
      
      targetIds.forEach(sid => {
        const current = next[sid] || [];
        if (current.includes(posterId)) {
          next[sid] = current.filter(id => id !== posterId);
        } else {
          next[sid] = [...current, posterId];
        }
      });
      
      return next;
    });
  };

  const batchScheduleMutation = useBatchSchedulePosters(eventId);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await batchScheduleMutation.mutateAsync(screenAssignments);
      onClose();
    } catch (err: any) {
      console.error("Failed to save assignments", err);
      if (err.response) {
        console.error("Response data:", err.response.data);
        console.error("Response status:", err.response.status);
      } else if (err.request) {
        console.error("No response received. Request details:", err.request);
      } else {
        console.error("Error setting up request:", err.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPosters = useMemo(() => {
    return activePosters.filter(p => 
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      getSpeakerName(p).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [activePosters, searchQuery, speakers]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-[var(--base)] z-[150] flex flex-col"
        >
          {/* Background Elements */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[var(--pri)]/5 blur-[120px] rounded-full animate-pulse-slow" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[var(--sec)]/5 blur-[120px] rounded-full animate-pulse-slow" />
          </div>

          {/* Premium Header */}
          <header className="relative z-10 px-10 pt-12 pb-8 flex items-center justify-between shrink-0">
            <div>
               <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-2xl bg-[var(--pri)]/10 flex items-center justify-center border border-[var(--pri)]/20">
                    <MonitorPlay className="h-5 w-5 text-[var(--pri)]" />
                  </div>
                  <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
                    Screen <span className="text-[var(--sec)]">Orchestrator</span>
                  </h1>
               </div>
               <p className="text-[11px] font-bold text-muted uppercase tracking-[0.3em] ml-1">Mapping knowledge to the physical world</p>
            </div>
            
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2 glass-3d p-1 rounded-2xl border-default mr-4">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      const next = !syncAllScreens;
                      setSyncAllScreens(next);
                      if (next) {
                        setSelectedScreenIds(virtualScreens.map(s => s.id));
                      } else {
                        setSelectedScreenIds([]);
                      }
                    }}
                    className={cn(
                      "h-10 px-4 text-[9px] font-black uppercase tracking-[0.2em] rounded-xl transition-all",
                      syncAllScreens ? "bg-[var(--pri)] text-white" : "text-muted hover:text-[var(--text)]"
                    )}
                  >
                    Sync All Screens
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setIsMultiSelectMode(!isMultiSelectMode);
                      if (!isMultiSelectMode) setSelectedScreenIds(selectedScreenIds.slice(0, 1));
                    }}
                    className={cn(
                      "h-10 px-4 text-[9px] font-black uppercase tracking-[0.2em] rounded-xl transition-all",
                      isMultiSelectMode ? "bg-[var(--sec)] text-white" : "text-muted hover:text-[var(--text)]"
                    )}
                  >
                    Multi-Select Mode
                  </Button>
               </div>

               <Button 
                onClick={onClose}
                variant="ghost"
                className="h-12 w-12 p-0 rounded-full glass-3d border-default text-muted hover:text-[var(--text)] transition-all"
               >
                 <X className="h-5 w-5" />
               </Button>
            </div>
          </header>

          {/* Main Grid View */}
          <div className="flex-1 overflow-hidden px-10 pb-10 flex gap-8">
             {/* Screen Grid */}
             <div className="flex-1 overflow-y-auto no-scrollbar pr-4">
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                   {virtualScreens.map(screen => {
                      const assigned = screenAssignments[screen.id] || [];
                      const isSelected = selectedScreenIds.includes(screen.id);
                      
                      return (
                        <motion.div 
                          key={screen.id}
                          layoutId={screen.id}
                          onClick={() => handleSelectScreen(screen.id)}
                          className={cn(
                            "glass-3d rounded-[2rem] border-default p-8 cursor-pointer transition-all hover-lift-3d group relative overflow-hidden",
                            isSelected ? "ring-2 ring-[var(--pri)] border-[var(--pri)]/30 shadow-[0_20px_50px_rgba(var(--pri-rgb),0.2)]" : "hover:border-[var(--pri)]/30"
                          )}
                        >
                           {isSelected && (
                             <div className="absolute top-0 right-0 p-4">
                               <CheckCircle2 className="h-5 w-5 text-[var(--pri)] animate-in zoom-in duration-300" />
                             </div>
                           )}

                           <div className="flex items-center gap-4 mb-6">
                              <div className={cn(
                                "h-14 w-14 rounded-2xl flex items-center justify-center transition-all",
                                isSelected ? "bg-[var(--pri)] text-white" : "bg-[var(--pri)]/5 text-[var(--pri)] group-hover:bg-[var(--pri)]/10"
                              )}>
                                 <MonitorPlay className="h-7 w-7" />
                              </div>
                              <div>
                                 <h4 className="text-[16px] font-black text-[var(--text)] tracking-tight">{screen.name}</h4>
                                 <p className="text-[10px] font-black text-muted uppercase tracking-widest">{screen.roomName}</p>
                              </div>
                           </div>

                           <div className="space-y-4">
                              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted border-b border-default pb-2">
                                 <span>Assignments</span>
                                 <span className={cn(assigned.length > 0 ? "text-[var(--pri)]" : "")}>{assigned.length} Posters</span>
                              </div>
                              
                              <div className="flex flex-wrap gap-2">
                                 {assigned.length === 0 ? (
                                   <div className="w-full py-4 flex flex-col items-center justify-center rounded-2xl bg-white/5 border border-dashed border-default">
                                      <p className="text-[11px] font-bold text-muted">No posters assigned</p>
                                   </div>
                                 ) : (
                                   assigned.slice(0, 5).map(id => {
                                      const p = activePosters.find(x => x.id === id);
                                      return (
                                        <div key={id} className="h-8 w-8 rounded-full bg-[var(--text)] text-[var(--base)] flex items-center justify-center text-[10px] font-black ring-2 ring-[var(--base)] transition-transform hover:scale-110 shadow-sm" title={p?.title}>
                                          {getSpeakerName(p).charAt(0).toUpperCase()}
                                        </div>
                                      );
                                   })
                                 )}
                                 {assigned.length > 5 && (
                                   <div className="h-8 w-8 rounded-lg bg-white/10 border border-default text-muted flex items-center justify-center text-[10px] font-black">
                                      +{assigned.length - 5}
                                   </div>
                                 )}
                              </div>
                           </div>
                        </motion.div>
                      );
                   })}
                </div>
             </div>

             {/* Side Panel: Poster Selector */}
             <div className="w-[450px] flex flex-col glass-3d rounded-[2.5rem] border-default overflow-hidden relative group">
                <div className="p-8 border-b border-default shrink-0">
                   <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-black text-[var(--text)] tracking-tighter">
                        {selectedScreenIds.length > 0 ? (
                           syncAllScreens ? "Syncing All Screens" : 
                           selectedScreenIds.length === 1 ? "Assign Posters" : 
                           `Editing ${selectedScreenIds.length} Screens`
                        ) : "Select a Screen"}
                      </h3>
                      {(selectedScreenIds.length > 0 || syncAllScreens) && (
                        <div className="flex gap-2">
                           <Button 
                             size="sm" 
                             variant="ghost" 
                             onClick={() => {
                               const targetIds = syncAllScreens ? virtualScreens.map(s => s.id) : selectedScreenIds;
                               setScreenAssignments(prev => {
                                 const next = { ...prev };
                                 targetIds.forEach(sid => next[sid] = activePosters.map(p => p.id));
                                 return next;
                               });
                             }} 
                             className="text-[9px] font-black uppercase tracking-widest text-[var(--pri)] hover:bg-[var(--pri)]/10"
                           >All</Button>
                           <Button 
                             size="sm" 
                             variant="ghost" 
                             onClick={() => {
                               const targetIds = syncAllScreens ? virtualScreens.map(s => s.id) : selectedScreenIds;
                               setScreenAssignments(prev => {
                                 const next = { ...prev };
                                 targetIds.forEach(sid => next[sid] = []);
                                 return next;
                               });
                             }} 
                             className="text-[9px] font-black uppercase tracking-widest text-[var(--dan)] hover:bg-[var(--dan)]/10"
                           >Clear</Button>
                        </div>
                      )}
                   </div>

                   <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input 
                        placeholder="Search posters or speakers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-12 pl-12 bg-white/5 border-default rounded-2xl text-[13px] font-bold focus:ring-[var(--pri)]/30"
                      />
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-2">
                   {selectedScreenIds.length === 0 && !syncAllScreens ? (
                     <div className="h-full flex flex-col items-center justify-center text-center p-10">
                        <div className="h-20 w-20 rounded-full bg-[var(--pri)]/5 border border-[var(--pri)]/20 flex items-center justify-center mb-6">
                           <MousePointer2 className="h-8 w-8 text-[var(--pri)] opacity-50" />
                        </div>
                        <p className="text-[14px] font-bold text-muted">Click a screen on the left to start assigning posters.</p>
                     </div>
                   ) : filteredPosters.length === 0 ? (
                     <div className="text-center py-20 text-muted font-bold">No posters found.</div>
                   ) : (
                     filteredPosters.map(poster => {
                        const isAssigned = syncAllScreens 
                          ? Object.values(screenAssignments).every(ids => ids.includes(poster.id))
                          : selectedScreenIds.every(sid => screenAssignments[sid]?.includes(poster.id));
                        
                        const isPartiallyAssigned = !isAssigned && (
                          syncAllScreens 
                            ? Object.values(screenAssignments).some(ids => ids.includes(poster.id))
                            : selectedScreenIds.some(sid => screenAssignments[sid]?.includes(poster.id))
                        );

                        return (
                          <div 
                            key={poster.id}
                            onClick={() => handleTogglePoster(selectedScreenIds, poster.id)}
                            className={cn(
                              "flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer group",
                              isAssigned 
                                ? "bg-[var(--pri)]/10 border-[var(--pri)]/30" 
                                : isPartiallyAssigned
                                  ? "bg-[var(--warn)]/10 border-[var(--warn)]/30"
                                  : "hover:bg-white/5 border-transparent hover:border-default"
                            )}
                          >
                             <div className={cn(
                               "h-6 w-6 rounded-md border flex items-center justify-center transition-all",
                               isAssigned ? "bg-[var(--pri)] border-[var(--pri)] text-white" : 
                               isPartiallyAssigned ? "bg-[var(--warn)] border-[var(--warn)] text-white" : "border-default"
                             )}>
                                {isAssigned && <CheckSquare className="h-3 w-3" />}
                                {isPartiallyAssigned && <div className="h-1 w-3 bg-white rounded-full" />}
                             </div>
                             <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-bold text-[var(--text)] truncate">{poster.title}</p>
                                <p className="text-[10px] font-black text-muted uppercase tracking-tighter mt-0.5">{getSpeakerName(poster)}</p>
                             </div>
                             <Badge variant="outline" className="text-[8px] opacity-50">{poster.category?.slice(0, 8)}</Badge>
                          </div>
                        );
                     })
                   )}
                </div>

                {/* Status Bar */}
                <div className="p-8 border-t border-default shrink-0 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                   <Button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full h-14 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-lg border-0"
                   >
                     {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                     Sync Configuration
                   </Button>
                </div>
             </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
