"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Calendar, CheckCircle2, ChevronRight, Play, Check, AlertCircle,
  Terminal, History, Gauge, Activity, Wifi, CheckSquare, Square,
  RefreshCw, Award, Info, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface ChecklistItem {
  id: string;
  title: string;
  isCompleted: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

interface Deployment {
  id: string;
  number: string;
  title: string;
  date: string;
  status: "PLANNED" | "IN_PROGRESS" | "SUCCESS" | "FAILED";
  checklist: ChecklistItem[];
}

export default function DeploymentsCommand() {
  const { eventId } = useParams();
  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [activeDeployId, setActiveDeployId] = useState<string>("");
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  // Initial Seed Data
  useEffect(() => {
    const timer = setTimeout(() => {
      const initialDeployments: Deployment[] = [
        {
          id: "dep1",
          number: "DEP-001",
          title: "Main Ballroom AV Integration",
          date: "2026-06-25",
          status: "IN_PROGRESS",
          checklist: [
            { id: "c1", title: "Verify wireless lapel microphone stocks", isCompleted: true, priority: "HIGH" },
            { id: "c2", title: "Confirm projector rig and primary line connection", isCompleted: true, priority: "CRITICAL" },
            { id: "c3", title: "Coordinate Dante audio routing and AV tech lead handover", isCompleted: false, priority: "HIGH" },
            { id: "c4", title: "Install backup cellular WAN link and secondary router", isCompleted: false, priority: "MEDIUM" },
            { id: "c5", title: "Run audio-visual latency validation test loop", isCompleted: false, priority: "LOW" },
          ]
        },
        {
          id: "dep2",
          number: "DEP-002",
          title: "Registration Desk Network Infrastructure",
          date: "2026-06-24",
          status: "SUCCESS",
          checklist: [
            { id: "c6", title: "Deploy wireless access points and PoE switches", isCompleted: true, priority: "HIGH" },
            { id: "c7", title: "Configure separate VLANs for staff and attendees", isCompleted: true, priority: "HIGH" },
            { id: "c8", title: "Validate ticket scanner printer connectivity", isCompleted: true, priority: "MEDIUM" }
          ]
        },
        {
          id: "dep3",
          number: "DEP-003",
          title: "Digital Signage Stream Handover",
          date: "2026-06-26",
          status: "PLANNED",
          checklist: [
            { id: "c9", title: "Upload custom digital signage branding assets", isCompleted: false, priority: "MEDIUM" },
            { id: "c10", title: "Configure signage screens in central lounge", isCompleted: false, priority: "MEDIUM" },
            { id: "c11", title: "Link schedule API feed to display templates", isCompleted: false, priority: "HIGH" }
          ]
        }
      ];

      setDeployments(initialDeployments);
      setActiveDeployId(initialDeployments[0].id);
      
      const timestamp = new Date().toLocaleTimeString();
      setTerminalLogs([
        `[${timestamp}] SYSTEM initialized deployment engine v1.4.2`,
        `[${timestamp}] DEPLOY: DEP-002 status loaded as SUCCESS`,
        `[${timestamp}] DEPLOY: DEP-001 status loaded as IN_PROGRESS`,
        `[${timestamp}] Ready for operator intervention...`
      ]);
      setLoading(false);
    }, 700);

    return () => clearTimeout(timer);
  }, [eventId]);

  const activeDeployment = useMemo(() => {
    return deployments.find(d => d.id === activeDeployId) || null;
  }, [deployments, activeDeployId]);

  // Calculations
  const activeProgress = useMemo(() => {
    if (!activeDeployment || activeDeployment.checklist.length === 0) return 0;
    const completed = activeDeployment.checklist.filter(c => c.isCompleted).length;
    return Math.round((completed / activeDeployment.checklist.length) * 100);
  }, [activeDeployment]);

  const overallReadiness = useMemo(() => {
    if (deployments.length === 0) return 0;
    const totalItems = deployments.flatMap(d => d.checklist);
    const completedItems = totalItems.filter(c => c.isCompleted);
    if (totalItems.length === 0) return 0;
    return Math.round((completedItems.length / totalItems.length) * 100);
  }, [deployments]);

  // Console log helper
  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [`[${timestamp}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // Handlers
  const toggleChecklistItem = (itemId: string) => {
    if (!activeDeployment) return;

    setDeployments(prev => {
      return prev.map(d => {
        if (d.id !== activeDeployId) return d;
        const updatedChecklist = d.checklist.map(item => {
          if (item.id !== itemId) return item;
          const nextState = !item.isCompleted;
          addLog(`CHECKLIST: '${item.title}' marked as ${nextState ? "COMPLETED" : "TODO"}`);
          return { ...item, isCompleted: nextState };
        });

        // Auto transition status if appropriate
        let nextStatus = d.status;
        const allCompleted = updatedChecklist.every(item => item.isCompleted);
        
        if (allCompleted && d.status === "IN_PROGRESS") {
          nextStatus = "SUCCESS";
          addLog(`STATUS: DEP-${d.number.split("-")[1]} auto-completed!`);
        } else if (!allCompleted && d.status === "SUCCESS") {
          nextStatus = "IN_PROGRESS";
          addLog(`STATUS: DEP-${d.number.split("-")[1]} reverted to IN_PROGRESS.`);
        }

        return { ...d, checklist: updatedChecklist, status: nextStatus };
      });
    });
  };

  const startDeployment = () => {
    if (!activeDeployment) return;
    setDeployments(prev => {
      return prev.map(d => {
        if (d.id !== activeDeployId) return d;
        addLog(`ACTION: Deployments operator started ${d.number} (${d.title})`);
        return { ...d, status: "IN_PROGRESS" };
      });
    });
  };

  const completeDeployment = () => {
    if (!activeDeployment) return;
    setDeployments(prev => {
      return prev.map(d => {
        if (d.id !== activeDeployId) return d;
        addLog(`ACTION: Deployments operator forced SUCCESS status on ${d.number}`);
        // Tick off all items if forced complete
        const updatedChecklist = d.checklist.map(item => ({ ...item, isCompleted: true }));
        return { ...d, status: "SUCCESS", checklist: updatedChecklist };
      });
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "SUCCESS": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "IN_PROGRESS": return "bg-sky-500/10 text-sky-400 border-sky-500/20 animate-pulse";
      case "FAILED": return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      default: return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
  };

  const getPriorityClass = (prio: string) => {
    switch (prio) {
      case "CRITICAL": return "text-rose-500 bg-rose-500/10 border-rose-500/20";
      case "HIGH": return "text-orange-500 bg-orange-500/10 border-orange-500/20";
      case "MEDIUM": return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      default: return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-10 w-10 animate-spin text-[var(--pri)]" />
          <p className="text-muted text-xs font-bold uppercase tracking-widest">Initialising Deployments Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 h-full overflow-y-auto custom-scrollbar pb-12">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-black text-[var(--pri)] tracking-[0.2em] uppercase">Phase 7 Deployment Engine</span>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
            Deployments & <span className="text-[var(--sec)]">Checklists</span>
          </h1>
          <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] opacity-80">
            Track live setups, execute handovers, and check operational checklists
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-black text-muted uppercase tracking-widest">Global Setup Readiness</p>
            <p className={cn("text-lg font-black tracking-tight", overallReadiness >= 80 ? "text-emerald-500" : "text-amber-500")}>
              {overallReadiness}% Complete
            </p>
          </div>
          <div className="h-12 w-12 rounded-[1.25rem] border border-default flex items-center justify-center shadow-lg relative bg-[var(--card)]/40">
            <Gauge className="h-6 w-6 text-[var(--pri)]" />
            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
              <circle cx="24" cy="24" r="21" stroke="rgba(255,255,255,0.02)" strokeWidth="3" fill="transparent" />
              <circle cx="24" cy="24" r="21" stroke="var(--pri)" strokeWidth="3" fill="transparent"
                strokeDasharray="131.9"
                strokeDashoffset={131.9 - (131.9 * overallReadiness) / 100}
                className="transition-all duration-700"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Deployments Registry (List) */}
        <div className="space-y-6 lg:col-span-1">
          <div className="flex items-center justify-between border-b border-default/50 pb-3">
            <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">Deployments Registry</h3>
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest">{deployments.length} Active</Badge>
          </div>

          <div className="space-y-4">
            {deployments.map((d, idx) => {
              const isActive = d.id === activeDeployId;
              const completedCount = d.checklist.filter(c => c.isCompleted).length;
              const progressPercent = Math.round((completedCount / d.checklist.length) * 100);
              
              return (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => setActiveDeployId(d.id)}
                  className={cn(
                    "p-5 rounded-[2rem] border transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden",
                    isActive 
                      ? "glass-3d border-[var(--pri)] shadow-md bg-[color-mix(in_srgb,var(--pri)_4%,transparent)]" 
                      : "bg-[var(--card)]/20 border-default hover:border-[var(--muted)]/50"
                  )}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-muted uppercase tracking-wider">{d.number}</span>
                      <h4 className="text-[12px] font-black text-[var(--text)] leading-tight">{d.title}</h4>
                    </div>
                    <Badge className={cn("border px-2 py-0.5 text-[8px] font-black tracking-widest uppercase rounded-lg", getStatusBadgeClass(d.status))}>
                      {d.status}
                    </Badge>
                  </div>

                  <div className="space-y-2 mt-2">
                    <div className="flex justify-between items-center text-[9px] font-black text-muted uppercase tracking-wider">
                      <span>Tasks: {completedCount}/{d.checklist.length}</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full overflow-hidden border border-default/30">
                      <div 
                        className="h-full bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] rounded-full transition-all duration-500" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Active Deployment Details, Checklist & Console Logs */}
        <div className="lg:col-span-2 space-y-8">
          <AnimatePresence mode="wait">
            {activeDeployment && (
              <motion.div
                key={activeDeployment.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Active Info Header */}
                <div className="glass-3d p-6 rounded-[2.5rem] border-default space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-[var(--sec)] uppercase tracking-wider">{activeDeployment.number}</span>
                        <span className="text-muted text-[10px] font-bold">• {activeDeployment.date}</span>
                      </div>
                      <h3 className="text-lg font-black text-[var(--text)] tracking-tight">{activeDeployment.title}</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeDeployment.status === "PLANNED" && (
                        <Button 
                          onClick={startDeployment}
                          className="h-9 px-4 bg-sky-500 hover:bg-sky-600 text-white font-black uppercase tracking-widest text-[9px] rounded-full hover-lift-2d"
                        >
                          <Play className="mr-2 h-3.5 w-3.5" /> Start Setup
                        </Button>
                      )}
                      {activeDeployment.status !== "SUCCESS" && (
                        <Button 
                          onClick={completeDeployment}
                          className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[9px] rounded-full hover-lift-2d"
                        >
                          <Check className="mr-2 h-3.5 w-3.5" /> Force Complete
                        </Button>
                      )}
                      <Badge className={cn("border px-2.5 py-1 text-[8px] font-black tracking-widest uppercase rounded-lg", getStatusBadgeClass(activeDeployment.status))}>
                        {activeDeployment.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5 pt-2">
                    <div className="flex justify-between items-center text-[10px] font-black text-muted uppercase tracking-widest">
                      <span>Checklist Completion Progress</span>
                      <span className="text-[var(--pri)]">{activeProgress}% Done</span>
                    </div>
                    <div className="h-2 w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full overflow-hidden border border-default/40">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${activeProgress}%` }}
                        className="h-full bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] rounded-full"
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Checklist Checklist Items */}
                <div className="glass-3d p-6 rounded-[2.5rem] border-default space-y-4">
                  <div className="flex items-center justify-between border-b border-default/50 pb-3 mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[var(--pri)]" />
                      <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">Handover Verification Checklist</h4>
                    </div>
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                      {activeDeployment.checklist.filter(c => c.isCompleted).length} / {activeDeployment.checklist.length} Verified
                    </span>
                  </div>

                  <div className="space-y-3">
                    {activeDeployment.checklist.map((item) => {
                      return (
                        <div 
                          key={item.id}
                          className={cn(
                            "p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 cursor-pointer",
                            item.isCompleted 
                              ? "bg-emerald-500/5 border-emerald-500/10 opacity-75" 
                              : "bg-[var(--card)]/30 border-default hover:border-[var(--muted)]/50"
                          )}
                          onClick={() => toggleChecklistItem(item.id)}
                        >
                          <div className="flex items-center gap-3.5 flex-1">
                            <span className="h-5 w-5 text-muted hover:text-[var(--pri)] flex items-center justify-center shrink-0">
                              {item.isCompleted ? (
                                <CheckSquare className="h-5 w-5 text-emerald-500" />
                              ) : (
                                <Square className="h-5 w-5" />
                              )}
                            </span>
                            <span className={cn(
                              "text-xs font-bold leading-tight",
                              item.isCompleted ? "line-through text-muted" : "text-[var(--text)]"
                            )}>
                              {item.title}
                            </span>
                          </div>

                          <Badge className={cn("border px-2 py-0.5 text-[8px] font-black tracking-wider uppercase rounded-lg", getPriorityClass(item.priority))}>
                            {item.priority}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Operations Terminal Logs */}
                <div className="glass-3d p-6 rounded-[2.5rem] border-default space-y-4">
                  <div className="flex items-center justify-between border-b border-default/50 pb-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-[var(--sec)]" />
                      <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">Deployment Console Stream</h4>
                    </div>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  </div>

                  <div className="font-mono text-[10px] bg-black/60 p-5 rounded-2xl border border-default/50 space-y-2 h-44 overflow-y-auto custom-scrollbar flex flex-col-reverse text-[var(--sec)] select-none">
                    {terminalLogs.map((log, idx) => (
                      <p key={idx} className={cn(
                        "leading-relaxed transition-all duration-300",
                        idx === 0 ? "text-emerald-400 font-bold" : "opacity-75"
                      )}>
                        {log}
                      </p>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
