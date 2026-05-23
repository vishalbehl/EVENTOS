"use client";

import { useState } from "react";
import { 
  Plus, Search, LayoutGrid, List, Filter, 
  Calendar, MapPin, Globe, AlertCircle, 
  ChevronRight, MoreVertical, Edit2, Trash2, 
  Copy, Zap, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents, useDeleteEvent, useUpdateEvent } from "@/hooks/useEvents";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EventSummary } from "@/types/backend";
import { CreateEventDialog } from "@/components/CreateEventDialog";

export default function EventsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<EventSummary | null>(null);
  const [selectedEventForRedirect, setSelectedEventForRedirect] = useState<EventSummary | null>(null);

  const { data: events, isLoading } = useEvents({ status: statusFilter === "all" ? undefined : statusFilter, search: searchQuery });
  const deleteEvent = useDeleteEvent();

  const handleDelete = async (e: React.MouseEvent, eventId: string, eventName: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (window.confirm(`DANGER: This will permanently delete "${eventName}" and ALL associated data (sessions, speakers, files, logs). This cannot be undone. Are you sure?`)) {
      try {
        await deleteEvent.mutateAsync(eventId);
      } catch (err) {
        console.error("Delete failed:", err);
      }
    }
  };

  const handleEdit = (e: React.MouseEvent, event: EventSummary) => {
    e.stopPropagation();
    e.preventDefault();
    setEventToEdit(event);
    setIsCreateDialogOpen(true);
  };

  const closeDialog = () => {
    setIsCreateDialogOpen(false);
    setEventToEdit(null);
  };

  const handleSelectEvent = (event: EventSummary) => {
    const hasSpeaker = (event as any).speaker_mode_enabled ?? true;
    const hasReg = (event as any).registration_mode_enabled ?? true;

    if (hasSpeaker && hasReg) {
      setSelectedEventForRedirect(event);
    } else if (hasSpeaker) {
      router.push(`/events/${event.id}/speaker/dashboard`);
    } else if (hasReg) {
      router.push(`/events/${event.id}/registration`);
    } else {
      router.push(`/events/${event.id}/speaker/dashboard`);
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col overflow-hidden animate-in fade-in duration-700">
      <CreateEventDialog 
        isOpen={isCreateDialogOpen} 
        onClose={closeDialog} 
        eventToEdit={eventToEdit}
      />

      {/* Sticky Header & Toolbar Container */}
      <div className="sticky top-0 z-20 bg-transparent backdrop-blur-md pb-6 space-y-8 px-2 pt-2">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
              All <span className="text-[var(--sec)]">Events</span>
            </h1>
            <p className="text-muted font-medium text-sm tracking-tight uppercase tracking-[0.2em] opacity-70">
              Create and manage your conferences
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              onClick={() => setIsCreateDialogOpen(true)}
              className="h-12 px-8 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] border-0 hover-lift-3d"
            >
              <Plus className="mr-2 h-4 w-4" /> Create New Event
            </Button>
          </div>
        </div>

        {/* Toolbar Section */}
        <div className="glass-3d p-4 rounded-[2rem] border-default flex flex-col md:flex-row items-center gap-4 shadow-xl">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input 
              placeholder="Search events by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 pl-14 pr-4 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-0 rounded-2xl focus-visible:ring-1 focus-visible:ring-[var(--pri)]/50 transition-all font-bold text-[11px] uppercase tracking-widest placeholder:text-muted"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-1.5 rounded-2xl border border-default">
              <button
                onClick={() => setViewMode("card")}
                className={cn(
                  "p-2.5 rounded-xl transition-all",
                  viewMode === "card" ? "bg-[var(--background)] shadow-xl text-[var(--pri)]" : "text-muted hover:text-[var(--text)]"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-2.5 rounded-xl transition-all",
                  viewMode === "list" ? "bg-[var(--background)] shadow-xl text-[var(--pri)]" : "text-muted hover:text-[var(--text)]"
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            <Button variant="outline" className="h-12 px-6 border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted hover:text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-2xl hover-lift-3d flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span>Filter Events</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Content Section */}
      <div className="flex-1 overflow-y-auto px-2 pb-10 custom-scrollbar overflow-x-hidden">
        <AnimatePresence>
          {isLoading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                "grid gap-6",
                viewMode === "card" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1"
              )}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className={cn("bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[2rem]", viewMode === "card" ? "h-64" : "h-20")} />
              ))}
            </motion.div>
          ) : events?.length === 0 ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center space-y-6"
            >
              <div className="h-24 w-24 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center border border-default">
                <AlertCircle className="h-10 w-10 text-muted" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">No Events Found</h3>
                <p className="text-muted text-[11px] font-black uppercase tracking-[0.2em] max-w-[320px] mx-auto">
                  We couldn't find any events matching your search criteria.
                </p>
              </div>
              <Button 
                variant="outline" 
                className="rounded-full px-8 font-black uppercase text-[10px] tracking-widest border-default hover:bg-[var(--pri)]/10 hover:text-[var(--pri)]"
                onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}
              >
                Clear Filters
              </Button>
            </motion.div>
          ) : viewMode === "card" ? (
            <motion.div 
              key="grid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {events?.map((event) => (
                <EventCard 
                  key={event.id} 
                  event={event} 
                  onEdit={(e) => handleEdit(e, event)}
                  onDelete={(e) => handleDelete(e, event.id, event.name)}
                  onSelect={() => handleSelectEvent(event)}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div 
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass-3d rounded-[2.5rem] border-default overflow-hidden shadow-2xl">
                 <div className="overflow-x-auto">
                   <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                          <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-[0.3em] text-muted">Event Name</th>
                          <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-[0.3em] text-muted">Date</th>
                          <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-[0.3em] text-muted">Location</th>
                          <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-[0.3em] text-muted">Status</th>
                          <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-[0.3em] text-muted">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-default/50">
                        {events?.map((event) => (
                          <EventRow 
                            key={event.id} 
                            event={event} 
                            onEdit={(e) => handleEdit(e, event)}
                            onDelete={(e) => handleDelete(e, event.id, event.name)}
                            onSelect={() => handleSelectEvent(event)}
                          />
                        ))}
                      </tbody>
                   </table>
                 </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Glassmorphic Workspace Choice Dialog */}
      <AnimatePresence>
        {selectedEventForRedirect && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
            onClick={() => setSelectedEventForRedirect(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="glass-3d w-full max-w-2xl rounded-[2.5rem] border-default overflow-hidden p-8 space-y-8 relative shadow-2xl text-left"
              onClick={(e) => e.stopPropagation()}
            >
              {/* background decorative light flare */}
              <div className="absolute -top-12 -right-12 h-40 w-40 bg-[var(--pri)]/20 blur-3xl rounded-full" />
              
              <div className="space-y-2">
                <span className="text-[10px] font-black text-[var(--pri)] uppercase tracking-[0.3em]">
                  {selectedEventForRedirect.short_code}
                </span>
                <h2 className="text-2xl font-black text-[var(--text)] tracking-tighter leading-tight">
                  {selectedEventForRedirect.name}
                </h2>
                <p className="text-muted text-[11px] font-bold uppercase tracking-[0.1em]">
                  Select dashboard workspace to open
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Speaker Desk Option */}
                <Link
                  href={`/events/${selectedEventForRedirect.id}/speaker/dashboard`}
                  onClick={() => setSelectedEventForRedirect(null)}
                  className="group relative glass-3d p-6 rounded-[2rem] border-default hover:border-[var(--pri)]/50 transition-all duration-300 flex flex-col space-y-4 hover-lift-3d text-left"
                >
                  <div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/15 border border-[var(--pri)]/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Activity className="h-6 w-6 text-[var(--pri)]" />
                  </div>
                  <div>
                    <h3 className="text-md font-black text-[var(--text)] tracking-tight group-hover:text-[var(--pri)] transition-colors">
                      Speaker Presentation Desk
                    </h3>
                    <p className="text-muted text-[10px] font-medium leading-relaxed mt-1">
                      Manage speaker credentials, track presentation files, run validation reports, and generate bundles.
                    </p>
                  </div>
                </Link>

                {/* On-Site Registration Option */}
                <Link
                  href={`/events/${selectedEventForRedirect.id}/registration`}
                  onClick={() => setSelectedEventForRedirect(null)}
                  className="group relative glass-3d p-6 rounded-[2rem] border-default hover:border-[var(--sec)]/50 transition-all duration-300 flex flex-col space-y-4 hover-lift-3d text-left"
                >
                  <div className="h-12 w-12 rounded-2xl bg-[var(--sec)]/15 border border-[var(--sec)]/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Globe className="h-6 w-6 text-[var(--sec)]" />
                  </div>
                  <div>
                    <h3 className="text-md font-black text-[var(--text)] tracking-tight group-hover:text-[var(--sec)] transition-colors">
                      On-Site Registration & Printing
                    </h3>
                    <p className="text-muted text-[10px] font-medium leading-relaxed mt-1">
                      Register attendees, scan QR check-ins, configure dynamic pricing tiers, and design and print high-quality badges.
                    </p>
                  </div>
                </Link>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedEventForRedirect(null)}
                  className="rounded-full px-6 font-black uppercase text-[10px] tracking-widest border-default hover:bg-[var(--pri)]/10 hover:text-[var(--pri)]"
                >
                  Close Window
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EventCard({ 
  event, 
  onEdit, 
  onDelete,
  onSelect
}: { 
  event: EventSummary;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onSelect: () => void;
}) {
  const statusColors = {
    active: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    draft: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    completed: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    archived: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
  };

  return (
    <div onClick={onSelect} className="group block h-full cursor-pointer">
      <motion.div
        whileHover={{ y: -8, rotateX: 2, rotateY: 2 }}
        className="glass-3d p-6 rounded-[2rem] border-default h-full flex flex-col relative overflow-hidden group-hover:border-[var(--pri)]/50 transition-all duration-500 shadow-xl"
      >
        <div className="absolute top-0 right-0 h-32 w-32 bg-[var(--pri)]/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        
        <div className="flex items-center justify-between mb-5">
          <div className="h-11 w-11 rounded-xl bg-[color-mix(in_srgb,var(--base)_25%,transparent)] border border-default flex items-center justify-center group-hover:border-[var(--pri)]/50 group-hover:bg-[var(--pri)]/10 transition-all" onClick={(e) => e.stopPropagation()}>
            <Globe className="h-5 w-5 text-[var(--pri)] group-hover:scale-110 transition-transform" />
          </div>
          <Badge className={cn("border px-3 py-1 font-black text-[8px] uppercase tracking-[0.2em] rounded-full", statusColors[event.status as keyof typeof statusColors])}>
            {event.status}
          </Badge>
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-[var(--pri)] uppercase tracking-[0.3em]">{event.short_code}</span>
          </div>
          <h3 className="text-lg font-black text-[var(--text)] group-hover:text-[var(--sec)] transition-colors line-clamp-2 leading-tight tracking-tighter">
            {event.name}
          </h3>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 text-[10px] font-black text-muted uppercase tracking-[0.1em]">
            <Calendar className="h-3.5 w-3.5 text-[var(--pri)]/50" />
            <span>{new Date(event.start_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-black text-muted uppercase tracking-[0.1em]">
            <MapPin className="h-3.5 w-3.5 text-[var(--pri)]/50" />
            <span className="truncate">{event.location || "Online"}</span>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-default/50 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
           <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-[var(--pri)]/10 hover:text-[var(--pri)] transition-all" onClick={onEdit}>
                 <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-all" onClick={onDelete}>
                 <Trash2 className="h-3.5 w-3.5" />
              </Button>
           </div>
           <div className="h-9 w-9 rounded-xl glass-3d border-default flex items-center justify-center text-muted group-hover:text-[var(--pri)] group-hover:border-[var(--pri)]/50 transition-all">
              <ChevronRight className="h-4 w-4" />
           </div>
        </div>
      </motion.div>
    </div>
  );
}

function EventRow({ 
  event, 
  onEdit, 
  onDelete,
  onSelect
}: { 
  event: EventSummary;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onSelect: () => void;
}) {
  const statusColors = {
    active: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    draft: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    completed: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    archived: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
  };

  return (
    <tr 
      className="group hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] transition-all cursor-pointer"
      onClick={onSelect}
    >
      <td className="px-8 py-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center group-hover:border-[var(--pri)]/50 transition-all">
            <Globe className="h-5 w-5 text-[var(--pri)]" />
          </div>
          <div className="space-y-1">
            <p className="text-[14px] font-black text-[var(--text)] tracking-tight group-hover:text-[var(--pri)] transition-colors">{event.name}</p>
            <p className="text-[10px] font-black text-muted uppercase tracking-widest">{event.short_code}</p>
          </div>
        </div>
      </td>
      <td className="px-8 py-6">
        <div className="flex items-center gap-2 text-[11px] font-black text-muted uppercase tracking-tight">
          <Calendar className="h-3.5 w-3.5" />
          <span>{new Date(event.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
        </div>
      </td>
      <td className="px-8 py-6">
        <div className="flex items-center gap-2 text-[11px] font-black text-muted uppercase tracking-tight">
          <MapPin className="h-3.5 w-3.5" />
          <span className="max-w-[150px] truncate">{event.location || "Hybrid"}</span>
        </div>
      </td>
      <td className="px-8 py-6">
        <Badge className={cn("border-0 font-black text-[9px] px-3 py-1 uppercase tracking-[0.2em] rounded-lg shadow-sm", statusColors[event.status as keyof typeof statusColors])}>
          {event.status}
        </Badge>
      </td>
      <td className="px-8 py-6 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-3">
           <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-[var(--pri)]/10 hover:text-[var(--pri)] transition-all" onClick={onEdit}>
              <Edit2 className="h-4 w-4" />
           </Button>
           <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-red-500/10 hover:text-red-500 transition-all" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
           </Button>
           <div className="h-10 w-10 rounded-2xl glass-3d border-default flex items-center justify-center text-muted group-hover:text-[var(--pri)] group-hover:border-[var(--pri)]/50 group-hover:shadow-lg transition-all" onClick={onSelect}>
              <ChevronRight className="h-5 w-5" />
           </div>
        </div>
      </td>
    </tr>
  );
}
