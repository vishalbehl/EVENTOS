"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, FileUp, ClipboardCheck, CheckCircle, Clock, XCircle,
  TrendingUp, Calendar, AlertCircle, Plus, Mail,
  CheckSquare, LayoutGrid, ChevronRight, MoreHorizontal,
  History, ArrowRight, Activity, Zap, PlayCircle,
  BarChart as BarChartIcon, MapPin, Laptop, ShieldCheck,
  AlertTriangle, FileWarning, HelpCircle as FileQuestion,
  Copy, RefreshCw, Upload, ToggleLeft, ToggleRight, Check
} from "lucide-react";
import { toast } from "sonner";

import { useEvent, useDashboardStats, useActivity, useMainDashboardStats, useUpdateEvent } from "@/hooks/useEvents";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuthStore } from "@/store/use-auth-store";
import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { cn, getFallbackTimezone, getTimezoneAbbrev } from "@/lib/utils";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";

import { DailyUploadsChart } from "@/components/dashboard/DailyUploadsChart";
import { RoomReadinessChart } from "@/components/dashboard/RoomReadinessChart";
import { ReadinessHeatmap } from "@/components/dashboard/ReadinessHeatmap";
import { ScheduleImportModal } from "@/components/events/ScheduleImportModal";

// Recharts imports
import {
  BarChart as RechartsBarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

export default function EventOverviewPage() {
  const { eventId } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const updateEvent = useUpdateEvent(eventId as string);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  // Data fetching
  const { data: event, isLoading: eventLoading } = useEvent(eventId as string);
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useDashboardStats(eventId as string);
  const { data: mainStats, isLoading: mainLoading, refetch: refetchMain } = useMainDashboardStats(eventId as string);
  const { data: activity, isLoading: activityLoading } = useActivity(eventId as string, 5);

  // WebSocket connection
  const { socket } = useWebSocket(eventId as string);

  const isLive = event?.speaker_settings?.enabled ?? false;
  const portalUrl = `${process.env.NEXT_PUBLIC_SPEAKER_PORTAL_URL || "http://localhost:3001"}/${eventId}`;

  const handleToggleLive = async () => {
    setToggling(true);
    try {
      await updateEvent.mutateAsync({
        speaker_settings: { enabled: !isLive, window_required: event?.speaker_settings?.window_required ?? true }
      });
      toast.success(!isLive ? "Portal is now LIVE 🚀" : "Portal set to Draft");
    } catch {
      toast.error("Failed to update portal status.");
    } finally {
      setToggling(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!socket) return;

    const handleRealtimeUpdate = (payload: any) => {
      console.log("[Socket.IO] Real-time event received, invalidating queries:", payload);
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", eventId] });
      queryClient.invalidateQueries({ queryKey: ["main-dashboard-stats", eventId] });
      queryClient.invalidateQueries({ queryKey: ["activity", eventId] });
    };

    socket.on("file.uploaded", handleRealtimeUpdate);
    socket.on("file.approved", handleRealtimeUpdate);
    socket.on("device.status", handleRealtimeUpdate);
    socket.on("notification", handleRealtimeUpdate);

    return () => {
      socket.off("file.uploaded", handleRealtimeUpdate);
      socket.off("file.approved", handleRealtimeUpdate);
      socket.off("device.status", handleRealtimeUpdate);
      socket.off("notification", handleRealtimeUpdate);
    };
  }, [socket, eventId, queryClient]);

  // Floating Actions Toolbar
  useEffect(() => {
    setToolbarActions([
      { label: "Import Schedule", icon: Plus, onClick: () => setIsImportOpen(true), color: "bg-[var(--pri)]/10" },
      { label: "Send Reminders", icon: Mail, onClick: () => router.push(`/events/${eventId}/speaker/emails`) },
      { label: "Manage Rooms", icon: MapPin, onClick: () => router.push(`/events/${eventId}/speaker/rooms`) },
    ]);
  }, [setToolbarActions, eventId, router, setIsImportOpen]);

  const handleManualRefresh = () => {
    refetchStats();
    refetchMain();
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
          icon: FileQuestion,
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

  // Filter out any registration-specific alerts (e.g. duplicate_registration)
  const filteredAlerts = mainStats?.alerts?.filter((alert: any) => 
    alert.type !== "duplicate_registration" && !alert.type.includes("registration")
  ) || [];
  const alertCount = filteredAlerts.length;

  const metrics = [
    { label: "Speakers Invited", value: stats?.total_speakers || 0, icon: Users, color: "text-[var(--pri)]" },
    { label: "Uploads Approved", value: stats?.files_approved || 0, icon: ClipboardCheck, color: "text-[var(--success)]" },
    { label: "Pending Review", value: stats?.files_pending || 0, icon: Clock, color: "text-[var(--warn)]" },
    { 
      label: "Pending Upload", 
      value: stats ? (stats.talks_pending_upload ?? 0) : 0, 
      icon: FileWarning, 
      color: "text-slate-400" 
    },
    { label: "Uploads Rejected", value: stats?.files_rejected || 0, icon: XCircle, color: "text-[var(--dan)]" },
    { label: "Active Rooms", value: mainStats?.active_rooms || stats?.total_rooms || 0, icon: MapPin, color: "text-purple-400" },
    { label: "Total Sessions", value: mainStats?.total_sessions || 0, icon: Calendar, color: "text-blue-400" },
    { label: "Active Staff", value: mainStats?.active_staff_count || 0, icon: ShieldCheck, color: "text-orange-400" },
    { label: "Ecosystem Alerts", value: alertCount, icon: AlertCircle, color: alertCount > 0 ? "text-red-400" : "text-muted", isAlert: alertCount > 0 },
    { label: "Ecosystem Readiness", value: mainStats?.event_readiness_pct ? `${mainStats.event_readiness_pct}%` : `${Math.round(stats?.approval_rate_pct || 0)}%`, icon: Zap, color: "text-indigo-400" },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-12 pb-20 animate-fade-in perspective-1000">
        
        {/* Event Header */}
        <section className="flex flex-col md:flex-row items-center justify-between gap-6 px-2">
          <div className="flex items-center gap-6">
            <div className="h-20 w-24 glass-3d rounded-[2rem] flex flex-col items-center justify-center border-[var(--pri)]/30 shadow-2xl transform -rotate-3 hover:rotate-0 transition-transform animate-fade-in px-2">
              <span className="text-[10px] font-black text-[var(--pri)] uppercase tracking-widest">
                {event?.start_date ? new Date(event.start_date).toLocaleDateString('en-IN', { month: 'short', timeZone: getFallbackTimezone() }) : '---'}
              </span>
              <span className="text-2xl font-black text-[var(--text)] tracking-tighter">
                {event?.start_date && event?.end_date ? (
                  new Date(event.start_date).getDate() === new Date(event.end_date).getDate() ? (
                    new Date(event.start_date).getDate()
                  ) : (
                    `${new Date(event.start_date).getDate()}-${new Date(event.end_date).getDate()}`
                  )
                ) : '--'}
              </span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo leading-none">
                  {eventLoading ? <Skeleton className="h-10 w-48 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" /> : event?.name}
                </h1>
                {event && (
                  <Badge className="bg-[var(--pri)]/10 text-[var(--pri)] border-0 font-black text-[10px] px-3 py-1 rounded-full flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {new Date(event.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: getFallbackTimezone() })}
                      {" - "}
                      {new Date(event.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: getFallbackTimezone() })}
                    </span>
                  </Badge>
                )}
                {event?.short_code && (
                  <Badge className="bg-[var(--sec)]/10 text-[var(--sec)] border-0 font-black text-[10px] px-3">{event?.short_code}</Badge>
                )}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[11px] font-bold text-muted uppercase tracking-[0.2em]">
                <span>Unified Speaker & Venue Surveillance</span>
              </div>

              {/* Portal status toggle & URL copy button */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-semibold">
                  <span className="text-[9px] font-black uppercase tracking-wider text-muted mr-1">Portal Control:</span>
                  <div className={`h-2 w-2 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-wider ${isLive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isLive ? 'Live' : 'Draft'}
                  </span>
                  <button
                    onClick={handleToggleLive}
                    disabled={toggling}
                    className="ml-2 hover:scale-105 transition-all text-muted hover:text-[var(--text)] disabled:opacity-50"
                    title={isLive ? "Set to Draft" : "Go Live"}
                  >
                    {isLive ? <ToggleRight className="h-5 w-5 text-emerald-400" /> : <ToggleLeft className="h-5 w-5 text-muted" />}
                  </button>
                </div>

                <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-semibold">
                  <span className="text-[9px] font-black uppercase tracking-wider text-muted mr-1">Portal Link:</span>
                  <button
                    onClick={copyLink}
                    className="flex items-center gap-1.5 hover:text-[var(--text)] transition-all font-mono text-[10px] text-muted hover:underline"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-400 animate-bounce" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied Link' : 'Copy URL'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setIsImportOpen(true)}
              className="h-12 px-8 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] border-0 hover-lift-3d flex items-center gap-2"
            >
              <Upload className="h-4 w-4" /> Upload Agenda
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleManualRefresh}
              className="h-12 w-12 rounded-full glass-3d border-default text-muted hover:text-[var(--pri)] hover:border-[var(--pri)]/30"
              title="Manual Telemetry Invalidation"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <PermissionGate permission={PERMISSIONS.ANALYTICS_VIEW}>
              <Button 
                onClick={() => router.push(`/events/${eventId}/speaker/analytics`)}
                className="h-12 px-8 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] border-0 hover-lift-3d"
              >
                Full Analytics Suite <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </PermissionGate>
          </div>
        </section>

        {/* Top KPI Cards Grid */}
        <section className="grid gap-6 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5">
          {metrics.map((metric, i) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                "glass-3d p-6 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-[155px]",
                metric.isAlert && "border-red-500/20"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center group-hover:bg-[var(--pri)]/10 group-hover:border-[var(--pri)]/30 transition-all">
                  <metric.icon className={cn("h-5 w-5", metric.color)} />
                </div>
                <div className={cn("h-1.5 w-1.5 rounded-full bg-current opacity-40", metric.isAlert && "bg-red-500 animate-ping")} />
              </div>
              <div className="mt-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-1">{metric.label}</p>
                <h3 className={cn("text-2xl font-black text-[var(--text)] tracking-tighter truncate", metric.isAlert && "text-red-400")}>
                  {statsLoading || mainLoading ? (
                    <Skeleton className="h-8 w-12 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" />
                  ) : (
                    metric.value
                  )}
                </h3>
              </div>
            </motion.div>
          ))}
        </section>

        {/* Centralized Surveillance System */}
        <div className="grid gap-10 lg:grid-cols-[1fr_460px]">
          
          {/* Left Surveillance Column: Live Feeds & Logs */}
          <div className="space-y-10 min-w-0">
            {/* Alert Center Board */}
            <Card className="glass-3d border-default rounded-[2.5rem] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-default flex items-center justify-between bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted flex items-center gap-3">
                  <AlertCircle className="h-4.5 w-4.5 text-red-400" /> Alert Center Board
                </h3>
                {alertCount > 0 && (
                  <Badge className="bg-red-500/10 text-red-500 border-0 font-black text-[9px] px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                    {alertCount} Detected
                  </Badge>
                )}
              </div>
              
              <div className="p-6 flex-1 max-h-[450px] overflow-y-auto pr-2 space-y-4 no-scrollbar">
                {mainLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full bg-muted/10 rounded-2xl" />
                    <Skeleton className="h-20 w-full bg-muted/10 rounded-2xl" />
                  </div>
                ) : alertCount > 0 ? (
                  <AnimatePresence>
                    {filteredAlerts.map((alert: any) => {
                      const config = getAlertStyle(alert.severity);
                      const SpecificIcon = getAlertIcon(alert.type);
                      
                      return (
                        <motion.div
                          key={alert.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
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
                                {new Date(alert.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: getFallbackTimezone() })} {getTimezoneAbbrev(getFallbackTimezone(), new Date(alert.timestamp))}
                              </span>
                              <Badge className={cn("border-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5", config.badge)}>
                                {alert.severity}
                              </Badge>
                            </div>
                            <p className="text-[12px] font-bold text-[var(--text)] leading-snug">
                              {alert.message}
                            </p>
                          </div>
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
                                  router.push(`/events/${eventId}/speaker/settings`);
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

            {/* Recent Activity Log */}
            <Card className="glass-3d border-default rounded-[2.5rem] overflow-hidden">
              <div className="p-6 border-b border-default flex items-center justify-between bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted flex items-center gap-3">
                  <History className="h-4 w-4" /> Recent Activity Log
                </h3>
                <Button 
                  variant="ghost" 
                  onClick={() => router.push(`/events/${eventId}/speaker/files`)}
                  className="text-[10px] font-black text-muted uppercase tracking-widest hover:text-[var(--text)]"
                >
                  View All
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-default text-[9px] font-black uppercase tracking-[0.2em] text-muted">
                      <th className="px-8 py-4">Activity Details</th>
                      <th className="px-8 py-4 text-right">Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {activityLoading ? (
                      <tr>
                        <td colSpan={2} className="px-8 py-4">
                          <Skeleton className="h-10 w-full bg-muted/10 rounded-lg" />
                        </td>
                      </tr>
                    ) : activity?.map((item: any, i: number) => (
                      <tr key={i} className="group hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-colors">
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center">
                              <FileUp className="h-5 w-5 text-muted group-hover:text-[var(--pri)] transition-colors" />
                            </div>
                            <div>
                              <p className="text-[13px] font-bold text-[var(--text)]">{item.description}</p>
                              <p className="text-[10px] font-black text-muted uppercase tracking-widest mt-0.5">{item.user_name || 'System Node'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-4 text-right">
                           <span className="text-[10px] font-mono text-muted">{new Date(item.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: getFallbackTimezone() })} {getTimezoneAbbrev(getFallbackTimezone(), new Date(item.timestamp))}</span>
                        </td>
                      </tr>
                    )) || (
                      <tr>
                        <td colSpan={2} className="px-8 py-20 text-center">
                          <p className="text-[11px] font-black text-muted uppercase tracking-[0.3em]">No intake detected in current cycle</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Right Surveillance Column: Checkpoints & Timelines */}
          <div className="space-y-10">
            {/* Live Operation Stream */}
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
                {mainLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-14 w-full bg-muted/10 rounded-2xl" />
                    <Skeleton className="h-14 w-full bg-muted/10 rounded-2xl" />
                  </div>
                ) : mainStats?.recent_activity?.length > 0 ? (
                  <div className="space-y-4 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/5">
                    {mainStats.recent_activity.map((act: any, idx: number) => (
                      <div key={idx} className="relative pl-10 flex gap-3 items-start group">
                        <div className="absolute left-[11px] top-1.5 h-3.5 w-3.5 rounded-full border-4 border-[var(--surf)] bg-[var(--pri)] shadow-md transition-transform group-hover:scale-125 z-10" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="text-[12px] font-bold text-[var(--text)] group-hover:text-[var(--pri)] transition-colors">
                              {act.description}
                            </p>
                            <span className="text-[9px] font-mono text-muted shrink-0">
                               {new Date(act.occurred_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: getFallbackTimezone() })}
                            </span>
                          </div>
                          {act.speaker_name && (
                            <p className="text-[8.5px] font-black text-muted uppercase tracking-wider">
                              Origin Node: {act.speaker_name}
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

            {/* Operational Milestones */}
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
                {mainLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full bg-muted/10 rounded-xl" />
                    <Skeleton className="h-10 w-full bg-muted/10 rounded-xl" />
                  </div>
                ) : mainStats?.upcoming_deadlines?.length > 0 ? (
                  mainStats.upcoming_deadlines.map((milestone: any, idx: number) => {
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
                           {new Date(milestone.time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: getFallbackTimezone() })} {getTimezoneAbbrev(getFallbackTimezone(), new Date(milestone.time))}
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

            {/* Upcoming Deadlines */}
            <Card className="glass-3d border-default rounded-[2.5rem] p-8">
              <div className="flex items-center justify-between mb-10">
                <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted">Upcoming Deadlines</h3>
                <Calendar className="h-4 w-4 text-[var(--warn)]" />
              </div>
              
              <div className="space-y-10 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                {[
                  { 
                    title: "Submission Deadline", 
                    time: event?.upload_deadline ? new Date(event.upload_deadline).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', timeZone: getFallbackTimezone() }) : "TBD", 
                    status: event?.upload_deadline && new Date(event.upload_deadline) < new Date() ? "Passed" : "Critical", 
                    color: "bg-[var(--dan)]" 
                  },
                  { 
                    title: "Event Operations Start", 
                    time: event?.start_date ? new Date(event.start_date).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', timeZone: getFallbackTimezone() }) : "TBD", 
                    status: "Upcoming", 
                    color: "bg-[var(--warn)]" 
                  },
                  { 
                    title: "Event Wrap", 
                    time: event?.end_date ? new Date(event.end_date).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', timeZone: getFallbackTimezone() }) : "TBD", 
                    status: "Scheduled", 
                    color: "bg-[var(--pri)]" 
                  }
                ].map((milestone, i) => (
                  <div key={i} className="relative pl-10 group">
                    <div className={cn("absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-4 border-[var(--surf)] shadow-lg transition-transform group-hover:scale-125", milestone.color)} />
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[12px] font-bold text-[var(--text)] group-hover:text-[var(--pri)] transition-colors">{milestone.title}</p>
                      <Badge className="bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted border-0 text-[8px] px-1.5">{milestone.time}</Badge>
                    </div>
                    <p className="text-[9px] font-black text-muted uppercase tracking-widest">{milestone.status}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

        </div>

      </div>
      <ScheduleImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        eventId={eventId as string}
      />
    </TooltipProvider>
  );
}
