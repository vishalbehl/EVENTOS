"use client";

import { usePlatformApplications, PlatformApplication } from "@/services/super-admin-service";
import { AppWindow, RefreshCw, CheckCircle2, Clock, Zap } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  core: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  operations: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  platform: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  ai: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const APP_ICONS: Record<string, string> = {
  "organizer-portal": "🏢",
  "registration-portal": "📋",
  "speaker-portal": "🎤",
  "venue-portal": "🏛️",
  "developer-portal": "⚙️",
  "ai-assistant": "🤖",
};

function AppCard({ app }: { app: PlatformApplication }) {
  const catCls = CATEGORY_COLORS[app.category] || "bg-white/5 text-white/40 border-white/10";
  return (
    <div className="rounded-2xl border border-white/5 bg-white/3 p-5 hover:border-white/10 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl">
          {APP_ICONS[app.id] || "📦"}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${catCls}`}>
            {app.category}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
            app.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
            app.status === "beta" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
            "bg-slate-500/10 text-slate-400 border-slate-500/20"
          }`}>
            {app.status}
          </span>
        </div>
      </div>
      <h3 className="text-sm font-black text-white mb-1">{app.name}</h3>
      <p className="text-[11px] text-white/35 mb-4">{app.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-white/20">v{app.version}</span>
        <div className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          <span className="text-[10px] font-bold">Online</span>
        </div>
      </div>
    </div>
  );
}

export default function ApplicationRegistryPage() {
  const { data: apps = [], isLoading, refetch } = usePlatformApplications();

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/20">
            <AppWindow className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Application Registry</h1>
            <p className="text-[11px] text-white/35">{apps.length} platform applications</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-white/30 p-8">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading applications…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}
