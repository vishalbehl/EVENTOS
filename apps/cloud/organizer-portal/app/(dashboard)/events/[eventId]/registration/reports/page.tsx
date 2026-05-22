"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { 
  BarChart3, PieChart as PieIcon, Download, Sparkles, RefreshCw, FileText
} from "lucide-react";
import { useEvent } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { apiGet } from "@/lib/api-client";
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as ChartTooltip, Legend, PieChart, Pie, Cell 
} from "recharts";

interface Participant {
  id: string;
  regno: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role: string;
  paid_status: string;
  source: string;
  registered_at: string;
}

export default function ReportsDashboard() {
  const { eventId } = useParams();
  const { data: event } = useEvent(eventId as string);
  
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const list = await apiGet<Participant[]>(`/events/${eventId}/participants`);
      setParticipants(list);
      
      const statsRes = await apiGet<any>(`/events/${eventId}/participants/stats`);
      setStats(statsRes || {});
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load registration analytics reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
  }, [eventId]);

  // Data processing for charts
  // 1. Role distribution
  const roleChartData = Object.entries(stats.role_breakdown || {}).map(([name, value]) => ({
    name,
    count: value
  }));

  // 2. Paid Status Pie Chart
  const paymentChartData = [
    { name: "Paid", value: stats.paid || 0, color: "#10b981" },
    { name: "Unpaid", value: stats.unpaid || 0, color: "#ef4444" }
  ].filter(item => item.value > 0);

  // 3. Registrations over time (group by day)
  const getRegOverTimeData = () => {
    const dailyCounts: Record<string, number> = {};
    participants.forEach(p => {
      if (!p.registered_at) return;
      const dateStr = new Date(p.registered_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      });
      dailyCounts[dateStr] = (dailyCounts[dateStr] || 0) + 1;
    });
    
    // Convert to sorted list
    return Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .reverse(); // Order from oldest to newest if list is descending
  };

  const timelineData = getRegOverTimeData();

  // Export full delegates database to CSV
  const handleExportCSV = () => {
    if (participants.length === 0) {
      toast.error("No delegate data available to export.");
      return;
    }
    
    const headers = ["Registration No", "Full Name", "Email", "Phone", "Company", "Role", "Payment Status", "Source", "Registration Date"];
    const csvRows = [headers.join(",")];
    
    participants.forEach(p => {
      const values = [
        `"${p.regno || ""}"`,
        `"${p.name || ""}"`,
        `"${p.email || ""}"`,
        `"${p.phone || ""}"`,
        `"${p.company || ""}"`,
        `"${p.role || ""}"`,
        `"${p.paid_status || ""}"`,
        `"${p.source || ""}"`,
        `"${p.registered_at ? new Date(p.registered_at).toLocaleDateString() : ""}"`
      ];
      csvRows.push(values.join(","));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `delegates-export-${eventId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV report exported successfully.");
  };

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]/80">Analytics & Insights</span>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mt-1 text-glow-indigo">Intake Reports</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mt-1">
            Review detailed metrics, check-in timelines, category breakdown graphs, and export raw candidate tables.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={handleExportCSV} 
            className="h-12 px-8 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-black uppercase tracking-widest text-[11px] rounded-full border border-emerald-500/20 hover-lift-3d"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button 
            onClick={fetchData} 
            disabled={loading} 
            className="h-12 px-8 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default hover-lift-3d"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh Analytics
          </Button>
        </div>
      </div>

      {/* Analytics Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Timeline Chart */}
        <Card className="lg:col-span-2 p-8 glass-3d border-default rounded-[2.5rem] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover-lift-3d relative overflow-hidden shadow-xl">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="h-4 w-4 text-[var(--pri)]" />
            <h3 className="text-sm font-black uppercase tracking-[0.15em] text-[var(--text)]">Registration Intake Timeline</h3>
          </div>
          <div className="h-[300px] w-full">
            {timelineData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted font-bold">No timeline records found.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                  <YAxis stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                  <ChartTooltip 
                    contentStyle={{ backgroundColor: "var(--surf)", border: "1px solid var(--border-default)", borderRadius: "1rem", fontSize: "11px", color: "var(--text)", fontWeight: "bold" }}
                  />
                  <Bar dataKey="count" fill="var(--pri)" radius={[4, 4, 0, 0]} maxBarSize={45} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Payment breakdown */}
        <Card className="p-8 glass-3d border-default rounded-[2.5rem] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover-lift-3d relative overflow-hidden shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <PieIcon className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-black uppercase tracking-[0.15em] text-[var(--text)]">Payment Breakdown</h3>
            </div>
            <div className="h-[200px] w-full relative">
              {paymentChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted font-bold">No payment metrics.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {paymentChartData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-default/30 text-xs font-black uppercase tracking-widest text-center">
            <div className="text-emerald-500">
              <span className="block text-2xl font-black">{stats.paid || 0}</span>
              <span>Paid</span>
            </div>
            <div className="text-red-500">
              <span className="block text-2xl font-black">{stats.unpaid || 0}</span>
              <span>Unpaid</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Role Breakdown Bar chart */}
      <Card className="p-8 glass-3d border-default rounded-[2.5rem] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover-lift-3d relative overflow-hidden shadow-xl">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="h-4 w-4 text-[var(--sec)]" />
          <h3 className="text-sm font-black uppercase tracking-[0.15em] text-[var(--text)]">Role Category Distribution</h3>
        </div>
        <div className="h-[250px] w-full">
          {roleChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted font-bold">No role distribution metrics.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roleChartData} layout="vertical" margin={{ top: 10, right: 10, left: 30, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                <ChartTooltip />
                <Bar dataKey="count" fill="var(--sec)" radius={[0, 4, 4, 0]} maxBarSize={25} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}
