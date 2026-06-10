"use client";

import { useAuthStore } from "@/store/use-auth-store";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Search, RefreshCw, ExternalLink, Building2 } from "lucide-react";

interface EventRow {
  id: string;
  title: string;
  status: string;
  organization_id: string;
  organization_name?: string;
  start_date?: string;
  total_speakers?: number;
  total_sessions?: number;
}

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  DRAFT: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  ARCHIVED: "bg-white/5 text-white/30 border-white/10",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function EventExplorerPage() {
  const { accessToken } = useAuthStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const API = process.env.NEXT_PUBLIC_API_URL;

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    fetch(`${API}/api/v1/events?limit=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d) => setEvents(d.events || d.items || d || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [accessToken, API]);

  const filtered = events.filter(
    (e) =>
      !search ||
      e.title?.toLowerCase().includes(search.toLowerCase()) ||
      e.organization_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20">
            <Calendar className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Event Explorer</h1>
            <p className="text-[11px] text-white/35">Browse all events across the platform</p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events or organizations…"
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/40 transition-all"
        />
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/3 overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-white/5">
          {["Event", "Status", "Organization", "Date", ""].map((h) => (
            <div key={h} className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">{h}</div>
          ))}
        </div>

        {loading ? (
          <div className="p-8 flex items-center gap-2 text-white/25 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading events…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-white/20 text-sm">No events found</div>
        ) : (
          <div className="divide-y divide-white/3">
            {filtered.map((event) => (
              <div
                key={event.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-4 hover:bg-white/3 transition-colors group items-center"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-white/80 truncate">{event.title}</p>
                  <p className="text-[10px] text-white/25 font-mono">{event.id.slice(0, 8)}…</p>
                </div>
                <div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLES[event.status] || "bg-white/5 text-white/30 border-white/10"}`}>
                    {event.status || "DRAFT"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[12px] text-white/50">
                  <Building2 className="w-3 h-3" />
                  {event.organization_name || event.organization_id?.slice(0, 8) || "—"}
                </div>
                <div className="text-[11px] text-white/30 font-mono">
                  {event.start_date ? new Date(event.start_date).toLocaleDateString() : "—"}
                </div>
                <button
                  onClick={() => router.push(`/events/${event.id}/speaker/dashboard`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400 hover:bg-blue-500/20 transition-all opacity-0 group-hover:opacity-100"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
