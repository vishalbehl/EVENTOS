"use client";

import React, { useState } from "react";
import { 
  BarChart2, Clock, CheckCircle2, AlertTriangle, RefreshCw,
  TrendingUp, Sparkles, UserCheck, ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { ChartCard } from "@/components/super-admin/ui/ChartCard";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function SLAAnalyticsPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsRefreshing(false);
    toast.success("SLA parameters updated");
  };

  // Mock data
  const complianceTrend = [
    { day: "Mon", MetPct: 98.2 },
    { day: "Tue", MetPct: 97.5 },
    { day: "Wed", MetPct: 99.0 },
    { day: "Thu", MetPct: 96.4 },
    { day: "Fri", MetPct: 98.8 },
    { day: "Sat", MetPct: 99.5 },
    { day: "Sun", MetPct: 99.8 },
  ];

  const firstResponseTime = [
    { category: "CRITICAL", Minutes: 12 },
    { category: "HIGH", Minutes: 24 },
    { category: "MEDIUM", Minutes: 120 },
    { category: "LOW", Minutes: 360 },
  ];

  const agentResolutionCount = [
    { name: "Alice", Met: 45, Breached: 1 },
    { name: "Bob", Met: 38, Breached: 0 },
    { name: "Charlie", Met: 52, Breached: 3 },
  ];

  const metrics = [
    { label: "Overall Compliance", value: "98.4%", icon: CheckCircle2, delta: "+0.5% this week" },
    { label: "Avg First Response", value: "18 mins", icon: Clock },
    { label: "Active Breaches", value: "1", icon: ShieldAlert, delta: "Needs attention" },
    { label: "Total Resolved (30d)", value: "1,240", icon: UserCheck }
  ];

  return (
    <PageContainer>
      <SectionHeader
        title="SLA Compliance Analytics"
        description="Monitor system support responsiveness, team resolution efficiencies, and compliance trend telemetry."
        breadcrumb={["Console", "Support", "SLA Analytics"]}
        actions={
          <Button
            variant="outline"
            onClick={handleRefresh}
            size="sm"
            className="border-border"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <MetricRow metrics={metrics} />

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Compliance trends */}
        <ChartCard title="SLA Met % Trend" description="Daily compliance rates mapping target resolution within 24h limit">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={complianceTrend} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
              <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[90, 100]} tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Area type="monotone" dataKey="MetPct" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* First Response Times by Priority */}
        <ChartCard title="Average First Response Time (Minutes)" description="Response latency categorised by SLA ticket urgency level">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={firstResponseTime} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
              <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="category" tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="Minutes" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        
        {/* Resolutions by agent */}
        <div className="lg:col-span-6 bg-surface border border-border rounded-xl p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] border-b border-border/60 pb-2.5 mb-4">Resolutions by Team Agent</h3>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentResolutionCount} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="Met" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={15} />
                <Bar dataKey="Breached" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={15} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI insights & suggestions */}
        <div className="lg:col-span-4 bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-1.5 text-[var(--brand-primary)]">
            <Sparkles className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">AI SLA Telemetry Insights</h3>
          </div>
          
          <div className="space-y-3">
            {[
              { text: "Finance tickets (billing queue) exhibit longest response delays. Recommend increasing consumers on mailers broker.", severity: "warning" },
              { text: "SLA compliance met optimal levels for 4 consecutive days.", severity: "success" },
              { text: "Average response on Critical issues is 12m, exceeding the 15m guarantee threshold.", severity: "success" }
            ].map((insight, idx) => (
              <div key={idx} className={cn(
                "p-3 rounded-lg border text-xs leading-relaxed",
                insight.severity === "warning" ? "bg-[var(--warning-muted)] border-[var(--warning)]/20 text-[var(--text-secondary)]" : "bg-[var(--success-muted)] border-[var(--success)]/20 text-[var(--text-secondary)]"
              )}>
                {insight.text}
              </div>
            ))}
          </div>
        </div>

      </div>

    </PageContainer>
  );
}
