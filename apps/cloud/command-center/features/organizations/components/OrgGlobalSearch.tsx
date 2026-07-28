"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useOrganizationConsoleSearch } from "@/features/organizations/api/organization-console-api";

export function OrgGlobalSearch({ orgId }: { orgId: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const search = useOrganizationConsoleSearch(orgId, query);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, []);
  return <div ref={root} className="relative w-full max-w-2xl">
    <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
    <input value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} aria-label="Search all organization and event records" placeholder="Search events, attendees, speakers, sessions, files, campaigns, or users" className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] py-2 pl-9 pr-9 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" />
    {query && <button aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-3.5" /></button>}
    {open && query.trim().length >= 2 && <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 shadow-2xl">
      {search.isLoading ? <p className="p-3 text-xs text-[var(--text-tertiary)]">Searching authoritative records…</p> : search.isError ? <p className="p-3 text-xs text-[var(--status-danger)]">Search is unavailable. No empty result has been inferred.</p> : search.data?.items.length ? search.data.items.map(item => <Link onClick={() => setOpen(false)} key={`${item.domain}-${item.id}`} href={item.event_id ? `/organizations/${orgId}/events?eventId=${item.event_id}` : `/organizations/${orgId}/overview`} className="flex items-center justify-between gap-3 rounded-lg p-2.5 hover:bg-[var(--bg-surface-3)]"><div className="min-w-0"><p className="truncate text-xs font-bold text-[var(--text-primary)]">{item.title}</p><p className="truncate text-[10px] text-[var(--text-tertiary)]">{item.subtitle || item.resource_type} · {item.id}</p></div><span className="shrink-0 rounded-md bg-[var(--brand-primary)]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--brand-primary)]">{item.domain}</span></Link>) : <p className="p-3 text-xs text-[var(--text-tertiary)]">No matching records in this organization.</p>}
    </div>}
  </div>;
}
