"use client";

import { use, useState } from "react";
import { 
  Calendar, Clock, AlertTriangle, Play, RefreshCw, BarChart2,
  Tv, CheckCircle2, ShieldCheck, MapPin, Users, HelpCircle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ROOMS_DATA = [
  { name: "Grand Ballroom", type: "Keynote Hall", status: "Live", currentSession: "Opening Keynote & AI Foundations", moderator: "Dr. Eleanor Vance", devices: 4, signal: "Excellent" },
  { name: "Hall A", type: "Technical Talks", status: "Active", currentSession: "Quantum Computing & Scalability", moderator: "Prof. Alan Turing", devices: 3, signal: "Good" },
  { name: "Hall B", type: "Interactive Workshop", status: "Active", currentSession: "Rust for High Performance Microservices", moderator: "Linus Torvalds", devices: 2, signal: "Good" },
  { name: "Room 101", type: "ePoster Presentation", status: "Idle", currentSession: "None — Next: Biotech Innovation Panel", moderator: "Dr. Sarah Chen", devices: 2, signal: "Excellent" },
  { name: "Executive Suite", type: "Roundtable", status: "Offline", currentSession: "None", moderator: "Steve Jobs", devices: 0, signal: "N/A" }
];

export default function SessionsDashboardPage({ params: paramsPromise }: { params: Promise<{ eventId: string }> }) {
  const params = use(paramsPromise);
  const { eventId } = params;

  const [refreshing, setRefreshing] = useState(false);

  const triggerRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <div className="relative w-full max-w-full overflow-x-hidden p-6">
      {/* Background Aesthetics */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[var(--pri)] rounded-full blur-[120px] opacity-10 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-[var(--sec)] rounded-full blur-[120px] opacity-10" />
      </div>

      <div className="relative z-10 w-full space-y-6">
        {/* Header section */}
        <header className="flex flex-col gap-4 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-[var(--pri)]" />
              <span className="text-[9px] font-black uppercase tracking-[0.35em] text-[var(--pri)]">Overview</span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-[var(--text)]">
              SESSIONS & <span className="text-[var(--pri)]">ROOMS</span>
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted mt-1">
              Agenda Status · Room Management · Device Control
            </p>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={triggerRefresh}
            className="w-fit bg-white/5 border-white/10 hover:bg-white/10 gap-2 text-xs font-semibold rounded-xl"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-[var(--pri)]" : ""}`} />
            Sync Status
          </Button>
        </header>

        {/* Conflict Checks Banner */}
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-black text-emerald-400">All Schedules Aligned</h4>
            <p className="text-[10px] text-muted mt-0.5">
              The AI scheduler checked 142 sessions across 5 rooms. No room double-bookings or speaker time clashes detected.
            </p>
          </div>
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-bold uppercase tracking-wider text-[8px]">
            Conflicts: 0
          </Badge>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Active Rooms", value: "4", sub: "1 Offline", icon: MapPin },
            { label: "Scheduled", value: "142", sub: "+12 Pending", icon: Calendar },
            { label: "Room Devices", value: "11", sub: "All Live", icon: Tv },
            { label: "Total Duration", value: "6.4k", sub: "Minutes", icon: Clock },
          ].map((stat, i) => (
            <Card key={i} className="glass-3d border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-2xl">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase text-muted tracking-widest">{stat.label}</span>
                  <h3 className="text-2xl font-black text-[var(--text)] mt-1">{stat.value}</h3>
                  <span className="text-[9px] text-indigo-400 font-semibold block mt-0.5">{stat.sub}</span>
                </div>
                <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-muted">
                  <stat.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Rooms and Devices Status */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)]">
              Room & Device Status Grid
            </h3>
            <Badge className="bg-white/5 text-muted border-none rounded-lg text-[8px] font-bold">
              Auto-refreshing
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ROOMS_DATA.map((room, idx) => {
              const live = room.status === "Live";
              const active = room.status === "Active";
              const offline = room.status === "Offline";

              const badgeStyle = live 
                ? "bg-rose-500/10 text-rose-400 border-rose-500/20" 
                : active 
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                : "bg-white/5 text-muted border-white/10";

              return (
                <Card key={idx} className="glass-3d border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-2xl hover:border-white/10 transition-all duration-350 flex flex-col justify-between">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-black text-[var(--text)]">{room.name}</h4>
                        <span className="text-[9px] text-muted font-bold uppercase tracking-wider">{room.type}</span>
                      </div>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${badgeStyle}`}>
                        {room.status}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                      <span className="text-[8px] font-black uppercase tracking-widest text-muted block">Current Presentation</span>
                      <p className="text-xs font-bold text-[var(--text)] truncate">{room.currentSession}</p>
                      <div className="flex items-center gap-1.5 text-[9px] text-muted">
                        <Users className="h-3 w-3" />
                        <span>Host: {room.moderator}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[9px] text-muted font-bold uppercase tracking-wider">
                      <span>Devices: {room.devices} Live</span>
                      <span>Signal: <span className="text-indigo-400">{room.signal}</span></span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Live Timeline & Conflict Checker Preview */}
        <Card className="glass-3d border-default bg-[color-mix(in_srgb,var(--text)_3%,transparent)] rounded-[2rem] p-6">
          <CardContent className="p-0 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-black text-[var(--text)]">Schedule Timeline Preview</h3>
                <p className="text-[10px] text-muted mt-0.5">Real-time visualization of room blocks and session progression.</p>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" className="bg-[var(--pri)] hover:bg-[var(--pri-hover)] rounded-xl text-xs font-black uppercase tracking-wider">
                  Launch Visual Agenda Planner
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {[
                { time: "09:00 AM - 10:00 AM", event: "Opening Ceremony & Logistics Briefing", halls: ["Grand Ballroom"] },
                { time: "10:15 AM - 11:30 AM", event: "Deep Learning Architectures in Production", halls: ["Hall A", "Hall B"] },
                { time: "11:45 AM - 01:00 PM", event: "ePoster Presenters Quick-Pitch Rounds", halls: ["Room 101"] }
              ].map((slot, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 border border-white/5 bg-white/[0.01] rounded-2xl">
                  <div className="sm:w-48 shrink-0">
                    <span className="text-xs font-black text-indigo-400 tracking-tight">{slot.time}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-[var(--text)]">{slot.event}</h4>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {slot.halls.map((h, hIdx) => (
                        <span key={hIdx} className="inline-flex px-1.5 py-0.5 bg-white/5 text-[8px] font-bold text-muted uppercase tracking-wider rounded">
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
