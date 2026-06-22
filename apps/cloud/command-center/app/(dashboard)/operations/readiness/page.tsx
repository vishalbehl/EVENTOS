"use client";

import { useState } from "react";
import { 
  Activity, CheckCircle2, ShieldCheck, AlertTriangle, Play, RefreshCw,
  Cpu, Zap, Radio, Tv, Server, ShieldAlert, Award
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";

interface ReadinessSystem {
  id: string;
  name: string;
  category: "Networking" | "Power" | "AV" | "Signage";
  score: number; // 0 - 100
  status: "OPTIMAL" | "DEGRADED" | "CRITICAL";
  lastChecked: string;
  checks: { name: string; passed: boolean }[];
}

const initialSystems: ReadinessSystem[] = [
  {
    id: "SYS-01",
    name: "Primary Fiber Uplink Loop",
    category: "Networking",
    score: 100,
    status: "OPTIMAL",
    lastChecked: "2 mins ago",
    checks: [
      { name: "SLA Carrier Sync (Active-Active)", passed: true },
      { name: "VLAN Tagging & Core Routes Config", passed: true },
      { name: "DNS Resolver Latency Tests (<5ms)", passed: true }
    ]
  },
  {
    id: "SYS-02",
    name: "Uninterruptible Power Systems (UPS)",
    category: "Power",
    score: 95,
    status: "OPTIMAL",
    lastChecked: "5 mins ago",
    checks: [
      { name: "Emergency Generator Battery Test", passed: true },
      { name: "Mains Power Source Stability check", passed: true },
      { name: "Overload Load-Shedding script verified", passed: false }
    ]
  },
  {
    id: "SYS-03",
    name: "Main Hall A/V & Rigging Array",
    category: "AV",
    score: 78,
    status: "DEGRADED",
    lastChecked: "10 mins ago",
    checks: [
      { name: "FOH Acoustic Wave Alignment", passed: true },
      { name: "Hanging Rig Load Stress Inspection", passed: true },
      { name: "Left LED Panel Matrix sync errors detected", passed: false }
    ]
  },
  {
    id: "SYS-04",
    name: "Digital Signage Network Feed",
    category: "Signage",
    score: 45,
    status: "CRITICAL",
    lastChecked: "1 min ago",
    checks: [
      { name: "Signage Controller Heartbeat online", passed: true },
      { name: "Sync Media Feed Assets Cache loaded", passed: false },
      { name: "HTML5 Player Engine loop crash detected", passed: false }
    ]
  }
];

export default function ReadinessCenter() {
  const [systems, setSystems] = useState<ReadinessSystem[]>(initialSystems);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const triggerDiagnostic = (sysId: string) => {
    setSystems(prev => prev.map(sys => {
      if (sys.id === sysId) {
        // Resolve issues on diagnostic test
        const fixedChecks = sys.checks.map(c => ({ ...c, passed: true }));
        return {
          ...sys,
          score: 100,
          status: "OPTIMAL",
          lastChecked: "Just now",
          checks: fixedChecks
        };
      }
      return sys;
    }));
  };

  const refreshAllSystems = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  // Calculate overall readiness average
  const overallScore = Math.round(
    systems.reduce((acc, curr) => acc + curr.score, 0) / systems.length
  );

  return (
    <div className="space-y-6 p-8 pb-16 overflow-y-auto h-full custom-scrollbar">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-white">
            Readiness <span className="bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">Center</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Venue sub-systems readiness indices, telemetry metrics, and automatic health verification.
          </p>
        </div>
        <div>
          <Button 
            onClick={refreshAllSystems} 
            variant="outline" 
            className="border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white h-9 text-xs"
          >
            <RefreshCw className={`h-4 w-4 mr-2 text-teal-400 ${isRefreshing ? "animate-spin" : ""}`} /> 
            Verify All Systems
          </Button>
        </div>
      </div>

      {/* Large Gauge Panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-32 col-span-1 md:col-span-2">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-400 uppercase tracking-wider">
            <span>Overall Tech Readiness Score</span>
            <span className={
              overallScore >= 90 ? "text-emerald-400" :
              overallScore >= 75 ? "text-amber-400" : "text-rose-500"
            }>{overallScore}% Ready</span>
          </div>
          <div className="space-y-3 mt-auto">
            <Progress value={overallScore} className="h-2.5" />
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold">
              <span>2 of 4 Systems fully ready (100%)</span>
              <span>1 critical system warning</span>
            </div>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-32">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">SLA Risk Assessment</span>
          <div className="space-y-1">
            <div className="text-sm font-black text-amber-400 flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" /> MODERATE RISK</div>
            <p className="text-[10px] text-zinc-500">Signage outages could breach SLA clock</p>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-32">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Operational Target</span>
          <div className="space-y-1">
            <div className="text-sm font-black text-white flex items-center gap-1.5"><Award className="h-4 w-4 text-yellow-400" /> Go-Live Quality Bar</div>
            <p className="text-[10px] text-zinc-500">Requires minimum 95% overall readiness</p>
          </div>
        </Card>
      </div>

      {/* Systems Readiness Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {systems.map((sys) => {
          const sysIcon = 
            sys.category === "Networking" ? Radio :
            sys.category === "Power" ? Zap :
            sys.category === "AV" ? Cpu : Tv;

          return (
            <Card key={sys.id} className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md flex flex-col justify-between">
              <CardHeader className="pb-3 border-b border-zinc-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                      <Cpu className="h-4 w-4 text-teal-400" />
                    </div>
                    <div>
                      <CardTitle className="text-xs font-black text-zinc-300 uppercase tracking-wide">{sys.category}</CardTitle>
                      <CardDescription className="text-xs font-bold text-zinc-200 mt-0.5">{sys.name}</CardDescription>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-500 font-bold font-mono block">SCORE</span>
                    <Badge className={`text-xs font-black py-0.5 px-2 ${
                      sys.score >= 90 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                      sys.score >= 70 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                      "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }`}>
                      {sys.score}%
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {/* Specific checks */}
                <div className="space-y-2">
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-500">System Telemetry Checklist</span>
                  <div className="space-y-2">
                    {sys.checks.map((check, index) => (
                      <div 
                        key={index}
                        className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/20 border border-zinc-900 text-xs font-medium"
                      >
                        <span className={check.passed ? "text-zinc-300" : "text-zinc-500 line-through"}>{check.name}</span>
                        {check.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-rose-500" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-2 pb-4 border-t border-zinc-900 flex items-center justify-between gap-4">
                <span className="text-[10px] text-zinc-500 font-mono">Last status sync: {sys.lastChecked}</span>
                {sys.score < 100 && (
                  <Button 
                    onClick={() => triggerDiagnostic(sys.id)} 
                    variant="outline" 
                    className="border-zinc-800 text-teal-400 hover:text-white hover:bg-zinc-800 text-[10px] h-7 px-2.5"
                  >
                    Run Fix Script
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
