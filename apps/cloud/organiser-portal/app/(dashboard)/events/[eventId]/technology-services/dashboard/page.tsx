"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { 
  ClipboardList, Clock, CheckCircle, ShieldAlert, Sparkles, 
  ArrowUpRight, Plus, HelpCircle, Activity, Wifi, Laptop 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";

export default function TechnologyDashboard() {
  const { eventId } = useParams();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setLoading(false);
    }, 400);
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <p className="text-muted text-xs font-bold uppercase tracking-widest animate-pulse">Loading Technology Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 h-full overflow-y-auto custom-scrollbar pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
            Technology <span className="text-[var(--sec)]">Services Hub</span>
          </h1>
          <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] opacity-80">
            Request catalog items, check provisioning status, and view event network readiness
          </p>
        </div>
        <Button className="h-11 px-6 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[11px] rounded-full hover-lift-3d">
          <Plus className="mr-2 h-4 w-4" /> New Service Request
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Total Requests", value: 3, icon: ClipboardList, color: "text-[var(--pri)]", bg: "bg-[var(--pri)]/10" },
          { label: "Awaiting Estimates", value: 1, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "Approved & Planning", value: 2, icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "Active SLA Pledges", value: "Gold Tier", icon: Activity, color: "text-indigo-400", bg: "bg-indigo-500/10" }
        ].map((item, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <Card className="glass-3d p-6 border-default flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted">{item.label}</span>
                <h3 className="text-2xl font-black text-[var(--text)]">{item.value}</h3>
              </div>
              <div className={`h-12 w-12 rounded-2xl ${item.bg} flex items-center justify-center shrink-0`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Grid: Client Readiness summary & active quotes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 glass-3d p-8 rounded-[2.5rem] border-default space-y-6">
          <div className="flex items-center justify-between border-b border-default pb-4">
            <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">Service Delivery & Readiness</h3>
            <Wifi className="h-5 w-5 text-[var(--pri)]" />
          </div>

          <div className="space-y-5">
            {[
              { label: "Network Bandwidth Allocation", score: 85, color: "bg-[var(--pri)]" },
              { label: "Speaker Ready Room Equipment Setup", score: 95, color: "bg-emerald-500" },
              { label: "Main Stage Audio / Video Coverage", score: 90, color: "bg-indigo-500" }
            ].map((item, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-[var(--text)]">
                  <span>{item.label}</span>
                  <span>{item.score}% Ready</span>
                </div>
                <div className="h-2 w-full bg-background rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${item.score}%` }}
                    transition={{ duration: 0.8 }}
                    className={`h-full ${item.color}`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-2xl bg-[var(--card)]/40 border border-default/50 flex items-start gap-3">
            <Sparkles className="h-4 w-4 text-[var(--sec)] shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted font-bold leading-normal">
              Technical crew is assigned. Next compliance check scheduled automatically 24 hours prior to general event setup.
            </p>
          </div>
        </Card>

        {/* Travel / SLA Pledge info */}
        <Card className="glass-3d p-8 rounded-[2.5rem] border-default space-y-6">
          <div className="flex items-center justify-between border-b border-default pb-4">
            <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">SLA Target Pledges</h3>
            <Laptop className="h-5 w-5 text-[var(--sec)]" />
          </div>

          <div className="space-y-4">
            {[
              { priority: "CRITICAL", time: "Response within 2 hours / Resolution in 12 hours" },
              { priority: "HIGH", time: "Response within 4 hours / Resolution in 24 hours" },
              { priority: "MEDIUM", time: "Response within 12 hours / Resolution in 48 hours" }
            ].map((sla, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-[var(--card)]/30 border border-default flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black tracking-wider text-muted">PRIORITY</span>
                  <Badge variant="outline" className="border-default text-[8px] font-black">{sla.priority}</Badge>
                </div>
                <p className="text-[10px] font-bold text-[var(--text)]">{sla.time}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
