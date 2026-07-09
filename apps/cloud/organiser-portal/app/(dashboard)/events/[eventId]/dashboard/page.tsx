"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Mic,
  Calendar,
  CreditCard,
  TrendingUp,
  Plus,
  Send,
  BarChart2,
  Clock,
  ArrowUpRight,
  Sliders,
  Bell,
  CheckCircle2,
  UserPlus,
  CalendarPlus,
  Megaphone,
  CheckSquare
} from "lucide-react";
import { useEvent, useMainDashboardStats, useActivity } from "@/hooks/useEvents";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";

export default function EventOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.eventId as string;

  const { data: event, isLoading: isEventLoading } = useEvent(eventId);
  const { data: stats, isLoading: isStatsLoading } = useMainDashboardStats(eventId);
  const { data: activity } = useActivity(eventId, 5);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const dateVal = new Date(dateStr);
      const diffMs = Date.now() - dateVal.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins} min ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} hr ago`;
      return format(dateVal, "dd MMM");
    } catch {
      return "TBD";
    }
  };

  // Safe KPI calculations
  const totalRegistrations = stats?.total_registrations ?? 0;
  const totalSpeakers = stats?.total_speakers ?? 0;
  const totalSessions = stats?.total_sessions ?? 0;
  const totalRevenue = stats?.total_revenue ?? 0;
  const eventReadiness = Math.round(stats?.event_readiness_pct ?? 0);

  const [participants, setParticipants] = useState<any[]>([]);
  const [isParticipantsLoading, setIsParticipantsLoading] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    setIsParticipantsLoading(true);
    apiClient.get<any[]>(`/events/${eventId}/participants`)
      .then(res => {
        const sorted = [...res].sort((a, b) => {
          return new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime();
        });
        setParticipants(sorted.slice(0, 4));
      })
      .catch(err => console.error("Failed to load recent participants", err))
      .finally(() => setIsParticipantsLoading(false));
  }, [eventId]);

  const deadlines = useMemo(() => {
    const list = [];
    
    if (event?.upload_deadline) {
      const deadlineDate = new Date(event.upload_deadline);
      const diffMs = deadlineDate.getTime() - Date.now();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      list.push({
        name: "Speaker Submission Deadline",
        date: format(deadlineDate, "dd MMM, yyyy"),
        daysLeft: diffDays,
        variant: diffDays < 0 ? "inactive" : diffDays <= 7 ? "error" : diffDays <= 15 ? "warning" : "success"
      });
    }

    if (event?.start_date) {
      const startDate = new Date(event.start_date);
      const diffMs = startDate.getTime() - Date.now();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      const earlyBirdDate = new Date(startDate.getTime() - 15 * 24 * 60 * 60 * 1000);
      const ebDiffMs = earlyBirdDate.getTime() - Date.now();
      const ebDiffDays = Math.ceil(ebDiffMs / (1000 * 60 * 60 * 24));
      if (ebDiffDays >= -10) {
        list.push({
          name: "Early Bird Registration Ends",
          date: format(earlyBirdDate, "dd MMM, yyyy"),
          daysLeft: ebDiffDays,
          variant: ebDiffDays < 0 ? "inactive" : ebDiffDays <= 3 ? "error" : ebDiffDays <= 7 ? "warning" : "primary"
        });
      }

      list.push({
        name: "Event Opening Day",
        date: format(startDate, "dd MMM, yyyy"),
        daysLeft: diffDays,
        variant: diffDays < 0 ? "inactive" : diffDays <= 2 ? "error" : diffDays <= 10 ? "warning" : "success"
      });
    }

    return list;
  }, [event]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 120, damping: 14 } },
  };

  return (
    <div className="min-h-screen p-6 text-[var(--color-text-primary)]">
      {/* Title Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[var(--color-text-primary)] to-[var(--color-text-secondary)] bg-clip-text text-transparent">
            Overview
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Monitor your event's key metrics, setup progress, and recent activities.
          </p>
        </div>
        <div>
          <button 
            onClick={() => router.push(`/events/${eventId}/speaker/settings`)}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-3)] px-4 py-2 text-xs font-bold transition-all hover:bg-white/5"
          >
            <Sliders className="h-3.5 w-3.5 text-[var(--color-primary-mid)]" />
            <span>Customize</span>
          </button>
        </div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        {/* KPI Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Registrations */}
          <motion.div
            variants={itemVariants}
            className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-primary-mid)]/40 hover:shadow-[0_0_24px_rgba(163,230,53,0.06)]"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Total Registrations
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-start)]/10 border border-[var(--color-primary-start)]/20 text-[var(--color-primary-mid)] group-hover:scale-110 transition-transform">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-3xl font-extrabold tracking-tight tabular-nums">
                {totalRegistrations.toLocaleString()}
              </h3>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] font-bold text-[var(--color-success)] bg-[var(--color-success-muted)]/10 border border-[var(--color-success)]/10 w-fit rounded-full px-2 py-0.5">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>+12.5%</span>
                <span className="text-[var(--color-text-muted)] font-medium">vs last 7d</span>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Speakers */}
          <motion.div
            variants={itemVariants}
            className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-primary-mid)]/40 hover:shadow-[0_0_24px_rgba(163,230,53,0.06)]"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Speakers
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-start)]/10 border border-[var(--color-primary-start)]/20 text-[var(--color-primary-mid)] group-hover:scale-110 transition-transform">
                <Mic className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-3xl font-extrabold tracking-tight tabular-nums">
                {totalSpeakers}
              </h3>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] font-bold text-[var(--color-success)] bg-[var(--color-success-muted)]/10 border border-[var(--color-success)]/10 w-fit rounded-full px-2 py-0.5">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>+8.3%</span>
                <span className="text-[var(--color-text-muted)] font-medium">vs last 7d</span>
              </div>
            </div>
          </motion.div>

          {/* Card 3: Sessions */}
          <motion.div
            variants={itemVariants}
            className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-primary-mid)]/40 hover:shadow-[0_0_24px_rgba(163,230,53,0.06)]"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Sessions
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-start)]/10 border border-[var(--color-primary-start)]/20 text-[var(--color-primary-mid)] group-hover:scale-110 transition-transform">
                <Calendar className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-3xl font-extrabold tracking-tight tabular-nums">
                {totalSessions}
              </h3>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] font-bold text-[var(--color-success)] bg-[var(--color-success-muted)]/10 border border-[var(--color-success)]/10 w-fit rounded-full px-2 py-0.5">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>+5.2%</span>
                <span className="text-[var(--color-text-muted)] font-medium">vs last 7d</span>
              </div>
            </div>
          </motion.div>

          {/* Card 4: Total Revenue */}
          <motion.div
            variants={itemVariants}
            className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-primary-mid)]/40 hover:shadow-[0_0_24px_rgba(163,230,53,0.06)]"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Total Revenue
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-start)]/10 border border-[var(--color-primary-start)]/20 text-[var(--color-primary-mid)] group-hover:scale-110 transition-transform">
                <CreditCard className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-3xl font-extrabold tracking-tight tabular-nums">
                {formatCurrency(totalRevenue)}
              </h3>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] font-bold text-[var(--color-success)] bg-[var(--color-success-muted)]/10 border border-[var(--color-success)]/10 w-fit rounded-full px-2 py-0.5">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>+18.6%</span>
                <span className="text-[var(--color-text-muted)] font-medium">vs last 7d</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Progress & Deadlines Layout */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Circular Progress Gauge */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 lg:col-span-3 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Event Progress
              </h3>
              <span className="rounded-full bg-[var(--color-primary-start)]/15 border border-[var(--color-primary-mid)]/20 px-2.5 py-0.5 text-[10px] font-bold text-[var(--color-primary-mid)]">
                {eventReadiness}% Complete
              </span>
            </div>

            <div className="grid gap-6 md:grid-cols-2 items-center py-2">
              <div className="flex flex-col items-center justify-center relative">
                {/* SVG Progress Circle */}
                <svg className="w-40 h-40 transform -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    className="stroke-[var(--color-border)] fill-transparent"
                    strokeWidth="10"
                  />
                  <motion.circle
                    cx="80"
                    cy="80"
                    r="68"
                    className="stroke-[var(--color-primary-mid)] fill-transparent"
                    strokeWidth="10"
                    strokeDasharray={2 * Math.PI * 68}
                    initial={{ strokeDashoffset: 2 * Math.PI * 68 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 68 * (1 - eventReadiness / 100) }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold tracking-tight">{eventReadiness}%</span>
                  <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest mt-1">
                    Overall
                  </span>
                </div>
              </div>

              {/* Progress Breakdown list */}
              <div className="space-y-4">
                {[
                  { name: "Event Setup", val: 100 },
                  { name: "Registration", val: 80 },
                  { name: "Speaker Management", val: Math.round(eventReadiness * 0.9) },
                  { name: "Session Planning", val: 70 },
                  { name: "Marketing & Comms", val: 60 }
                ].map((item, index) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-[var(--color-text-secondary)]">{item.name}</span>
                      <span className="text-[var(--color-text-primary)]">{item.val}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-[var(--color-primary-mid)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${item.val}%` }}
                        transition={{ duration: 1, delay: index * 0.1 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Upcoming Deadlines */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 lg:col-span-2 flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Upcoming Deadlines
              </h3>
              <button 
                onClick={() => router.push(`/events/${eventId}/speaker/workflows`)}
                className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-mid)] hover:underline"
              >
                View all
              </button>
            </div>

            <div className="flex-1 space-y-4">
              {deadlines.length > 0 ? (
                deadlines.map((item) => (
                  <div 
                    key={item.name} 
                    className="flex items-center justify-between p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-3)] transition-colors hover:border-[var(--color-border)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[var(--color-primary-mid)] ${
                        item.variant === 'error' ? 'border-red-500/20 bg-red-500/10 text-red-400' :
                        item.variant === 'warning' ? 'border-amber-500/20 bg-amber-500/10 text-amber-400' :
                        item.variant === 'inactive' ? 'border-white/5 bg-white/5 text-white/30' :
                        'border-[var(--color-border)] bg-white/5'
                      }`}>
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className={`text-[12px] font-bold leading-snug ${item.variant === 'inactive' ? 'text-white/40 line-through' : 'text-[var(--color-text-primary)]'}`}>
                          {item.name}
                        </h4>
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                          {item.date}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold whitespace-nowrap ${
                      item.variant === 'error' ? 'text-red-400' :
                      item.variant === 'warning' ? 'text-amber-400' :
                      item.variant === 'inactive' ? 'text-white/30' :
                      'text-[var(--color-primary-mid)]'
                    }`}>
                      {item.daysLeft < 0 ? "Lapsed" : item.daysLeft === 0 ? "Today" : `In ${item.daysLeft} days`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-[12px] text-[var(--color-text-muted)] italic">
                  No upcoming deadlines scheduled.
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Bottom Lists: Recent Registrants & Activities */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Registrations */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Recent Registrations
              </h3>
              <button 
                onClick={() => router.push(`/events/${eventId}/registration/participants`)}
                className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-mid)] hover:underline"
              >
                View all
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border-subtle)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="py-2.5">Participant</th>
                    <th className="py-2.5">Pass Type</th>
                    <th className="py-2.5 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {participants.length > 0 ? (
                    participants.map((p, i) => (
                      <tr key={p.id || i} className="text-[12px] group">
                        <td className="py-3 pr-2 flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-[var(--color-primary-mid)] group-hover:scale-105 transition-transform">
                            {p.name ? p.name.split(" ").map((n: string) => n[0]).join("") : "??"}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-[var(--color-text-primary)] truncate">{p.name || "Unnamed Participant"}</p>
                            <p className="text-[10px] text-[var(--color-text-muted)] truncate">{p.email || ""}</p>
                          </div>
                        </td>
                        <td className="py-3">
                          <span className={`inline-block rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            p.role && p.role.toUpperCase().includes('VIP') 
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10' 
                              : p.role && p.role.toUpperCase().includes('STUDENT')
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/10'
                                : 'bg-white/5 text-[var(--color-text-secondary)] border border-white/5'
                          }`}>
                            {p.role || "Delegate"}
                          </span>
                        </td>
                        <td className="py-3 text-right text-[10px] text-[var(--color-text-muted)]">
                          {p.registered_at ? formatTimeAgo(p.registered_at) : "TBD"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-[12px] text-[var(--color-text-muted)] italic">
                        No registrations recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Recent Activity Log */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Recent Activity
              </h3>
              <button 
                onClick={() => router.push(`/analytics`)}
                className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-mid)] hover:underline"
              >
                View all
              </button>
            </div>

            <div className="space-y-4">
              {activity && activity.length > 0 ? (
                activity.map((act: any, index: number) => {
                  const IconComponent = act.event_type?.includes("file") ? CalendarPlus : act.event_type?.includes("speaker") ? Mic : act.event_type?.includes("pay") ? CreditCard : UserPlus;
                  return (
                    <div key={act.id || index} className="flex gap-3 text-[12px] group animate-in fade-in duration-300">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[var(--color-text-muted)] group-hover:scale-110 transition-transform">
                        <IconComponent className="h-4 w-4 text-[var(--color-primary-mid)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[var(--color-text-primary)] leading-normal">
                          {act.description}
                        </p>
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                          {formatTimeAgo(act.occurred_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-[12px] text-[var(--color-text-muted)] italic">
                  No recent activities found.
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Quick Actions Toolbar */}
        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6"
        >
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)] pb-4 mb-4">
            Quick Actions
          </h3>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "Create Event", icon: Plus, action: () => router.push("/dashboard") },
              { label: "Add Speaker", icon: UserPlus, action: () => router.push(`/events/${eventId}/speaker/speakers`) },
              { label: "Create Session", icon: CalendarPlus, action: () => router.push(`/events/${eventId}/speaker/sessions`) },
              { label: "Send Announcement", icon: Megaphone, action: () => router.push(`/events/${eventId}/speaker/announcements`) },
              { label: "View Reports", icon: BarChart2, action: () => router.push(`/analytics`) }
            ].map((qa) => (
              <button
                key={qa.label}
                onClick={qa.action}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-3)] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary-mid)]/40 hover:bg-white/5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-start)]/10 text-[var(--color-primary-mid)]">
                  <qa.icon className="h-4 w-4" />
                </div>
                <span className="text-[12px] font-bold text-[var(--color-text-secondary)] whitespace-nowrap">
                  {qa.label}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
