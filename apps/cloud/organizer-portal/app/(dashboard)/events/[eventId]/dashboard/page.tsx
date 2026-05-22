"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Calendar, MapPin, CheckCircle, Clock, ClipboardCheck,
  Zap, Laptop, ShieldCheck, AlertCircle, DollarSign, Activity,
  ArrowRight, FileCheck, HelpCircle, Plus, Mail, Settings, PlayCircle,
  AlertTriangle, Copy, FileWarning, HelpCircle as FileQuestion, Lock, EyeOff, Eye,
  RefreshCw, TrendingUp, BarChart3, PieChart as PieIcon, MonitorPlay
} from "lucide-react";

import { useEvent, useMainDashboardStats } from "@/hooks/useEvents";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuthStore } from "@/store/use-auth-store";
import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

// Recharts imports
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from "recharts";

const CHART_COLORS = ["#6366F1", "#06B6D4", "#A855F7", "#10B981", "#F97316"];

export default function MainEventDashboard() {
  const { eventId } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);

  const { data: event, isLoading: eventLoading } = useEvent(eventId as string);
  const { data: stats, isLoading: statsLoading, refetch } = useMainDashboardStats(eventId as string);

  // WebSocket Integration
  const { socket, isConnected } = useWebSocket(eventId as string);

  const [revealedRevenue, setRevealedRevenue] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleRealtimeUpdate = (payload: any) => {
      console.log("[Socket.IO] Real-time event received, invalidating queries:", payload);
      queryClient.invalidateQueries({ queryKey: ["main-dashboard-stats", eventId] });
    };

    socket.on("file.uploaded", handleRealtimeUpdate);
    socket.on("file.approved", handleRealtimeUpdate);
    socket.on("check_in.created", handleRealtimeUpdate);
    socket.on("device.status", handleRealtimeUpdate);
    socket.on("notification", handleRealtimeUpdate);

    return () => {
      socket.off("file.uploaded", handleRealtimeUpdate);
      socket.off("file.approved", handleRealtimeUpdate);
      socket.off("check_in.created", handleRealtimeUpdate);
      socket.off("device.status", handleRealtimeUpdate);
      socket.off("notification", handleRealtimeUpdate);
    };
  }, [socket, eventId, queryClient]);

  // Floating Actions Toolbar
  useEffect(() => {
    setToolbarActions([
      { label: "Import Schedule", icon: Plus, onClick: () => router.push(`/events/${eventId}/speaker/sessions`) },
      { label: "Send Reminders", icon: Mail, onClick: () => router.push(`/events/${eventId}/speaker/emails`) },
      { label: "Manage Rooms", icon: MapPin, onClick: () => router.push(`/events/${eventId}/speaker/rooms`) },
    ]);
  }, [setToolbarActions, eventId, router]);

  // Check role permission for revenue visibility
  const canViewRevenue = user?.role && ["super_admin", "admin", "organiser"].includes(user.role);

  // Format currency
  const formatCurrency = (amount: number) => {
    const currencyCode = event?.currency || "USD";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Render Custom Tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-3d p-3 border-default rounded-xl shadow-xl text-[11px] font-bold">
          <p className="text-muted mb-1 uppercase tracking-wider">{label}</p>
          {payload.map((item: any, idx: number) => (
            <p key={idx} style={{ color: item.stroke || item.fill }} className="capitalize font-black">
              {item.name}: {item.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Helper for alert colors
  const getAlertStyle = (severity: string) => {
    switch (severity) {
      case "critical":
        return {
          border: "border-red-500/20 bg-red-500/5 hover:border-red-500/30",
          icon: AlertTriangle,
          iconColor: "text-red-500",
          badge: "bg-red-500/10 text-red-500",
        };
      case "warning":
        return {
          border: "border-amber-500/20 bg-amber-500/5 hover:border-amber-500/30",
          icon: AlertCircle,
          iconColor: "text-amber-500",
          badge: "bg-amber-500/10 text-amber-500",
        };
      default:
        return {
          border: "border-blue-500/20 bg-blue-500/5 hover:border-blue-500/30",
          icon: HelpCircle,
          iconColor: "text-blue-500",
          badge: "bg-blue-500/10 text-blue-500",
        };
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "failed_upload":
        return FileWarning;
      case "offline_device":
        return Laptop;
      case "duplicate_registration":
        return Copy;
      case "session_conflict":
        return Calendar;
      case "deadline_warning":
        return Clock;
      default:
        return FileQuestion;
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-12 pb-20 animate-fade-in perspective-1000">
        
        {/* Header Section */}
        <section className="flex flex-col md:flex-row items-center justify-between gap-6 px-2">
          <div className="flex items-center gap-6">
            <div className="h-20 w-20 glass-3d rounded-[2rem] flex flex-col items-center justify-center border-[var(--pri)]/30 shadow-2xl transform -rotate-3 hover:rotate-0 transition-transform">
              <span className="text-[10px] font-black text-[var(--pri)] uppercase tracking-widest">
                {event?.start_date ? new Date(event.start_date).toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }) : '---'}
              </span>
              <span className="text-3xl font-black text-[var(--text)]">
                {event?.start_date ? new Date(event.start_date).toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' }) : '--'}
              </span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo leading-none">
                  {eventLoading ? <Skeleton className="h-10 w-48 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" /> : event?.name}
                </h1>
                {event?.short_code && (
                  <Badge className="bg-[var(--pri)]/10 text-[var(--pri)] border-0 font-black text-[10px] px-3">{event?.short_code}</Badge>
                )}
              </div>
              <p className="text-[11px] font-bold text-muted uppercase tracking-[0.3em]">Consolidated Main Event Surveillance</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              className="h-11 w-11 rounded-xl glass-3d border-default text-muted hover:text-[var(--pri)] hover:border-[var(--pri)]/30"
              title="Manual Telemetry Invalidation"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            
            <div className="text-right mr-4 hidden xl:block">
              <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Global Validation Target</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-[var(--text)]">{stats?.event_readiness_pct || 0}%</span>
                <div className="h-1.5 w-24 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] transition-all duration-1000"
                    style={{ width: `${stats?.event_readiness_pct || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 12 KPI Metrics Grid */}
        <section className="grid gap-6 grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          
          {/* 1. Registrations */}
          <div className="glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center group-hover:bg-[var(--pri)]/20 group-hover:border-[var(--pri)]/40 transition-all text-[var(--pri)]">
                <Users className="h-4.5 w-4.5" />
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--pri)] animate-pulse" />
            </div>
            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1">Registrations</p>
              <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">
                {statsLoading ? <Skeleton className="h-7 w-12 bg-muted/10" /> : stats?.total_registrations}
              </h3>
            </div>
          </div>

          {/* 2. Speakers */}
          <div className="glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-[var(--sec)]/10 border border-[var(--sec)]/20 flex items-center justify-center group-hover:bg-[var(--sec)]/20 group-hover:border-[var(--sec)]/40 transition-all text-[var(--sec)]">
                <Users className="h-4.5 w-4.5" />
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--sec)]" />
            </div>
            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1">Speakers</p>
              <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">
                {statsLoading ? <Skeleton className="h-7 w-12 bg-muted/10" /> : stats?.total_speakers}
              </h3>
            </div>
          </div>

          {/* 3. Sessions */}
          <div className="glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-[var(--acc)]/10 border border-[var(--acc)]/20 flex items-center justify-center group-hover:bg-[var(--acc)]/20 group-hover:border-[var(--acc)]/40 transition-all text-[var(--acc)]">
                <Calendar className="h-4.5 w-4.5" />
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--acc)]" />
            </div>
            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1">Sessions</p>
              <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">
                {statsLoading ? <Skeleton className="h-7 w-12 bg-muted/10" /> : stats?.total_sessions}
              </h3>
            </div>
          </div>

          {/* 4. Active Rooms */}
          <div className="glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/20 group-hover:border-purple-500/40 transition-all text-purple-400">
                <MapPin className="h-4.5 w-4.5" />
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            </div>
            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1">Active Rooms</p>
              <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">
                {statsLoading ? <Skeleton className="h-7 w-12 bg-muted/10" /> : stats?.active_rooms}
              </h3>
            </div>
          </div>

          {/* 5. Completed Uploads */}
          <div className="glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/20 group-hover:border-emerald-500/40 transition-all text-emerald-400">
                <CheckCircle className="h-4.5 w-4.5" />
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </div>
            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1">Uploads Validated</p>
              <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">
                {statsLoading ? <Skeleton className="h-7 w-12 bg-muted/10" /> : stats?.uploads_completed}
              </h3>
            </div>
          </div>

          {/* 6. Pending Uploads */}
          <div className="glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/20 group-hover:border-amber-500/40 transition-all text-amber-400">
                <Clock className="h-4.5 w-4.5" />
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            </div>
            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1">Uploads Pending</p>
              <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">
                {statsLoading ? <Skeleton className="h-7 w-12 bg-muted/10" /> : stats?.uploads_pending}
              </h3>
            </div>
          </div>

          {/* 7. Attendees Checked In */}
          <div className="glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/20 group-hover:border-cyan-500/40 transition-all text-cyan-400">
                <ClipboardCheck className="h-4.5 w-4.5" />
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
            </div>
            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1">Attendees Checked In</p>
              <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">
                {statsLoading ? <Skeleton className="h-7 w-12 bg-muted/10" /> : stats?.attendees_checked_in}
              </h3>
            </div>
          </div>

          {/* 8. Event Readiness */}
          <div className="glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/20 group-hover:border-indigo-500/40 transition-all text-indigo-400">
                <Zap className="h-4.5 w-4.5" />
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
            </div>
            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1">Ecosystem Readiness</p>
              <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">
                {statsLoading ? <Skeleton className="h-7 w-12 bg-muted/10" /> : `${stats?.event_readiness_pct || 0}%`}
              </h3>
            </div>
          </div>

          {/* 9. Room Device Telemetry */}
          <div className="glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/20 group-hover:border-blue-500/40 transition-all text-blue-400">
                <Laptop className="h-4.5 w-4.5" />
              </div>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {stats?.device_status?.offline > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
              </span>
            </div>
            <div className="mt-2">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-0.5">Device Nodes</p>
              <h3 className="text-lg font-black text-[var(--text)] tracking-tight leading-none">
                {statsLoading ? <Skeleton className="h-7 w-16 bg-muted/10" /> : `${stats?.device_status?.online || 0} ON / ${stats?.device_status?.offline || 0} OFF`}
              </h3>
            </div>
          </div>

          {/* 10. Revenue generated (Conditional display) */}
          <div className="glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center group-hover:bg-teal-500/20 group-hover:border-teal-500/40 transition-all text-teal-400">
                <DollarSign className="h-4.5 w-4.5" />
              </div>
              {canViewRevenue && (
                <button 
                  onClick={() => setRevealedRevenue(!revealedRevenue)}
                  className="text-muted hover:text-[var(--text)] transition-colors p-1"
                >
                  {revealedRevenue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1">Total Revenue</p>
              {!canViewRevenue ? (
                <div className="flex items-center gap-1.5 text-muted">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-[11px] font-black tracking-widest uppercase">RESTRICTED</span>
                </div>
              ) : statsLoading ? (
                <Skeleton className="h-7 w-16 bg-muted/10" />
              ) : (
                <h3 className={cn(
                  "text-xl font-black text-[var(--text)] tracking-tighter transition-all duration-300",
                  !revealedRevenue && "blur-md select-none"
                )}>
                  {formatCurrency(stats?.total_revenue || 0)}
                </h3>
              )}
            </div>
          </div>

          {/* 11. Active Staff */}
          <div className="glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]">
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/20 group-hover:border-orange-500/40 transition-all text-orange-400">
                <ShieldCheck className="h-4.5 w-4.5" />
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            </div>
            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1">Active Staff</p>
              <h3 className="text-2xl font-black text-[var(--text)] tracking-tighter">
                {statsLoading ? <Skeleton className="h-7 w-12 bg-muted/10" /> : stats?.active_staff_count}
              </h3>
            </div>
          </div>

          {/* 12. Alert Count */}
          <div className={cn(
            "glass-3d p-5 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]",
            stats?.alert_count > 0 ? "border-red-500/20" : "border-default"
          )}>
            <div className="flex items-center justify-between">
              <div className={cn(
                "h-9 w-9 rounded-xl flex items-center justify-center transition-all",
                stats?.alert_count > 0
                  ? "bg-red-500/15 border border-red-500/30 text-red-400 group-hover:bg-red-500/25"
                  : "bg-gray-500/10 border border-gray-500/20 text-muted group-hover:bg-gray-500/20"
              )}>
                <AlertCircle className="h-4.5 w-4.5" />
              </div>
              {stats?.alert_count > 0 && (
                <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
              )}
            </div>
            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1">Ecosystem Alerts</p>
              <h3 className={cn(
                "text-2xl font-black tracking-tighter",
                stats?.alert_count > 0 ? "text-red-400" : "text-[var(--text)]"
              )}>
                {statsLoading ? <Skeleton className="h-7 w-12 bg-muted/10" /> : stats?.alert_count}
              </h3>
            </div>
          </div>

        </section>

        {/* Analytics Charts Grid */}
        <section className="space-y-10">
          
          {/* Row 1: Area charts (Velocity / Growth) */}
          <div className="grid gap-8 lg:grid-cols-2">
            
            {/* Chart A: Registration Growth */}
            <Card className="glass-3d border-default rounded-[2.5rem] p-8 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted mb-1">Registration Growth</h3>
                  <p className="text-[10px] text-muted uppercase font-bold tracking-widest">Cumulative participants registered</p>
                </div>
                <TrendingUp className="h-4 w-4 text-[var(--pri)] animate-pulse" />
              </div>
              <div className="flex-1 min-h-[280px]">
                {statsLoading ? (
                  <Skeleton className="h-full w-full bg-muted/10 rounded-2xl" />
                ) : stats?.registration_growth?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={stats.registration_growth} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--pri)" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="var(--pri)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="value" name="Registrations" stroke="var(--pri)" strokeWidth={2} fillOpacity={1} fill="url(#regGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center border border-dashed border-default rounded-2xl py-12">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">No registration telemetry recorded</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Chart B: Upload Velocity */}
            <Card className="glass-3d border-default rounded-[2.5rem] p-8 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted mb-1">Asset Upload Velocity</h3>
                  <p className="text-[10px] text-muted uppercase font-bold tracking-widest">Presenter uploads received per day</p>
                </div>
                <Activity className="h-4 w-4 text-[var(--sec)]" />
              </div>
              <div className="flex-1 min-h-[280px]">
                {statsLoading ? (
                  <Skeleton className="h-full w-full bg-muted/10 rounded-2xl" />
                ) : stats?.upload_completion_trends?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={stats.upload_completion_trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--sec)" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="var(--sec)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="value" name="Uploads" stroke="var(--sec)" strokeWidth={2} fillOpacity={1} fill="url(#uploadGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center border border-dashed border-default rounded-2xl py-12">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">No uploads recorded in this window</p>
                  </div>
                )}
              </div>
            </Card>

          </div>

          {/* Row 2: Demographics, Session Dist, Room Occupancy */}
          <div className="grid gap-8 lg:grid-cols-3">
            
            {/* Chart C: Attendee Demographics (Donut) */}
            <Card className="glass-3d border-default rounded-[2.5rem] p-8 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted mb-1">Geographic Spreads</h3>
                  <p className="text-[10px] text-muted uppercase font-bold tracking-widest">Top 5 participant countries</p>
                </div>
                <PieIcon className="h-4 w-4 text-[var(--acc)]" />
              </div>
              <div className="flex-1 min-h-[220px] flex items-center justify-center">
                {statsLoading ? (
                  <Skeleton className="h-40 w-40 rounded-full bg-muted/10" />
                ) : stats?.attendee_demographics?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={stats.attendee_demographics}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                        nameKey="label"
                      >
                        {stats.attendee_demographics.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 9, paddingTop: 10 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted">No demographic datasets</p>
                )}
              </div>
            </Card>

            {/* Chart D: Session Distribution by Room */}
            <Card className="glass-3d border-default rounded-[2.5rem] p-8 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted mb-1">Session Clusters</h3>
                  <p className="text-[10px] text-muted uppercase font-bold tracking-widest">Scheduled sessions per room</p>
                </div>
                <BarChart3 className="h-4 w-4 text-purple-400" />
              </div>
              <div className="flex-1 min-h-[220px]">
                {statsLoading ? (
                  <Skeleton className="h-full w-full bg-muted/10 rounded-xl" />
                ) : stats?.session_distribution?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.session_distribution} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="Sessions" fill="var(--pri)" radius={[4, 4, 0, 0]}>
                        {stats.session_distribution.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill="var(--pri)" opacity={0.6 + (index % 3) * 0.2} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">No scheduled rooms mapped</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Chart E: Room Occupancy */}
            <Card className="glass-3d border-default rounded-[2.5rem] p-8 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted mb-1">Room Occupancy</h3>
                  <p className="text-[10px] text-muted uppercase font-bold tracking-widest">Total scheduled hours per room</p>
                </div>
                <MapPin className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-h-[220px]">
                {statsLoading ? (
                  <Skeleton className="h-full w-full bg-muted/10 rounded-xl" />
                ) : stats?.room_occupancy?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.room_occupancy} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={9} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="Hours" fill="var(--sec)" radius={[4, 4, 0, 0]}>
                        {stats.room_occupancy.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill="var(--sec)" opacity={0.6 + (index % 3) * 0.2} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">No occupancy telemetry compiled</p>
                  </div>
                )}
              </div>
            </Card>

          </div>

          {/* Row 3: Heatmap & Upload Funnel */}
          <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
            
            {/* Chart F: Daily Activity Heatmap */}
            <Card className="glass-3d border-default rounded-[2.5rem] p-8 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted mb-1">Check-in Activity Heatmap</h3>
                  <p className="text-[10px] text-muted uppercase font-bold tracking-widest">Registrant check-in intensity (DOW vs Hour)</p>
                </div>
                <Activity className="h-4 w-4 text-[var(--pri)]" />
              </div>
              
              <div className="flex-1 overflow-x-auto select-none no-scrollbar">
                {statsLoading ? (
                  <Skeleton className="h-56 w-full bg-muted/10 rounded-2xl" />
                ) : stats?.daily_activity_heatmap?.length > 0 ? (
                  <div className="min-w-[650px] space-y-2">
                    {/* Header: hours */}
                    <div className="flex items-center text-[8px] font-black text-muted uppercase">
                      <div className="w-12 text-left shrink-0">DOW</div>
                      <div className="flex justify-between flex-1 px-1">
                        {Array.from({ length: 24 }).map((_, hr) => (
                          <div key={hr} className="w-6 text-center text-[7px]">
                            {hr.toString().padStart(2, "0")}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Rows */}
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => {
                      const dayData = stats.daily_activity_heatmap.filter((h: any) => h.day === day);
                      return (
                        <div key={day} className="flex items-center">
                          <div className="w-12 text-[10px] font-black text-muted text-left uppercase shrink-0">
                            {day}
                          </div>
                          <div className="flex flex-1 justify-between px-1 gap-1">
                            {Array.from({ length: 24 }).map((_, hr) => {
                              const cell = dayData.find((d: any) => d.hour === hr);
                              const val = cell ? cell.value : 0;
                              
                              // Determine opacity based on scale
                              let bgStyle = "bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-white/5";
                              if (val > 0 && val <= 2) bgStyle = "bg-[var(--pri)]/20 border border-[var(--pri)]/10";
                              else if (val > 2 && val <= 5) bgStyle = "bg-[var(--pri)]/40 border border-[var(--pri)]/20";
                              else if (val > 5 && val <= 10) bgStyle = "bg-[var(--pri)]/70 border border-[var(--pri)]/35";
                              else if (val > 10) bgStyle = "bg-[var(--pri)] border border-[var(--pri)] shadow-[0_0_8px_var(--pri)]";

                              return (
                                <div
                                  key={hr}
                                  className={cn(
                                    "w-6 h-6 rounded-md transition-all hover:scale-125 hover:z-10 cursor-pointer relative group/cell",
                                    bgStyle
                                  )}
                                  title={`${day} @ ${hr.toString().padStart(2, "0")}:00 — ${val} check-ins`}
                                >
                                  {/* Micro Tooltip */}
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/cell:block z-50 glass-3d border-default px-2 py-1 rounded text-[8px] font-black text-glow-indigo pointer-events-none whitespace-nowrap">
                                    {val} check-ins
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-56 flex items-center justify-center border border-dashed border-default rounded-2xl">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">No check-in telemetry compiled</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Chart G: Speaker Upload Funnel (Progression) */}
            <Card className="glass-3d border-default rounded-[2.5rem] p-8 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted">Speaker Intake Funnel</h3>
                <TrendingUp className="h-4 w-4 text-[var(--pri)]" />
              </div>
              
              <div className="flex flex-col gap-5 flex-1 justify-center">
                {statsLoading ? (
                  <Skeleton className="h-48 w-full bg-muted/10 rounded-xl" />
                ) : stats?.speaker_upload_progress ? (
                  (() => {
                    const funnel = stats.speaker_upload_progress;
                    const stages = [
                      { label: "Invited Speakers", val: funnel.invited, color: "bg-[var(--pri)]/20", pct: 100 },
                      { label: "Uploads Received", val: funnel.uploaded, color: "bg-[var(--pri)]/40", pct: funnel.invited > 0 ? Math.round((funnel.uploaded / funnel.invited) * 100) : 0 },
                      { label: "Validated Assets", val: funnel.approved, color: "bg-[var(--pri)]/70", pct: funnel.uploaded > 0 ? Math.round((funnel.approved / funnel.uploaded) * 100) : 0 },
                      { label: "Pending Revision", val: funnel.pending, color: "bg-amber-500/50", pct: funnel.uploaded > 0 ? Math.round((funnel.pending / funnel.uploaded) * 100) : 0 }
                    ];

                    return stages.map((stage, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-muted">
                          <span>{stage.label}</span>
                          <span>{stage.val} <span className="opacity-50">({stage.pct}%)</span></span>
                        </div>
                        <div className="h-7 w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-lg overflow-hidden relative border border-default/50">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stage.pct}%` }}
                            transition={{ delay: idx * 0.15, duration: 1 }}
                            className={cn("h-full relative overflow-hidden", stage.color)}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent" />
                          </motion.div>
                        </div>
                      </div>
                    ));
                  })()
                ) : (
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted text-center py-12">No funnel telemetry compileable</p>
                )}
              </div>
            </Card>

          </div>

        </section>

        {/* Alerts & Live Activity Split Feed */}
        <div className="grid gap-10 lg:grid-cols-[1fr_460px]">
          
          {/* Centralized Alert Center */}
          <Card className="glass-3d border-default rounded-[2.5rem] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-default flex items-center justify-between bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted flex items-center gap-3">
                <AlertCircle className="h-4.5 w-4.5 text-red-400" /> Alert Center Board
              </h3>
              {stats?.alerts?.length > 0 && (
                <Badge className="bg-red-500/10 text-red-500 border-0 font-black text-[9px] px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                  {stats.alerts.length} Detected
                </Badge>
              )}
            </div>
            
            <div className="p-6 flex-1 max-h-[450px] overflow-y-auto pr-2 space-y-4 no-scrollbar">
              {statsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full bg-muted/10 rounded-2xl" />
                  <Skeleton className="h-20 w-full bg-muted/10 rounded-2xl" />
                </div>
              ) : stats?.alerts?.length > 0 ? (
                <AnimatePresence>
                  {stats.alerts.map((alert: any) => {
                    const config = getAlertStyle(alert.severity);
                    const SpecificIcon = getAlertIcon(alert.type);
                    
                    return (
                      <motion.div
                        key={alert.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={cn(
                          "p-4 rounded-2xl border transition-all duration-300 flex gap-4 items-start relative group",
                          config.border
                        )}
                      >
                        <div className={cn("h-9 w-9 rounded-xl border border-default flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--text)_4%,transparent)]", config.iconColor)}>
                          <SpecificIcon className="h-4.5 w-4.5" />
                        </div>
                        <div className="flex-1 min-w-0 pr-8">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-mono text-muted">
                              {new Date(alert.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST
                            </span>
                            <Badge className={cn("border-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5", config.badge)}>
                              {alert.severity}
                            </Badge>
                          </div>
                          <p className="text-[12px] font-bold text-[var(--text)] leading-snug">
                            {alert.message}
                          </p>
                        </div>

                        {/* Quick action fixer */}
                        <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            className="h-7 px-3 bg-[var(--pri)]/10 hover:bg-[var(--pri)] text-[10px] font-black uppercase tracking-wider text-[var(--text)] hover:text-white rounded-lg border-0"
                            onClick={() => {
                              if (alert.type === "failed_upload" || alert.type === "missing_file") {
                                router.push(`/events/${eventId}/speaker/files`);
                              } else if (alert.type === "offline_device") {
                                router.push(`/events/${eventId}/speaker/rooms`);
                              } else if (alert.type === "session_conflict") {
                                router.push(`/events/${eventId}/speaker/sessions`);
                              } else {
                                router.push(`/events/${eventId}/speaker/configuration`);
                              }
                            }}
                          >
                            Resolve <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              ) : (
                <div className="py-20 text-center flex flex-col items-center justify-center">
                  <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <h4 className="text-[12px] font-black text-muted uppercase tracking-[0.2em] mb-1">Ecosystem Stable</h4>
                  <p className="text-[10px] text-muted uppercase tracking-tighter">No telemetry conflict nodes scanned</p>
                </div>
              )}
            </div>
          </Card>

          {/* Live Activity Feed */}
          <Card className="glass-3d border-default rounded-[2.5rem] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-default flex items-center justify-between bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted flex items-center gap-3">
                <Activity className="h-4.5 w-4.5 text-[var(--pri)]" /> Live Operation Stream
              </h3>
              <Badge className="bg-[var(--pri)]/10 text-[var(--pri)] border-0 font-black text-[9px] px-2 py-0.5 rounded-md uppercase tracking-widest animate-pulse">
                Websocket Sync Active
              </Badge>
            </div>
            
            <div className="p-6 flex-1 max-h-[450px] overflow-y-auto pr-2 space-y-4 no-scrollbar">
              {statsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-14 w-full bg-muted/10 rounded-2xl" />
                  <Skeleton className="h-14 w-full bg-muted/10 rounded-2xl" />
                </div>
              ) : stats?.recent_activity?.length > 0 ? (
                <div className="space-y-4 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/5">
                  {stats.recent_activity.map((activity: any, idx: number) => (
                    <div key={idx} className="relative pl-10 flex gap-3 items-start group">
                      <div className="absolute left-[11px] top-1.5 h-3.5 w-3.5 rounded-full border-4 border-[var(--surf)] bg-[var(--pri)] shadow-md transition-transform group-hover:scale-125 z-10" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="text-[12px] font-bold text-[var(--text)] group-hover:text-[var(--pri)] transition-colors">
                            {activity.description}
                          </p>
                          <span className="text-[9px] font-mono text-muted shrink-0">
                            {new Date(activity.occurred_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                          </span>
                        </div>
                        {activity.speaker_name && (
                          <p className="text-[8.5px] font-black text-muted uppercase tracking-wider">
                            Origin Node: {activity.speaker_name}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center flex flex-col items-center justify-center">
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest">No activities in current epoch</p>
                </div>
              )}
            </div>
          </Card>

        </div>

        {/* Upcoming Section (Timeline & Deadlines) */}
        <section className="grid gap-10 lg:grid-cols-[1fr_460px]">
          
          {/* Upcoming Sessions (Timeline List) */}
          <Card className="glass-3d border-default rounded-[2.5rem] p-8 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted flex items-center gap-3">
                <PlayCircle className="h-4.5 w-4.5 text-[var(--pri)]" /> Upcoming Session Timeline
              </h3>
              <Badge className="bg-[var(--pri)]/10 text-[var(--pri)] border-0 font-black text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider">
                Next 5
              </Badge>
            </div>
            
            <div className="space-y-6 flex-1">
              {statsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-16 w-full bg-muted/10 rounded-2xl" />
                  <Skeleton className="h-16 w-full bg-muted/10 rounded-2xl" />
                </div>
              ) : stats?.upcoming_sessions?.length > 0 ? (
                stats.upcoming_sessions.map((sess: any) => (
                  <div key={sess.id} className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default/50 hover:border-default transition-all flex justify-between gap-4">
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-bold text-[var(--text)] truncate mb-1">
                        {sess.name}
                      </h4>
                      {sess.speaker_names?.length > 0 && (
                        <p className="text-[10px] text-muted font-black uppercase tracking-wider truncate mb-2">
                          Speakers: {sess.speaker_names.join(", ")}
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-purple-500/10 text-purple-400 border-0 font-black text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-md">
                          Room: {sess.room_name || "Unassigned"}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-black text-[var(--pri)] tracking-tight">
                        {new Date(sess.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                      </p>
                      <p className="text-[9px] font-black text-muted uppercase tracking-widest mt-1">
                        {new Date(sess.start_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted">No sessions scheduled in this epoch</p>
                </div>
              )}
            </div>
          </Card>

          {/* Operational Deadlines (Milestones) */}
          <Card className="glass-3d border-default rounded-[2.5rem] p-8 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted flex items-center gap-3">
                <Calendar className="h-4.5 w-4.5 text-[var(--warn)]" /> Operational Milestones
              </h3>
              <Badge className="bg-[var(--warn)]/10 text-[var(--warn)] border-0 font-black text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider">
                Critical Checklist
              </Badge>
            </div>
            
            <div className="space-y-8 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/5 flex-1 justify-center flex flex-col">
              {statsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full bg-muted/10 rounded-xl" />
                  <Skeleton className="h-10 w-full bg-muted/10 rounded-xl" />
                </div>
              ) : stats?.upcoming_deadlines?.length > 0 ? (
                stats.upcoming_deadlines.map((milestone: any, idx: number) => {
                  let badgeStyle = "bg-gray-500/10 text-muted";
                  let dotStyle = "bg-gray-500";
                  if (milestone.status === "Critical") {
                    badgeStyle = "bg-red-500/10 text-red-400";
                    dotStyle = "bg-red-500 animate-pulse";
                  } else if (milestone.status === "Upcoming") {
                    badgeStyle = "bg-amber-500/10 text-amber-400";
                    dotStyle = "bg-amber-500";
                  } else if (milestone.status === "Passed") {
                    badgeStyle = "bg-emerald-500/10 text-emerald-400";
                    dotStyle = "bg-emerald-500";
                  }

                  return (
                    <div key={idx} className="relative pl-10 group">
                      <div className={cn("absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-4 border-[var(--surf)] shadow-lg transition-transform group-hover:scale-125 z-10", dotStyle)} />
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[12px] font-bold text-[var(--text)] group-hover:text-[var(--pri)] transition-colors">
                          {milestone.title}
                        </p>
                        <Badge className={cn("border-0 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md", badgeStyle)}>
                          {milestone.status}
                        </Badge>
                      </div>
                      <p className="text-[10px] font-mono text-muted">
                        {new Date(milestone.time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted">No checklist checkpoints compiled</p>
                </div>
              )}
            </div>
          </Card>

        </section>

      </div>
    </TooltipProvider>
  );
}
