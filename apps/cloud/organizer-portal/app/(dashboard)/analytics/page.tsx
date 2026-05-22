
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { 
  TrendingUp, Users, FileUp, Globe, Shield,
  Zap, Download, Activity,
  ArrowUpRight, CheckCircle2,
  Mail, Server, Map, Presentation, Layers, Maximize2, Clock
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useGlobalStats } from "@/hooks/useEvents";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip";

export default function GlobalAnalyticsPage() {
  const [timeRange, setTimeRange] = useState("All");
  const { data, isLoading } = useGlobalStats();

  if (isLoading) {
     return (
        <div className="h-[80vh] flex flex-col items-center justify-center gap-4">
           <div className="relative h-20 w-20">
              <Activity className="h-20 w-20 text-[var(--pri)] animate-spin opacity-20" />
              <Activity className="absolute inset-0 h-20 w-20 text-[var(--pri)] animate-pulse" />
           </div>
           <p className="text-[11px] font-black text-muted uppercase tracking-[0.4em] animate-pulse">Aggregating Global Clusters...</p>
        </div>
     );
  }

  if (!data || data.total_sessions === 0) {
     return (
        <div className="h-[80vh] flex flex-col items-center justify-center text-center space-y-8 animate-fade-in">
           <div className="h-32 w-32 rounded-[3rem] glass-3d border-default flex items-center justify-center bg-gradient-to-br from-[var(--pri)]/10 to-transparent">
              <Shield className="h-12 w-12 text-muted" />
           </div>
           <div className="space-y-3">
              <h2 className="text-3xl font-black text-[var(--text)] tracking-tighter">No Active Event Clusters</h2>
              <p className="text-muted font-medium max-w-md mx-auto leading-relaxed">
                 We couldn't find any events with active nodes to analyze globally.
              </p>
           </div>
        </div>
     );
  }

  const primaryMetrics = [
    { 
      label: "Global Intake", 
      val: `${Math.round(data.upload_rate_pct)}%`, 
      trend: "Cross-Event", 
      color: "var(--pri)",
      raw: `${data.files_uploaded}/${data.total_speakers} Files`,
      icon: FileUp
    },
    { 
      label: "Strategic Readiness", 
      val: `${Math.round(data.approval_rate_pct)}%`, 
      trend: "Verified", 
      color: "var(--sec)",
      raw: `${data.files_approved} Approved Assets`,
      icon: CheckCircle2
    },
    { 
      label: "Total Node Count", 
      val: data.total_sessions.toString(), 
      trend: "Active", 
      color: "var(--success)",
      raw: `${data.total_rooms} Managed Venues`,
      icon: Layers
    },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-12 max-w-[1600px] mx-auto pb-32 animate-fade-in px-4">
        
        {/* Cinematic Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-2">
             <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center border border-[var(--pri)]/20">
                   <Globe className="h-5 w-5 text-[var(--pri)]" />
                </div>
                <h1 className="text-4xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
                  Global <span className="text-[var(--sec)]">Intelligence</span>
                </h1>
             </div>
             <p className="text-[12px] font-bold text-muted uppercase tracking-[0.4em] ml-1">Aggregated neural analysis across all managed events</p>
          </div>
          
          <div className="flex items-center gap-5">
             <Button className="h-14 px-10 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-xl border-0 hover-lift-3d transition-all duration-500">
               <Download className="mr-3 h-4 w-4" /> Export Global Report
             </Button>
          </div>
        </header>

        {/* Neural Metrics Cluster */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-10">
           {primaryMetrics.map((m, i) => (
             <motion.div
               key={m.label}
               initial={{ opacity: 0, y: 30 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: i * 0.1 }}
               className="glass-3d p-12 rounded-[4rem] border-default flex flex-col items-center text-center group relative overflow-hidden"
             >
                <div className="relative h-56 w-56 mb-10">
                   <svg className="h-full w-full transform -rotate-90 drop-shadow-2xl">
                      <circle cx="112" cy="112" r="100" fill="transparent" stroke="currentColor" strokeWidth="12" className="text-muted/5" />
                      <motion.circle 
                        cx="112" 
                        cy="112" 
                        r="100" 
                        fill="transparent" 
                        stroke={m.color} 
                        strokeWidth="12" 
                        strokeDasharray={628} 
                        initial={{ strokeDashoffset: 628 }}
                        animate={{ strokeDashoffset: 628 - (628 * (parseFloat(m.val) || 0) / 100) }}
                        transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
                        strokeLinecap="round" 
                      />
                   </svg>
                   <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <m.icon className={cn("h-8 w-8 mb-4 opacity-20", i === 0 ? "text-[var(--pri)]" : i === 1 ? "text-[var(--sec)]" : "text-[var(--success)]")} />
                      <span className="text-6xl font-black text-[var(--text)] tracking-tighter leading-none">{m.val}</span>
                      <Badge variant="outline" className="text-[10px] font-black text-muted uppercase mt-4 tracking-[0.2em] px-4 py-1.5 border-default/50">{m.trend}</Badge>
                   </div>
                </div>
                <h3 className="text-[13px] font-black text-[var(--text)] uppercase tracking-[0.4em] mb-3">{m.label}</h3>
                <p className="text-[11px] font-bold text-muted uppercase tracking-widest">{m.raw}</p>
             </motion.div>
           ))}
        </section>

        {/* Global Distribution Map */}
        <div className="grid gap-10 lg:grid-cols-[1fr_450px]">
           <Card className="glass-3d border-default rounded-[4rem] p-16 overflow-hidden shadow-2xl relative group">
              <div className="flex items-center justify-between mb-12 relative">
                 <div className="space-y-1">
                    <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">Cluster Distribution</h3>
                    <p className="text-[12px] font-black text-muted uppercase tracking-[0.4em]">Aggregated Venue Readiness</p>
                 </div>
              </div>

              <div className="space-y-8">
                 {data.room_readiness?.map((room: any, i: number) => (
                    <div key={i} className="flex items-center gap-8 group/row">
                       <div className="w-48 shrink-0">
                          <p className="text-[11px] font-black text-[var(--text)] uppercase tracking-widest truncate">{room.room_name}</p>
                          <p className="text-[9px] font-bold text-muted uppercase">{room.session_count} Sessions</p>
                       </div>
                       <div className="flex-1 h-3 bg-muted/5 rounded-full overflow-hidden border border-default/30">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${room.readiness_pct}%` }}
                            transition={{ duration: 1.5, delay: i * 0.05 }}
                            className={cn(
                               "h-full rounded-full transition-all",
                               room.readiness_pct === 100 ? "bg-[var(--success)]" : "bg-[var(--pri)]"
                            )}
                          />
                       </div>
                       <div className="w-12 text-right">
                          <span className="text-[12px] font-black text-[var(--text)]">{Math.round(room.readiness_pct)}%</span>
                       </div>
                    </div>
                 ))}
              </div>
           </Card>

           <aside className="space-y-10">
              <div className="glass-3d p-10 rounded-[3.5rem] border-default space-y-8">
                 <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-muted flex items-center gap-3">
                    <Activity className="h-4 w-4 text-[var(--pri)]" /> Performance Index
                 </h4>
                 <div className="grid grid-cols-2 gap-6">
                    {[
                      { label: "Files Approved", val: data.files_approved, icon: CheckCircle2, color: "text-[var(--success)]" },
                      { label: "Files Pending", val: data.files_pending, icon: Clock, color: "text-[var(--warn)]" },
                      { label: "Total Venues", val: data.total_rooms, icon: Map, color: "text-[var(--sec)]" },
                      { label: "Global Slots", val: data.total_speakers, icon: Users, color: "text-[var(--pri)]" },
                    ].map((item, i) => (
                      <div key={i} className="p-6 rounded-3xl bg-muted/5 border border-default/50 flex flex-col gap-2">
                         <div className="flex items-center gap-3">
                            <item.icon className={cn("h-4 w-4", item.color)} />
                            <span className="text-[9px] font-black text-muted uppercase tracking-widest">{item.label}</span>
                         </div>
                         <p className="text-2xl font-black text-[var(--text)] tracking-tighter">{item.val.toLocaleString()}</p>
                      </div>
                    ))}
                 </div>
              </div>
           </aside>
        </div>

      </div>
    </TooltipProvider>
  );
}
