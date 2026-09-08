import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatInTZ(iso: string, timezone?: string, options?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat('en-IN', {
      ...options,
      timeZone: timezone || 'Asia/Kolkata'
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  }
}

export function formatTimeInTZ(iso: string, timezone?: string): string {
  const formatted = formatInTZ(iso, timezone || 'Asia/Kolkata', { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true 
  });
  return formatted ? `${formatted} IST` : "";
}

export function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "just now";
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatFileSize(bytes: number): string {
  return formatBytes(bytes);
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 1)}…`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    return successful;
  } catch {
    return false;
  }
}
