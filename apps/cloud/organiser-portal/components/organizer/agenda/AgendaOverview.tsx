"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Building2,
  Layers,
  Users,
  FileText,
  Clock,
  Plus,
  ArrowRight,
  MoreVertical,
  SlidersHorizontal,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Eye,
  Trash2,
  Copy,
  Edit,
  Sparkles,
  ChevronRight,
  Tag,
} from "lucide-react";
import { cn, formatDateInTZ, formatTimeInTZ } from "@/lib/utils";
import { toast } from "sonner";
import { ImportAgendaModal } from "./ImportAgendaModal";

export interface AgendaDayItem {
  id: string;
  dayNumber: number;
  name: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: "published" | "draft";
  roomsCount: number;
  sessionsCount: number;
  speakersCount: number;
}

interface AgendaOverviewProps {
  eventId: string;
  eventName: string;
  days: AgendaDayItem[];
  roomsCount: number;
  sessionsCount: number;
  tracksCount: number;
  speakersCount: number;
  documentsCount: number;
  onOpenDay: (dayId: string) => void;
  onOpenDaySetup: (dayId?: string) => void;
  onOpenStructure: (dayId: string) => void;
  onOpenRoomSetup: () => void;
  onNewSession: () => void;
  onApplyTemplate: (templateKey: string) => void;
}

export function AgendaOverview({
  eventId,
  eventName,
  days,
  roomsCount,
  sessionsCount,
  tracksCount,
  speakersCount,
  documentsCount,
  onOpenDay,
  onOpenDaySetup,
  onOpenStructure,
  onOpenRoomSetup,
  onNewSession,
  onApplyTemplate,
}: AgendaOverviewProps) {
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [activeMenuDayId, setActiveMenuDayId] = useState<string | null>(null);

  const kpis = [
    { label: "Days", value: days?.length || 0, icon: Calendar, color: "#3b82f6" },
    { label: "Rooms", value: roomsCount || 0, icon: Building2, color: "#10b981" },
    { label: "Sessions", value: sessionsCount || 0, icon: Layers, color: "#8b5cf6" },
    { label: "Tracks", value: tracksCount || 0, icon: Tag, color: "#f59e0b" },
    { label: "Speakers", value: speakersCount || 0, icon: Users, color: "#06b6d4" },
    { label: "Documents", value: documentsCount || 0, icon: FileText, color: "#ec4899" },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Agenda Overview</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Organize and build your event agenda across days, rooms, and conference sessions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer shadow-xs"
          >
            <Upload className="size-3.5 text-[var(--text-secondary)]" />
            Import Agenda
          </button>

          <button
            type="button"
            onClick={onNewSession}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
          >
            <Plus className="size-3.5" />
            + Add Session
          </button>
        </div>
      </div>

      {/* 6 KPI Stat Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="flex items-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-3.5 shadow-xs"
            >
              <div
                className="flex size-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${kpi.color}15`, color: kpi.color }}
              >
                <Icon className="size-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold text-[var(--text-primary)] leading-tight">
                  {kpi.value}
                </span>
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                  {kpi.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Agenda Days Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Agenda Days</h2>
            <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
              {days.length} Configured
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpenDaySetup()}
            className="text-xs font-semibold text-[var(--pri)] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <SlidersHorizontal className="size-3" /> Day & Schedule Setup
          </button>
        </div>

        {/* Days List */}
        <div className="space-y-3">
          {days.map((day) => {
            const dateObj = new Date(day.date);
            const dayNumStr = !isNaN(dateObj.getTime())
              ? dateObj.getDate().toString()
              : "01";
            const monthStr = !isNaN(dateObj.getTime())
              ? dateObj.toLocaleString("en-US", { month: "short" }).toUpperCase()
              : "AUG";
            const yearStr = !isNaN(dateObj.getTime())
              ? dateObj.getFullYear().toString()
              : "2026";

            return (
              <div
                key={day.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-xs hover:border-[var(--border-subtle)] transition-all"
              >
                <div className="flex items-center gap-4">
                  {/* Date Badge */}
                  <div className="flex size-14 flex-col items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] text-center shrink-0">
                    <span className="text-base font-bold text-[var(--text-primary)] leading-none">
                      {dayNumStr}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--pri)] mt-0.5 uppercase tracking-wider">
                      {monthStr}
                    </span>
                    <span className="text-[9px] text-[var(--text-tertiary)]">
                      {yearStr}
                    </span>
                  </div>

                  {/* Day Info */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        {day.name}
                      </h3>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold",
                          day.status === "published"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        )}
                      >
                        {day.status === "published" ? "Published" : "Draft"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="size-3 text-[var(--text-tertiary)]" />
                        {day.startTime} - {day.endTime}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Building2 className="size-3 text-[var(--text-tertiary)]" />
                        {day.roomsCount} Rooms
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Layers className="size-3 text-[var(--text-tertiary)]" />
                        {day.sessionsCount} Sessions
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3 text-[var(--text-tertiary)]" />
                        {day.speakersCount} Speakers
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => onOpenStructure(day.id)}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                  >
                    Outline Structure
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenDay(day.id)}
                    className="flex items-center gap-1.5 rounded-md bg-[var(--pri)] px-3.5 py-1.5 text-xs font-bold text-[var(--primary-contrast)] hover:opacity-95 transition-opacity cursor-pointer shadow-xs"
                  >
                    Open Agenda <ChevronRight className="size-3.5" />
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuDayId(activeMenuDayId === day.id ? null : day.id)
                      }
                      className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                      <MoreVertical className="size-4" />
                    </button>

                    {activeMenuDayId === day.id && (
                      <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-1 shadow-md text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuDayId(null);
                            onOpenDaySetup(day.id);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
                        >
                          <Edit className="size-3.5 text-[var(--text-secondary)]" /> Edit Day Settings
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuDayId(null);
                            toast.success(`Day duplicated: ${day.title} (Copy)`);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
                        >
                          <Copy className="size-3.5 text-[var(--text-secondary)]" /> Duplicate Day
                        </button>
                        <div className="my-1 border-t border-[var(--border-subtle)]" />
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuDayId(null);
                            toast.error("Cannot delete canonical active day");
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="size-3.5" /> Delete Day
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add New Day Trigger Button */}
          <button
            type="button"
            onClick={() => onOpenDaySetup()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-default)] p-3 text-xs font-bold text-[var(--pri)] hover:bg-[var(--pri)]/5 hover:border-[var(--pri)] transition-colors cursor-pointer"
          >
            <Plus className="size-4" /> + Add New Day
          </button>
        </div>
      </div>

      {/* Quick Setup Launcher Banner */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] shrink-0">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--text-primary)]">
              Venue Halls & Multi-Track Setup
            </h4>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Configure room capacities, floor layouts, and multi-track color tagging.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenRoomSetup}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer self-start sm:self-auto"
        >
          Manage Rooms & Tracks <ArrowRight className="size-3.5" />
        </button>
      </div>

      {/* Import Modal */}
      <ImportAgendaModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onApplyTemplate={onApplyTemplate}
        onImportFile={() => toast.success("Importing spreadsheet sessions...")}
        onApplyAIPrompt={() => toast.success("Generating AI schedule structure...")}
      />
    </div>
  );
}
