"use client";

import { useModalStore } from "@/store/useModalStore";
import { AnimatePresence, motion } from "framer-motion";
import { 
  X, Mail, Send, TrendingUp, Users, MousePointer2, ShieldCheck, Zap, Globe, 
  FileText, ArrowRight, MapPin, History, Settings, RefreshCw, Monitor,
  Trash2, Save, LayoutGrid, Clock, CheckCircle2, AlertTriangle, ToggleLeft as Toggle
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
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998]" 
          />
          
          {/* Modal Container */}
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-10 pointer-events-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              className="w-full max-w-7xl bg-[var(--card)] border border-[var(--border)] rounded-[4rem] p-10 md:p-16 shadow-2xl overflow-y-auto max-h-[95vh] no-scrollbar pointer-events-auto relative text-[var(--text)]"
            >
              {/* Close Button - Moved and styled to not overlap */}
              <button 
                onClick={closeModal}
                className="absolute top-8 right-8 h-12 w-12 rounded-full border border-[var(--border)] bg-[var(--surf)] flex items-center justify-center text-muted hover:text-[var(--text)] transition-all z-[100] shadow-xl group"
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
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-20 relative z-10">
                   <div className="space-y-12">
                      <div className="space-y-4">
                         <div className="flex items-center gap-4">
                            <Badge className="bg-[var(--pri)]/20 text-[var(--pri)] border-0 text-[10px] font-black tracking-widest px-3 py-1 uppercase">ROOM CONFIGURATION</Badge>
                            <div className="flex items-center gap-2 px-3 py-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full">
                               <MapPin className="h-3 w-3 text-muted" />
                               <span className="text-[10px] font-black text-muted uppercase tracking-widest">
                                 {event?.venue_name ? `${event.venue_name}${event.location ? `, ${event.location}` : ''}` : (event?.location || "Main Convention Center")}
                               </span>
                            </div>
                         </div>
                         <h2 className="text-6xl font-black text-[var(--text)] tracking-tighter leading-tight">{roomData.name}</h2>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-12">
                         <div className="space-y-8">
                            <div className="flex items-center justify-between">
                               <h4 className="text-[11px] font-black text-muted uppercase tracking-[0.2em]">Operational Schedule</h4>
                               <Badge className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted border-0 text-[9px] font-black">{sessions?.length || 0} SESSIONS MAPPED</Badge>
                            </div>
                            
                            <div className="glass-3d rounded-[2.5rem] border-default overflow-hidden">
                               <div className="max-h-[400px] overflow-y-auto no-scrollbar">
                                  <table className="w-full text-left border-collapse">
                                     <thead>
                                        <tr className="border-b border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                                           <th className="p-6 text-[10px] font-black text-muted uppercase tracking-widest">Session / Code</th>
                                           <th className="p-6 text-[10px] font-black text-muted uppercase tracking-widest text-center">Timing</th>
                                           <th className="p-6 text-[10px] font-black text-muted uppercase tracking-widest text-center">Readiness</th>
                                           <th className="p-6 text-[10px] font-black text-muted uppercase tracking-widest text-right">Status</th>
                                        </tr>
                                     </thead>
                                     <tbody>
                                        {sessions?.length ? sessions.map((session) => (
                                          <tr key={session.id} className="border-b border-default hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors group">
                                             <td className="p-6">
                                                <p className="text-[13px] font-bold text-[var(--text)] mb-1 group-hover:text-[var(--pri)] transition-colors">{session.name}</p>
                                                <p className="text-[10px] font-mono text-muted uppercase">{session.session_code}</p>
                                             </td>
                                             <td className="p-6 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                   <span className="text-[11px] font-bold text-muted">{formatTimeInTZ(session.start_time, (session as any).event_timezone)}</span>
                                                   <span className="text-[9px] font-black text-muted uppercase tracking-tighter">TO</span>
                                                   <span className="text-[11px] font-bold text-muted">{formatTimeInTZ(session.end_time, (session as any).event_timezone)}</span>
                                                </div>
                                             </td>
                                             <td className="p-6">
                                                <div className="flex flex-col items-center gap-2">
                                                   <span className="text-[11px] font-mono font-black text-[var(--sec)]">{Math.round(session.readiness_pct || 0)}%</span>
                                                   <div className="h-1 w-16 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full overflow-hidden">
                                                      <div className="h-full bg-[var(--sec)]" style={{ width: `${session.readiness_pct}%` }} />
                                                   </div>
                                                </div>
                                             </td>
                                             <td className="p-6 text-right">
                                                <Badge className={cn(
                                                  "border-0 text-[9px] font-black px-2 py-0.5",
                                                  session.status === 'confirmed' ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[var(--warn)]"
                                                )}>
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
                   </div>

                   <div className="flex flex-col h-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-l border-default p-10 -m-10 rounded-r-[4rem] space-y-8 pt-24">
                      <div className="flex items-center justify-between">
                         <h4 className="text-[11px] font-black text-muted uppercase tracking-[0.2em]">Node Settings</h4>
                         <div className="flex items-center gap-3">
                            <span className={cn("text-[9px] font-black tracking-widest uppercase", roomData.is_active ? "text-[var(--success)]" : "text-[var(--dan)]")}>
                               {roomData.is_active ? "ACTIVE" : "INACTIVE"}
                            </span>
                            <button 
                               onClick={() => handleFieldChange('is_active', !roomData.is_active)}
                               className={cn(
                                 "h-6 w-11 rounded-full transition-all relative border border-default",
                                 roomData.is_active ? "bg-[var(--pri)]" : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                               )}
                            >
                               <motion.div 
                                 animate={{ x: roomData.is_active ? 22 : 4 }}
                                 className="absolute top-1 h-3.5 w-3.5 rounded-full bg-[var(--text)] shadow-lg"
                               />
                            </button>
                         </div>
                      </div>

                      <div className="space-y-6 overflow-y-auto no-scrollbar pr-2 pb-10">
                         <div className="space-y-3">
                            <Label className="text-[10px] font-black text-muted uppercase tracking-[0.25em] ml-1">Node Name</Label>
                            <Input 
                              value={roomData.name ?? ""}
                              onChange={(e) => handleFieldChange('name', e.target.value)}
                              className="h-14 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-2xl text-[var(--text)] font-bold focus:border-[var(--pri)]/50 transition-all"
                            />
                         </div>

                         <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-3">
                               <Label className="text-[10px] font-black text-muted uppercase tracking-[0.25em] ml-1">Max Capacity</Label>
                               <div className="relative">
                                  <Input 
                                    type="number"
                                    value={roomData.capacity ?? ""}
                                    onChange={(e) => handleFieldChange('capacity', e.target.value === "" ? 0 : parseInt(e.target.value))}
                                    className="h-14 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-2xl pl-12 text-[var(--text)] font-bold focus:border-[var(--pri)]/50 transition-all"
                                  />
                                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
                                </div>
                            </div>
                             <div className="space-y-3">
                                <Label className="text-[10px] font-black text-muted uppercase tracking-[0.25em] ml-1">Screens</Label>
                                <div className="relative group">
                                   <Input 
                                     type="number"
                                     min="1"
                                     value={roomData.screen_count ?? 1}
                                     onChange={(e) => handleFieldChange('screen_count', e.target.value === "" ? 1 : parseInt(e.target.value))}
                                     className="h-14 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-2xl pl-12 pr-4 text-[var(--text)] font-bold focus:border-[var(--pri)]/50 transition-all"
                                   />
                                   <Monitor className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted group-focus-within:text-[var(--pri)] transition-colors" />
                                </div>
                             </div>
                         </div>

                         <div className="space-y-3">
                            <Label className="text-[10px] font-black text-muted uppercase tracking-[0.25em] ml-1">Location Details</Label>
                            <div className="relative group">
                               <MapPin className="absolute left-4 top-4 h-4 w-4 text-muted group-focus-within:text-[var(--pri)] transition-colors" />
                               <textarea 
                                 value={roomData.location_notes ?? ""}
                                 onChange={(e) => handleFieldChange('location_notes', e.target.value)}
                                 placeholder="e.g. Floor 2, North Wing, near elevator"
                                 className="w-full min-h-[100px] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default rounded-2xl p-4 pl-12 text-[var(--text)] font-bold focus:border-[var(--pri)]/50 outline-none transition-all resize-none text-[13px]"
                               />
                            </div>
                         </div>

                         <div className="space-y-3">
                            <Label className="text-[10px] font-black text-muted uppercase tracking-[0.25em] ml-1">Classification</Label>
                            <select 
                              value={roomData.room_type}
                              onChange={(e) => handleFieldChange('room_type', e.target.value)}
                              className="w-full h-14 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default rounded-2xl px-6 text-[var(--text)] font-bold focus:border-[var(--pri)]/50 outline-none transition-all appearance-none cursor-pointer"
                            >
                               {ROOM_TYPES.map(t => (
                                 <option key={t.value} value={t.value} className="bg-[var(--card)]">{t.label}</option>
                               ))}
                            </select>
                         </div>
                      </div>

                      <div className="mt-auto space-y-4">
                         <Button 
                           onClick={closeModal}
                           className="w-full h-14 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-lg border-0 group"
                         >
                            Update Node <Save className="ml-2 h-4 w-4" />
                         </Button>
                         <Button 
                           onClick={handleDelete}
                           variant="ghost" 
                           className="w-full h-14 text-[var(--dan)] hover:text-[var(--dan)] hover:bg-[var(--dan)]/5 rounded-2xl text-[11px] font-black uppercase tracking-widest"
                         >
                            Decommission Node <Trash2 className="ml-2 h-4 w-4" />
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
