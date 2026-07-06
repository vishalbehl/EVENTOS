"use client";

import { useState } from "react";
import { useAdminOrgs, useAdminOrgFeatures, useOverrideFeature } from "@/services/super-admin-service";
import { Flag, RefreshCw, ChevronDown, Search } from "lucide-react";

export default function FeatureFlagsPage() {
  const [selectedOrg, setSelectedOrg] = useState("");
  const [search, setSearch] = useState("");

  const { data: orgs = [] } = useAdminOrgs({ limit: 200 });
  const { data: features = [], isLoading } = useAdminOrgFeatures(selectedOrg);
  const { mutate: overrideFeature, isPending } = useOverrideFeature(selectedOrg);

  const filtered = features.filter(
    (f) =>
      !search ||
      f.name?.toLowerCase().includes(search.toLowerCase()) ||
      f.key?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <Flag className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Feature Flags</h1>
          <p className="text-[11px] text-white/35">Manage per-organization feature entitlements</p>
        </div>
      </div>

      {/* Org Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="relative">
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="w-full appearance-none rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/40 transition-all cursor-pointer"
          >
            <option value="" className="bg-[#1a1a2e]">Select Organization…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id} className="bg-[#1a1a2e]">{o.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search features…"
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 transition-all"
          />
        </div>
      </div>

      {/* Feature Flags Grid */}
      {!selectedOrg ? (
        <div className="rounded-2xl border border-white/5 bg-white/3 p-10 text-center text-white/20 text-sm">
          Select an organization to manage its feature entitlements
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-white/30 p-8">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading features…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/3 p-10 text-center text-white/20 text-sm">
          No features found
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filtered.map((f) => (
            <div
              key={f.id}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-all ${
                f.is_enabled
                  ? "border-amber-500/15 bg-amber-500/5"
                  : "border-white/5 bg-white/3"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[12px] font-bold text-white/70">{f.name}</p>
                </div>
                <p className="text-[10px] text-white/25 font-mono truncate">{f.key}</p>
              </div>
              <button
                onClick={() => overrideFeature({ featureId: f.id, isEnabled: !f.is_enabled })}
                disabled={isPending}
                className={`relative w-10 h-5 rounded-full transition-all duration-200 flex-shrink-0 disabled:opacity-40 ${f.is_enabled ? "bg-amber-500" : "bg-white/10"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${f.is_enabled ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
