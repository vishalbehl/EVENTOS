"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Layers, CheckCircle2, Shield, ArrowRight, RefreshCw, 
  Wifi, HelpCircle, HardDrive, Clock, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";

export default function TechnologyServicesDashboard() {
  const { eventId } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData({
        requestsSummary: {
          total: 6,
          pending: 1,
          approved: 4,
          inProgress: 1
        },
        slaTier: {
          name: "Platinum Enterprise",
          responseTime: "15 min response target",
          activeTickets: 0
        },
        readinessScore: 82.5,
        provisioning: {
          bandwidth: "1 Gbps Dedicated Fiber",
          badgePrinters: "10x High-Speed Thermal",
          avSetup: "Dual Keynote Presentation Rig",
          networkCoverage: "Wi-Fi 6 Mesh active"
        }
      });
      setLoading(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex h-[75vh] items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-10 w-10 animate-spin text-indigo-500" />
          <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Loading Customer Console...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8 pb-16 overflow-y-auto h-full custom-scrollbar">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Technology <span className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">Services Portal</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage your venue requirements, network provisioning, and technical requests
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => router.push(`/technology-services/requests`)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-lg shadow-lg shadow-indigo-600/20 hover:scale-[1.02] transition-all"
          >
            Submit Request <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Stats & SLA */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md flex flex-col justify-between h-40 hover:border-zinc-700/50 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Total Requests</span>
                <div className="p-2 rounded-lg bg-zinc-800/80 text-zinc-300">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-black text-white">{data.requestsSummary.total}</div>
                <div className="text-zinc-500 text-xs font-medium">{data.requestsSummary.pending} awaiting approval</div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md flex flex-col justify-between h-40 hover:border-zinc-700/50 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">SLA Status</span>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Shield className="h-4 w-4" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-lg font-black text-emerald-400">{data.slaTier.name}</div>
                <div className="text-zinc-500 text-xs font-medium">{data.slaTier.responseTime}</div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md flex flex-col justify-between h-40 hover:border-zinc-700/50 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Event Readiness</span>
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-black text-white">{data.readinessScore}%</span>
                </div>
                <Progress value={data.readinessScore} className="h-1.5" />
              </div>
            </div>
          </div>

          {/* Provisioned Specs */}
          <div className="p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800/40 backdrop-blur-md space-y-6">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <HardDrive className="text-indigo-400 h-5 w-5" /> Active Provisioned Setup
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex items-start gap-4">
                <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 mt-0.5">
                  <Wifi className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Network Provisioning</div>
                  <div className="text-zinc-200 text-sm font-semibold mt-1">{data.provisioning.bandwidth}</div>
                  <div className="text-zinc-500 text-xs mt-1">Managed primary link active</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex items-start gap-4">
                <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 mt-0.5">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-zinc-400 text-xs font-bold uppercase tracking-wider">On-Site Badging</div>
                  <div className="text-zinc-200 text-sm font-semibold mt-1">{data.provisioning.badgePrinters}</div>
                  <div className="text-zinc-500 text-xs mt-1">Pre-tested in local inventory</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex items-start gap-4">
                <div className="p-2.5 rounded-lg bg-pink-500/10 text-pink-400 mt-0.5">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Keynote AV Package</div>
                  <div className="text-zinc-200 text-sm font-semibold mt-1">{data.provisioning.avSetup}</div>
                  <div className="text-zinc-500 text-xs mt-1">Assigned Dante sound console</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex items-start gap-4">
                <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 mt-0.5">
                  <Wifi className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Wi-Fi Network</div>
                  <div className="text-zinc-200 text-sm font-semibold mt-1">{data.provisioning.networkCoverage}</div>
                  <div className="text-zinc-500 text-xs mt-1">Custom SSID & captive portal active</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Quick Links & Contact */}
        <div className="space-y-8">
          <div className="p-8 rounded-2xl bg-gradient-to-br from-indigo-900/20 to-purple-950/20 border border-indigo-500/20 backdrop-blur-md space-y-6">
            <h3 className="text-md font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="text-indigo-400 h-5 w-5" /> Quick Operations Actions
            </h3>
            <div className="space-y-3">
              <Button 
                onClick={() => router.push(`/technology-services/requests`)}
                variant="outline"
                className="w-full justify-between hover:bg-zinc-800 border-zinc-800 hover:text-white"
              >
                <span>Launch Requirements Wizard</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button 
                onClick={() => router.push(`/technology-services/quotes`)}
                variant="outline"
                className="w-full justify-between hover:bg-zinc-800 border-zinc-800 hover:text-white"
              >
                <span>Review Estimate Quotes</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button 
                onClick={() => router.push(`/technology-services/status`)}
                variant="outline"
                className="w-full justify-between hover:bg-zinc-800 border-zinc-800 hover:text-white"
              >
                <span>Check Deployments & SLA Status</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800/40 backdrop-blur-md space-y-4">
            <h3 className="text-md font-bold text-white">Need Urgent Technical Help?</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              For immediate support regarding networking outages, badge print queue locks, or SRR equipment issues, contact our dedicated operations desk.
            </p>
            <div className="border-t border-zinc-800/60 pt-4 mt-2">
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Direct Dispatch Line</div>
              <div className="text-sm font-semibold text-zinc-200 mt-0.5">+1 (800) EVENTOS-TECH</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
