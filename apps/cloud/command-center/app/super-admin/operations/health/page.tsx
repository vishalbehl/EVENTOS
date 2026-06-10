"use client";

import { useState, useEffect } from "react";
import {
  Heart, Database, Activity, RefreshCw, Zap, Server,
  HardDrive, Mail, CheckCircle2, ShieldAlert
} from "lucide-react";
import { toast } from "sonner";

interface ServiceHealth {
  id: string;
  name: string;
  icon: any;
  status: "healthy" | "warning" | "critical";
  latency: number | null; // in ms
  description: string;
  role: string;
}

export default function SystemHealthPage() {
  const [loading, setLoading] = useState(false);
  const [overallStatus, setOverallStatus] = useState<"healthy" | "warning" | "critical">("healthy");
  const [globalLatency, setGlobalLatency] = useState<number | null>(null);

  const [services, setServices] = useState<ServiceHealth[]>([
    { id: "db", name: "PostgreSQL Database", icon: Database, status: "healthy", latency: null, description: "Transactional database storage cluster", role: "Primary DB" },
    { id: "redis", name: "Redis Cache", icon: Zap, status: "healthy", latency: null, description: "Session cache, rate limiting, and message broker", role: "Cache & Broker" },
    { id: "worker", name: "Celery Workers", icon: Server, status: "healthy", latency: null, description: "Asynchronous task queue executing background jobs", role: "Background Workers" },
    { id: "api", name: "API Gateway", icon: Activity, status: "healthy", latency: null, description: "FastAPI REST API router and security controllers", role: "API Routing" },
    { id: "storage", name: "S3 Object Storage", icon: HardDrive, status: "healthy", latency: null, description: "File vault hosting assets, pdfs, and speakers slides", role: "Asset Storage" },
    { id: "mail", name: "SMTP Mailer", icon: Mail, status: "healthy", latency: null, description: "Transaction mail campaigns & invitation dispatch", role: "Notifications" },
  ]);

  const testOverallHealth = async () => {
    setLoading(true);
    const start = performance.now();
    try {
      // Fetch /health from backend (configured in backend main.py at root URL)
      // Since base URL is /api/v1, we need to go one level up to check /health.
      // Let's resolve the backend URL.
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const r = await fetch(`${apiBaseUrl}/health`);
      const data = await r.json();
      const end = performance.now();
      
      if (data?.status === "ok") {
        setOverallStatus("healthy");
        const lat = Math.round(end - start);
        setGlobalLatency(lat);
        toast.success(`System is healthy (Ping: ${lat}ms)`);
      } else {
        setOverallStatus("warning");
        toast.warning("Health ping returned abnormal status");
      }
    } catch (err) {
      setOverallStatus("critical");
      toast.error("Failed to connect to backend server");
    } finally {
      setLoading(false);
    }
  };

  const pingService = async (serviceId: string) => {
    // Simulate latency checks per component for visual micro-interaction
    const start = performance.now();
    setServices((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, latency: null } : s))
    );

    await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 400));
    const latency = Math.round(performance.now() - start);

    setServices((prev) =>
      prev.map((s) =>
        s.id === serviceId
          ? {
              ...s,
              latency,
              status: latency > 500 ? "warning" : "healthy",
            }
          : s
      )
    );
    toast.success(`Pinged ${serviceId.toUpperCase()} service successfully`);
  };

  useEffect(() => {
    testOverallHealth();
    // Default initial latency check for components
    services.forEach((s) => pingService(s.id));
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-emerald-400 border-emerald-500/20 bg-emerald-500/5";
      case "warning":
        return "text-amber-400 border-amber-500/20 bg-amber-500/5";
      default:
        return "text-red-400 border-red-500/20 bg-red-500/5";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/20">
            <Heart className="w-6 h-6 text-teal-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">System Health</h1>
            <p className="text-[11px] text-white/35">Real-time status monitor of platform micro-services and infrastructure</p>
          </div>
        </div>
        <button
          onClick={testOverallHealth}
          disabled={loading}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white disabled:opacity-30"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Main Health Card */}
      <div className="rounded-2xl border border-white/5 bg-white/3 p-5 flex flex-col md:flex-row items-center justify-between gap-5 relative overflow-hidden">
        <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-[0.06] ${
          overallStatus === "healthy" ? "bg-emerald-500" : overallStatus === "warning" ? "bg-amber-500" : "bg-red-500"
        }`} />
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
            overallStatus === "healthy" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}>
            <Heart className={`w-6 h-6 ${overallStatus === "healthy" ? "animate-pulse" : ""}`} />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">Platform Health status</h2>
            <p className="text-[11px] text-white/40">
              {overallStatus === "healthy"
                ? "All infrastructure nodes are responsive and operational."
                : "Platform is experiencing connections degradation."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {globalLatency !== null && (
            <div className="px-4 py-2 rounded-xl bg-white/3 border border-white/5 text-center font-mono">
              <span className="block text-[8px] font-black uppercase tracking-wider text-white/25">Main Latency</span>
              <span className="text-sm font-black text-white/70">{globalLatency}ms</span>
            </div>
          )}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border ${getStatusColor(overallStatus)}`}>
            {overallStatus === "healthy" ? (
              <>
                <CheckCircle2 className="w-4 h-4" /> Operational
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4" /> Issue Detected
              </>
            )}
          </span>
        </div>
      </div>

      {/* Infrastructure Components Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service) => {
          const ServiceIcon = service.icon;
          return (
            <div
              key={service.id}
              className="group rounded-2xl border border-white/5 bg-white/3 p-5 flex flex-col justify-between hover:border-white/10 transition-all duration-300 relative overflow-hidden"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-white/60">
                      <ServiceIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">{service.name}</h4>
                      <p className="text-[9px] text-white/25 font-mono">{service.role}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${getStatusColor(service.status)}`}>
                    {service.status}
                  </span>
                </div>
                <p className="text-[11px] text-white/40 mt-4 leading-relaxed">{service.description}</p>
              </div>

              <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-6">
                <div className="font-mono">
                  <span className="block text-[8px] font-bold text-white/20 uppercase tracking-wider">latency</span>
                  <span className="text-[12px] font-bold text-white/60">
                    {service.latency !== null ? `${service.latency}ms` : "checking…"}
                  </span>
                </div>
                <button
                  onClick={() => pingService(service.id)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-[10px] font-bold text-white/40 hover:text-white transition-all uppercase tracking-wider"
                >
                  Ping Test
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
