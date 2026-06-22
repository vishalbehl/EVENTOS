"use client";

import { useState } from "react";
import { 
  Calendar, Layers, CheckCircle2, Circle, AlertCircle, Clock, ChevronRight,
  Filter, Play, Plus, Milestone, GitFork, ArrowRight, UserCheck, ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";

interface MilestoneTask {
  id: string;
  name: string;
  lane: "AV" | "Networking" | "Streaming" | "Signage";
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  startDay: number; // Day offset relative to build start
  duration: number; // Number of days
  assignee: string;
  dependencies?: string[];
}

const initialMilestones: MilestoneTask[] = [
  { id: "T-101", name: "Deploy Primary Uplink Fiber Network", lane: "Networking", status: "DONE", startDay: 1, duration: 2, assignee: "Alex Rivera (NetLead)" },
  { id: "T-102", name: "Rigging Main Hall Speaker System", lane: "AV", status: "DONE", startDay: 2, duration: 2, assignee: "Marcus Chen (A/V Head)" },
  { id: "T-103", name: "Configure VLANs & Signage Endpoints", lane: "Networking", status: "IN_PROGRESS", startDay: 3, duration: 1, assignee: "Alex Rivera (NetLead)", dependencies: ["T-101"] },
  { id: "T-104", name: "Speaker Ready Room System Setup", lane: "AV", status: "IN_PROGRESS", startDay: 3, duration: 2, assignee: "Sarah Connor (Eng)", dependencies: ["T-102"] },
  { id: "T-105", name: "RTMP Streaming Live Encoder Rigging", lane: "Streaming", status: "TODO", startDay: 4, duration: 1, assignee: "Devon Patel (StreamLead)", dependencies: ["T-103"] },
  { id: "T-106", name: "NFC Fast-track Gates Integration", lane: "Networking", status: "TODO", startDay: 4, duration: 2, assignee: "Alex Rivera (NetLead)", dependencies: ["T-103"] },
  { id: "T-107", name: "Main Stage LED Wall Content Dry-Run", lane: "AV", status: "BLOCKED", startDay: 5, duration: 1, assignee: "Marcus Chen (A/V Head)", dependencies: ["T-104"] }
];

const LANES = [
  { id: "Networking", label: "Network Infrastructure", color: "border-blue-500/20 bg-blue-500/5 text-blue-400" },
  { id: "AV", label: "A/V Rigging & Projection", color: "border-purple-500/20 bg-purple-500/5 text-purple-400" },
  { id: "Streaming", label: "Live Broadcast & Encoder", color: "border-teal-500/20 bg-teal-500/5 text-teal-400" },
  { id: "Signage", label: "Registration & Digital Signage", color: "border-amber-500/20 bg-amber-500/5 text-amber-400" }
];

export default function ProjectGantt() {
  const [tasks, setTasks] = useState<MilestoneTask[]>(initialMilestones);
  const [selectedTask, setSelectedTask] = useState<MilestoneTask | null>(initialMilestones[2]);
  const [activeTab, setActiveTab] = useState<string>("ALL");

  const totalBuildDays = 7;
  const daysArray = Array.from({ length: totalBuildDays }, (_, i) => i + 1);

  const toggleTaskStatus = (taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const nextStatusMap: Record<MilestoneTask["status"], MilestoneTask["status"]> = {
          "TODO": "IN_PROGRESS",
          "IN_PROGRESS": "DONE",
          "DONE": "BLOCKED",
          "BLOCKED": "TODO"
        };
        return { ...t, status: nextStatusMap[t.status] };
      }
      return t;
    }));
  };

  const filteredTasks = tasks.filter(t => activeTab === "ALL" || t.lane === activeTab);

  const completedCount = tasks.filter(t => t.status === "DONE").length;
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  return (
    <div className="space-y-6 p-8 pb-16 overflow-y-auto h-full custom-scrollbar">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-white">
            Operations <span className="bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">Gantt Timeline</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Venue Operations build schedule, dependency networks, and critical path timeline.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800">
            <Plus className="h-4 w-4 mr-2 text-blue-400" /> Dispatch Task
          </Button>
        </div>
      </div>

      {/* Progress & Quick Stats Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md p-6 flex flex-col justify-between h-28 col-span-1 md:col-span-2">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-400 uppercase tracking-wider">
            <span>Overall Build Progress</span>
            <span className="text-blue-400">{progressPercent}% Completed</span>
          </div>
          <div className="space-y-2 mt-auto">
            <Progress value={progressPercent} className="h-2" />
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold">
              <span>{completedCount} of {tasks.length} tasks closed</span>
              <span>1 task blocked</span>
            </div>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Next Milestone</span>
          <div className="space-y-1">
            <div className="text-sm font-black text-white flex items-center gap-1.5"><Milestone className="h-4 w-4 text-amber-500" /> Day 4 Integration</div>
            <p className="text-[10px] text-zinc-500">Live RTMP setup & fast gates deployment</p>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Critical Path Check</span>
          <div className="space-y-1">
            <div className="text-sm font-black text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Healthy</div>
            <p className="text-[10px] text-zinc-500">Milestone buffers remain intact</p>
          </div>
        </Card>
      </div>

      {/* Lane Filter Buttons */}
      <div className="flex gap-2 border-b border-zinc-900 pb-3 overflow-x-auto no-scrollbar">
        {[{ id: "ALL", label: "All Lanes" }, ...LANES].map(lane => (
          <button
            key={lane.id}
            onClick={() => setActiveTab(lane.id)}
            className={`text-xs font-extrabold uppercase px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap ${
              activeTab === lane.id 
                ? "bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-md shadow-blue-500/5" 
                : "bg-zinc-950/30 border-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-800"
            }`}
          >
            {lane.label}
          </button>
        ))}
      </div>

      {/* Gantt Timeline Grid Dashboard */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left Side: Interactive Gantt Grid (8 cols) */}
        <div className="xl:col-span-8 overflow-x-auto">
          <div className="min-w-[700px] border border-zinc-900 rounded-2xl bg-zinc-950/20 overflow-hidden">
            {/* Grid Header */}
            <div className="grid grid-cols-12 border-b border-zinc-900 bg-zinc-950/50 p-4 items-center">
              <div className="col-span-4 text-xs font-black text-zinc-400 uppercase tracking-wider">Operations Task</div>
              <div className="col-span-8 grid grid-cols-7 text-center">
                {daysArray.map(day => (
                  <div key={day} className="text-[10px] font-black text-zinc-500 uppercase tracking-widest border-r border-zinc-900 last:border-0 py-1">
                    Day {day}
                  </div>
                ))}
              </div>
            </div>

            {/* Grid Lanes */}
            <div className="divide-y divide-zinc-900/60 p-2 space-y-2">
              {LANES.map(lane => {
                const laneTasks = filteredTasks.filter(t => t.lane === lane.id);
                if (laneTasks.length === 0) return null;

                return (
                  <div key={lane.id} className="py-3 space-y-2">
                    {/* Lane Label */}
                    <div className="px-2 flex items-center justify-between">
                      <span className="text-[10px] font-extrabold tracking-widest uppercase text-zinc-500">{lane.label}</span>
                    </div>

                    {/* Lane timeline bar chart */}
                    {laneTasks.map(task => {
                      const isSelected = selectedTask?.id === task.id;
                      return (
                        <div 
                          key={task.id} 
                          onClick={() => setSelectedTask(task)}
                          className="grid grid-cols-12 items-center px-2 py-1.5 hover:bg-zinc-900/30 rounded-lg cursor-pointer transition-all"
                        >
                          {/* Task Label column */}
                          <div className="col-span-4 flex items-center gap-2 pr-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTaskStatus(task.id);
                              }}
                              className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
                            >
                              {task.status === "DONE" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
                               task.status === "IN_PROGRESS" ? <Clock className="h-4 w-4 text-blue-400 animate-spin-slow" /> :
                               task.status === "BLOCKED" ? <AlertCircle className="h-4 w-4 text-rose-500" /> :
                               <Circle className="h-4 w-4" />}
                            </button>
                            <span className={`text-xs font-bold truncate ${
                              isSelected ? 'text-blue-400' : 'text-zinc-300'
                            }`}>{task.name}</span>
                          </div>

                          {/* Chronological bar Column */}
                          <div className="col-span-8 grid grid-cols-7 relative h-8 items-center">
                            {/* Visual Grid Lines */}
                            {daysArray.map(day => (
                              <div key={day} className="h-full border-r border-zinc-900/40 last:border-0" />
                            ))}

                            {/* Task Bar */}
                            <div 
                              className={`absolute h-6 rounded-lg border flex items-center justify-center text-[9px] font-bold transition-all px-2 shadow-lg ${
                                task.status === "DONE" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                                task.status === "IN_PROGRESS" ? "bg-blue-500/10 border-blue-500/30 text-blue-400" :
                                task.status === "BLOCKED" ? "bg-rose-500/10 border-rose-500/30 text-rose-400" :
                                "bg-zinc-900 border-zinc-800 text-zinc-500"
                              }`}
                              style={{
                                gridColumnStart: task.startDay,
                                gridColumnEnd: task.startDay + task.duration,
                              }}
                            >
                              <span className="truncate">{task.id}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Task Details Panel (4 cols) */}
        <div className="xl:col-span-4">
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md sticky top-6">
            <CardHeader className="pb-4 border-b border-zinc-900">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <GitFork className="h-4 w-4 text-blue-400" /> Milestone Detail Inspector
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {selectedTask ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-blue-400">{selectedTask.id}</span>
                    <Badge className={
                      selectedTask.status === "DONE" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                      selectedTask.status === "IN_PROGRESS" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                      selectedTask.status === "BLOCKED" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                      "bg-zinc-800 text-zinc-500"
                    }>
                      {selectedTask.status}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-zinc-200">{selectedTask.name}</h3>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-extrabold block mt-1">LANE: {selectedTask.lane}</span>
                  </div>

                  {/* Date and duration timeline */}
                  <div className="grid grid-cols-2 gap-4 py-3 px-4 rounded-xl bg-zinc-900/30 border border-zinc-900">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">Starts Day</span>
                      <div className="text-xs font-black text-zinc-300">Day {selectedTask.startDay} of Build</div>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">Duration</span>
                      <div className="text-xs font-black text-zinc-300">{selectedTask.duration} {selectedTask.duration > 1 ? "Days" : "Day"}</div>
                    </div>
                  </div>

                  {/* Assignee */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Lead Assignee</span>
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-900/20 border border-zinc-900 text-xs font-medium text-zinc-300">
                      <UserCheck className="h-4 w-4 text-blue-400 shrink-0" />
                      {selectedTask.assignee}
                    </div>
                  </div>

                  {/* Dependencies */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Task Dependencies</span>
                    {selectedTask.dependencies && selectedTask.dependencies.length > 0 ? (
                      <div className="space-y-1">
                        {selectedTask.dependencies.map(depId => {
                          const dep = tasks.find(t => t.id === depId);
                          return (
                            <div key={depId} className="flex items-center justify-between p-2 rounded bg-zinc-900/10 border border-zinc-900 text-[11px] font-medium text-zinc-400">
                              <span className="font-mono text-zinc-500">{depId} - {dep?.name}</span>
                              <Badge className={
                                dep?.status === "DONE" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-yellow-500/10 text-yellow-400"
                              }>
                                {dep?.status}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-zinc-600 text-xs italic">No prior tasks required. Independent.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-600 text-xs italic">
                  Select a milestone block to inspect dependency status and schedule details.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
