import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import type { UploadStatus, FileUploadStatus, StationStatus, ValidationResult } from "@/types/models";
import { runtimeConfig } from "@/lib/runtime-config";

// ── Tailwind class merger ─────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Date formatters ───────────────────────────────────────
export function getFallbackTimezone(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("system-timezone") || "Asia/Kolkata";
  }
  return "Asia/Kolkata";
}

export function getTimezoneAbbrev(timezone: string, date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });
    const parts = formatter.formatToParts(date);
    return parts.find(p => p.type === 'timeZoneName')?.value || timezone;
  } catch {
    return "IST";
  }
}

export function formatInTZ(iso: string, timezone?: string, options?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "";
  try {
    const tz = timezone || getFallbackTimezone();
    return new Intl.DateTimeFormat('en-IN', {
      ...options,
      timeZone: tz
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString('en-IN', { timeZone: timezone || getFallbackTimezone() });
  }
}

export function formatDateInTZ(iso: string, timezone?: string): string {
  return formatInTZ(iso, timezone || getFallbackTimezone(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTimeInTZ(iso: string, timezone?: string): string {
  const tz = timezone || getFallbackTimezone();
  const formatted = formatInTZ(iso, tz, { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true 
  });
  const abbrev = getTimezoneAbbrev(tz, new Date(iso));
  return formatted ? `${formatted} ${abbrev}` : "";
}

export function formatTimeInTZ(iso: string, timezone?: string): string {
  const tz = timezone || getFallbackTimezone();
  const formatted = formatInTZ(iso, tz, { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true 
  });
  const abbrev = getTimezoneAbbrev(tz, new Date(iso));
  return formatted ? `${formatted} ${abbrev}` : "";
}

export function formatTimeRangeInTZ(start: string, end: string, timezone?: string): string {
  const tz = timezone || getFallbackTimezone();
  const startFmt = formatInTZ(start, tz, { hour: '2-digit', minute: '2-digit', hour12: true });
  const endFmt = formatInTZ(end, tz, { hour: '2-digit', minute: '2-digit', hour12: true });
  const abbrev = getTimezoneAbbrev(tz, new Date(start));
  return `${startFmt} – ${endFmt} ${abbrev}`;
}

/**
 * Returns numerical components of a date in a specific timezone.
 * Essential for positioning elements in calendars/timelines.
 */
export function getTimeComponentsInTZ(iso: string, timezone?: string) {
  if (!iso) return { hour: 0, minute: 0, day: 0, month: 0, year: 0 };
  try {
    const date = new Date(iso);
    const formatter = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric', minute: 'numeric', day: 'numeric', month: 'numeric', year: 'numeric',
      hourCycle: 'h23', timeZone: timezone || getFallbackTimezone()
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || "0");
    
    return {
      hour: getPart('hour'),
      minute: getPart('minute'),
      day: getPart('day'),
      month: getPart('month'),
      year: getPart('year')
    };
  } catch {
    const d = new Date(iso);
    return { hour: d.getHours(), minute: d.getMinutes(), day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
  }
}

/** Returns YYYY-MM-DD for a date in a specific timezone */
export function getISODateInTZ(iso: string, timezone?: string): string {
  const c = getTimeComponentsInTZ(iso, timezone || getFallbackTimezone());
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
}

/** Returns YYYY-MM-DD for a local Date object without UTC shifting */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converts ISO UTC string to YYYY-MM-DDTHH:mm in a specific timezone
 * for use in <input type="datetime-local" />
 */
export function toDateTimeLocalString(iso: string, timezone?: string): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    const formatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone || getFallbackTimezone()
    });
    
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || "";
    
    // Format: YYYY-MM-DDTHH:mm
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}`;
  } catch {
    return iso.slice(0, 16);
  }
}

/**
 * Parses a YYYY-MM-DDTHH:mm string assuming it is in the given timezone,
 * and returns a UTC ISO string.
 */
export function fromDateTimeLocalString(localStr: string, timezone?: string): string {
  if (!localStr) return "";
  try {
    // 1. Parse input as if it were UTC (e.g. "2026-10-01T09:00Z")
    const asUTC = new Date(localStr + ':00Z');
    
    // 2. Format this UTC date in the target timezone to see the shift
    const parts = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: timezone || getFallbackTimezone()
    }).formatToParts(asUTC);
    
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || "";
    const inTZ = new Date(`${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}Z`);
    
    // 3. Difference is the offset from UTC
    const offset = asUTC.getTime() - inTZ.getTime();
    
    return new Date(asUTC.getTime() + offset).toISOString();
  } catch {
    return new Date(localStr).toISOString();
  }
}

export function timeAgo(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const formatFileSize = formatBytes;

// ── Upload status display ─────────────────────────────────
export const UPLOAD_STATUS_LABEL: Record<UploadStatus, string> = {
  pending: "Pending",
  uploaded: "Uploaded",
  replaced: "Replaced",
  approved: "Approved",
  rejected: "Rejected",
};

export const UPLOAD_STATUS_COLOR: Record<UploadStatus, string> = {
  pending: "text-[var(--warn)]  bg-[color-mix(in_srgb,var(--warn)_12%,transparent)]  border-[color-mix(in_srgb,var(--warn)_30%,transparent)]",
  uploaded: "text-[var(--pri)]   bg-[color-mix(in_srgb,var(--pri)_12%,transparent)]   border-[color-mix(in_srgb,var(--pri)_30%,transparent)]",
  replaced: "text-[var(--sec)] bg-[color-mix(in_srgb,var(--sec)_12%,transparent)] border-[color-mix(in_srgb,var(--sec)_30%,transparent)]",
  approved: "text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]",
  rejected: "text-[var(--dan)]    bg-[color-mix(in_srgb,var(--dan)_12%,transparent)]    border-[color-mix(in_srgb,var(--dan)_30%,transparent)]",
};

// ── File status display ───────────────────────────────────
export const FILE_STATUS_COLOR: Record<FileUploadStatus, string> = {
  processing: "text-muted   bg-[color-mix(in_srgb,var(--muted)_12%,transparent)]   border-default",
  valid: "text-[var(--pri)]   bg-[color-mix(in_srgb,var(--pri)_12%,transparent)]   border-[color-mix(in_srgb,var(--pri)_30%,transparent)]",
  invalid: "text-[var(--dan)]    bg-[color-mix(in_srgb,var(--dan)_12%,transparent)]    border-[color-mix(in_srgb,var(--dan)_30%,transparent)]",
  approved: "text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]",
  rejected: "text-[var(--dan)]    bg-[color-mix(in_srgb,var(--dan)_12%,transparent)]    border-[color-mix(in_srgb,var(--dan)_30%,transparent)]",
  locked: "text-muted   bg-[color-mix(in_srgb,var(--muted)_18%,transparent)]  border-default",
};

// ── Station status display ────────────────────────────────
export const STATION_STATUS_COLOR: Record<StationStatus, string> = {
  idle: "text-muted   bg-[color-mix(in_srgb,var(--muted)_12%,transparent)]   border-default",
  occupied: "text-[var(--pri)]   bg-[color-mix(in_srgb,var(--pri)_12%,transparent)]   border-[color-mix(in_srgb,var(--pri)_30%,transparent)]",
  uploading: "text-[var(--warn)]  bg-[color-mix(in_srgb,var(--warn)_12%,transparent)]  border-[color-mix(in_srgb,var(--warn)_30%,transparent)]",
  previewing: "text-[var(--sec)] bg-[color-mix(in_srgb,var(--sec)_12%,transparent)] border-[color-mix(in_srgb,var(--sec)_30%,transparent)]",
  completed: "text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]",
  error: "text-[var(--dan)]    bg-[color-mix(in_srgb,var(--dan)_12%,transparent)]    border-[color-mix(in_srgb,var(--dan)_30%,transparent)]",
  locked: "text-muted   bg-[color-mix(in_srgb,var(--muted)_18%,transparent)]  border-default",
};

// ── Validation result display ─────────────────────────────
export const VALIDATION_COLOR: Record<ValidationResult, string> = {
  pass: "text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]",
  warning: "text-[var(--warn)]  bg-[color-mix(in_srgb,var(--warn)_12%,transparent)]  border-[color-mix(in_srgb,var(--warn)_30%,transparent)]",
  fail: "text-[var(--dan)]    bg-[color-mix(in_srgb,var(--dan)_12%,transparent)]    border-[color-mix(in_srgb,var(--dan)_30%,transparent)]",
};

// ── Event status display ──────────────────────────────────
export const EVENT_STATUS_COLOR: Record<string, string> = {
  draft: "text-muted   bg-[color-mix(in_srgb,var(--muted)_12%,transparent)]",
  active: "text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)]",
  completed: "text-[var(--pri)]   bg-[color-mix(in_srgb,var(--pri)_12%,transparent)]",
  archived: "text-muted   bg-[color-mix(in_srgb,var(--muted)_12%,transparent)]",
};

// ── Number formatting ─────────────────────────────────────
export function formatPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural ?? singular + "s"}`;
}

// ── URL builders ──────────────────────────────────────────
export function getAssetUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  
  const base = runtimeConfig.assetsOrigin;
  return `${base}/${path}`;
}

export function eventPath(eventId: string, sub?: string): string {
  const base = `/events/${eventId}`;
  return sub ? `${base}/${sub}` : base;
}

export function speakerUploadUrl(eventId: string, token: string): string {
  const base = runtimeConfig.speakerPortalOrigin;
  return `${base}/${eventId}/${token}`;
}

// ── Misc ──────────────────────────────────────────────────
export function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 1)}…`;
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  try {
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-999999px";
      textarea.style.top = "-999999px";
      textarea.setAttribute("readonly", "");
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      return successful;
    }
  } catch {
    // Silently handle fallback failure
  }
  return false;
}
