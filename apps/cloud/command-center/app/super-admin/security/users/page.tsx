"use client";

import { useState } from "react";
import { useGlobalUsers } from "@/services/super-admin-service";
import { Users2, Search, RefreshCw, CheckCircle2, XCircle, ShieldCheck, Key } from "lucide-react";

export default function GlobalUsersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 25;

  const { data, isLoading, refetch } = useGlobalUsers({
    skip: page * limit,
    limit,
    search: debouncedSearch || undefined,
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout((window as any).__searchTimer);
    (window as any).__searchTimer = setTimeout(() => { setDebouncedSearch(v); setPage(0); }, 400);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20">
            <Users2 className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Global Users</h1>
            <p className="text-[11px] text-white/35">{total.toLocaleString()} total users across platform</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/40 transition-all"
        />
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/3 overflow-hidden">
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-white/5">
          {["Name / Email", "Organization", "Role", "Platform Role", "Status", "2FA"].map((h) => (
            <div key={h} className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center gap-2 text-white/25 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Loading users…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-white/20 text-sm">No users found</div>
        ) : (
          <div className="divide-y divide-white/3">
            {items.map((user) => (
              <div key={user.id} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-white/75 truncate">{user.first_name} {user.last_name}</p>
                  <p className="text-[10px] text-white/30 truncate font-mono">{user.email}</p>
                </div>
                <p className="text-[12px] text-white/50 truncate">{user.organization_name}</p>
                <span className="text-[10px] font-mono text-white/40">{user.role}</span>
                {user.platform_role ? (
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-violet-400" />
                    <span className="text-[10px] font-bold text-violet-400">{user.platform_role}</span>
                  </div>
                ) : (
                  <span className="text-[10px] text-white/15">—</span>
                )}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit ${user.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                  {user.is_active ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                  {user.is_active ? "Active" : "Disabled"}
                </span>
                <span className={`text-[10px] font-bold ${user.is_2fa_enabled ? "text-emerald-400" : "text-white/20"}`}>
                  {user.is_2fa_enabled ? "✓ On" : "Off"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-white/25 font-mono">Page {page + 1} · {total} total</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/40 hover:text-white disabled:opacity-30 transition-all">Previous</button>
          <button onClick={() => setPage(page + 1)} disabled={items.length < limit} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/40 hover:text-white disabled:opacity-30 transition-all">Next</button>
        </div>
      </div>
    </div>
  );
}
