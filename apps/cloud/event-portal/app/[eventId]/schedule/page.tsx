"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, MapPin, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type FeedSession = {
  id: string;
  code?: string;
  title: string;
  type?: string | null;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  room?: string | null;
  track?: string | null;
};

type ScheduleFeed = {
  event_id: string;
  event_name: string;
  published_at?: string | null;
  sessions: FeedSession[];
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(value));
}

export default function PublicSchedulePage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [feed, setFeed] = useState<ScheduleFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/v1/programme/events/${eventId}/schedule.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "The schedule has not been published yet." : "The schedule is temporarily unavailable.");
      setFeed(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The schedule is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (eventId) void load(); }, [eventId]);

  const days = useMemo(() => {
    const grouped = new Map<string, FeedSession[]>();
    for (const session of feed?.sessions || []) {
      const key = new Date(session.starts_at).toISOString().slice(0, 10);
      grouped.set(key, [...(grouped.get(key) || []), session]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [feed]);

  if (loading) return <main className="min-h-screen bg-[#f4f7f6] p-8 text-[#17211f]"><div className="mx-auto max-w-5xl animate-pulse rounded-[28px] bg-white p-10 shadow-sm">Loading the programme…</div></main>;

  if (error || !feed) return (
    <main className="min-h-screen bg-[#f4f7f6] px-5 py-12 text-[#17211f]">
      <section className="mx-auto max-w-xl rounded-[28px] border border-[#dfe8e4] bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#e7f1ed] text-[#16735f]"><CalendarDays className="size-6" /></div>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Programme preview</h1>
        <p className="mt-2 text-sm leading-6 text-[#60706a]">{error || "The schedule is not available."}</p>
        <button type="button" onClick={() => void load()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#17211f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#28413a]"><RefreshCw className="size-4" /> Try again</button>
      </section>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#f4f7f6] px-5 py-8 text-[#17211f] sm:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="relative overflow-hidden rounded-[30px] bg-[#17211f] px-7 py-9 text-white shadow-[0_20px_50px_rgba(23,33,31,0.16)] sm:px-10">
          <div className="absolute -right-12 -top-20 size-64 rounded-full border-[26px] border-[#d0a86b]/25" aria-hidden="true" />
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#d0a86b]">Published programme</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">{feed.event_name}</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#c6d2cd]">A live view of the rooms, sessions, and tracks. Times are shown in your local timezone.</p>
        </header>

        {feed.sessions.length === 0 ? (
          <section className="mt-6 rounded-[24px] border border-[#dfe8e4] bg-white p-10 text-center"><p className="font-semibold">The published programme is currently empty.</p></section>
        ) : (
          <div className="mt-8 space-y-8">
            {days.map(([day, sessions]) => (
              <section key={day}>
                <div className="mb-3 flex items-center gap-3"><span className="size-2 rounded-full bg-[#16735f]" /><h2 className="text-lg font-semibold tracking-[-0.02em]">{formatDay(sessions[0].starts_at)}</h2><span className="text-xs text-[#73827c]">{sessions.length} sessions</span></div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {sessions.map((session) => (
                    <article key={session.id} className="rounded-[22px] border border-[#dfe8e4] bg-white p-5 shadow-[0_4px_14px_rgba(23,33,31,0.04)] transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold tabular-nums text-[#16735f]">{formatTime(session.starts_at)} – {formatTime(session.ends_at)}</p><h3 className="mt-2 text-lg font-semibold leading-6 tracking-[-0.02em]">{session.title}</h3></div><span className="rounded-full bg-[#eef4f1] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#477166]">{session.type || "Session"}</span></div>
                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-[#60706a]"><span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{session.room || "Room to be announced"}</span>{session.track ? <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" />{session.track}</span> : null}</div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
