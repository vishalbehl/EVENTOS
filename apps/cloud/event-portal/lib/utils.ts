import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO } from "date-fns";

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
  } catch (e) {
    return "IST";
  }
}

export function formatInTZ(iso: string, timezone?: string, options?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "";
  try {
    const tz = timezone || getFallbackTimezone();
    const formatted = new Intl.DateTimeFormat('en-IN', {
      ...options,
      timeZone: tz
    }).format(new Date(iso));
    return formatted.replace(/GMT\+5:30/gi, '').trim();
  } catch (e) {
    const formatted = new Date(iso).toLocaleString('en-IN', { timeZone: timezone || getFallbackTimezone() });
    return formatted.replace(/GMT\+5:30/gi, '').trim();
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
  return formatted || "";
}

export function formatTimeInTZ(iso: string, timezone?: string): string {
  const tz = timezone || getFallbackTimezone();
  const formatted = formatInTZ(iso, tz, { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true 
  });
  return formatted || "";
}

export function formatTimeRangeInTZ(start: string, end: string, timezone?: string): string {
  const tz = timezone || getFallbackTimezone();
  const startFmt = formatInTZ(start, tz, { hour: '2-digit', minute: '2-digit', hour12: true });
  const endFmt = formatInTZ(end, tz, { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${startFmt} – ${endFmt}`;
}

export function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch (e) {
    return "";
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const formatFileSize = formatBytes;

// ── Upload status labels & colors ─────────────────────────
export type UploadStatus = "pending" | "uploaded" | "replaced" | "approved" | "rejected";

export const UPLOAD_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  uploaded: "Uploaded",
  replaced: "Replaced",
  approved: "Approved",
  rejected: "Rejected",
};

export const UPLOAD_STATUS_COLOR: Record<string, string> = {
  pending: "text-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] border-[color-mix(in_srgb,var(--warn)_30%,transparent)]",
  uploaded: "text-[var(--pri)] bg-[color-mix(in_srgb,var(--pri)_12%,transparent)] border-[color-mix(in_srgb,var(--pri)_30%,transparent)]",
  replaced: "text-[var(--sec)] bg-[color-mix(in_srgb,var(--sec)_12%,transparent)] border-[color-mix(in_srgb,var(--sec)_30%,transparent)]",
  approved: "text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]",
  rejected: "text-[var(--dan)] bg-[color-mix(in_srgb,var(--dan)_12%,transparent)] border-[color-mix(in_srgb,var(--dan)_30%,transparent)]",
};

// ── Misc helpers ──────────────────────────────────────────
export function initials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

export function truncate(str: string, maxLength: number): string {
  if (!str || str.length <= maxLength) return str || "";
  return `${str.slice(0, maxLength - 1)}…`;
}

export function getErrorMessage(value: any, fallback = "Something went wrong"): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (Array.isArray(value)) {
    const messages = value
      .map((item) => {
        if (item && typeof item === "object" && item.msg) {
          const fieldName = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null;
          return fieldName ? `${fieldName}: ${item.msg}` : item.msg;
        }
        return getErrorMessage(item, "");
      })
      .filter(Boolean);
    return messages.length ? messages.join("; ") : fallback;
  }

  if (value && typeof value === "object") {
    if (typeof value.message === "string" && value.message.trim()) return value.message.trim();
    if (typeof value.msg === "string" && value.msg.trim()) return value.msg.trim();
    if (value.detail !== undefined) return getErrorMessage(value.detail, fallback);
    if (value.errors !== undefined) return getErrorMessage(value.errors, fallback);
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

export function formatApiError(error: any, fallback = "Something went wrong"): string {
  if (!error) return fallback;
  const candidate =
    error?.response?.data?.detail ??
    error?.response?.data?.message ??
    error?.detail ??
    error?.message ??
    error;
  return getErrorMessage(candidate, fallback);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
    }
  }
  return false;
}
