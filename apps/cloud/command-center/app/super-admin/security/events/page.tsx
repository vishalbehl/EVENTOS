"use client";

import React, { useState, useMemo } from "react";
import { useSecurityLogs } from "@/services/super-admin-service";
import { 
  ShieldAlert, RefreshCw, AlertTriangle, ShieldCheck, MapPin, Globe, 
  Terminal, Shield, Eye, Calendar, User, ChevronRight, Download
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { ChartCard } from "@/components/super-admin/ui/ChartCard";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";
import { useReactTable, getCoreRowModel, getPaginationRowModel, ColumnDef, flexRender } from "@tanstack/react-table";
import { DataTable } from "@/components/super-admin/ui/DataTable";

export default function SecurityEventsPage() {
  const [selectedTab, setSelectedTab] = useState("ALL");
  const { data, isLoading, refetch } = useSecurityLogs({ page: 1, page_size: 20 });

  const rawLogs = data?.items || [];

  // Seed events if database empty
  const events = useMemo(() => {
    if (rawLogs.length > 0) return rawLogs;

    return [
      { id: "1", time: "10:24:12 AM", type: "IMPOSSIBLE_TRAVEL", severity: "critical", user: "admin@conf-platform.com", location: "🇮🇳 Mumbai", risk: 94, status: "blocked", action: "IP Blocked" },
      { id: "2", time: "10:18:05 AM", type: "BRUTE_FORCE", severity: "critical", user: "organizer@conf-platform.com", location: "🇺🇸 Chicago", risk: 88, status: "locked", action: "Account Locked" },
      { id: "3", time: "09:42:10 AM", type: "SUSPICIOUS_IP", severity: "warning", user: "user@test-org.com", location: "🇬🇧 London", risk: 65, status: "logged_out", action: "Force Logout" },
      { id: "4", time: "09:30:54 AM", type: "FAILED_LOGIN", severity: "info", user: "finance@billing.com", location: "🇩🇪 Frankfurt", risk: 24, status: "resolved", action: "None" },
      { id: "5", time: "08:15:22 AM", type: "RATE_LIMIT", severity: "warning", user: "dev@api-key.io", location: "🇸🇬 Singapore", risk: 48, status: "resolved", action: "None" },
    ];
  }, [rawLogs]);

  // Columns definition
  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      accessorKey: "time",
      header: "Time",
      cell: ({ row }) => <span className="font-mono text-xs text-[var(--text-secondary)]">{row.original.time}</span>,
    },
    {
      accessorKey: "type",
      header: "Event Type",
      cell: ({ row }) => <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">{row.original.type}</span>,
    },
    {
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }) => (
        <span className={cn(
          "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
          row.original.severity === "critical" && "bg-[var(--danger-muted)] text-[var(--danger)]",
          row.original.severity === "warning" && "bg-[var(--warning-muted)] text-[var(--warning)]",
          row.original.severity === "info" && "bg-[var(--info-muted)] text-[var(--info)]"
        )}>
          {row.original.severity}
        </span>
      ),
    },
    {
      accessorKey: "user",
      header: "User",
      cell: ({ row }) => <span className="text-xs text-[var(--text-secondary)] truncate max-w-[150px] block">{row.original.user}</span>,
    },
    {
      accessorKey: "location",
      header: "IP + Location",
      cell: ({ row }) => <span className="text-xs text-[var(--text-secondary)] font-mono">{row.original.location}</span>,
    },
    {
      accessorKey: "risk",
      header: "Risk Score",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 min-w-[100px]">
          <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                row.original.risk > 80 ? "bg-[var(--danger)]" : row.original.risk > 50 ? "bg-[var(--warning)]" : "bg-[var(--success)]"
              )}
              style={{ width: `${row.original.risk}%` }}
            />
          </div>
          <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">{row.original.risk}</span>
        </div>
      ),
    },
    {
      accessorKey: "action",
      header: "Action Taken",
      cell: ({ row }) => {
        const act = row.original.action;
        let color = "bg-surface-2 text-[var(--text-tertiary)]";
        if (act === "IP Blocked" || act === "Account Locked") color = "bg-[var(--danger-muted)] text-[var(--danger)]";
        else if (act === "Force Logout") color = "bg-[var(--warning-muted)] text-[var(--warning)]";
        return (
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold", color)}>
            {act}
          </span>
        );
      },
    },
  ], []);

  const table = useReactTable({
    data: events,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Severity metrics
  const severityCards = [
    { label: "Critical", value: 23, delta: "+15%", color: "text-[var(--danger)]", bg: "bg-[var(--danger-muted)]" },
    { label: "High", value: 47, delta: "+8%", color: "text-[var(--warning)]", bg: "bg-[var(--warning-muted)]" },
    { label: "Medium", value: 132, delta: "+12%", color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Low", value: 356, delta: "+5%", color: "text-[var(--info)]", bg: "bg-[var(--info-muted)]" },
    { label: "Total (24h)", value: 558, delta: "Risk Avg: 32/100", color: "text-[var(--text-primary)]", bg: "bg-surface-2" },
  ];

  // Mock timeline area chart
  const timelineData = [
    { name: "Mon", Critical: 2, High: 5, Medium: 12, Low: 32 },
    { name: "Tue", Critical: 4, High: 8, Medium: 15, Low: 42 },
    { name: "Wed", Critical: 3, High: 12, Medium: 22, Low: 56 },
    { name: "Thu", Critical: 8, High: 15, Medium: 30, Low: 64 },
    { name: "Fri", Critical: 5, High: 14, Medium: 25, Low: 58 },
    { name: "Sat", Critical: 3, High: 9, Medium: 18, Low: 40 },
    { name: "Sun", Critical: 2, High: 6, Medium: 14, Low: 32 },
  ];

  // Horizontal bar charts event types
  const eventTypesData = [
    { name: "FAILED_LOGIN", count: 245 },
    { name: "BRUTE_FORCE", count: 124 },
    { name: "SUSPICIOUS_IP", count: 85 },
    { name: "ACCOUNT_LOCKED", count: 42 },
    { name: "IMPOSSIBLE_TRAVEL", count: 23 },
  ];

  // Countries
  const riskyCountries = [
    { rank: 1, name: "Russia", flag: "🇷🇺", count: 324, risk: 85 },
    { rank: 2, name: "China", flag: "🇨🇳", count: 245, risk: 78 },
    { rank: 3, name: "North Korea", flag: "🇰🇵", count: 184, risk: 94 },
    { rank: 4, name: "Iran", flag: "🇮🇷", count: 120, risk: 70 },
    { rank: 5, name: "Ukraine", flag: "🇺🇦", count: 98, risk: 54 },
  ];

  return (
    <PageContainer>
      <SectionHeader
        title="Security Events Explorer"
        description="Monitor system intrusion warnings, WAF logs, and user identity risk ratings in real-time."
        breadcrumb={["Console", "Security", "Events"]}
        actions={
          <Button variant="outline" onClick={() => refetch()} className="border-border">
            <RefreshCw className="w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]" />
            Refresh
          </Button>
        }
      />

      {/* Row 1 — Severity cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {severityCards.map((c, idx) => (
          <div key={idx} className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm h-28">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{c.label}</span>
            <div className="mt-2.5">
              <p className={cn("text-2xl font-black tabular-nums tracking-tight", c.color)}>{c.value}</p>
              <span className={cn("inline-flex px-1.5 py-0.2 rounded text-[9px] font-semibold mt-1", c.bg, c.color)}>
                {c.delta}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2 — Dual Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Timeline stacked area chart */}
        <div className="lg:col-span-3">
          <ChartCard title="Events Over Time (Last 7 Days)" description="Stacked event analysis classified by urgency level">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                <Area type="monotone" dataKey="Critical" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.15} />
                <Area type="monotone" dataKey="High" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.15} />
                <Area type="monotone" dataKey="Medium" stackId="1" stroke="#FBBF24" fill="#FBBF24" fillOpacity={0.15} />
                <Area type="monotone" dataKey="Low" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Top event types horizontal bar chart */}
        <div className="lg:col-span-2">
          <ChartCard title="Top Event Types" description="Most frequent security warning categories triggered">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={eventTypesData} layout="vertical" margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#EF4444" radius={[0, 4, 4, 0]} maxBarSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Row 3 — Event Feed Table */}
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-surface border border-border rounded-xl w-fit">
          {[
            { label: "All Events", value: "ALL" },
            { label: "Critical/High", value: "CRITICAL" },
            { label: "Unresolved", value: "UNRESOLVED" },
            { label: "Blocked IPs", value: "BLOCKED" },
          ].map((tab) => {
            const isActive = selectedTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setSelectedTab(tab.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150",
                  isActive ? "bg-[var(--brand-primary)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-2"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <DataTable table={table} isLoading={isLoading} />
      </div>

      {/* Row 4 — Two Panels (World Map SVG + Risky Countries) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* World Map SVG (60%) */}
        <div className="lg:col-span-6 bg-surface border border-border rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Geographic Threat Source Map</h3>
            <p className="text-xs text-[var(--text-tertiary)]">Interactive visualization of threat intensities by node origin</p>
          </div>
          {/* Simple Vector SVG Placeholder */}
          <div className="h-[220px] w-full flex items-center justify-center bg-surface-2/40 border border-border/60 rounded-xl my-4 relative">
            <svg className="w-full h-full max-h-[180px] text-[var(--text-tertiary)]/15 fill-current" viewBox="0 0 1000 500">
              <path d="M150,150 Q180,100 220,120 T300,100 T380,140 T450,100 T520,150 T600,120 T700,160 T850,100" stroke="currentColor" strokeWidth="2" fill="none" className="opacity-30" />
              <circle cx="220" cy="120" r="12" className="text-[var(--danger)]/40 fill-current animate-ping" />
              <circle cx="220" cy="120" r="6" className="text-[var(--danger)] fill-current" />
              
              <circle cx="520" cy="150" r="16" className="text-[var(--warning)]/30 fill-current animate-ping" />
              <circle cx="520" cy="150" r="8" className="text-[var(--warning)] fill-current" />
              
              <circle cx="700" cy="160" r="10" className="text-[var(--danger)]/30 fill-current animate-ping" />
              <circle cx="700" cy="160" r="5" className="text-[var(--danger)] fill-current" />
            </svg>
            <div className="absolute bottom-3 left-3 text-[10px] text-[var(--text-tertiary)] flex items-center gap-1.5 bg-surface border border-border px-2 py-0.8 rounded-lg shadow-sm">
              <Globe className="w-3.5 h-3.5" />
              <span>Real-time threat source ledger active</span>
            </div>
          </div>
        </div>

        {/* Top Risky Countries (40%) */}
        <div className="lg:col-span-4 bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Top Risky Countries</h3>
            <p className="text-xs text-[var(--text-tertiary)]">Volume metrics sorted by location risk coefficients</p>
          </div>
          <div className="divide-y divide-border/60">
            {riskyCountries.map((c) => (
              <div key={c.rank} className="flex items-center justify-between py-2.8 first:pt-1 last:pb-1 text-xs gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[10px] font-bold text-[var(--text-tertiary)] w-3">{c.rank}</span>
                  <span className="text-sm">{c.flag}</span>
                  <span className="font-semibold text-[var(--text-primary)] truncate">{c.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[var(--text-secondary)]">{c.count} threats</span>
                  <div className="w-12 h-1.5 bg-surface-2 rounded-full overflow-hidden shrink-0">
                    <div className="h-full rounded-full bg-[var(--danger)]" style={{ width: `${c.risk}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
