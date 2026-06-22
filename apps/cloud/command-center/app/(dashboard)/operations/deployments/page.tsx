"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Play, Pause, RotateCcw, Terminal, CheckCircle2, Circle, AlertCircle, Clock,
  ArrowRight, ShieldCheck, PlayCircle, Loader2, Sparkles, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";

interface RunbookStep {
  id: string;
  name: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
  phase: "Pre-Build" | "Main Setup" | "Dry Run" | "Live Ops";
  cmd: string;
}

const initialSteps: RunbookStep[] = [
  { id: "S-1", name: "Provision Core Fiber Uplink", status: "SUCCESS", phase: "Pre-Build", cmd: "net_provision --interface=fiber0 --uplink=1gbps" },
  { id: "S-2", name: "Establish Event Edge Firewalls & VLANs", status: "SUCCESS", phase: "Pre-Build", cmd: "firewall_init --profile=secure-event --vlan=100,200,300" },
  { id: "S-3", name: "Register NFC Badge Gateway Terminals", status: "RUNNING", phase: "Main Setup", cmd: "nfc_gateway_deploy --gateways=12 --reg-server=https://api.eventos" },
  { id: "S-4", name: "Deploy Speaker Ready Room Screens", status: "PENDING", phase: "Main Setup", cmd: "display_sync --room=speaker-ready --layout=grid" },
  { id: "S-5", name: "Verify RTMP Primary & Secondary Streams", status: "PENDING", phase: "Dry Run", cmd: "rtmp_test --stream-id=keynote-stream --fps=60" },
  { id: "S-6", name: "Perform Network Stress & Failover Test", status: "PENDING", phase: "Dry Run", cmd: "traffic_simulate --duration=5m --clients=2000" },
  { id: "S-7", name: "Lock Production Configuration & SLA Clocks", status: "PENDING", phase: "Live Ops", cmd: "sla_lock --monitor-interval=5s" }
];

export default function DeploymentRunbooks() {
  const [steps, setSteps] = useState<RunbookStep[]>(initialSteps);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "[SYSTEM] Initiating deployment engine v4.0.1...",
    "[SYSTEM] Connected to primary event console: GTS-2026",
    "[S-1] Running net_provision --interface=fiber0 --uplink=1gbps...",
    "[S-1] Fiber carrier heartbeat established. RTT: 2.4ms",
    "[S-1] Core uplink provisioned successfully.",
    "[S-2] Running firewall_init --profile=secure-event --vlan=100,200,300...",
    "[S-2] Firewall policies loaded. 3 VLANs established.",
    "[S-2] VLAN tagging verified. Core routers configured.",
    "[S-3] Running nfc_gateway_deploy --gateways=12..."
  ]);
  const [activeStepIndex, setActiveStepIndex] = useState(2); // S-3 is running

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Simulate execution of runbook steps
  useEffect(() => {
    let interval: any = null;
    if (isRunning) {
      interval = setInterval(() => {
        setSteps(prev => {
          const nextSteps = [...prev];
          const currentStep = nextSteps[activeStepIndex];

          if (!currentStep) {
            setIsRunning(false);
            return prev;
          }

          if (currentStep.status === "RUNNING") {
            // Complete current step
            currentStep.status = "SUCCESS";
            setLogs(l => [
              ...l,
              `[${currentStep.id}] ${currentStep.name} completed successfully.`,
              `[SYSTEM] Step ${currentStep.id} exited with code 0.`
            ]);
            
            // Start next step if exists
            const nextIdx = activeStepIndex + 1;
            if (nextIdx < nextSteps.length) {
              nextSteps[nextIdx].status = "RUNNING";
              setActiveStepIndex(nextIdx);
              setLogs(l => [
                ...l,
                `[${nextSteps[nextIdx].id}] Running ${nextSteps[nextIdx].cmd}...`,
                `[${nextSteps[nextIdx].id}] Starting execution pipeline...`
              ]);
            } else {
              setIsRunning(false);
              setLogs(l => [...l, "[SYSTEM] Runbook checklist executed completely. System is fully operational."]);
            }
          }
          return nextSteps;
        });
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [isRunning, activeStepIndex]);

  const startExecution = () => {
    setIsRunning(true);
    setLogs(l => [...l, "[SYSTEM] Resume runbook checklist execution..."]);
  };

  const pauseExecution = () => {
    setIsRunning(false);
    setLogs(l => [...l, "[SYSTEM] Execution suspended by operator."]);
  };

  const resetExecution = () => {
    setIsRunning(false);
    setActiveStepIndex(0);
    setSteps(initialSteps.map((s, idx) => ({
      ...s,
      status: idx === 0 ? "RUNNING" : "PENDING"
    })));
    setLogs([
      "[SYSTEM] Resetting runbook engine state...",
      "[S-1] Running net_provision --interface=fiber0 --uplink=1gbps..."
    ]);
  };

  const totalSteps = steps.length;
  const completedSteps = steps.filter(s => s.status === "SUCCESS").length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  return (
    <div className="space-y-6 p-8 pb-16 overflow-y-auto h-full custom-scrollbar">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-white">
            On-Site <span className="bg-gradient-to-r from-violet-400 to-indigo-500 bg-clip-text text-transparent">Runbooks</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Live-deployment checklists, automation tasks, and streaming output terminals.
          </p>
        </div>
        <div className="flex gap-2">
          {isRunning ? (
            <Button onClick={pauseExecution} variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 h-9 text-xs">
              <Pause className="h-4 w-4 mr-2" /> Pause Execution
            </Button>
          ) : (
            <Button onClick={startExecution} className="bg-indigo-500 text-white hover:bg-indigo-600 h-9 text-xs">
              <Play className="h-4 w-4 mr-2" /> Resume Runbook
            </Button>
          )}
          <Button onClick={resetExecution} variant="outline" className="border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-800 hover:text-white h-9 text-xs">
            <RotateCcw className="h-4 w-4 mr-2" /> Reset
          </Button>
        </div>
      </div>

      {/* Progress Monitor */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-28 col-span-1 md:col-span-2">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-400 uppercase tracking-wider">
            <span>Runbook Complete Status</span>
            <span className="text-indigo-400">{progressPercent}%</span>
          </div>
          <div className="space-y-2 mt-auto">
            <Progress value={progressPercent} className="h-2" />
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold">
              <span>{completedSteps} of {totalSteps} steps completed</span>
              <span>1 running step active</span>
            </div>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Deployment Status</span>
          <div className="space-y-1">
            <div className="text-sm font-black text-emerald-400 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> SECURE</div>
            <p className="text-[10px] text-zinc-500">Continuous security sweeps active</p>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Execution Server</span>
          <div className="space-y-1">
            <div className="text-sm font-black text-white flex items-center gap-1.5"><Terminal className="h-4 w-4 text-zinc-400" /> edge-worker-us</div>
            <p className="text-[10px] text-zinc-500">Region: us-east-1a (Active)</p>
          </div>
        </Card>
      </div>

      {/* Checklist and Terminal Console Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Side: Step-by-step checklist (5 cols) */}
        <div className="xl:col-span-5 space-y-4">
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md">
            <CardHeader className="pb-3 border-b border-zinc-900">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-zinc-300">Runbook Operations Queue</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
              {steps.map((step) => {
                const isCurrent = step.status === "RUNNING";
                return (
                  <div 
                    key={step.id} 
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                      isCurrent 
                        ? "bg-indigo-500/10 border-indigo-500/30 shadow-md shadow-indigo-500/5" 
                        : step.status === "SUCCESS"
                        ? "bg-zinc-900/20 border-zinc-900 text-zinc-400"
                        : "bg-zinc-950/30 border-zinc-900 text-zinc-500"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="shrink-0">
                        {step.status === "SUCCESS" ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : step.status === "RUNNING" ? (
                          <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />
                        ) : step.status === "FAILED" ? (
                          <AlertCircle className="h-5 w-5 text-rose-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-zinc-700" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-extrabold uppercase tracking-wide opacity-60">{step.phase}</span>
                        <h4 className="text-xs font-bold text-zinc-200">{step.name}</h4>
                        <span className="font-mono text-[9px] text-zinc-500 block truncate max-w-[200px]">{step.cmd}</span>
                      </div>
                    </div>
                    <Badge className={`text-[10px] font-mono ${
                      step.status === "SUCCESS" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                      step.status === "RUNNING" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse" :
                      "bg-zinc-800 text-zinc-500"
                    }`}>
                      {step.id}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Streaming Stdout Terminal Console (7 cols) */}
        <div className="xl:col-span-7 space-y-6">
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md">
            <CardHeader className="pb-3 border-b border-zinc-900 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                  <Terminal className="h-4 w-4 text-indigo-400" /> STDOUT Streaming Terminal
                </CardTitle>
                <CardDescription className="text-xs text-zinc-500 mt-1">Live worker agent diagnostic streams.</CardDescription>
              </div>
              {isRunning && (
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Streaming
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {/* Simulated Terminal screen */}
              <div className="bg-zinc-950 p-6 font-mono text-[11px] text-zinc-300 space-y-1.5 max-h-[420px] min-h-[420px] overflow-y-auto border-b border-zinc-900 custom-scrollbar select-none">
                {logs.map((log, idx) => (
                  <div key={idx} className="leading-5">
                    {log.startsWith("[SYSTEM]") ? (
                      <span className="text-indigo-400">{log}</span>
                    ) : log.includes("successfully") || log.includes("closed") ? (
                      <span className="text-emerald-400">{log}</span>
                    ) : log.includes("suspended") || log.includes("exited") ? (
                      <span className="text-amber-400">{log}</span>
                    ) : (
                      <span>{log}</span>
                    )}
                  </div>
                ))}
                {/* Loader or cursor */}
                {isRunning && (
                  <div className="text-zinc-500 animate-pulse flex items-center gap-1 mt-1 font-bold">
                    <span>$ node agent_runner.js ...</span>
                    <span className="bg-indigo-400 h-3.5 w-1.5 inline-block"></span>
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            </CardContent>
            <CardFooter className="py-4 px-6 flex justify-between items-center text-[10px] text-zinc-500">
              <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Terminal captures edge container actions in real-time.</span>
              <button onClick={() => setLogs([])} className="hover:text-white transition-colors">Clear Console Logs</button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
