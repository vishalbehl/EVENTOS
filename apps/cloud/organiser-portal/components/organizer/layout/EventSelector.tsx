"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Calendar, Search, Check, Box, Plus } from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EventSelector() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.eventId as string;

  const { data: events, isLoading } = useEvents();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeEvent = events?.find((e) => e.id === eventId);

  const filteredEvents = events?.filter((e) =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.short_code.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleSelect = (selectedId: string) => {
    setIsOpen(false);
    setSearchQuery("");
    router.push(`/events/${selectedId}/dashboard`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 h-11 px-4 rounded-lg border border-[var(--border)] bg-[var(--card)] w-[260px]">
        <Skeleton className="h-5 w-5 rounded bg-muted/20" />
        <Skeleton className="h-4 w-32 bg-muted/20" />
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between gap-3 h-11 px-4 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--pri)]/40 hover:bg-[color-mix(in_srgb,var(--pri)_5%,transparent)] transition-all text-left w-full select-none",
          isOpen && "border-[var(--pri)]/50 shadow-sm"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-6 w-6 rounded-md bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center shrink-0">
            <Box className="h-3.5 w-3.5 text-[var(--pri)]" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-black text-[var(--text)] truncate leading-none uppercase tracking-tight">
              {activeEvent ? activeEvent.name : "Select Event..."}
            </p>
            {activeEvent && (
              <p className="text-[9px] font-bold text-muted truncate mt-0.5 tracking-wider uppercase">
                Code: {activeEvent.short_code}
              </p>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted transition-transform duration-300 shrink-0",
            isOpen && "rotate-180 text-[var(--pri)]"
          )}
        />
      </button>

      {/* Dropdown Container */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 mt-2 w-[320px] max-w-[90vw] border border-[var(--border)] rounded-lg p-3 z-50 shadow-md bg-[var(--card)]"
          >
            {/* Search Box */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search event catalog..."
                className="w-full h-9 pl-9 pr-3 rounded-md bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[var(--border)] text-[12px] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-[var(--pri)]/40 transition-colors"
                autoFocus
              />
            </div>

            {/* List */}
            <div className="max-h-[220px] overflow-y-auto pr-1 space-y-1 scrollbar-thin">
              {filteredEvents.length > 0 ? (
                filteredEvents.map((evt) => {
                  const isSelected = evt.id === eventId;
                  const isActiveStatus = evt.status === "active";
                  return (
                    <button
                      key={evt.id}
                      onClick={() => handleSelect(evt.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-all hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] group",
                        isSelected && "bg-[var(--pri)]/10 text-[var(--text)] border border-[var(--pri)]/20"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            "h-7 w-7 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                            isSelected
                              ? "bg-[var(--pri)]/20 border-[var(--pri)]/30 text-[var(--pri)]"
                              : "bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border-[var(--border)] text-muted group-hover:text-[var(--text)] group-hover:border-muted"
                          )}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-bold text-[var(--text)] truncate leading-none uppercase">
                            {evt.name}
                          </p>
                          <p className="text-[9px] font-black text-muted tracking-wider uppercase mt-1">
                            {evt.short_code} • {new Date(evt.start_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isActiveStatus && (
                          <Badge className="bg-[var(--success)]/10 text-[var(--success)] border-0 text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded-md uppercase">
                            Live
                          </Badge>
                        )}
                        {isSelected && (
                          <Check className="h-4 w-4 text-[var(--pri)] shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="py-8 text-center">
                  <p className="text-[11px] font-black text-muted uppercase tracking-widest">
                    No matching events
                  </p>
                </div>
              )}
            </div>

            {/* Create Event Quick Link */}
            <div className="h-px bg-[var(--border)] my-2" />
            <button
              onClick={() => {
                setIsOpen(false);
                router.push("/events?create=true");
              }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-black text-muted hover:text-[var(--pri)] hover:bg-[var(--pri)]/5 transition-all uppercase tracking-widest"
            >
              <Plus className="h-3.5 w-3.5" /> Create New Event
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
