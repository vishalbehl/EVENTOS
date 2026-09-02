"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { 
  Search, DoorOpen, User, Calendar, Monitor, FileText, AlertTriangle, 
  ArrowRight, X, Loader2, CornerDownLeft, Sparkles, Command
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type SearchResult = {
  type: "room" | "speaker" | "session" | "device" | "file" | "incident";
  id: string;
  title: string;
  detail: string;
  href: string;
  actions?: Array<{ label: string; href: string }>;
};

type SearchResponse = {
  query: string;
  count: number;
  results: SearchResult[];
};

export function GlobalSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 200);
    return () => clearTimeout(handler);
  }, [query]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ["global-search", debouncedQuery],
    queryFn: () =>
      debouncedQuery
        ? apiClient.get<SearchResponse>(`/venue/admin/control/search?q=${encodeURIComponent(debouncedQuery)}`)
        : Promise.resolve({ query: "", count: 0, results: [] }),
    enabled: Boolean(debouncedQuery && open),
  });

  const results = data?.results || [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      const target = results[selectedIndex];
      router.push(target.href);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const getIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "room":
        return <DoorOpen className="size-4 text-emerald-400" />;
      case "speaker":
        return <User className="size-4 text-blue-400" />;
      case "session":
        return <Calendar className="size-4 text-amber-400" />;
      case "device":
        return <Monitor className="size-4 text-purple-400" />;
      case "file":
        return <FileText className="size-4 text-cyan-400" />;
      case "incident":
        return <AlertTriangle className="size-4 text-rose-400" />;
      default:
        return <Sparkles className="size-4 text-zinc-400" />;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surf)] shadow-2xl animate-in zoom-in-95 duration-150"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5">
          <Search className="size-5 shrink-0 text-[var(--muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rooms, speakers, sessions, devices, presentation files, incidents..."
            className="w-full bg-transparent text-sm font-semibold text-[var(--text)] placeholder-[var(--muted)] focus:outline-none"
          />
          {isLoading && <Loader2 className="size-4 shrink-0 animate-spin text-[var(--pri)]" />}
          {query && (
            <button
              onClick={() => setQuery("")}
              className="rounded p-1 text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]"
            >
              <X className="size-4" />
            </button>
          )}
          <kbd className="hidden items-center gap-1 rounded bg-[var(--card)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--muted)] border border-[var(--border)] sm:flex">
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!query && (
            <div className="p-6 text-center text-xs text-[var(--muted)]">
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--pri)]">
                <Command className="size-5" />
              </div>
              <p className="font-bold text-[var(--text)]">Universal Venue Omnibox</p>
              <p className="mt-1">Type a speaker name, session title, room name (e.g. &quot;Hall 4&quot;), device hostname, or asset code.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {["Dr. Sharma", "Hall 4", "Cardiology", "TECH-PC-04", "INC-0082", "SRR-02"].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setQuery(suggestion)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-medium hover:border-[var(--pri)] hover:text-[var(--text)]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {query && !isLoading && results.length === 0 && (
            <div className="p-8 text-center text-xs text-[var(--muted)]">
              No live records found matching &quot;{query}&quot;.
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-1">
              {results.map((res, idx) => (
                <div
                  key={`${res.type}-${res.id}`}
                  onClick={() => {
                    router.push(res.href);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "group flex cursor-pointer items-center justify-between rounded-xl p-3 transition-colors",
                    selectedIndex === idx ? "bg-[var(--raised)] border border-[var(--border)]" : "hover:bg-[var(--raised)]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)]">
                      {getIcon(res.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text)]">{res.title}</span>
                        <span className="rounded bg-[var(--card)] border border-[var(--border)] px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase text-[var(--muted)]">
                          {res.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--muted)]">{res.detail}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {res.actions?.map((act) => (
                      <button
                        key={act.label}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(act.href);
                          onClose();
                        }}
                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--text)] hover:bg-[var(--pri)] hover:text-[var(--primary-contrast)]"
                      >
                        {act.label}
                      </button>
                    ))}
                    <div className="text-[var(--muted)] group-hover:text-[var(--text)]">
                      <CornerDownLeft className="size-4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[10px] font-medium text-[var(--muted)]">
          <div className="flex items-center gap-3">
            <span>Use <kbd className="rounded border bg-[var(--surf)] px-1 font-mono">↑</kbd> <kbd className="rounded border bg-[var(--surf)] px-1 font-mono">↓</kbd> to navigate</span>
            <span><kbd className="rounded border bg-[var(--surf)] px-1 font-mono">ENTER</kbd> to select</span>
          </div>
          <span>Eventos NOC Authority</span>
        </div>
      </div>
    </div>
  );
}
