"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
   MapPin, Monitor, Mic2, Volume2, Wifi, Zap,
   Settings, AlertCircle, CheckCircle2, LayoutGrid,
   Layers, ChevronRight, Activity, Info, Clock,
   Maximize2, Power, RefreshCw, Box, MoreHorizontal, X, Globe, ShieldCheck, Plus, Users, Cpu,
   History, Grid3X3, Filter, Search
} from "lucide-react";
import { useRooms, useRoomAnalytics, RoomSummary } from "@/hooks/useRooms";
import { useEvent } from "@/hooks/useEvents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEffect, useMemo } from "react";

import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";
import { useModalStore } from "@/store/useModalStore";
import { CreateRoomDialog } from "@/components/organizer/rooms/CreateRoomDialog";

import { Portal } from "@/components/ui/portal";

export default function RoomsPage() {
   const { eventId } = useParams();
   const openModal = useModalStore((state) => state.openModal);
   const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
   const [typeFilter, setTypeFilter] = useState("");
   const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);

   useEffect(() => {
      setToolbarActions([
         { label: "Configure Grid", icon: Grid3X3, onClick: () => setIsCreateDialogOpen(true), color: "bg-[var(--pri)]/10" },
         { label: "New Environment", icon: Plus, onClick: () => setIsCreateDialogOpen(true) },
         { label: "Technical Audit", icon: Activity, onClick: () => console.log("Audit") },
      ]);
   }, [setToolbarActions]);

   const { data: roomsConfig, isLoading: isConfigLoading } = useRooms(eventId as string || "");
   const { data: roomsAnalytics, isLoading: isAnalyticsLoading } = useRoomAnalytics(eventId as string || "");
   const { data: event } = useEvent(eventId as string || "");

   const isLoading = isConfigLoading || isAnalyticsLoading;

   // Merge config and analytics
   const rooms: RoomSummary[] = useMemo(() => {
      if (!roomsConfig) return [];
      return roomsConfig
         .filter(r => !typeFilter || r.room_type === typeFilter)
         .map(config => {
            const analytics = roomsAnalytics?.find(a => a.room_id === config.id);
            return {
               ...config,
               sessions_count: analytics?.session_count || 0,
               readiness: analytics?.readiness_pct || 0,
            };
         });
   }, [roomsConfig, roomsAnalytics, typeFilter]);

   const stats = [
      { label: "Active Rooms", val: rooms.filter(r => r.is_active).length.toString(), icon: Globe, color: "text-[var(--pri)]" },
      { label: "Total Capacity", val: rooms.reduce((acc, r) => acc + (r.capacity || 0), 0).toString(), icon: Users, color: "text-[var(--success)]" },
      { label: "Avg Readiness", val: `${Math.round(rooms.reduce((acc, r) => acc + (r.readiness || 0), 0) / Math.max(1, rooms.length))}%`, icon: Zap, color: "text-[var(--sec)]" },
      { label: "Mapped Sessions", val: rooms.reduce((acc, r) => acc + (r.sessions_count || 0), 0).toString(), icon: LayoutGrid, color: "text-[var(--warn)]" },
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
                     className="h-12 px-8 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] border-0 hover-lift-3d"
                  >
                     <Plus className="mr-2 h-4 w-4" /> Add Room
                  </Button>
               </div>
            </header>

            {/* Global Overview Row */}
            <section className="grid grid-cols-4 gap-6">
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

            {/* Search and Filter Bar */}
            <section className="flex-shrink-0 flex items-center gap-4 px-2">
               <div className="flex-1 max-w-md relative group">
                  <div className="absolute inset-0 bg-[var(--pri)]/5 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                  <div className="relative neomorphic-inset rounded-2xl p-0.5 border border-default focus-within:border-[var(--pri)]/50 transition-all">
                     <Search className="absolute left-5 top-3.5 h-4 w-4 text-muted group-focus-within:text-[var(--pri)]" />
                     <Input
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
               <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {isLoading ? (
                     Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-64 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default rounded-[2.5rem] animate-pulse" />
                     ))
                  ) : (
                     rooms.map((room) => (
                        <motion.div
                           key={room.id}
                           whileHover={{ y: -8 }}
                           onClick={() => openModal('ROOM_SETTINGS', room)}
                           className="glass-3d p-8 rounded-[2.5rem] border-default relative overflow-hidden group cursor-pointer shadow-2xl"
                        >
                           <div className="absolute top-0 right-0 h-32 w-32 bg-[var(--pri)]/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />

                           <div className="flex items-center justify-between mb-8">
                              <div className="h-12 w-12 rounded-2xl bg-[color-mix(in_srgb,var(--base)_25%,transparent)] flex items-center justify-center">
                                 <MapPin className="h-6 w-6 text-[var(--pri)]" />
                              </div>
                              <Badge className={cn(
                                 "px-3 py-1 rounded-lg text-[9px] font-black tracking-widest border-0",
                                 room.is_active ? "bg-[var(--success)]/20 text-[var(--success)]" : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted"
                              )}>
                                 {room.is_active ? 'ACTIVE' : 'IDLE'}
                              </Badge>
                           </div>

                           <h3 className="text-[18px] font-black text-[var(--text)] group-hover:text-[var(--sec)] transition-colors mb-2 truncate">
                              {room.name}
                           </h3>
                           <p className="text-[11px] font-bold text-muted mb-6 flex items-center gap-2">
                              <MapPin className="h-3 w-3 text-[var(--pri)]" />
                              {event?.venue_name ? `${event.venue_name}, ` : ""}{room.location_notes || "Main Venue"}
                           </p>

                           <div className="grid grid-cols-2 gap-4 mb-8">
                              <div>
                                 <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">Capacity</p>
                                 <p className="text-[13px] font-bold text-muted">{room.capacity || 0} Pax</p>
                              </div>
                              <div>
                                 <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">Type</p>
                                 <p className="text-[13px] font-bold text-muted uppercase tracking-tighter">{room.room_type}</p>
                              </div>
                           </div>

                           <div className="pt-6 border-t border-default flex items-center justify-between">
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
                     ))
                  )}
               </section>
            </div>
         </div>
         <Portal>
            <CreateRoomDialog
               isOpen={isCreateDialogOpen}
               onClose={() => setIsCreateDialogOpen(false)}
            />
         </Portal>
      </>
   );
}
