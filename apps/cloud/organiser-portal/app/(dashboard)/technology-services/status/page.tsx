"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { 
  ShieldCheck, RefreshCw, Clock, Wifi, Printer, Video, 
  HelpCircle, ChevronRight, Activity, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";

export default function TechnologyServicesStatus() {
  const { eventId } = useParams();
  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDeployments([
        { id: 1, name: "Core Dedicated Fiber Link Setup", progress: 100, status: "COMPLETED", icon: Wifi },
        { id: 2, name: "Badge Printers Network Syncing", progress: 80, status: "IN_PROGRESS", icon: Printer },
        { id: 3, name: "Keynote Room Soundcheck Rigging", progress: 30, status: "IN_PROGRESS", icon: Video }
      ]);
      setTickets([
        { id: "T-104", subject: "CAPTIVE_PORTAL: Custom SSID landing redirect error", status: "OPEN", priority: "HIGH", timer: "12m left" },
        { id: "T-102", subject: "PRINTER_SETUP: Thermal printer ribbon replacement", status: "RESOLVED", priority: "MEDIUM", timer: "RESOLVED" }
      ]);
      setLoading(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [eventId]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      case "MEDIUM":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      default:
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse";
    }
  };

  if (loading) {
    return (
      <div className="flex h-[75vh] items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <Activity className="h-10 w-10 animate-spin text-indigo-500" />
          <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Loading Status Monitor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8 pb-16 overflow-y-auto h-full custom-scrollbar">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Delivery <span className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">& SLA Status</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Monitor real-time technical deployments and active SLA support tickets
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Deployments status */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Activity className="text-indigo-400 h-5 w-5" /> Provisioning Pipelines
          </h2>
          
          <div className="space-y-4">
            {deployments.map(deploy => (
              <div 
                key={deploy.id} 
                className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800/50 backdrop-blur-md space-y-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-850 text-zinc-400">
                      <deploy.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{deploy.name}</h3>
                      <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider mt-0.5">Deployment Step {deploy.id}</div>
                    </div>
                  </div>
                  <Badge className={getStatusColor(deploy.status)}>
                    {deploy.status === "COMPLETED" ? "Live" : "Deploying"}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-zinc-400">
                    <span>Progress</span>
                    <span className="font-mono">{deploy.progress}%</span>
                  </div>
                  <Progress value={deploy.progress} className="h-2" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Support tickets SLA */}
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock className="text-indigo-400 h-5 w-5" /> SLA Support Tickets
          </h2>

          <div className="space-y-4">
            {tickets.map(ticket => (
              <div 
                key={ticket.id} 
                className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md space-y-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-xs font-mono font-bold tracking-wider">{ticket.id}</span>
                    <Badge className={getPriorityColor(ticket.priority)}>{ticket.priority} Priority</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-semibold">
                    <Clock className="h-3.5 w-3.5" />
                    <span className={ticket.status === "OPEN" ? "text-indigo-400" : "text-emerald-400"}>{ticket.timer}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Subject</div>
                  <p className="text-sm font-bold text-zinc-200">{ticket.subject}</p>
                </div>

                <div className="flex justify-between items-center border-t border-zinc-850 pt-3">
                  <span className="text-xs text-zinc-500">Target response time: 15 mins</span>
                  <Badge className={ticket.status === "OPEN" ? "bg-indigo-500/10 text-indigo-400" : "bg-emerald-500/10 text-emerald-400"}>
                    {ticket.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
