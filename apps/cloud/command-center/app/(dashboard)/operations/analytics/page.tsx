"use client";

import React, { useState } from "react";
import { 
  BarChart3, Clock, CheckCircle2, TrendingUp, Sparkles, 
  DollarSign, Activity, Percent, ArrowUpRight, ArrowDownRight, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Progress } from "@/components/ui/progress";

export default function OperationalAnalytics() {
  const [activeRange, setActiveRange] = useState("30d");

  // Mock revenue and margin trends
  const revenueTrend = [
    { name: "Jan", Revenue: 45000, COGS: 21000, Margin: 53.3 },
    { name: "Feb", Revenue: 58000, COGS: 26000, Margin: 55.1 },
    { name: "Mar", Revenue: 72000, COGS: 31000, Margin: 56.9 },
    { name: "Apr", Revenue: 64000, COGS: 29000, Margin: 54.6 },
    { name: "May", Revenue: 89000, COGS: 38000, Margin: 57.3 },
    { name: "Jun", Revenue: 104000, COGS: 44000, Margin: 57.6 }
  ];

  const slaComplianceData = [
    { week: "Wk 21", Networking: 100, AV: 98.4, Streaming: 97.2 },
    { week: "Wk 22", Networking: 99.8, AV: 97.9, Streaming: 98.0 },
    { week: "Wk 23", Networking: 100, AV: 99.0, Streaming: 99.2 },
    { week: "Wk 24", Networking: 98.9, AV: 96.5, Streaming: 95.8 },
    { week: "Wk 25", Networking: 100, AV: 98.1, Streaming: 98.8 }
  ];

  const costBreakdown = [
    { category: "Fiber/Networking", Cost: 24000 },
    { category: "A/V Rigging Equipment", Cost: 18500 },
    { category: "Streaming Bandwidth", Cost: 9800 },
    { category: "Signage Controller Units", Cost: 6200 },
    { category: "Specialist Contractors", Cost: 14000 }
  ];

  const summaryKPIs = [
    { label: "Overall Gross Margin", value: "57.6%", delta: "+1.2% vs last month", icon: Percent, isGood: true },
    { label: "YTD Gross Profit", value: "$243,000", delta: "+18.4% YoY growth", icon: DollarSign, isGood: true },
    { label: "SLA Response Rate", value: "99.1%", delta: "-0.2% vs target", icon: Clock, isGood: false },
    { label: "Active Deployments", value: "3 Events", delta: "100% network uptime", icon: Activity, isGood: true }
  ];

  return (
    <div className="space-y-6 p-8 pb-16 overflow-y-auto h-full custom-scrollbar">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-white">
            Operational <span className="bg-gradient-to-r from-violet-400 to-indigo-500 bg-clip-text text-transparent">Analytics</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Gross margins, cost structures, and technical SLA compliance logs.
          </p>
        </div>
        <div className="flex gap-2">
          {["7d", "30d", "90d"].map(r => (
            <button
              key={r}
              onClick={() => setActiveRange(r)}
              className={`text-xs font-extrabold uppercase px-3 py-1.5 rounded-lg border transition-all ${
                activeRange === r 
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" 
                  : "bg-zinc-950/30 border-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {summaryKPIs.map((kpi, idx) => (
          <Card key={idx} className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md p-6 flex flex-col justify-between h-32 hover:border-zinc-700/50 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">{kpi.label}</span>
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-indigo-400">
                <kpi.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="space-y-1 mt-auto">
              <div className="text-2xl font-black text-white">{kpi.value}</div>
              <div className="flex items-center gap-1 text-[10px] font-bold">
                {kpi.isGood ? (
                  <span className="text-emerald-400 flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" /> {kpi.delta}</span>
                ) : (
                  <span className="text-rose-400 flex items-center gap-0.5"><ArrowDownRight className="h-3 w-3" /> {kpi.delta}</span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Primary Chart Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Margin Trend Chart */}
        <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md">
          <CardHeader className="pb-3 border-b border-zinc-900">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-zinc-300">Revenue & Profit Margins</CardTitle>
            <CardDescription className="text-xs text-zinc-500">Monthly gross revenue vs base carrier and hardware COGS.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#18181b" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", borderRadius: "12px" }}
                    itemStyle={{ color: "#e4e4e7" }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="Revenue" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="COGS" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* SLA Compliance Tendency */}
        <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md">
          <CardHeader className="pb-3 border-b border-zinc-900">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-zinc-300">SLA Response Compliance %</CardTitle>
            <CardDescription className="text-xs text-zinc-500">Weekly uptime and setup compliance rates by category.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={slaComplianceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#18181b" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[90, 100]} tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", borderRadius: "12px" }}
                    itemStyle={{ color: "#e4e4e7" }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="Networking" stroke="#10b981" fill="#10b981" fillOpacity={0.05} />
                  <Area type="monotone" dataKey="AV" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.05} />
                  <Area type="monotone" dataKey="Streaming" stroke="#6366f1" fill="#6366f1" fillOpacity={0.05} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Grid: Cost Structures and AI Advisor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Cost structure breakdown */}
        <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md lg:col-span-7">
          <CardHeader className="pb-3 border-b border-zinc-900">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-zinc-300">Cost Structure Distribution</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costBreakdown} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#18181b" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="category" tick={{ fill: "#71717a", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", borderRadius: "12px" }}
                    itemStyle={{ color: "#e4e4e7" }}
                  />
                  <Bar dataKey="Cost" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* AI Recommendations */}
        <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md lg:col-span-5 flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-zinc-900">
            <div className="flex items-center gap-1.5 text-indigo-400">
              <Sparkles className="h-4 w-4" />
              <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-300">AI Operation Insights</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/10 text-xs leading-relaxed text-zinc-400">
              <b className="text-zinc-200">Recommendation:</b> Digital signage media endpoints accounted for 24% of emergency service dispatches in Wk 24. Upgrading to the offline asset-caching framework is projected to improve SLA compliance by 1.8%.
            </div>
            <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/10 text-xs leading-relaxed text-zinc-400">
              <b className="text-zinc-200">Margin Analytics:</b> Networking packages hold the highest gross profit margins (62.4%), while custom streaming contracts have high resource volatility. Prioritize pre-packaging streaming rates.
            </div>
          </CardContent>
          <CardFooter className="pb-6 border-transparent">
            <Button variant="outline" className="w-full border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-white text-xs">
              Generate Export Report
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
