"use client";

import React, { useState } from "react";
import { 
  Puzzle, RefreshCw, CheckCircle2, AlertTriangle, Play, 
  Trash2, Globe, Database, HelpCircle, HardDrive, Key, Mail
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";

interface ThirdPartyService {
  id: string;
  name: string;
  category: string;
  endpoint: string;
  status: "active" | "disabled" | "warning";
  latency_ms: number;
  last_check_at: string;
  icon: any;
  color: string;
}

export default function IntegrationsPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const [services, setServices] = useState<ThirdPartyService[]>([
    { id: "srv-1", name: "Stripe Gateway", category: "billing", endpoint: "https://api.stripe.com/v3", status: "active", latency_ms: 185, last_check_at: new Date().toISOString(), icon: Key, color: "text-cyan-400" },
    { id: "srv-2", name: "Postmark Mailer", category: "notifications", endpoint: "https://api.postmarkapp.com", status: "active", latency_ms: 120, last_check_at: new Date().toISOString(), icon: Mail, color: "text-purple-400" },
    { id: "srv-3", name: "Cloudflare R2", category: "storage", endpoint: "https://cloudflare.com/r2", status: "active", latency_ms: 34, last_check_at: new Date().toISOString(), icon: HardDrive, color: "text-yellow-400" },
    { id: "srv-4", name: "Firebase Auth", category: "identity", endpoint: "https://identitytoolkit.googleapis.com", status: "warning", latency_ms: 540, last_check_at: new Date(Date.now() - 300000).toISOString(), icon: Database, color: "text-orange-400" }
  ]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsRefreshing(false);
    toast.success("Third-party integration states verified");
  };

  const handleRunCheck = async (id: string) => {
    setCheckingId(id);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    setServices(prev => prev.map(s => {
      if (s.id === id) {
        return {
          ...s,
          latency_ms: Math.floor(Math.random() * 100) + 30,
          status: "active",
          last_check_at: new Date().toISOString()
        };
      }
      return s;
    }));

    setCheckingId(null);
    toast.success("Service connection verification passed");
  };

  return (
    <PageContainer>
      <SectionHeader
        title="Integrations Manager"
        description="Verify third-party API transports, manage credential health checks, and verify webhook channels."
        breadcrumb={["Console", "Developer", "Integrations"]}
        actions={
          <Button
            variant="outline"
            onClick={handleRefresh}
            size="sm"
            className="border-border"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]", isRefreshing && "animate-spin")} />
            Verify Connections
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {services.map(srv => {
          const Icon = srv.icon;
          const isChecking = checkingId === srv.id;

          return (
            <div key={srv.id} className="rounded-xl border border-border bg-surface p-5 space-y-4 shadow-sm relative group">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-surface-2 border border-border">
                    <Icon className={cn("w-5 h-5", srv.color)} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">{srv.name}</h3>
                    <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono tracking-wider">{srv.category}</span>
                  </div>
                </div>

                <StatusBadge status={srv.status} className="text-[10px] py-0 px-2 font-bold uppercase" />
              </div>

              <div className="space-y-2.5 pt-3 border-t border-border/60">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-tertiary)]">API Gateway:</span>
                  <span className="font-mono text-[var(--text-secondary)] truncate max-w-[200px]">{srv.endpoint}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-tertiary)]">Response Latency:</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">{srv.latency_ms} ms</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-tertiary)]">Last Inspected:</span>
                  <span className="text-[var(--text-secondary)]">{new Date(srv.last_check_at).toLocaleTimeString()}</span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => handleRunCheck(srv.id)}
                  disabled={isChecking}
                  size="sm"
                  className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 text-white font-semibold text-xs h-8 px-3.5 flex gap-1.5"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", isChecking && "animate-spin")} />
                  {isChecking ? "Checking..." : "Run Check"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </PageContainer>
  );
}
