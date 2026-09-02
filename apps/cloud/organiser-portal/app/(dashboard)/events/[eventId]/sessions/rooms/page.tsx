"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
   MapPin, Zap, LayoutGrid, Layers, Globe, Plus, Users, Search, Filter, Clock, Calendar
} from "lucide-react";
import { useRooms, useRoomAnalytics, RoomSummary } from "@/hooks/useRooms";
import { useSessions } from "@/hooks/useSessions";
import { useEvent } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatTimeRangeInTZ } from "@/lib/utils";

import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";
import { useModalStore } from "@/store/useModalStore";
import { CreateRoomDialog } from "@/components/organizer/rooms/CreateRoomDialog";
import { Portal } from "@/components/ui/portal";
import { useOperationAccess } from "@/lib/capabilities";

export default function RoomsPage() {
   const { eventId } = useParams();
   const eventIdStr = (eventId as string) || "";
   const openModal = useModalStore((state) => state.openModal);
   const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
   const [typeFilter, setTypeFilter] = useState("");
   const [searchTerm, setSearchTerm] = useState("");
   const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);
   const roomAccess = useOperationAccess("venue.rooms.manage");

   useEffect(() => {
      setToolbarActions([
         { label: "Configure Grid", icon: LayoutGrid, onClick: () => roomAccess.enabled && setIsCreateDialogOpen(true), color: "bg-[var(--pri)]/10" },
         { label: "New Environment", icon: Plus, onClick: () => roomAccess.enabled && setIsCreateDialogOpen(true) },
      ]);
   }, [setToolbarActions, roomAccess.enabled]);

   const { data: roomsConfig, isLoading: isConfigLoading } = useRooms(eventIdStr);
   const { data: roomsAnalytics } = useRoomAnalytics(eventIdStr);
   const { data: allSessions } = useSessions(eventIdStr);
   const { data: event } = useEvent(eventIdStr);

   const isLoading = isConfigLoading;

   // Map sessions by room ID for accurate session counts and inline previews
   const roomSessionsMap = useMemo(() => {
      const map: Record<string, any[]> = {};
      allSessions?.forEach(s => {
         if (s.room_id) {
            if (!map[s.room_id]) map[s.room_id] = [];
            map[s.room_id].push(s);
         }
      });
      return map;
   }, [allSessions]);

   // Merge config, analytics, and session data
   const rooms: RoomSummary[] = useMemo(() => {
      if (!roomsConfig) return [];
      return roomsConfig
         .filter(r => !typeFilter || r.room_type === typeFilter)
         .filter(r => !searchTerm || r.name.toLowerCase().includes(searchTerm.toLowerCase()) || r.code?.toLowerCase().includes(searchTerm.toLowerCase()) || r.room_type?.toLowerCase().includes(searchTerm.toLowerCase()))
         .map(config => {
            const analytics = roomsAnalytics?.find(a => a.room_id === config.id);
            const mappedSessions = roomSessionsMap[config.id] || [];
            return {
               ...config,
               sessions_count: mappedSessions.length || analytics?.session_count || 0,
               readiness: analytics?.readiness_pct || 0,
            };
         });
   }, [roomsConfig, roomsAnalytics, roomSessionsMap, typeFilter, searchTerm]);

   const stats = [
      { label: "Active Rooms", val: rooms.filter(r => r.is_active).length.toString(), icon: Globe, color: "text-[var(--pri)]" },
      { label: "Total Rooms", val: rooms.length.toString(), icon: LayoutGrid, color: "text-[var(--success)]" },
      { label: "Avg Readiness", val: `${Math.round(rooms.reduce((acc, r) => acc + (r.readiness || 0), 0) / Math.max(1, rooms.length))}%`, icon: Zap, color: "text-[var(--sec)]" },
      { label: "Mapped Sessions", val: rooms.reduce((acc, r) => acc + (r.sessions_count || 0), 0).toString(), icon: Layers, color: "text-[var(--warn)]" },
   ];

   const uniqueTypes = Array.from(new Set(roomsConfig?.map(r => r.room_type).filter(Boolean) || []));

   return (
      <>
         <div className="space-y-10 pb-20 animate-fade-in perspective-1000">
            <header className="flex flex-col md:flex-row items-center justify-between gap-6 px-2">
               <div>
                  <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2 text-glow-indigo">
                     Room <span className="text-[var(--sec)]">Management</span>
                  </h1>
                  <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">Architect the physical event ecosystem</p>
               </div>
               <div className="flex items-center gap-4">
                  <Button
                     onClick={() => setIsCreateDialogOpen(true)}
                     disabled={roomAccess.loading || !roomAccess.enabled}
                     title={roomAccess.enabled ? "Add room" : `Unavailable: ${(roomAccess.reason ?? "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}`}
                     className="h-12 px-8 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] border-0 hover-lift-3d"
                  >
                     <Plus className="mr-2 h-4 w-4" /> Add Room
                  </Button>
               </div>
            </header>

            {/* Global Overview Row */}
            <section className="grid grid-cols-4 gap-6">
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
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search rooms..."
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
                     <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-muted" />
                        <select
                           value={typeFilter}
                           onChange={(e) => setTypeFilter(e.target.value)}
                           className="bg-transparent text-[11px] font-black uppercase tracking-widest text-[var(--text)] outline-none cursor-pointer hover:text-[var(--pri)] transition-colors"
                        >
                           <option value="" className="bg-[var(--base)]">All Environment Types</option>
                           {uniqueTypes.map(t => (
                              <option key={t} value={t} className="bg-[var(--base)]">{t.toUpperCase()}</option>
                           ))}
                        </select>
                     </div>

                     {typeFilter && (
                        <>
                           <div className="h-4 w-px bg-default" />
                           <button
                              onClick={() => setTypeFilter("")}
                              className="text-[10px] font-black text-[var(--dan)] uppercase tracking-widest hover:scale-105 transition-transform"
                           >
                              Reset
                           </button>
                        </>
                     )}
                  </div>
               </div>
            </section>

            <div className="grid gap-10">
               {/* Room Grid */}
               <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {isLoading ? (
                     Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-72 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default rounded-[2.5rem] animate-pulse" />
                     ))
                  ) : rooms.length > 0 ? (
                     rooms.map((room) => {
                        const roomSessions = roomSessionsMap[room.id] || [];
                        return (
                           <motion.div
                              key={room.id}
                              whileHover={{ y: -6 }}
                              onClick={() => openModal('ROOM_SETTINGS', room)}
                              className="glass-3d p-7 rounded-[2.5rem] border-default relative overflow-hidden group cursor-pointer shadow-2xl flex flex-col justify-between"
                           >
                              <div className="absolute top-0 right-0 h-32 w-32 bg-[var(--pri)]/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />

                              <div>
                                 <div className="flex items-center justify-between mb-6">
                                    <div className="h-12 w-12 rounded-2xl bg-[color-mix(in_srgb,var(--base)_25%,transparent)] flex items-center justify-center border border-default/50">
                                       <MapPin className="h-6 w-6 text-[var(--pri)]" />
                                    </div>
                                    <Badge className={cn(
                                       "px-3 py-1 rounded-lg text-[9px] font-black tracking-widest border-0",
                                       room.is_active ? "bg-[var(--success)]/20 text-[var(--success)]" : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted"
                                    )}>
                                       {room.is_active ? 'ACTIVE' : 'IDLE'}
                                    </Badge>
                                 </div>

                                 <h3 className="text-[18px] font-black text-[var(--text)] group-hover:text-[var(--sec)] transition-colors mb-1 truncate">
                                    {room.name}
                                 </h3>
                                 <p className="text-[11px] font-bold text-muted mb-5 flex items-center gap-1.5">
                                    <MapPin className="h-3 w-3 text-[var(--pri)]" />
                                    {room.room_coordinator ? `Coord: ${room.room_coordinator}` : (event?.venue_name || "Main Venue")}
                                 </p>

                                 <div className="grid grid-cols-2 gap-4 mb-6 p-3 rounded-2xl bg-background/40 border border-default/40">
                                    <div>
                                       <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-0.5">Code</p>
                                       <p className="text-[12px] font-mono font-extrabold text-[var(--text)]">{room.code || "—"}</p>
                                    </div>
                                    <div>
                                       <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-0.5">Type</p>
                                       <p className="text-[12px] font-extrabold text-[var(--text)] uppercase tracking-tight truncate">{room.room_type || "ROOM"}</p>
                                    </div>
                                 </div>
                              </div>

                              <div className="pt-5 border-t border-default flex items-center justify-between">
                                 <div className="flex items-center gap-2">
                                    <Layers className="h-4 w-4 text-muted" />
                                    <span className="text-[10px] font-black text-muted uppercase tracking-widest">{room.sessions_count || 0} Sessions</span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-[var(--sec)]" />
                                    <span className="text-[11px] font-mono text-[var(--sec)] font-black">{Math.round(room.readiness || 0)}%</span>
                                 </div>
                              </div>
                           </motion.div>
                        );
                     })
                  ) : (
                     <div className="col-span-full py-16 text-center text-muted border border-dashed border-default rounded-[2.5rem]">
                        <p className="text-[14px] font-bold">No rooms found for this event.</p>
                        <p className="text-[11px] mt-1">Click "Add Room" to create a new hall or room.</p>
                     </div>
                  )}
               </section>
            </div>
         </div>
         <Portal>
            <CreateRoomDialog
               isOpen={isCreateDialogOpen && roomAccess.enabled}
               onClose={() => setIsCreateDialogOpen(false)}
            />
         </Portal>
      </>
   );
}
