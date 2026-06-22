"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { 
  Wifi, Laptop, CheckCircle, Clock, ShieldAlert, Sparkles, Activity,
  PlayCircle, Timer, AlertTriangle, AlertCircle, HelpCircle, HardDrive
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";

interface Ticket {
  id: string;
  ticket_number: string;
  issue_title: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  sla_response_due: string; // ISO String
  sla_resolve_due: string; // ISO String
  status: "OPEN" | "RESPONDED" | "RESOLVED";
  created_at: string;
}

export default function StatusPage() {
  const { eventId } = useParams();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [readinessScores, setReadinessScores] = useState<any[]>([]);

  useEffect(() => {
    setTimeout(() => {
      setReadinessScores([
        { name: "Venue Network & Wi-Fi Uplink", score: 85, color: "text-emerald-500", bg: "bg-emerald-500" },
        { name: "Speaker Ready Room Equipment Setup", score: 95, color: "text-indigo-400", bg: "bg-indigo-400" },
        { name: "Main Stage Audio / Video Coverage", score: 90, color: "text-[var(--pri)]", bg: "bg-[var(--pri)]" },
        { name: "Entrance Lobby Registration Kiosks", score: 70, color: "text-amber-500", bg: "bg-amber-500" }
      ]);
      setTickets([
        {
          id: "t1",
          ticket_number: "TCK-0021",
          issue_title: "Keynote presentation video feed latency on monitor 2",
          priority: "CRITICAL",
          sla_response_due: new Date(Date.now() + 1000 * 60 * 45).toISOString(), // 45 mins
          sla_resolve_due: new Date(Date.now() + 1000 * 60 * 360).toISOString(), // 6 hours
          status: "OPEN",
          created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString()
        },
        {
          id: "t2",
          ticket_number: "TCK-0022",
          issue_title: "Badge printer kiosk 3 alignment warning",
          priority: "MEDIUM",
          sla_response_due: new Date(Date.now() + 1000 * 60 * 480).toISOString(),
          sla_resolve_due: new Date(Date.now() + 1000 * 60 * 1440).toISOString(),
          status: "RESPONDED",
          created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString()
        }
      ]);
      setLoading(false);
    }, 450);
  }, [eventId]);

  const getPriorityColor = (prio: string) => {
    switch (prio) {
      case "CRITICAL":
        return "text-rose-500 bg-rose-500/10 border-rose-500/20";
      case "HIGH":
        return "text-orange-500 bg-orange-500/10 border-orange-500/20";
      case "MEDIUM":
        return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      default:
        return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    }
  };

  const getTimerRemaining = (dueTime: string) => {
    const diffMs = new Date(dueTime).getTime() - Date.now();
    if (diffMs <= 0) return "Breached";
    const minutes = Math.floor(diffMs / 1000 / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m left`;
    }
    return `${minutes}m left`;
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <p className="text-muted text-xs font-black uppercase tracking-widest animate-pulse">Loading status and SLA gauges...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 h-full overflow-y-auto custom-scrollbar pb-12">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
          Provisioning & <span className="text-[var(--sec)]">Readiness Status</span>
        </h1>
        <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] opacity-80">
          Monitor real-time technical deployments, compliance reviews, and SLA pledge response tickets
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: Readiness Score Progress Bars */}
        <Card className="lg:col-span-2 glass-3d p-8 rounded-[2.5rem] border-default space-y-6">
          <div className="flex items-center justify-between border-b border-default pb-4">
            <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">Operational Readiness Metrics</h3>
            <Activity className="h-5 w-5 text-[var(--pri)]" />
          </div>

          <div className="space-y-6">
            {readinessScores.map((item, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-[var(--text)]">
                  <span>{item.name}</span>
                  <span className={item.color}>{item.score}% Provisioned</span>
                </div>
                <div className="h-2.5 w-full bg-background/50 rounded-full overflow-hidden border border-default/30">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${item.score}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={`h-full ${item.bg}`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-2xl bg-[var(--card)]/40 border border-default/50 flex items-start gap-3 mt-4">
            <Sparkles className="h-4 w-4 text-[var(--sec)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[11px] text-[var(--text)] font-black uppercase tracking-wider">Automatic Verification Active</p>
              <p className="text-[10px] text-muted font-semibold leading-normal">
                Technical crew is conducting final configuration and connectivity checks. All setups will be verified against requested specifications.
              </p>
            </div>
          </div>
        </Card>

        {/* Right Col: SLA Pledge info */}
        <Card className="glass-3d p-8 rounded-[2.5rem] border-default space-y-6">
          <div className="flex items-center justify-between border-b border-default pb-4">
            <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">SLA Target Targets</h3>
            <Timer className="h-5 w-5 text-[var(--sec)]" />
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[var(--pri)]/5 border border-[var(--pri)]/20 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-muted tracking-wider uppercase">Active SLA Pledge tier</span>
                <Badge className="bg-[var(--pri)] text-white text-[8px] font-black tracking-widest uppercase">Gold Tier</Badge>
              </div>
              <p className="text-[11px] text-[var(--text)] font-semibold leading-normal">
                Enables priority 24/7 onsite technician routing and dedicated standby engineer desk.
              </p>
            </div>

            <div className="border-t border-default/50 pt-4 space-y-3">
              {[
                { priority: "CRITICAL", time: "Response within 2 hrs / Resolution in 12 hrs" },
                { priority: "HIGH", time: "Response within 4 hrs / Resolution in 24 hrs" }
              ].map((sla, idx) => (
                <div key={idx} className="flex justify-between items-center text-[10px] font-bold text-muted uppercase">
                  <Badge variant="outline" className={`border-default text-[8px] font-black ${getPriorityColor(sla.priority)}`}>{sla.priority}</Badge>
                  <span>{sla.time}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Lower Row: SLA Support Tickets Monitor */}
      <Card className="glass-3d p-8 rounded-[2.5rem] border-default space-y-6">
        <div className="flex items-center justify-between border-b border-default pb-4">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">Active Operations Support Tickets</h3>
            <p className="text-[10px] text-muted font-bold">Monitors onsite issues and tracks live SLA response countdowns</p>
          </div>
          <AlertCircle className="h-5 w-5 text-rose-500" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tickets.map(ticket => (
            <div key={ticket.id} className="p-5 rounded-3xl bg-[var(--card)]/30 border border-default space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-muted tracking-widest uppercase">{ticket.ticket_number}</span>
                    <h4 className="text-xs font-black text-[var(--text)] tracking-tight leading-snug">{ticket.issue_title}</h4>
                  </div>
                  <Badge className={`border px-2 py-0.5 text-[8px] font-black rounded-lg ${getPriorityColor(ticket.priority)}`}>
                    {ticket.priority}
                  </Badge>
                </div>
              </div>

              <div className="border-t border-default/50 pt-4 grid grid-cols-2 gap-4 text-[10px] font-bold text-muted uppercase">
                <div className="space-y-1">
                  <span className="text-[8px] text-muted tracking-wider block">SLA Response Due</span>
                  <div className="flex items-center gap-1 text-[var(--text)]">
                    <Clock className="h-3 w-3 text-[var(--pri)]" />
                    <span>{getTimerRemaining(ticket.sla_response_due)}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] text-muted tracking-wider block">SLA Resolution Due</span>
                  <div className="flex items-center gap-1 text-[var(--text)]">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span>{getTimerRemaining(ticket.sla_resolve_due)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
