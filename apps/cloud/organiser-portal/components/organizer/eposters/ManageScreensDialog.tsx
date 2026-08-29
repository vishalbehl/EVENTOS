"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, MonitorPlay, CheckSquare, 
  Search, Save, Loader2, MousePointer2,
  CheckCircle2, LayoutGrid, Monitor
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";

interface ManageScreensDialogProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  rooms: any[];
  posters: any[];
  speakers: any[];
  sessions?: any[];
}

export function ManageScreensDialog({
  isOpen,
  onClose,
  eventId,
  rooms,
  posters,
  speakers,
}: ManageScreensDialogProps) {
  const [selectedScreenIds, setSelectedScreenIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [syncAllScreens, setSyncAllScreens] = useState(false);

  const virtualScreens = useMemo(() => {
    const list: any[] = [];
    rooms.forEach(r => {
      const count = r.screen_count || 1;
      for (let i = 1; i <= count; i++) {
        list.push({
          id: `${r.id}_${i}`,
          roomId: r.id,
          roomName: r.name,
          screenNumber: i,
          name: count > 1 ? `${r.name} - Screen ${i}` : `${r.name} Display`,
          capacity: r.capacity
        });
      }
    });
    return list;
  }, [rooms]);

  const activePosters = useMemo(() => {
    return posters.filter(p => p.status === "approved" || p.status === "valid" || p.status === "pending_validation");
  }, [posters]);

  const [screenAssignments, setScreenAssignments] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[] | any> = {};
    activePosters.forEach(p => {
      if (p.assigned_screen_ids && p.assigned_screen_ids.length > 0) {
        p.assigned_screen_ids.forEach((sid: string) => {
          if (!initial[sid]) initial[sid] = [];
          initial[sid].push(p.id);
        });
      } else if (p.assigned_screen_id) {
        if (!initial[p.assigned_screen_id]) initial[p.assigned_screen_id] = [];
        initial[p.assigned_screen_id].push(p.id);
      }
    });
    return initial;
  });

  const getSpeakerName = (poster: any) => {
    const sp = speakers.find(s => s.id === poster.speaker_id);
    if (!sp) return "Unknown Presenter";
    return `${sp.first_name || ""} ${sp.last_name || ""}`.trim();
  };

  const handleSelectScreen = (screenId: string) => {
    if (syncAllScreens) return;
    
    if (isMultiSelectMode) {
      if (selectedScreenIds.includes(screenId)) {
        setSelectedScreenIds(selectedScreenIds.filter(id => id !== screenId));
      } else {
        setSelectedScreenIds([...selectedScreenIds, screenId]);
      }
    } else {
      setSelectedScreenIds([screenId]);
    }
  };

  const handleTogglePoster = (targetScreenIds: string[], posterId: string) => {
    const targets = syncAllScreens ? virtualScreens.map(s => s.id) : targetScreenIds;
    if (targets.length === 0) return;

    setScreenAssignments(prev => {
      const next = { ...prev };
      const allHaveIt = targets.every(sid => (next[sid] || []).includes(posterId));

      targets.forEach(sid => {
        const currentList = next[sid] || [];
        if (allHaveIt) {
          next[sid] = currentList.filter(id => id !== posterId);
        } else {
          if (!currentList.includes(posterId)) {
            next[sid] = [...currentList, posterId];
          }
        }
      });
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates = activePosters.map(p => {
        const assignedTo = Object.keys(screenAssignments).filter(sid => 
          screenAssignments[sid]?.includes(p.id)
        );
        return {
          id: p.id,
          assigned_screen_ids: assignedTo,
          assigned_screen_id: assignedTo[0] || null
        };
      });

      await apiPost(`/events/${eventId}/eposters/batch-screen-assignments`, { updates });
      toast.success("Display configurations updated successfully.");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update configurations");
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
          className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 md:p-8"
        >
          <div className="w-full max-w-6xl h-[90vh] rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-2xl flex flex-col overflow-hidden text-[var(--text-primary)] relative">
            {/* Header */}
            <header className="p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center border border-[var(--pri)]/20">
                  <MonitorPlay className="size-4" />
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
                    Screen Orchestrator
                  </h1>
                  <p className="text-[11px] text-[var(--text-secondary)]">Map posters to onsite display screens</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-[var(--card)] p-1 rounded-lg border border-[var(--border-default)]">
                  <button 
                    type="button"
                    onClick={() => {
                      const next = !syncAllScreens;
                      setSyncAllScreens(next);
                      if (next) setSelectedScreenIds(virtualScreens.map(s => s.id));
                      else setSelectedScreenIds([]);
                    }}
                    className={cn(
                      "h-7 px-2.5 text-xs font-bold rounded-md transition-colors cursor-pointer",
                      syncAllScreens ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    Sync All Screens
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsMultiSelectMode(!isMultiSelectMode);
                      if (!isMultiSelectMode) setSelectedScreenIds(selectedScreenIds.slice(0, 1));
                    }}
                    className={cn(
                      "h-7 px-2.5 text-xs font-bold rounded-md transition-colors cursor-pointer",
                      isMultiSelectMode ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    Multi-Select Mode
                  </button>
                </div>

                <button 
                  type="button"
                  onClick={onClose}
                  className="size-8 rounded-md border border-[var(--border-default)] bg-[var(--card)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer shadow-sm"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            {/* Main Grid View */}
            <div className="flex-1 overflow-hidden p-5 flex gap-5">
              {/* Screen Grid */}
              <div className="flex-1 overflow-y-auto pr-2">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {virtualScreens.map(screen => {
                    const assigned = screenAssignments[screen.id] || [];
                    const isSelected = selectedScreenIds.includes(screen.id);
                    
                    return (
                      <div 
                        key={screen.id}
                        onClick={() => handleSelectScreen(screen.id)}
                        className={cn(
                          "rounded-lg border p-4 cursor-pointer transition-all relative overflow-hidden bg-[var(--bg-surface-2)]",
                          isSelected ? "border-[var(--pri)] ring-1 ring-[var(--pri)] shadow-sm" : "border-[var(--border-default)] hover:border-[var(--pri)]/50"
                        )}
                      >
                        {isSelected && (
                          <div className="absolute top-3 right-3">
                            <CheckCircle2 className="size-4 text-[var(--pri)]" />
                          </div>
                        )}

                        <div className="flex items-center gap-3 mb-3">
                          <div className={cn(
                            "size-10 rounded-lg flex items-center justify-center transition-colors shrink-0",
                            isSelected ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "bg-[var(--card)] border border-[var(--border-default)] text-[var(--text-secondary)]"
                          )}>
                            <Monitor className="size-5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[200px]">{screen.name}</h4>
                            <p className="text-[10px] text-[var(--text-secondary)] uppercase">{screen.roomName} • Screen #{screen.screenNumber}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--border-subtle)]">
                          <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Assigned Posters:</span>
                          <span className="font-bold text-[var(--pri)]">{assigned.length}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Side Panel: Poster Selector */}
              <div className="w-[360px] flex flex-col rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] overflow-hidden shrink-0">
                <div className="p-4 border-b border-[var(--border-subtle)] space-y-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                      {selectedScreenIds.length > 0 ? (
                        syncAllScreens ? "Syncing All Screens" : 
                        selectedScreenIds.length === 1 ? "Assign Posters" : 
                        `Editing ${selectedScreenIds.length} Screens`
                      ) : "Select a Screen"}
                    </h3>
                    {(selectedScreenIds.length > 0 || syncAllScreens) && (
                      <div className="flex gap-1.5">
                        <button 
                          type="button"
                          onClick={() => {
                            const targetIds = syncAllScreens ? virtualScreens.map(s => s.id) : selectedScreenIds;
                            setScreenAssignments(prev => {
                              const next = { ...prev };
                              targetIds.forEach(sid => next[sid] = activePosters.map(p => p.id));
                              return next;
                            });
                          }} 
                          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[var(--card)] border border-[var(--border-default)] text-[var(--pri)] cursor-pointer"
                        >All</button>
                        <button 
                          type="button"
                          onClick={() => {
                            const targetIds = syncAllScreens ? virtualScreens.map(s => s.id) : selectedScreenIds;
                            setScreenAssignments(prev => {
                              const next = { ...prev };
                              targetIds.forEach(sid => next[sid] = []);
                              return next;
                            });
                          }} 
                          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[var(--card)] border border-[var(--border-default)] text-rose-500 cursor-pointer"
                        >Clear</button>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                    <Input 
                      placeholder="Search posters or speakers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 pl-8 bg-[var(--card)] border-[var(--border-default)] rounded-lg text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 text-xs">
                  {selectedScreenIds.length === 0 && !syncAllScreens ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--text-secondary)]">
                      <MousePointer2 className="size-8 text-[var(--text-tertiary)] mb-2" />
                      <p className="font-semibold text-xs text-[var(--text-primary)]">Click a screen to assign posters</p>
                    </div>
                  ) : filteredPosters.length === 0 ? (
                    <div className="text-center py-10 text-[var(--text-secondary)]">No posters found.</div>
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
                            "flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors cursor-pointer bg-[var(--card)]",
                            isAssigned 
                              ? "bg-[var(--pri)]/10 border-[var(--pri)]/30" 
                              : isPartiallyAssigned
                                ? "bg-amber-500/10 border-amber-500/30"
                                : "border-[var(--border-default)] hover:border-[var(--pri)]"
                          )}
                        >
                          <div className={cn(
                            "size-4 rounded border flex items-center justify-center transition-colors shrink-0",
                            isAssigned ? "bg-[var(--pri)] border-[var(--pri)] text-white" : 
                            isPartiallyAssigned ? "bg-amber-500 border-amber-500 text-white" : "border-[var(--border-default)]"
                          )}>
                            {isAssigned && <CheckSquare className="size-3" />}
                            {isPartiallyAssigned && <div className="h-0.5 w-2 bg-white rounded-full" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{poster.title}</p>
                            <p className="text-[10px] text-[var(--text-secondary)] truncate">{getSpeakerName(poster)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Status Bar */}
                <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--card)]">
                  <Button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full h-9 bg-[var(--pri)] hover:opacity-90 text-[var(--primary-contrast)] font-bold text-xs rounded-lg shadow-sm border-0 cursor-pointer"
                  >
                    {isSaving ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Save className="size-3.5 mr-1.5" />}
                    Sync Configuration
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
