"use client";

import { useState } from "react";
import { 
  ShieldAlert, ShieldCheck, AlertTriangle, ShieldCheck as ShieldIcon, PlayCircle,
  Clock, CheckCircle, RefreshCw, XCircle, Users, Activity, HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";

interface OperationalRisk {
  id: string;
  name: string;
  category: "Infrastructure" | "Weather" | "Staffing" | "Hardware";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  mitigation: string;
  status: "IDENTIFIED" | "MITIGATING" | "RESOLVED";
  failoverAction: string;
  triggeredLogs?: string[];
}

const initialRisks: OperationalRisk[] = [
  {
    id: "RSK-201",
    name: "Primary ISP Fiber Uplink Outage",
    category: "Infrastructure",
    severity: "CRITICAL",
    mitigation: "BGP failover route established. Secondary carrier synced.",
    status: "IDENTIFIED",
    failoverAction: "Activate Secondary ISP Carrier BGP Feed",
    triggeredLogs: []
  },
  {
    id: "RSK-202",
    name: "Double-booking of Senior A/V Rigging crew",
    category: "Staffing",
    severity: "HIGH",
    mitigation: "Call standby subcontractor crew member (Sarah Connor) to on-duty status.",
    status: "MITIGATING",
    failoverAction: "Dispatch Backup Standby Crew Member",
    triggeredLogs: ["[LOG] Notified standby subcontractor...", "[LOG] Sarah Connor assigned to GTS Hall A."]
  },
  {
    id: "RSK-203",
    name: "Overheating warning on Hall B Video Switcher",
    category: "Hardware",
    severity: "MEDIUM",
    mitigation: "Deploy auxiliary backup switcher model. Check cooling ducts.",
    status: "IDENTIFIED",
    failoverAction: "Switch to Aux Video Switcher Feed",
    triggeredLogs: []
  },
  {
    id: "RSK-204",
    name: "Weather warning: Wind gusts exceeding limits",
    category: "Weather",
    severity: "LOW",
    mitigation: "Lower top rigging array by 2 meters. Double support anchor chains.",
    status: "RESOLVED",
    failoverAction: "Trigger Rigging Height Safety Script",
    triggeredLogs: ["[LOG] Safety script executed. Anchors tension verified."]
  }
];

export default function RiskRegister() {
  const [risks, setRisks] = useState<OperationalRisk[]>(initialRisks);
  const [activeRiskId, setActiveRiskId] = useState<string>("RSK-201");
  const [isTriggering, setIsTriggering] = useState(false);

  const selectedRisk = risks.find(r => r.id === activeRiskId) || risks[0];

  const handleFailoverTrigger = (riskId: string) => {
    setIsTriggering(true);
    setTimeout(() => {
      setRisks(prev => prev.map(r => {
        if (r.id === riskId) {
          return {
            ...r,
            status: "RESOLVED",
            triggeredLogs: [
              ...(r.triggeredLogs || []),
              `[LOG] Failover action: "${r.failoverAction}" triggered.`,
              `[SYSTEM] Failover handshake established. Telemetry returned code 200.`,
              `[SYSTEM] Incident resolved. Severity degraded to safe status.`
            ]
          };
        }
        return r;
      }));
      setIsTriggering(false);
    }, 1500);
  };

  const getSeverityBadge = (sev: OperationalRisk["severity"]) => {
    const maps = {
      CRITICAL: "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse",
      HIGH: "bg-orange-500/10 text-orange-400 border-orange-500/20",
      MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      LOW: "bg-zinc-800 text-zinc-500"
    };
    return maps[sev];
  };

  return (
    <div className="space-y-6 p-8 pb-16 overflow-y-auto h-full custom-scrollbar">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-white">
            Risk <span className="bg-gradient-to-r from-rose-400 to-orange-500 bg-clip-text text-transparent">Register</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Operational risk logs, contingency mitigations, and emergency failover triggers.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Unmitigated Risks</span>
          <div className="space-y-1">
            <div className="text-2xl font-black text-rose-400">
              {risks.filter(r => r.status === "IDENTIFIED").length} Open
            </div>
            <p className="text-[10px] text-zinc-500">Awaiting active mitigation sweeps</p>
          </div>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Active Mitigations</span>
          <div className="space-y-1">
            <div className="text-2xl font-black text-amber-400">
              {risks.filter(r => r.status === "MITIGATING").length} Pending
            </div>
            <p className="text-[10px] text-zinc-500">Contingency protocol in execution</p>
          </div>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Resolved incidents</span>
          <div className="space-y-1">
            <div className="text-2xl font-black text-emerald-400">
              {risks.filter(r => r.status === "RESOLVED").length} Incidents
            </div>
            <p className="text-[10px] text-zinc-500">Safely handled and logged</p>
          </div>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Insurance SLA Health</span>
          <div className="space-y-1">
            <div className="text-2xl font-black text-white flex items-center gap-1">
              <ShieldCheck className="h-5 w-5 text-emerald-400" /> Compliance
            </div>
            <p className="text-[10px] text-zinc-500">Complies with premium operations cover</p>
          </div>
        </Card>
      </div>

      {/* Main split grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Side: Risk Logs List (5 cols) */}
        <div className="xl:col-span-5 space-y-4">
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md">
            <CardHeader className="pb-3 border-b border-zinc-900">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-zinc-300">Operational Incidents Register</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[500px] overflow-y-auto custom-scrollbar">
              <div className="divide-y divide-zinc-900/50">
                {risks.map(risk => {
                  const isSelected = risk.id === activeRiskId;
                  return (
                    <div
                      key={risk.id}
                      onClick={() => setActiveRiskId(risk.id)}
                      className={`p-4 flex flex-col gap-2 cursor-pointer transition-all ${
                        isSelected 
                          ? "bg-zinc-900/60 border-l-2 border-rose-500" 
                          : "hover:bg-zinc-900/20 border-l-2 border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black text-white">{risk.id}</span>
                          <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${getSeverityBadge(risk.severity)}`}>
                            {risk.severity}
                          </span>
                        </div>
                        <Badge className={`text-[10px] ${
                          risk.status === "RESOLVED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          risk.status === "MITIGATING" ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse" :
                          "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        }`}>
                          {risk.status}
                        </Badge>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-zinc-200 line-clamp-1">{risk.name}</h4>
                        <p className="text-[11px] text-zinc-500 font-medium">Category: {risk.category}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Action Trigger Desk (7 cols) */}
        <div className="xl:col-span-7 space-y-6">
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md">
            <CardHeader className="pb-4 border-b border-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-rose-500 animate-pulse" /> Emergency Control Deck
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-500 mt-1">Simulate contingency protocols and verify failovers.</CardDescription>
                </div>
                <span className="font-mono text-xs font-black text-rose-400">{selectedRisk.id}</span>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-1">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-500">Incident Details</span>
                <h3 className="text-sm font-black text-zinc-200">{selectedRisk.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-zinc-800 text-zinc-400">Category: {selectedRisk.category}</Badge>
                  <Badge className={`border ${getSeverityBadge(selectedRisk.severity)}`}>Severity: {selectedRisk.severity}</Badge>
                </div>
              </div>

              {/* Mitigation info */}
              <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-900 space-y-1.5">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-500 flex items-center gap-1"><Clock className="h-3 w-3 text-rose-400" /> Proposed Mitigation Script</span>
                <p className="text-xs text-zinc-300 font-medium leading-5">{selectedRisk.mitigation}</p>
              </div>

              {/* Logs output */}
              <div className="space-y-2">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-500">Failover Event Stream</span>
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 font-mono text-[10px] text-zinc-400 space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar select-none">
                  {selectedRisk.triggeredLogs && selectedRisk.triggeredLogs.length > 0 ? (
                    selectedRisk.triggeredLogs.map((log, idx) => (
                      <div key={idx} className={log.startsWith("[SYSTEM]") ? "text-emerald-400" : "text-zinc-400"}>{log}</div>
                    ))
                  ) : (
                    <div className="text-zinc-600 italic">No failover events triggered yet. System idle.</div>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-2 pb-6 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-[10px] text-zinc-500 font-mono">Ensure backup power generators are armed.</span>
              {selectedRisk.status !== "RESOLVED" && (
                <Button 
                  onClick={() => handleFailoverTrigger(selectedRisk.id)} 
                  disabled={isTriggering}
                  className="bg-rose-500 text-white hover:bg-rose-600 text-xs py-1 px-4 h-9 flex items-center gap-1.5 w-full sm:w-auto justify-center"
                >
                  {isTriggering ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Running Failover...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4" /> Trigger Emergency Failover
                    </>
                  )}
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
