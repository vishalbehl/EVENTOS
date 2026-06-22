"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { 
  ShieldAlert, Activity, Users, Layers, CheckCircle2, 
  AlertTriangle, RefreshCw, Server, Wifi, Cpu, ArrowRight 
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function OperationsDashboard() {
  const { eventId } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  // Mock data representing a fully operational Phase 7 event state
  useEffect(() => {
    const timer = setTimeout(() => {
      setData({
        totalRequests: 8,
        pendingApprovals: 2,
        activeProjects: 3,
        overallReadiness: 78.5,
        readinessBreakdown: {
          technology: 85,
          staff: 70,
          equipment: 80,
          network: 79
        },
        activeRisks: 2,
        risks: [
          { id: 1, title: "Keynote Streaming Latency", severity: "HIGH", probability: "MEDIUM", status: "IDENTIFIED" },
          { id: 2, title: "Printer Power Fluctuations", severity: "MEDIUM", probability: "HIGH", status: "MITIGATED" }
        ],
        recentDeployments: [
          { id: "d1", number: "DEP-001", date: "2026-06-25", status: "SUCCESS" },
          { id: "d2", number: "DEP-002", date: "2026-06-28", status: "PLANNED" }
        ]
      });
      setLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-10 w-10 animate-spin text-[var(--pri)]" />
          <p className="text-muted text-xs font-bold uppercase tracking-widest">Loading Operations Command...</p>
        </div>
      </div>
    );
  }

  const getReadinessColor = (val: number) => {
    if (val >= 80) return "text-emerald-500";
    if (val >= 60) return "text-amber-500";
    return "text-rose-500";
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "CRITICAL":
        return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      case "HIGH":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "MEDIUM":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
    }
  };

  return (
    <div className="space-y-8 p-6 pb-12 overflow-y-auto h-full custom-scrollbar">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
            Operations <span className="text-[var(--sec)]">Dashboard</span>
          </h1>
          <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] opacity-80">
            Tech services request, resources, readiness & risks command
          </p>
        </div>
        <Button variant="outline" className="h-10 border-default bg-[var(--card)]/40 hover-lift-2d">
          <RefreshCw className="mr-2 h-4 w-4" /> Sync Heartbeats
        </Button>
      </div>

      {/* Grid Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Tech Requests", val: data.totalRequests, sub: `${data.pendingApprovals} Pending Approval`, icon: Layers, color: "var(--pri)" },
          { label: "Active Projects", val: data.activeProjects, sub: "Running on schedule", icon: Activity, color: "var(--sec)" },
          { label: "Overall Readiness", val: `${data.overallReadiness}%`, sub: "Target 95% at Event Start", icon: CheckCircle2, color: "#10b981" },
          { label: "Active Risks", val: data.activeRisks, sub: "All mitigation plans set", icon: ShieldAlert, color: "#f59e0b" }
        ].map((c, idx) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="glass-3d p-6 rounded-[2rem] border-default relative overflow-hidden flex flex-col justify-between"
          >
            <div className="absolute top-0 right-0 h-16 w-16 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] blur-xl opacity-20" />
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">{c.label}</p>
                <h3 className="text-3xl font-black text-[var(--text)] tracking-tight">{c.val}</h3>
              </div>
              <div className="p-3 rounded-2xl border border-default" style={{ color: c.color, backgroundColor: `color-mix(in_srgb, ${c.color} 10%, transparent)` }}>
                <c.icon className="h-5 w-5" />
              </div>
            </div>
            <p className="text-[10px] font-black text-muted uppercase mt-4 tracking-wider">{c.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Readiness Gauges Center */}
        <div className="glass-3d p-8 rounded-[2.5rem] border-default lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-default/50 pb-4">
            <h3 className="text-lg font-black tracking-tight uppercase tracking-wider text-[var(--text)]">Readiness Gauges</h3>
            <span className="text-[10px] font-black text-[var(--pri)] uppercase tracking-wider">Live Telemetry Metrics</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 py-4">
            {[
              { label: "Technology", score: data.readinessBreakdown.technology, icon: Cpu, desc: "AV, Streaming & Apps" },
              { label: "Staff", score: data.readinessBreakdown.staff, icon: Users, desc: "Allocated Crews" },
              { label: "Equipment", score: data.readinessBreakdown.equipment, icon: Server, desc: "Device Inventory" },
              { label: "Network", score: data.readinessBreakdown.network, icon: Wifi, desc: "Bandwidth & VLANs" }
            ].map((g, idx) => (
              <div key={g.label} className="flex flex-col items-center text-center space-y-3">
                <div className="relative h-24 w-24 flex items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default shadow-inner">
                  {/* Outer circle track */}
                  <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                    <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.03)" strokeWidth="8" fill="transparent" />
                    <circle cx="48" cy="48" r="40" stroke="var(--pri)" strokeWidth="8" fill="transparent"
                      strokeDasharray="251.2"
                      strokeDashoffset={251.2 - (251.2 * g.score) / 100}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <g.icon className="h-7 w-7 text-muted group-hover:text-[var(--text)]" />
                </div>
                <div className="space-y-1">
                  <p className="text-[12px] font-black text-[var(--text)]">{g.label}</p>
                  <p className={cn("text-[16px] font-black tracking-tight", getReadinessColor(g.score))}>{g.score}%</p>
                  <p className="text-[9px] font-black text-muted uppercase tracking-wider">{g.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Risks / Severity Center */}
        <div className="glass-3d p-8 rounded-[2.5rem] border-default space-y-6">
          <div className="flex items-center justify-between border-b border-default/50 pb-4">
            <h3 className="text-lg font-black tracking-tight uppercase tracking-wider text-[var(--text)]">Risk Center</h3>
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>

          <div className="space-y-4">
            {data.risks.map((r: any) => (
              <div key={r.id} className="p-4 rounded-2xl bg-[var(--card)]/40 border border-default flex flex-col space-y-2">
                <div className="flex justify-between items-start">
                  <h4 className="text-[12px] font-black text-[var(--text)] leading-tight">{r.title}</h4>
                  <Badge className={cn("border-0 text-[8px] font-black tracking-widest px-2 py-0.5 uppercase", getSeverityBadge(r.severity))}>
                    {r.severity}
                  </Badge>
                </div>
                <div className="flex justify-between text-[9px] font-black text-muted uppercase tracking-wider">
                  <span>Prob: {r.probability}</span>
                  <span className="text-[var(--sec)]">{r.status}</span>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" className="w-full h-11 border-default bg-[var(--card)]/40 hover-lift-2d text-[10px] font-black uppercase tracking-widest">
            Analyze Risk Matrix <ArrowRight className="ml-2 h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
