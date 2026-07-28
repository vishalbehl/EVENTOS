"use client";

import { useState } from "react";
import { Search, Users, Tag, Calendar, Plus, ChevronLeft, ChevronRight, AlertCircle, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessionBuilderStore, BuilderSpeaker, BuilderSession } from "@/store/useSessionBuilderStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function LeftPalette() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"unscheduled" | "speakers" | "tracks">("unscheduled");

  const unscheduledSpeakers = useSessionBuilderStore((s) => s.unscheduledSpeakers);
  const sessions = useSessionBuilderStore((s) => s.sessions);
  const tracks = useSessionBuilderStore((s) => s.tracks);
  const trackFilter = useSessionBuilderStore((s) => s.trackFilter);
  const setTrackFilter = useSessionBuilderStore((s) => s.setTrackFilter);
  const assignSpeakerToSession = useSessionBuilderStore((s) => s.assignSpeakerToSession);
  const selectedSessionId = useSessionBuilderStore((s) => s.selectedSessionId);

  const unscheduledSessions = sessions.filter((s) => !s.room_id);

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-4 px-2 border-r border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] w-14 transition-all">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="h-8 w-8 rounded-full mb-4 text-muted hover:text-[var(--text)]"
          title="Expand Palette"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="flex flex-col gap-4 text-muted">
          <button
            onClick={() => {
              setIsCollapsed(false);
              setActiveTab("unscheduled");
            }}
            className="p-2 rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] relative"
            title="Unscheduled Sessions"
          >
            <Calendar className="h-5 w-5" />
            {unscheduledSessions.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[var(--pri)] text-[9px] font-black text-white flex items-center justify-center">
                {unscheduledSessions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setIsCollapsed(false);
              setActiveTab("speakers");
            }}
            className="p-2 rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] relative"
            title="Unassigned Speakers"
          >
            <Users className="h-5 w-5" />
            {unscheduledSpeakers.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[var(--sec)] text-[9px] font-black text-white flex items-center justify-center">
                {unscheduledSpeakers.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setIsCollapsed(false);
              setActiveTab("tracks");
            }}
            className="p-2 rounded-xl hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
            title="Tracks"
          >
            <Tag className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside className="w-80 flex flex-col border-r border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] h-[calc(100vh-140px)] transition-all">
      {/* Header */}
      <div className="p-4 border-b border-default flex items-center justify-between">
        <h3 className="font-black text-[14px] text-[var(--text)] tracking-tight uppercase">
          Builder <span className="text-[var(--pri)]">Palette</span>
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(true)}
          className="h-7 w-7 rounded-full text-muted hover:text-[var(--text)]"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 p-2 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] gap-1 border-b border-default text-[11px] font-bold">
        <button
          onClick={() => setActiveTab("unscheduled")}
          className={cn(
            "py-2 rounded-xl transition-all text-center flex items-center justify-center gap-1.5",
            activeTab === "unscheduled"
              ? "bg-background text-[var(--pri)] shadow-sm font-black"
              : "text-muted hover:text-[var(--text)]"
          )}
        >
          <span>Sessions</span>
          {unscheduledSessions.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-[var(--pri)]/20 text-[10px]">
              {unscheduledSessions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("speakers")}
          className={cn(
            "py-2 rounded-xl transition-all text-center flex items-center justify-center gap-1.5",
            activeTab === "speakers"
              ? "bg-background text-[var(--pri)] shadow-sm font-black"
              : "text-muted hover:text-[var(--text)]"
          )}
        >
          <span>Speakers</span>
          {unscheduledSpeakers.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-[var(--sec)]/20 text-[10px]">
              {unscheduledSpeakers.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("tracks")}
          className={cn(
            "py-2 rounded-xl transition-all text-center flex items-center justify-center gap-1.5",
            activeTab === "tracks"
              ? "bg-background text-[var(--pri)] shadow-sm font-black"
              : "text-muted hover:text-[var(--text)]"
          )}
        >
          <span>Tracks</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {activeTab === "unscheduled" && (
          <>
            <div className="text-[11px] text-muted font-medium mb-1">
              Unassigned sessions with no room allocation:
            </div>
            {unscheduledSessions.length > 0 ? (
              unscheduledSessions.map((session) => (
                <div
                  key={session.id}
                  className="p-3 rounded-2xl border border-default bg-background hover:border-[var(--pri)] transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-muted bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-0.5 rounded">
                      {session.session_code}
                    </span>
                    <Badge variant="outline" className="text-[9px] font-bold uppercase">
                      {session.session_type}
                    </Badge>
                  </div>
                  <h5 className="font-bold text-[13px] text-[var(--text)] line-clamp-1 group-hover:text-[var(--pri)] transition-colors">
                    {session.name}
                  </h5>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-muted text-[12px] italic">
                All sessions have room allocations! 🎉
              </div>
            )}
          </>
        )}

        {activeTab === "speakers" && (
          <>
            <div className="text-[11px] text-muted font-medium mb-1">
              Unassigned speakers (click to assign to selected session):
            </div>
            {unscheduledSpeakers.length > 0 ? (
              unscheduledSpeakers.map((spk) => (
                <div
                  key={spk.id}
                  onClick={() => {
                    if (selectedSessionId) {
                      assignSpeakerToSession(selectedSessionId, spk);
                    }
                  }}
                  className={cn(
                    "p-3 rounded-2xl border border-default bg-background hover:border-[var(--pri)] transition-all flex items-center justify-between cursor-pointer group shadow-sm",
                    !selectedSessionId && "opacity-80"
                  )}
                  title={selectedSessionId ? `Click to assign to selected session` : "Select a session first to assign"}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-[var(--pri)]/20 text-[var(--pri)] font-black flex items-center justify-center text-[12px]">
                      {spk.full_name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-[12px] text-[var(--text)] group-hover:text-[var(--pri)] transition-colors">
                        {spk.full_name}
                      </div>
                      <div className="text-[10px] text-muted truncate max-w-[150px]">
                        {spk.email}
                      </div>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedSessionId}
                    className="h-7 text-[10px] font-bold rounded-lg px-2"
                  >
                    Assign
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-muted text-[12px] italic">
                No unassigned speakers remaining.
              </div>
            )}
          </>
        )}

        {activeTab === "tracks" && (
          <>
            <div className="text-[11px] text-muted font-medium mb-2">
              Filter sessions by track category:
            </div>
            <button
              onClick={() => setTrackFilter(null)}
              className={cn(
                "p-3 rounded-2xl border text-left font-bold text-[12px] transition-all flex items-center justify-between",
                trackFilter === null
                  ? "border-[var(--pri)] bg-[var(--pri)]/10 text-[var(--pri)]"
                  : "border-default text-muted hover:text-[var(--text)]"
              )}
            >
              <span>All Tracks</span>
              <Badge variant="secondary" className="text-[10px]">
                {sessions.length}
              </Badge>
            </button>

            {tracks.map((track) => (
              <button
                key={track.id}
                onClick={() => setTrackFilter(track.id)}
                className={cn(
                  "p-3 rounded-2xl border text-left font-bold text-[12px] transition-all flex items-center justify-between",
                  trackFilter === track.id
                    ? "border-[var(--pri)] bg-[var(--pri)]/10 text-[var(--pri)] shadow-sm"
                    : "border-default text-muted hover:text-[var(--text)]"
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: track.display_color || "#6366f1" }}
                  />
                  <span className="truncate">{track.name}</span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {sessions.filter((s) => s.track_id === track.id).length}
                </Badge>
              </button>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
