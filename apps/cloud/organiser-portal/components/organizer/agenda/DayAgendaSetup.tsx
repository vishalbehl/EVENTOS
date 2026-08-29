"use client";

import { useState } from "react";
import {
  Calendar,
  Clock,
  Globe,
  Coffee,
  Utensils,
  Wine,
  Plus,
  ArrowLeft,
  Check,
  Trash2,
  SlidersHorizontal,
  Save,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface DayConfig {
  id: string;
  dayNumber: number;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  applyToAllDays: boolean;
  enableCoffeeBreak: boolean;
  coffeeBreakStart: string;
  coffeeBreakDuration: number;
  enableLunchBreak: boolean;
  lunchBreakStart: string;
  lunchBreakDuration: number;
  enableNetworkingBreak: boolean;
  networkingBreakStart: string;
  networkingBreakDuration: number;
}

interface DayAgendaSetupProps {
  days: DayConfig[];
  selectedDayId?: string;
  timezone: string;
  onSaveDay: (day: DayConfig) => void;
  onAddDay: () => void;
  onBack: () => void;
}

const COMMON_TIMEZONES = [
  { value: "Asia/Kolkata", label: "(GMT+05:30) Asia/Kolkata (IST)" },
  { value: "UTC", label: "(GMT+00:00) UTC Universal Time" },
  { value: "Europe/London", label: "(GMT+01:00) London / Edinburgh" },
  { value: "America/New_York", label: "(GMT-05:00) Eastern Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "(GMT-08:00) Pacific Time (US & Canada)" },
  { value: "Asia/Dubai", label: "(GMT+04:00) Gulf Standard Time (Dubai)" },
  { value: "Asia/Singapore", label: "(GMT+08:00) Singapore / Hong Kong" },
];

export function DayAgendaSetup({
  days,
  selectedDayId,
  timezone: initialTimezone,
  onSaveDay,
  onAddDay,
  onBack,
}: DayAgendaSetupProps) {
  const [activeDayId, setActiveDayId] = useState<string>(
    selectedDayId || (days[0]?.id ?? "day-1")
  );

  const activeDay = days.find((d) => d.id === activeDayId) || days[0] || {
    id: "day-1",
    dayNumber: 1,
    name: "Day 1 - Scientific Program",
    date: "2026-08-28",
    startTime: "09:00",
    endTime: "18:00",
    timezone: initialTimezone || "Asia/Kolkata",
    applyToAllDays: false,
    enableCoffeeBreak: true,
    coffeeBreakStart: "11:00",
    coffeeBreakDuration: 30,
    enableLunchBreak: true,
    lunchBreakStart: "13:00",
    lunchBreakDuration: 60,
    enableNetworkingBreak: true,
    networkingBreakStart: "16:30",
    networkingBreakDuration: 30,
  };

  const [formState, setFormState] = useState<DayConfig>({ ...activeDay });

  // Switch active day
  const handleSelectDay = (day: DayConfig) => {
    setActiveDayId(day.id);
    setFormState({ ...day });
  };

  const handleChange = (field: keyof DayConfig, value: any) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSaveDay(formState);
    toast.success(`Settings saved for ${formState.name}`);
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
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Day & Agenda Setup</h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Configure event days, working hours, break schedules, and timezone preferences.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-5 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
        >
          <Save className="size-3.5" /> Save Day Settings
        </button>
      </div>

      {/* Main Split Layout: Left Days List | Right Day Info & Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Event Days Column (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Event Days ({days.length})
            </h3>
            <button
              type="button"
              onClick={onAddDay}
              className="text-xs font-bold text-[var(--pri)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="size-3" /> Add Day
            </button>
          </div>

          <div className="space-y-2">
            {days.map((day) => {
              const isSelected = day.id === formState.id;
              return (
                <div
                  key={day.id}
                  onClick={() => handleSelectDay(day)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3.5 cursor-pointer transition-all",
                    isSelected
                      ? "border-[var(--pri)] bg-[var(--pri)]/10 shadow-xs"
                      : "border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--surface-subtle)]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-md font-bold text-xs",
                        isSelected
                          ? "bg-[var(--pri)] text-[var(--primary-contrast)]"
                          : "bg-[var(--surface-subtle)] text-[var(--text-secondary)]"
                      )}
                    >
                      D{day.dayNumber}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">
                        {day.name}
                      </h4>
                      <p className="text-[11px] font-mono text-[var(--text-secondary)]">
                        {day.date} • {day.startTime} - {day.endTime}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500" />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onAddDay}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--card)] p-3 text-xs font-semibold text-[var(--pri)] hover:bg-[var(--pri)]/5 hover:border-[var(--pri)] transition-colors cursor-pointer"
          >
            <Plus className="size-3.5" /> + Add Event Day
          </button>
        </div>

        {/* Right Day Information & Settings (8 cols) */}
        <div className="lg:col-span-8 space-y-5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-xs">
          {/* Section 1: Day Information */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] border-b border-[var(--border-subtle)] pb-2">
              Day Information & Schedule
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Day Name *
                </label>
                <input
                  value={formState.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="e.g. Day 1 - Scientific Program"
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={formState.date}
                  onChange={(e) => handleChange("date", e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Start Time *
                </label>
                <input
                  type="time"
                  value={formState.startTime}
                  onChange={(e) => handleChange("startTime", e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  End Time *
                </label>
                <input
                  type="time"
                  value={formState.endTime}
                  onChange={(e) => handleChange("endTime", e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Time Zone
                </label>
                <select
                  value={formState.timezone}
                  onChange={(e) => handleChange("timezone", e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formState.applyToAllDays}
                onChange={(e) => handleChange("applyToAllDays", e.target.checked)}
                className="rounded border-[var(--border-default)] accent-[var(--pri)]"
              />
              Apply start/end working hours to all event days
            </label>
          </div>

          {/* Section 2: Day Settings & Auto-Breaks Engine */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Automated Breaks & Networking Schedules
              </h3>
              <span className="text-[11px] text-[var(--text-secondary)]">
                Auto-generates spanning breaks across all active halls
              </span>
            </div>

            {/* Coffee Break Row */}
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formState.enableCoffeeBreak}
                    onChange={(e) => handleChange("enableCoffeeBreak", e.target.checked)}
                    className="rounded border-[var(--border-default)] accent-[var(--pri)]"
                  />
                  <Coffee className="size-4 text-amber-500" />
                  Enable Morning Coffee Break
                </label>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  Scheduled across all halls
                </span>
              </div>

              {formState.enableCoffeeBreak && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Break Start Time
                    </label>
                    <input
                      type="time"
                      value={formState.coffeeBreakStart}
                      onChange={(e) => handleChange("coffeeBreakStart", e.target.value)}
                      className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Duration (Minutes)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={120}
                      value={formState.coffeeBreakDuration}
                      onChange={(e) =>
                        handleChange("coffeeBreakDuration", parseInt(e.target.value) || 30)
                      }
                      className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Lunch Break Row */}
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formState.enableLunchBreak}
                    onChange={(e) => handleChange("enableLunchBreak", e.target.checked)}
                    className="rounded border-[var(--border-default)] accent-[var(--pri)]"
                  />
                  <Utensils className="size-4 text-rose-500" />
                  Enable Lunch Break & Exhibition Time
                </label>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  Scheduled across all halls
                </span>
              </div>

              {formState.enableLunchBreak && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Lunch Start Time
                    </label>
                    <input
                      type="time"
                      value={formState.lunchBreakStart}
                      onChange={(e) => handleChange("lunchBreakStart", e.target.value)}
                      className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Duration (Minutes)
                    </label>
                    <input
                      type="number"
                      min={30}
                      max={180}
                      value={formState.lunchBreakDuration}
                      onChange={(e) =>
                        handleChange("lunchBreakDuration", parseInt(e.target.value) || 60)
                      }
                      className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Networking Break Row */}
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formState.enableNetworkingBreak}
                    onChange={(e) => handleChange("enableNetworkingBreak", e.target.checked)}
                    className="rounded border-[var(--border-default)] accent-[var(--pri)]"
                  />
                  <Wine className="size-4 text-purple-500" />
                  Enable Afternoon Tea / Networking Break
                </label>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  Scheduled across all halls
                </span>
              </div>

              {formState.enableNetworkingBreak && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Networking Start Time
                    </label>
                    <input
                      type="time"
                      value={formState.networkingBreakStart}
                      onChange={(e) => handleChange("networkingBreakStart", e.target.value)}
                      className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Duration (Minutes)
                    </label>
                    <input
                      type="number"
                      min={15}
                      max={120}
                      value={formState.networkingBreakDuration}
                      onChange={(e) =>
                        handleChange("networkingBreakDuration", parseInt(e.target.value) || 30)
                      }
                      className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Submit */}
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-6 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
            >
              <Save className="size-3.5" /> Save Day
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
