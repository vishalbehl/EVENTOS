"use client";

import { useModalStore } from "@/store/useModalStore";
import { AnimatePresence, motion } from "framer-motion";
import { 
  X, Mail, Send, TrendingUp, Users, MousePointer2, ShieldCheck, Zap, Globe, 
  FileText, ArrowRight, MapPin, History, Settings, RefreshCw, Monitor,
  Trash2, Save, LayoutGrid, Clock, CheckCircle2, AlertTriangle, ToggleLeft as Toggle,
  Building, Calendar, Coffee
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatTimeInTZ } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useUpdateRoom, useDeleteRoom } from "@/hooks/useRooms";
import { useSessions } from "@/hooks/useSessions";
import { useEvent } from "@/hooks/useEvents";

export function GlobalModal() {
  const { isOpen, type, data, closeModal } = useModalStore();
  const { eventId } = useParams();
  const updateRoom = useUpdateRoom();
  const deleteRoom = useDeleteRoom();
  
  // Local state for real-time room editing
  const [roomData, setRoomData] = useState<any>(null);

  useEffect(() => {
    if (type === 'ROOM_SETTINGS' && data) {
      setRoomData(data);
    }
  }, [type, data]);

  const { data: event } = useEvent(eventId as string);
  const { data: sessions } = useSessions(eventId as string, { room_id: data?.id });

  useEffect(() => {
    if (typeof document !== "undefined") {
      if (isOpen) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "unset";
      }
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "unset";
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFieldChange = async (field: string, value: any) => {
    const updated = { ...roomData, [field]: value };
    setRoomData(updated);
    
    // Real-time update to backend
    try {
      await updateRoom.mutateAsync({
        eventId: eventId as string,
        roomId: data.id,
        data: { [field]: value }
      });
    } catch (error) {
      console.error(`Failed to update ${field}:`, error);
    }
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to decommission this room node? This action cannot be undone.")) {
      try {
        await deleteRoom.mutateAsync({
          eventId: eventId as string,
          roomId: data.id
        });
        closeModal();
      } catch (error) {
        console.error("Failed to delete room:", error);
      }
    }
  };

  const ROOM_TYPES = [
    { value: "presentation", label: "Presentation Hall" },
    { value: "workshop", label: "Workshop Room" },
    { value: "poster", label: "Poster Session" },
    { value: "plenary", label: "Plenary Hall" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
            className="fixed inset-0 bg-[var(--base)]/90 backdrop-blur-xl z-[9998]" 
          />
          
          {/* Modal Container */}
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-10 pointer-events-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              className="w-full max-w-5xl glass-3d border-default rounded-[3rem] p-8 md:p-12 shadow-[0_100px_200px_color-mix(in_srgb,var(--base)_80%,transparent)] overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto relative"
            >
              {/* Close Button - Moved and styled to not overlap */}
              <button 
                onClick={closeModal}
                className="absolute top-8 right-8 h-12 w-12 rounded-full glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--text)] transition-all z-[100] shadow-xl group"
              >
                <X className="h-5 w-5 group-hover:rotate-90 transition-transform" />
              </button>

              {type === 'EMAIL_CAMPAIGN' && data && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-20 relative z-10">
                   <div className="space-y-12">
                      <div className="flex items-center gap-4 mb-2">
                         <Badge className="bg-[var(--pri)]/20 text-[var(--pri)] border-0 text-[10px] font-black tracking-widest px-3 py-1 uppercase">CAMPAIGN ANALYTICS</Badge>
                         <span className="text-[11px] font-mono text-muted">NODE_COMM_W1</span>
                      </div>
                      <h2 className="text-5xl font-black text-[var(--text)] tracking-tighter leading-tight mb-8">{data.name}</h2>
                      
                      <div className="grid grid-cols-3 gap-10">
                         {[
                           { label: "Dispatch Health", val: "99.8%", color: "text-[var(--sec)]" },
                           { label: "Engagement Index", val: "14.2", color: "text-[var(--pri)]" },
                           { label: "Link Velocity", val: "1.2s", color: "text-[var(--success)]" },
                         ].map((metric, i) => (
                           <div key={i} className="space-y-2">
                              <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">{metric.label}</p>
                              <p className={cn("text-4xl font-black tracking-tighter", metric.color)}>{metric.val}</p>
                              <div className="h-1 w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full overflow-hidden">
                                 <motion.div initial={{ width: 0 }} animate={{ width: "80%" }} transition={{ delay: 0.5 + (i*0.2) }} className={cn("h-full", metric.color.replace('text-', 'bg-'))} />
                              </div>
                           </div>
                         ))}
                      </div>

                      <div className="pt-12 border-t border-default space-y-8">
                         <h4 className="text-[11px] font-black text-muted uppercase tracking-[0.2em]">Transmission Insights</h4>
                         <div className="h-64 glass-3d rounded-3xl border-default p-8 flex items-end justify-between gap-4">
                            {[40, 70, 45, 90, 65, 85, 55, 95, 60, 80].map((h, i) => (
                              <motion.div 
                                key={i}
                                initial={{ height: 0 }}
                                animate={{ height: `${h}%` }}
                                transition={{ delay: 0.8 + (i*0.05), type: "spring", stiffness: 100 }}
                                className="flex-1 bg-gradient-to-t from-[var(--pri)] to-[var(--sec)] rounded-t-xl opacity-40 hover:opacity-100 transition-opacity cursor-pointer group relative"
                              >
                                 <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity glass-3d px-2 py-1 rounded text-[9px] font-black text-[var(--text)]">
                                    {h}%
                                 </div>
                              </motion.div>
                            ))}
                         </div>
                      </div>
                   </div>

                   <div className="flex flex-col h-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-l border-default p-10 -m-10 rounded-r-[4rem] space-y-10 pt-24">
                      <h4 className="text-[11px] font-black text-muted uppercase tracking-[0.2em]">Campaign Protocol</h4>
                      <div className="space-y-6">
                         {[
                           { label: "Target Segment", val: "All Confirmed Speakers", icon: Users },
                           { label: "Transmission Node", val: "Global Cluster S1", icon: Globe },
                           { label: "Template Architecture", val: "Glass v4.0 Dark", icon: FileText },
                         ].map((meta, i) => (
                           <div key={i} className="flex gap-4">
                              <div className="h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center shrink-0">
                                 <meta.icon className="h-5 w-5 text-muted" />
                              </div>
                              <div>
                                 <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-0.5">{meta.label}</p>
                                 <p className="text-[13px] font-bold text-[var(--text)]">{meta.val}</p>
                              </div>
                           </div>
                         ))}
                      </div>

                      <div className="mt-auto space-y-4">
                         <Button className="w-full h-14 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-lg border-0 group">
                            Relaunch Campaign <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                         </Button>
                         <Button variant="outline" className="w-full h-14 border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted hover:text-[var(--text)] rounded-2xl text-[11px] font-black uppercase tracking-widest">
                            Technical Logs
                         </Button>
                      </div>
                   </div>
                </div>
              )}

              {type === 'ROOM_SETTINGS' && roomData && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] relative z-10 flex-1 overflow-hidden min-h-0 bg-[#0A0A0A] rounded-[2rem]">
                  {/* Left Panel */}
                  <div className="flex flex-col overflow-hidden min-h-0 p-10 bg-[#0B0C0E]">
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-8 shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-[#1a2118] flex items-center justify-center">
                          <Building className="h-4 w-4 text-[#4ADE80]" />
                        </div>
                        <span className="text-[12px] font-black tracking-widest uppercase text-white">ROOM CONFIGURATION</span>
                      </div>
                      <div className="flex items-center gap-3 px-4 py-2 bg-[#121316] rounded-xl ml-4 border border-[#1f2125]">
                        <MapPin className="h-4 w-4 text-[#888]" />
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-[#ccc] uppercase tracking-widest leading-tight">
                            {event?.venue_name || "Main Convention Center"}
                          </span>
                          {event?.location && (
                            <span className="text-[9px] font-bold text-[#888] uppercase tracking-widest leading-tight">
                              {event.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Title */}
                    <div className="shrink-0 mb-8">
                      <div className="flex items-center gap-5 mb-2">
                        <h2 className="text-4xl font-black text-white tracking-tighter leading-none">{roomData.name}</h2>
                        <div className="flex items-center gap-2 px-3 py-1 bg-transparent border border-[#2e3328] rounded-full">
                          <div className="h-2 w-2 rounded-full bg-[#4ADE80]" />
                          <span className="text-[10px] font-black text-[#4ADE80] uppercase tracking-widest">ACTIVE</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] font-medium text-[#888] max-w-sm leading-relaxed">
                          Manage schedules, capacity, screens and location details for this room.
                        </p>
                        <div className="flex items-center gap-3 px-3 py-2 bg-[#111215] border border-[#1f2125] rounded-xl">
                          <Calendar className="h-4 w-4 text-[#888]" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-white">{sessions?.length || 0} SESSIONS</span>
                            <span className="text-[8px] font-bold text-[#4ADE80] tracking-widest uppercase">MAPPED</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Sessions Table */}
                    <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
                      <div className="flex items-center gap-2 mb-4 shrink-0">
                         <Calendar className="h-4 w-4 text-[#888]" />
                         <h4 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">OPERATIONAL SCHEDULE</h4>
                      </div>
                      
                      <div className="bg-[#111215] border border-[#1f2125] rounded-2xl overflow-hidden flex-1 flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto no-scrollbar">
                          <table className="w-full text-left border-collapse">
                             <thead>
                                <tr className="border-b border-[#1f2125]">
                                   <th className="p-3 text-[9px] font-black text-[#888] uppercase tracking-widest">SESSION / CODE</th>
                                   <th className="p-3 text-[9px] font-black text-[#888] uppercase tracking-widest text-center">TIMING</th>
                                   <th className="p-3 text-[9px] font-black text-[#888] uppercase tracking-widest text-center">READINESS</th>
                                   <th className="p-3 text-[9px] font-black text-[#888] uppercase tracking-widest text-right">STATUS</th>
                                </tr>
                             </thead>
                             <tbody>
                                {sessions?.length ? sessions.map((session, i) => (
                                  <tr key={session.id} className={cn(
                                    "border-b border-[#1f2125] transition-colors relative",
                                    i === 0 ? "bg-[#16181b]" : ""
                                  )}>
                                     <td className="p-3 pl-6 relative">
                                        {i === 0 && (
                                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#4ADE80] shadow-[0_0_15px_rgba(74,222,128,0.5)]" />
                                        )}
                                        <div className="flex items-center gap-3">
                                           <div className={cn(
                                             "h-8 w-8 rounded-lg border flex items-center justify-center shrink-0",
                                             i === 0 ? "border-[#4ADE80]/30 shadow-[0_0_10px_rgba(74,222,128,0.1)]" : "border-[#2a2c31]"
                                           )}>
                                              <Monitor className={cn("h-4 w-4", i === 0 ? "text-[#4ADE80]" : "text-[#4b82f6]")} />
                                           </div>
                                           <div>
                                             <p className="text-[12px] font-black text-white mb-0.5">{session.name}</p>
                                             <p className="text-[9px] font-bold text-[#888] uppercase">{session.session_code}</p>
                                           </div>
                                        </div>
                                     </td>
                                     <td className="p-3 text-center">
                                        <div className="flex flex-col items-center gap-0.5">
                                           <span className="text-[10px] font-medium text-[#ccc]">{formatTimeInTZ(session.start_time, (session as any).event_timezone)}</span>
                                           <span className="text-[8px] font-black text-[#666] uppercase tracking-widest">TO</span>
                                           <span className="text-[10px] font-medium text-[#ccc]">{formatTimeInTZ(session.end_time, (session as any).event_timezone)}</span>
                                        </div>
                                     </td>
                                     <td className="p-3">
                                        <div className="flex flex-col items-center gap-1.5">
                                           <span className="text-[10px] font-black text-[#4ADE80]">{Math.round(session.readiness_pct || 100)}%</span>
                                           <div className="h-[2px] w-12 bg-[#2a2c31] rounded-full overflow-hidden">
                                              <div className="h-full bg-[#4ADE80]" style={{ width: `${session.readiness_pct || 100}%` }} />
                                           </div>
                                        </div>
                                     </td>
                                     <td className="p-3 text-right pr-4">
                                        <Badge className="border-0 text-[8px] font-black px-2 py-0.5 bg-[#1a2e1f] text-[#4ADE80] rounded-full uppercase tracking-widest">
                                          {session.status.toUpperCase()}
                                        </Badge>
                                     </td>
                                  </tr>
                                )) : (
                                  <tr>
                                     <td colSpan={4} className="p-20 text-center">
                                        <div className="space-y-3">
                                           <AlertTriangle className="h-10 w-10 text-muted mx-auto" />
                                           <p className="text-[11px] font-bold text-muted uppercase tracking-widest italic">No operational data detected for this cycle.</p>
                                        </div>
                                     </td>
                                  </tr>
                                )}
                             </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Panel */}
                  <div className="flex flex-col h-full bg-[#111215] border-l border-[#1f2125] p-8 pt-10 relative overflow-hidden">
                    {/* Background wave decoration */}
                    <div className="absolute top-0 right-0 w-full h-40 bg-gradient-to-br from-transparent to-[#1a1b1f] opacity-50 blur-xl pointer-events-none" />
                    
                    <div className="flex items-center justify-between mb-8 relative z-10">
                       <div className="flex items-center gap-3">
                          <Settings className="h-4 w-4 text-[#888]" />
                          <h4 className="text-[11px] font-black text-white uppercase tracking-widest">ROOM SETTINGS</h4>
                       </div>
                       <div className="flex items-center gap-3">
                          <span className={cn("text-[9px] font-black tracking-widest uppercase", roomData.is_active ? "text-[#4ADE80]" : "text-[#ef4444]")}>
                             {roomData.is_active ? "ACTIVE" : "INACTIVE"}
                          </span>
                          <button 
                             onClick={() => handleFieldChange('is_active', !roomData.is_active)}
                             className={cn(
                               "h-5 w-9 rounded-full transition-all relative border border-[#1f2125]",
                               roomData.is_active ? "bg-[#4ADE80]" : "bg-[#0a0a0c]"
                             )}
                          >
                             <motion.div 
                               animate={{ x: roomData.is_active ? 16 : 2 }}
                               className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-lg"
                             />
                          </button>
                       </div>
                    </div>

                    <div className="space-y-6 overflow-y-auto no-scrollbar relative z-10 pr-2">
                       <div className="space-y-2">
                          <Label className="text-[9px] font-black text-[#888] uppercase tracking-[0.1em]">ROOM NAME</Label>
                          <Input 
                            value={roomData.name ?? ""}
                            onChange={(e) => handleFieldChange('name', e.target.value)}
                            className="h-12 bg-[#0a0a0c] border-[#1f2125] rounded-xl text-white font-bold px-4 focus:border-[#4ADE80]/50"
                          />
                       </div>

                       <div className="grid grid-cols-2 gap-5">
                          <div className="space-y-2">
                             <Label className="text-[9px] font-black text-[#888] uppercase tracking-[0.1em]">MAX CAPACITY</Label>
                             <div className="relative">
                                <Input 
                                  type="number"
                                  value={roomData.capacity ?? ""}
                                  onChange={(e) => handleFieldChange('capacity', e.target.value === "" ? 0 : parseInt(e.target.value))}
                                  className="h-12 bg-[#0a0a0c] border-[#1f2125] rounded-xl pl-10 text-white font-bold focus:border-[#4ADE80]/50"
                                />
                                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888]" />
                              </div>
                          </div>
                           <div className="space-y-2">
                              <Label className="text-[9px] font-black text-[#888] uppercase tracking-[0.1em]">SCREENS</Label>
                              <div className="relative group">
                                 <Input 
                                   type="number"
                                   min="1"
                                   value={roomData.screen_count ?? 1}
                                   onChange={(e) => handleFieldChange('screen_count', e.target.value === "" ? 1 : parseInt(e.target.value))}
                                   className="h-12 bg-[#0a0a0c] border-[#1f2125] rounded-xl pl-10 pr-4 text-white font-bold focus:border-[#4ADE80]/50"
                                 />
                                 <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888] group-focus-within:text-[#4ADE80] transition-colors" />
                              </div>
                           </div>
                       </div>

                       <div className="space-y-2">
                          <Label className="text-[9px] font-black text-[#888] uppercase tracking-[0.1em]">LOCATION DETAILS</Label>
                          <div className="relative group">
                             <MapPin className="absolute left-3 top-3 h-4 w-4 text-[#888] group-focus-within:text-[#4ADE80] transition-colors" />
                             <textarea 
                               value={roomData.location_notes ?? ""}
                               onChange={(e) => handleFieldChange('location_notes', e.target.value)}
                               placeholder="e.g. Floor 2, North Wing"
                               className="w-full min-h-[80px] bg-[#0a0a0c] border border-[#1f2125] rounded-xl p-3 pl-10 text-white font-medium outline-none resize-none text-[12px] focus:border-[#4ADE80]/50 transition-colors"
                             />
                          </div>
                       </div>

                       <div className="space-y-2">
                          <Label className="text-[9px] font-black text-[#888] uppercase tracking-[0.1em]">ROOM TYPE</Label>
                          <div className="relative">
                             <select 
                               value={roomData.room_type}
                               onChange={(e) => handleFieldChange('room_type', e.target.value)}
                               className="w-full h-12 bg-[#0a0a0c] border border-[#1f2125] rounded-xl px-4 pr-10 text-white font-bold outline-none appearance-none cursor-pointer focus:border-[#4ADE80]/50 transition-colors text-[13px]"
                             >
                                <option value="" disabled>Select room type</option>
                                {ROOM_TYPES.map(t => (
                                  <option key={t.value} value={t.value} className="bg-[#0a0a0c] text-white">{t.label}</option>
                                ))}
                             </select>
                             <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                               <ArrowRight className="h-4 w-4 text-[#888] rotate-90" />
                             </div>
                          </div>
                       </div>
                    </div>

                    <div className="mt-auto pt-6 relative z-10 space-y-3">
                       <Button 
                         onClick={closeModal}
                         className="w-full h-12 bg-gradient-to-r from-[#4ADE80] to-[#3B82F6] hover:opacity-90 text-[#0a0a0c] font-black uppercase tracking-widest text-[11px] rounded-xl shadow-[0_10px_30px_rgba(74,222,128,0.3)] border-0 flex items-center justify-center gap-2 transition-all"
                       >
                          UPDATE ROOM <ArrowRight className="h-4 w-4" />
                       </Button>
                       <Button 
                         onClick={handleDelete}
                         variant="ghost" 
                         className="w-full h-12 text-[#ef4444] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                       >
                          DELETE ROOM <Trash2 className="ml-2 h-4 w-4" />
                       </Button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
