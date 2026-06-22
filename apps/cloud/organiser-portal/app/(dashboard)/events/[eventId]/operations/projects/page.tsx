"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { 
  Calendar, Layers, CheckCircle2, ChevronRight, 
  ChevronDown, Plus, AlertCircle, Clock, CheckSquare, Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function ProjectPlanner() {
  const { eventId } = useParams();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMilestones, setExpandedMilestones] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setTimeout(() => {
      setProject({
        id: "p1",
        name: "Audio Visual Deployment Project",
        project_code: "PRJ-9D2E4A",
        status: "PLANNING",
        start_date: "2026-06-22",
        end_date: "2026-06-27",
        completion_percentage: 45.0,
        milestones: [
          {
            id: "m1",
            name: "Requirements Clarification",
            description: "Verify specifications & resolve ambiguities",
            status: "COMPLETED",
            start_date: "2026-06-22",
            due_date: "2026-06-23",
            tasks: [
              { id: "t1", title: "Verify service request details with client", status: "COMPLETED", priority: "HIGH" },
              { id: "t2", title: "Obtain layout & floor plans", status: "COMPLETED", priority: "MEDIUM" }
            ]
          },
          {
            id: "m2",
            name: "Resource Allocation",
            description: "Allocate staff & hardware assets",
            status: "IN_PROGRESS",
            start_date: "2026-06-23",
            due_date: "2026-06-24",
            tasks: [
              { id: "t3", title: "Assign technical engineers & operators", status: "COMPLETED", priority: "HIGH" },
              { id: "t4", title: "Reserve hardware inventory", status: "IN_PROGRESS", priority: "HIGH" }
            ]
          },
          {
            id: "m3",
            name: "On-Site Setup & Integration",
            description: "Deploy, install & perform trials",
            status: "PLANNED",
            start_date: "2026-06-24",
            due_date: "2026-06-25",
            tasks: [
              { id: "t5", title: "Deploy on-site hardware in rooms", status: "TODO", priority: "CRITICAL" },
              { id: "t6", title: "Perform system validation dry runs", status: "TODO", priority: "HIGH" }
            ]
          },
          {
            id: "m4",
            name: "Operations Support",
            description: "Provide live operational assistance",
            status: "PLANNED",
            start_date: "2026-06-25",
            due_date: "2026-06-26",
            tasks: [
              { id: "t7", title: "Monitor device status & heartbeats", status: "TODO", priority: "MEDIUM" },
              { id: "t8", title: "Coordinate speaker upload desk", status: "TODO", priority: "MEDIUM" }
            ]
          }
        ]
      });
      // Expand first couple milestones by default
      setExpandedMilestones({ "m1": true, "m2": true });
      setLoading(false);
    }, 700);
  }, [eventId]);

  const toggleMilestone = (id: string) => {
    setExpandedMilestones(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleTaskStatus = (milestoneId: string, taskId: string) => {
    setProject((prev: any) => {
      const updatedMilestones = prev.milestones.map((m: any) => {
        if (m.id !== milestoneId) return m;
        const updatedTasks = m.tasks.map((t: any) => {
          if (t.id !== taskId) return t;
          const newStatus = t.status === "COMPLETED" ? "TODO" : "COMPLETED";
          return { ...t, status: newStatus };
        });
        // Recalculate milestone status based on tasks
        const allCompleted = updatedTasks.every((t: any) => t.status === "COMPLETED");
        const anyCompleted = updatedTasks.some((t: any) => t.status === "COMPLETED" || t.status === "IN_PROGRESS");
        const status = allCompleted ? "COMPLETED" : (anyCompleted ? "IN_PROGRESS" : "PLANNED");
        return { ...m, tasks: updatedTasks, status };
      });

      // Recalculate project completion %
      const allTasks = updatedMilestones.flatMap((m: any) => m.tasks);
      const completedTasks = allTasks.filter((t: any) => t.status === "COMPLETED");
      const completion_percentage = allTasks.length > 0 ? (completedTasks.length / allTasks.length) * 100 : 0;

      return { ...prev, milestones: updatedMilestones, completion_percentage };
    });
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <p className="text-muted text-xs font-bold uppercase tracking-widest animate-pulse">Loading Planner Engine...</p>
      </div>
    );
  }

  const getPriorityBadge = (prio: string) => {
    switch (prio) {
      case "CRITICAL": return "text-rose-500 bg-rose-500/10 border-rose-500/20";
      case "HIGH": return "text-orange-500 bg-orange-500/10 border-orange-500/20";
      default: return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  const getMilestoneStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "IN_PROGRESS": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      default: return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
    }
  };

  return (
    <div className="p-6 space-y-8 h-full overflow-y-auto custom-scrollbar pb-12">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-[10px] font-black text-[var(--pri)] tracking-[0.2em] uppercase">{project.project_code}</span>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
            Project <span className="text-[var(--sec)]">Planner & Gantt</span>
          </h1>
          <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] opacity-80">
            Track milestones, verify dependencies, and configure project tasks
          </p>
        </div>
        <Button className="h-11 px-6 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[11px] rounded-full hover-lift-3d">
          <Plus className="mr-2 h-4 w-4" /> Add Task
        </Button>
      </div>

      {/* Progress Card */}
      <div className="glass-3d p-8 rounded-[2.5rem] border-default flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 h-40 w-40 bg-[var(--sec)]/10 blur-3xl rounded-full" />
        <div className="space-y-2 flex-1">
          <span className="text-[10px] font-black text-muted uppercase tracking-[0.25em]">Overall Project Completion</span>
          <div className="flex items-end gap-3">
            <h2 className="text-4xl font-black text-[var(--text)] tracking-tighter">{Math.round(project.completion_percentage)}%</h2>
            <p className="text-muted text-[10px] font-bold uppercase tracking-wider mb-2">On Schedule</p>
          </div>
          {/* Progress bar */}
          <div className="h-2.5 w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full overflow-hidden border border-default">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${project.completion_percentage}%` }}
              transition={{ duration: 1 }}
              className="h-full bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] rounded-full" 
            />
          </div>
        </div>
        
        <div className="flex gap-4 md:pl-8 border-t md:border-t-0 md:border-l border-default/50 pt-6 md:pt-0">
          <div className="text-center px-4">
            <p className="text-[20px] font-black text-[var(--text)]">{project.milestones.length}</p>
            <p className="text-[9px] font-black text-muted uppercase tracking-wider">Milestones</p>
          </div>
          <div className="text-center px-4">
            <p className="text-[20px] font-black text-emerald-500">
              {project.milestones.flatMap((m: any) => m.tasks).filter((t: any) => t.status === "COMPLETED").length}
            </p>
            <p className="text-[9px] font-black text-muted uppercase tracking-wider">Completed Tasks</p>
          </div>
          <div className="text-center px-4">
            <p className="text-[20px] font-black text-amber-500">
              {project.milestones.flatMap((m: any) => m.tasks).filter((t: any) => t.status === "IN_PROGRESS").length}
            </p>
            <p className="text-[9px] font-black text-muted uppercase tracking-wider">In Progress</p>
          </div>
        </div>
      </div>

      {/* Milestones and Tasks Workspace */}
      <div className="space-y-6">
        {project.milestones.map((m: any, idx: number) => {
          const isExpanded = !!expandedMilestones[m.id];
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="glass-3d rounded-[2rem] border border-default/80 overflow-hidden shadow-md"
            >
              {/* Header Toggle */}
              <div 
                onClick={() => toggleMilestone(m.id)}
                className="p-6 bg-[color-mix(in_srgb,var(--text)_2%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] transition-colors flex items-center justify-between cursor-pointer border-b border-default/40"
              >
                <div className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center text-muted">
                    {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-[var(--text)] tracking-tight">{m.name}</h3>
                    <p className="text-[10px] text-muted font-medium">{m.description}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <span className="text-[9px] font-black text-muted uppercase tracking-wider hidden sm:inline">
                    {m.start_date} → {m.due_date}
                  </span>
                  <Badge className="border px-2.5 py-0.5 text-[8px] font-black tracking-widest uppercase rounded-lg" variant="outline">
                    {m.tasks.length} Tasks
                  </Badge>
                  <Badge className={cn("border-0 px-2.5 py-0.5 text-[8px] font-black tracking-widest uppercase rounded-lg", getMilestoneStatusBadge(m.status))}>
                    {m.status}
                  </Badge>
                </div>
              </div>

              {/* Tasks List */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-6 space-y-3 bg-[var(--card)]/10">
                      {m.tasks.map((t: any) => {
                        const isCompleted = t.status === "COMPLETED";
                        return (
                          <div 
                            key={t.id}
                            className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 ${
                              isCompleted 
                                ? "bg-emerald-500/5 border-emerald-500/10 opacity-75" 
                                : "bg-[var(--card)]/30 border-default hover:border-[var(--muted)]/50"
                            }`}
                          >
                            <div className="flex items-center gap-4 flex-1">
                              <button 
                                onClick={() => toggleTaskStatus(m.id, t.id)}
                                className="h-6 w-6 text-muted hover:text-[var(--pri)] transition-colors flex items-center justify-center shrink-0"
                              >
                                {isCompleted ? (
                                  <CheckSquare className="h-5 w-5 text-emerald-500" />
                                ) : (
                                  <Square className="h-5 w-5" />
                                )}
                              </button>
                              <span className={`text-xs font-bold leading-tight ${isCompleted ? "line-through text-muted" : "text-[var(--text)]"}`}>
                                {t.title}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <Badge className={cn("border px-2 py-0.5 text-[8px] font-black tracking-wider uppercase rounded-lg", getPriorityBadge(t.priority))}>
                                {t.priority}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
