"use client";

import { useState } from "react";
import {
  Globe,
  Smartphone,
  CreditCard,
  Tv,
  Users,
  Printer,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  Send,
  SlidersHorizontal,
  ArrowLeft,
  Search,
  Filter,
  Eye,
  Lock,
  Layers,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SessionInspectorData } from "./SessionInspectorDrawer";
import { RoomItem, TrackConfigItem } from "./RoomTrackSetup";

interface PreviewPublishStationProps {
  eventName: string;
  days: Array<{ id: string; name: string; date: string }>;
  rooms: RoomItem[];
  tracks: TrackConfigItem[];
  sessions: SessionInspectorData[];
  onPublish: (channels: string[], scheduleDate?: string) => void;
  onBack: () => void;
}

const PREVIEW_CHANNELS = [
  { key: "web", label: "Web (Public)", icon: Globe },
  { key: "mobile", label: "Mobile App", icon: Smartphone },
  { key: "registration", label: "Registration Portal", icon: CreditCard },
  { key: "venue", label: "Venue Display", icon: Tv },
  { key: "moderator", label: "Moderator App", icon: Users },
  { key: "print", label: "Print & PDF", icon: Printer },
];

export function PreviewPublishStation({
  eventName,
  days,
  rooms,
  tracks,
  sessions,
  onPublish,
  onBack,
}: PreviewPublishStationProps) {
  const [activePreviewMode, setActivePreviewMode] = useState<string>("web");
  const [selectedDayId, setSelectedDayId] = useState<string>(days[0]?.id || "day-1");
  const [searchFilter, setSearchFilter] = useState("");
  const [trackFilter, setTrackFilter] = useState("all");

  // Publishing Channels Checklist
  const [publishedChannels, setPublishedChannels] = useState<Record<string, boolean>>({
    website: true,
    mobile: true,
    registration: true,
    venue_screens: true,
    moderator_app: true,
    speaker_portal: true,
  });

  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [scheduledDate, setScheduledDate] = useState("2026-08-28");
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [isPublishing, setIsPublishing] = useState(false);

  const activeDay = days.find((d) => d.id === selectedDayId) || days[0];

  const filteredSessions = sessions.filter((s) => {
    if (trackFilter !== "all" && s.trackId !== trackFilter) return false;
    if (searchFilter && !s.title.toLowerCase().includes(searchFilter.toLowerCase())) {
      return false;
    }
    return true;
  });

  const handleToggleChannel = (key: string) => {
    setPublishedChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePublishSubmit = () => {
    setIsPublishing(true);
    const selectedChannelsList = Object.entries(publishedChannels)
      .filter(([_, val]) => val)
      .map(([key]) => key);

    setTimeout(() => {
      onPublish(
        selectedChannelsList,
        publishMode === "schedule" ? `${scheduledDate}T${scheduledTime}` : undefined
      );
      setIsPublishing(false);
      toast.success(
        publishMode === "now"
          ? "Agenda published across selected channels!"
          : `Agenda publication scheduled for ${scheduledDate} at ${scheduledTime}`
      );
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Preview & Publish</h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Live preview attendee experience across platforms and publish schedule to portals.
            </p>
          </div>
        </div>
      </div>

      {/* Main Split Layout: Left Live Preview Engine | Right Publish Control Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Live Preview Engine (8 cols) */}
        <div className="lg:col-span-8 space-y-4 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-xs">
          {/* Top Preview Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <span className="text-xs font-bold text-[var(--text-primary)] block">
                Preview Agenda
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">
                Preview how your agenda will appear to your attendees.
              </span>
            </div>

            {/* Channel Tabs */}
            <div className="flex items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-0.5 gap-0.5 flex-wrap">
              {PREVIEW_CHANNELS.map((ch) => {
                const Icon = ch.icon;
                const isActive = activePreviewMode === ch.key;
                return (
                  <button
                    key={ch.key}
                    type="button"
                    onClick={() => setActivePreviewMode(ch.key)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer",
                      isActive
                        ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-xs font-bold"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    <Icon className="size-3" /> {ch.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Attendee View Preview Frame */}
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)]/30 p-4 space-y-4">
            {/* Event Banner Sub-header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">{eventName}</h3>
                <p className="text-[11px] text-[var(--text-secondary)] flex items-center gap-2">
                  <Calendar className="size-3 text-[var(--pri)]" /> 28 - 30 Aug 2026 • New Delhi,
                  India
                </p>
              </div>

              {/* Day Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {days.map((day) => (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => setSelectedDayId(day.id)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                      selectedDayId === day.id
                        ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-xs"
                        : "border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    {day.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Search */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="size-3.5 absolute left-3 top-2.5 text-[var(--text-tertiary)]" />
                <input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search sessions, speakers, topics..."
                  className="h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] pl-8 pr-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <select
                value={trackFilter}
                onChange={(e) => setTrackFilter(e.target.value)}
                className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
              >
                <option value="all">All Tracks</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Rendered Live Timeline Schedule */}
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredSessions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center">
                  <Calendar className="mx-auto size-8 text-[var(--text-tertiary)]" />
                  <h4 className="mt-2 text-xs font-bold text-[var(--text-primary)]">
                    No Sessions Scheduled Yet
                  </h4>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    Create sessions in the Matrix Matrix or Structure Builder to preview live across publication channels.
                  </p>
                </div>
              ) : (
                filteredSessions.map((session) => {
                const room = rooms.find((r) => r.id === session.roomId);
                const track = tracks.find((t) => t.id === session.trackId);
                const accent = session.color || track?.displayColor || "#3b82f6";

                return (
                  <div
                    key={session.id}
                    className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-3.5 shadow-xs space-y-2 hover:border-[var(--border-subtle)] transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                            style={{ backgroundColor: `${accent}20`, color: accent }}
                          >
                            {session.sessionType}
                          </span>
                          {track && (
                            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                              • {track.name}
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold text-[var(--text-primary)]">
                          {session.title}
                        </h4>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-xs font-bold text-[var(--pri)]">
                          {session.startTime} - {session.endTime}
                        </span>
                        {session.cmeEligible && (
                          <span className="block text-[10px] font-bold text-amber-500 font-mono">
                            {session.cmeCredits} CME Credits
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-[var(--text-secondary)] pt-1 border-t border-[var(--border-subtle)] gap-2">
                      <div className="flex items-center gap-3">
                        {room && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3 text-[var(--text-tertiary)]" />
                            {room.name}
                          </span>
                        )}
                        {session.moderators?.length > 0 && (
                          <span className="flex items-center gap-1 font-medium">
                            <Users className="size-3 text-[var(--text-tertiary)]" />
                            Chair: {session.moderators.join(", ")}
                          </span>
                        )}
                      </div>

                      {session.speakers?.length > 0 && (
                        <span className="text-[11px] text-[var(--text-primary)] font-medium">
                          Speakers: {session.speakers.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }))}
            </div>
          </div>
        </div>

        {/* Right Publish Control Center (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Publish Agenda
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Publish your agenda to make it visible across selected platforms.
              </p>
            </div>

            {/* Publishing Channels Toggles */}
            <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                Publish To
              </span>

              {[
                { key: "website", label: "Event Website (Public)" },
                { key: "mobile", label: "Mobile App" },
                { key: "registration", label: "Registration Portal" },
                { key: "venue_screens", label: "Venue Display Screens" },
                { key: "moderator_app", label: "Moderator App" },
                { key: "speaker_portal", label: "Speaker Portal" },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-md p-1.5 hover:bg-[var(--surface-subtle)] transition-colors"
                >
                  <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(publishedChannels[item.key])}
                      onChange={() => handleToggleChannel(item.key)}
                      className="rounded border-[var(--border-default)] accent-[var(--pri)]"
                    />
                    {item.label}
                  </label>
                  <button
                    type="button"
                    onClick={() => toast.info(`Previewing channel: ${item.label}`)}
                    className="text-[10px] text-[var(--pri)] hover:underline cursor-pointer"
                  >
                    Preview
                  </button>
                </div>
              ))}
            </div>

            {/* Publishing Options */}
            <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                Publishing Options
              </span>

              <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer select-none">
                <input
                  type="radio"
                  name="publishOption"
                  checked={publishMode === "now"}
                  onChange={() => setPublishMode("now")}
                  className="accent-[var(--pri)]"
                />
                Publish Now
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer select-none">
                <input
                  type="radio"
                  name="publishOption"
                  checked={publishMode === "schedule"}
                  onChange={() => setPublishMode("schedule")}
                  className="accent-[var(--pri)]"
                />
                Schedule for Later
              </label>

              {publishMode === "schedule" && (
                <div className="grid grid-cols-2 gap-2 pl-5 pt-1">
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="h-8 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs text-[var(--text-primary)]"
                  />
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="h-8 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs font-mono text-[var(--text-primary)]"
                  />
                </div>
              )}
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              disabled={isPublishing}
              onClick={handlePublishSubmit}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--pri)] py-2.5 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-95 disabled:opacity-50 transition-opacity cursor-pointer mt-3"
            >
              <Send className="size-3.5" />
              {publishMode === "now" ? "Publish Agenda" : "Schedule Publication"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
