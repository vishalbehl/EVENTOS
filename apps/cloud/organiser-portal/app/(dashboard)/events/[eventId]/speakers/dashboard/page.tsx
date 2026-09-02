"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  FileUp,
  ClipboardCheck,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  Calendar,
  AlertCircle,
  Plus,
  Mail,
  CheckSquare,
  LayoutGrid,
  ChevronRight,
  History,
  ArrowRight,
  Activity,
  Zap,
  MapPin,
  Laptop,
  ShieldCheck,
  AlertTriangle,
  FileWarning,
  HelpCircle as FileQuestion,
  RefreshCw,
  Upload,
  Sparkles,
} from "lucide-react";

import { toast } from "sonner";

import {
  useEvent,
  useDashboardStats,
  useActivity,
  useMainDashboardStats,
  useUpdateEvent,
} from "@/hooks/useEvents";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuthStore } from "@/store/use-auth-store";
import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { cn, getFallbackTimezone, getTimezoneAbbrev } from "@/lib/utils";
import { PermissionGate } from "@/components/organizer/auth/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";

import { DailyUploadsChart } from "@/components/organizer/dashboard/DailyUploadsChart";
import { RoomReadinessChart } from "@/components/organizer/dashboard/RoomReadinessChart";
import { ReadinessHeatmap } from "@/components/organizer/dashboard/ReadinessHeatmap";
import { ScheduleImportModal } from "@/components/organizer/events/ScheduleImportModal";

export default function EventOverviewPage() {
  const params = useParams();
  const eventId = params?.eventId as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const updateEvent = useUpdateEvent(eventId);

  // Data fetching
  const { data: event, isLoading: eventLoading } = useEvent(eventId);
  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useDashboardStats(eventId);
  const {
    data: mainStats,
    isLoading: mainLoading,
    refetch: refetchMain,
  } = useMainDashboardStats(eventId);
  const { data: activity, isLoading: activityLoading } = useActivity(eventId, 5);

  // WebSocket connection
  const { socket } = useWebSocket(eventId);


  useEffect(() => {
    if (!socket) return;

    const handleRealtimeUpdate = (payload: any) => {
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

  useEffect(() => {
    setToolbarActions([
      {
        label: "Import Schedule",
        icon: Plus,
        onClick: () => setIsImportOpen(true),
        color: "bg-[var(--pri)]/10",
      },
      {
        label: "Send Reminders",
        icon: Mail,
        onClick: () => router.push(`/events/${eventId}/speaker/emails`),
      },
      {
        label: "Manage Rooms",
        icon: MapPin,
        onClick: () => router.push(`/events/${eventId}/speaker/rooms`),
      },
    ]);
  }, [setToolbarActions, eventId, router, setIsImportOpen]);

  const handleManualRefresh = () => {
    refetchStats();
    refetchMain();
  };

  const getAlertStyle = (severity: string) => {
    switch (severity) {
      case "critical":
        return {
          border: "border-red-500/30 bg-red-500/5",
          icon: AlertTriangle,
          iconColor: "text-red-500",
          badge: "bg-red-500/10 text-red-600 dark:text-red-400",
        };
      case "warning":
        return {
          border: "border-amber-500/30 bg-amber-500/5",
          icon: AlertCircle,
          iconColor: "text-amber-500",
          badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        };
      default:
        return {
          border: "border-[var(--border-default)] bg-[var(--card)]",
          icon: ShieldCheck,
          iconColor: "text-blue-500",
          badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        };
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "failed_upload":
        return FileWarning;
      case "missing_file":
        return FileQuestion;
      case "offline_device":
        return Laptop;
      case "session_conflict":
        return Clock;
      default:
        return AlertCircle;
    }
  };

  const alerts = mainStats?.alerts || [];
  const filteredAlerts = alerts.filter((a: any) => a.severity !== "info");
  const alertCount = filteredAlerts.length;

  const metrics = [
    {
      label: "Total Speakers",
      value: mainStats?.total_speakers ?? stats?.total_speakers ?? 0,
      icon: Users,
      color: "text-indigo-500",
    },
    {
      label: "Uploads Approved",
      value: stats?.files_approved ?? 0,
      icon: CheckCircle,
      color: "text-emerald-500",
    },
    {
      label: "Pending Review",
      value: stats?.files_pending ?? 0,
      icon: Clock,
      color: "text-amber-500",
    },
    {
      label: "Uploads Rejected",
      value: stats?.files_rejected ?? 0,
      icon: XCircle,
      color: "text-rose-500",
    },
    {
      label: "Active Rooms",
      value: mainStats?.active_rooms ?? stats?.total_rooms ?? 0,
      icon: MapPin,
      color: "text-purple-500",
    },
    {
      label: "Total Sessions",
      value: mainStats?.total_sessions ?? stats?.total_sessions ?? 0,
      icon: Calendar,
      color: "text-sky-500",
    },
    {
      label: "Program Readiness",
      value: mainStats?.event_readiness_pct
        ? `${mainStats.event_readiness_pct}%`
        : `${Math.round(stats?.approval_rate_pct ?? 0)}%`,
      icon: Zap,
      color: "text-[var(--pri)]",
    },
  ];

  return (
    <TooltipProvider>
      <div className="w-full space-y-6 p-6">
        {/* ── Top Header ── */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="size-4 text-[var(--pri)]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">
                Speakers & Presenters
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Speaker Surveillance & Operations
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Live telemetry tracking speaker submissions, room readiness, slide uploads, and schedule milestones.
            </p>
          </div>


          <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
            <button
              type="button"
              onClick={handleManualRefresh}
              className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors shadow-sm cursor-pointer"
              title="Refresh telemetry"
            >
              <RefreshCw className={cn("size-4", (statsLoading || mainLoading) && "animate-spin")} />
            </button>

            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors shadow-sm cursor-pointer"
            >
              <Upload className="size-3.5" />
              Upload Agenda
            </button>

            <PermissionGate permission={PERMISSIONS.ANALYTICS_VIEW}>
              <button
                type="button"
                onClick={() => router.push(`/events/${eventId}/speakers/analytics`)}
                className="flex h-9 items-center gap-2 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-all hover:opacity-90 cursor-pointer"
              >
                Analytics Suite <ArrowRight className="size-3.5" />
              </button>
            </PermissionGate>
          </div>
        </div>

        {/* ── KPI Metric Cards Grid (4-Column Layout) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {metric.label}
                </span>
                <metric.icon className={cn("size-4", metric.color)} />
              </div>
              <div className="text-2xl font-bold text-[var(--text-primary)] mt-2">
                {statsLoading || mainLoading ? "..." : metric.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Centralized Surveillance Grid ── */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: Alert Center & Recent Activity (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Alert Center Board */}
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 text-rose-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Alert Center Board
                  </h3>
                </div>
                {alertCount > 0 && (
                  <span className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                    {alertCount} Detected
                  </span>
                )}
              </div>

              <div className="p-4 max-h-80 overflow-y-auto space-y-2.5">
                {alertCount > 0 ? (
                  filteredAlerts.map((alert: any) => {
                    const config = getAlertStyle(alert.severity);
                    const SpecificIcon = getAlertIcon(alert.type);
                    return (
                      <div
                        key={alert.id}
                        className={cn(
                          "flex items-start justify-between gap-3 p-3 rounded-lg border transition-colors",
                          config.border
                        )}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <SpecificIcon className={cn("size-4 mt-0.5 shrink-0", config.iconColor)} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                                {new Date(alert.timestamp).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span className={cn("rounded px-1.5 py-0.2 text-[9px] font-bold uppercase", config.badge)}>
                                {alert.severity}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-[var(--text-primary)] mt-0.5">
                              {alert.message}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (alert.type === "failed_upload" || alert.type === "missing_file") {
                              router.push(`/events/${eventId}/speakers/files`);
                            } else if (alert.type === "offline_device") {
                              router.push(`/events/${eventId}/speakers/rooms`);
                            } else {
                              router.push(`/events/${eventId}/speakers/settings`);
                            }
                          }}
                          className="shrink-0 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                        >
                          Resolve
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-10 text-center text-xs text-[var(--text-secondary)]">
                    <CheckCircle className="size-6 text-emerald-500 mx-auto mb-1.5" />
                    <p className="font-semibold">Ecosystem Stable</p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">No telemetry conflict nodes detected.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Activity Log */}
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <History className="size-4 text-[var(--pri)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Recent Activity Log
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/events/${eventId}/speakers/files`)}
                  className="text-xs font-semibold text-[var(--pri)] hover:underline cursor-pointer"
                >
                  View All
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {activityLoading ? (
                      <tr>
                        <td className="py-8 text-center text-xs text-[var(--text-secondary)]">
                          Loading activity log...
                        </td>
                      </tr>
                    ) : activity?.length ? (
                      activity.map((item: any, i: number) => (
                        <tr key={i} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <FileUp className="size-4 text-[var(--text-tertiary)] shrink-0" />
                              <div>
                                <p className="font-medium text-[var(--text-primary)]">{item.description}</p>
                                <p className="text-[10px] text-[var(--text-tertiary)] font-mono">
                                  {item.user_name || "System"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] text-[var(--text-tertiary)] font-mono">
                            {new Date(item.timestamp).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-8 text-center text-xs text-[var(--text-secondary)]">
                          No recent activity recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Room Readiness & Milestones (1 col) */}
          <div className="space-y-6">
            {/* Live Operational Milestones */}
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-amber-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Operational Milestones
                  </h3>
                </div>
                <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  Critical Checklist
                </span>
              </div>

              <div className="space-y-3">
                {[
                  {
                    title: "Submission Deadline",
                    time: event?.upload_deadline
                      ? new Date(event.upload_deadline).toLocaleDateString()
                      : "TBD",
                    status:
                      event?.upload_deadline && new Date(event.upload_deadline) < new Date()
                        ? "Passed"
                        : "Critical",
                  },
                  {
                    title: "Event Operations Start",
                    time: event?.start_date
                      ? new Date(event.start_date).toLocaleDateString()
                      : "TBD",
                    status: "Upcoming",
                  },
                  {
                    title: "Event Wrap",
                    time: event?.end_date ? new Date(event.end_date).toLocaleDateString() : "TBD",
                    status: "Scheduled",
                  },
                ].map((milestone, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]"
                  >
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">{milestone.title}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)] font-mono">{milestone.time}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[9px] font-bold uppercase",
                        milestone.status === "Critical"
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : milestone.status === "Upcoming"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      {milestone.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Room Readiness Heatmap */}
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-[var(--pri)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Room Readiness
                  </h3>
                </div>
              </div>
              <ReadinessHeatmap data={mainStats?.room_readiness || []} />
            </div>
          </div>
        </div>

        {/* Schedule Import Modal */}
        <ScheduleImportModal
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          eventId={eventId}
        />
      </div>
    </TooltipProvider>
  );
}
