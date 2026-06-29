"use client";

import { useState, useEffect } from "react";
import { 
  Activity, ShieldAlert, Users, Calendar, ClipboardList, AlertTriangle, 
  MapPin, CheckCircle, TrendingUp, DollarSign, Clock, ShieldCheck, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";

export default function OperationsOverview() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setLoading(false);
    }, 400);
  }, []);

  if (loading) {
    return (
      <div className="flex h-[75vh] items-center justify-center">
        <p className="text-zinc-500 text-xs font-black uppercase tracking-widest animate-pulse">Loading Operations Dashboard...</p>
      </div>
    );
  }

  const kpis = [
    { label: "Active Project Venues", value: "3 Events", desc: "Operations in execution", icon: MapPin, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Unresolved Risks", value: "2 Incidents", desc: "1 High Severity", icon: AlertTriangle, color: "text-rose-500", bg: "bg-rose-500/10" },
    { label: "SLA Pledges Breached", value: "0 Breaches", desc: "100% compliance rate", icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Assigned Crew Members", value: "18 Staff", desc: "4 travel itineraries active", icon: Users, color: "text-indigo-400", bg: "bg-indigo-500/10" }
  ];

  const recentIncidents = [
    { id: "i1", title: "Double-booking: Lead A/V tech assigned to Main Hall and Exhibit Hall B", severity: "HIGH", code: "CF-209", time: "10 mins ago" },
    { id: "i2", title: "Weather Warning: Wind speed limits for Outdoor Stage rigging setup", severity: "MEDIUM", code: "WX-102", time: "1 hour ago" },
  ];

  return (
    <div className="space-y-8 p-8 pb-16 overflow-y-auto h-full custom-scrollbar">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-white">
            Operations <span className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">Overview</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Internal Operations ERP — Telemetry, Readiness & Dispatch Control
          </p>
        </div>
        <Button variant="outline" className="border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-500" /> Sync Heartbeats
        </Button>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, idx) => (
          <div 
            key={idx}
            className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md hover:border-zinc-700/50 transition-all flex flex-col justify-between h-36"
          >
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">{kpi.label}</span>
              <div className={`p-2 rounded-lg ${kpi.bg} ${kpi.color}`}>
                <kpi.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-black text-white">{kpi.value}</div>
              <div className="text-zinc-500 text-[11px] font-medium">{kpi.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Second Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Recent Incidents */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <ShieldAlert className="text-rose-500 h-5 w-5" /> Recent Operational Incidents
          </h2>
          <div className="space-y-4">
            {recentIncidents.map(inc => (
              <div 
                key={inc.id}
                className="p-6 rounded-xl bg-zinc-900/30 border border-zinc-800/50 flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-xs font-mono font-bold">{inc.code}</span>
                    <Badge className={
                      inc.severity === "HIGH" 
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20" 
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }>
                      {inc.severity}
                    </Badge>
                  </div>
                  <p className="text-sm font-bold text-zinc-200 mt-1">{inc.title}</p>
                </div>
                <div className="text-zinc-500 text-xs font-medium whitespace-nowrap">{inc.time}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Platform Health */}
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Zap className="text-indigo-400 h-5 w-5" /> Dispatch Status
          </h2>
          <div className="p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800/40 backdrop-blur-md space-y-4">
            <div className="flex justify-between items-center text-xs font-bold text-zinc-400">
              <span>Primary Uplink Availability</span>
              <span className="text-emerald-400">99.98%</span>
            </div>
            <Progress value={99.98} className="h-1.5" />

            <div className="flex justify-between items-center text-xs font-bold text-zinc-400 pt-2">
              <span>Badge Printer Allocations</span>
              <span className="text-blue-400">14/20 Printers Active</span>
            </div>
            <Progress value={70} className="h-1.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
