"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Calendar, Users, FileVideo, CheckSquare, 
  MapPin, Clock, ArrowUpRight, TrendingUp,
  AlertCircle, ChevronDown, Check, Activity, Sparkles,
  RefreshCw, ListCollapse
} from "lucide-react";
import { 
  useEvents, 
  useDashboardSummary, 
  useRegistrationsTimeline, 
  useRolesBreakdown, 
  usePendingActions, 
  useRecentActivity, 
  useUpcomingDeadlines 
} from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { socketService } from "@/lib/socket";
import { useAuthStore } from "@/store/use-auth-store";
import { PlanUsageWidget } from "@/components/organizer/dashboard/PlanUsageWidget";


// Recharts components
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell 
} from "recharts";

const COLORS = ["#6366F1", "#3B82F6", "#0EA5E9", "#10B981", "#F59E0B"];

export default function PlatformDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: events, isLoading: isEventsLoading } = useEvents();
  const { accessToken, isAuthenticated } = useAuthStore();
  
  // States
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [liveMode, setLiveMode] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  // Set default event
  useEffect(() => {
    if (events && events.length > 0 && !selectedEventId) {
      const saved = localStorage.getItem("selected_organizer_event_id");
      const exists = events.some(e => e.id === saved);
      if (saved && exists) {
        setSelectedEventId(saved);
      } else {
        // Fallback to first active or upcoming
        const firstActive = events.find(e => e.status === "active") || events[0];
        setSelectedEventId(firstActive.id);
      }
    }
  }, [events, selectedEventId]);

  // Save selection
  const handleEventSelect = (id: string) => {
    setSelectedEventId(id);
    localStorage.setItem("selected_organizer_event_id", id);
    setIsDropdownOpen(false);
  };

  const activeEvent = useMemo(() => {
    return events?.find(e => e.id === selectedEventId);
  }, [events, selectedEventId]);

  // Connect to Socket.IO & Register listeners
  useEffect(() => {
    if (!isAuthenticated || !accessToken || !selectedEventId) return;

    socketService.connect(accessToken);
    const socket = socketService.socket;
    if (!socket) return;

    // Join room
    socketService.joinEvent(selectedEventId);

    const handleRealtimeUpdate = () => {
      console.log("[Socket.IO] Real-time update received, invalidating queries...");
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary", selectedEventId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-pending-actions", selectedEventId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-activity", selectedEventId] });
    };

    socket.on("room_status_update", handleRealtimeUpdate);
    socket.on("speaker_checkin", handleRealtimeUpdate);
    socket.on("alert_new", handleRealtimeUpdate);

    return () => {
      socket.off("room_status_update", handleRealtimeUpdate);
      socket.off("speaker_checkin", handleRealtimeUpdate);
      socket.off("alert_new", handleRealtimeUpdate);
    };
  }, [isAuthenticated, accessToken, selectedEventId, queryClient]);

  // React Query Hooks
  const { data: summary, isLoading: isSummaryLoading } = useDashboardSummary(selectedEventId, liveMode);
  const { data: timelineData, isLoading: isTimelineLoading } = useRegistrationsTimeline(selectedEventId);
  const { data: rolesData, isLoading: isRolesLoading } = useRolesBreakdown(selectedEventId);
  const { data: pendingActions, isLoading: isActionsLoading } = usePendingActions(selectedEventId, liveMode);
  const { data: activityData, isLoading: isActivityLoading } = useRecentActivity(selectedEventId, liveMode);
  const { data: deadlines, isLoading: isDeadlinesLoading } = useUpcomingDeadlines(selectedEventId);

  const isDataLoading = isSummaryLoading || isTimelineLoading || isRolesLoading || isActionsLoading || isActivityLoading || isDeadlinesLoading;

  // Split timeline data into actual and forecast for Recharts
  const chartData = useMemo(() => {
    if (!timelineData) return [];
    
    // Find the index of the first forecasted item
    const lastActualIdx = timelineData.map(d => d.is_forecast).lastIndexOf(false);

    return timelineData.map((d, idx) => {
      if (d.is_forecast) {
        return {
          date: d.date,
          forecast_registered: d.registered,
          forecast_paid: d.paid,
          forecast_approved: d.approved,
          // connect the forecast line to the last actual point
          registered: idx === lastActualIdx + 1 ? timelineData[lastActualIdx].registered : null,
          paid: idx === lastActualIdx + 1 ? timelineData[lastActualIdx].paid : null,
          approved: idx === lastActualIdx + 1 ? timelineData[lastActualIdx].approved : null,
        };
      } else {
        return {
          date: d.date,
          registered: d.registered,
          paid: d.paid,
          approved: d.approved,
          forecast_registered: idx === lastActualIdx ? d.registered : null,
          forecast_paid: idx === lastActualIdx ? d.paid : null,
          forecast_approved: idx === lastActualIdx ? d.approved : null,
        };
      }
    });
  }, [timelineData]);

  // Today Date string formatting
  const todayDateFormatted = useMemo(() => {
    return new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }, []);

  if (isEventsLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-12 w-[300px]" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-32 w-full rounded-[2rem]" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[350px] w-full rounded-[2.5rem]" />
          <Skeleton className="h-[350px] w-full rounded-[2.5rem]" />
        </div>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
        <div className="h-20 w-20 rounded-[2rem] bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-xl shadow-indigo-500/5">
          <Calendar className="h-10 w-10 text-indigo-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-[var(--text)] tracking-tighter">No Events Seeded</h2>
          <p className="text-muted text-[12px] font-bold uppercase tracking-widest max-w-md">
            Please create an event to access your Organizer Dashboard.
          </p>
        </div>
        <Button onClick={() => router.push("/events?create=true")} className="h-12 px-8 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-[11px] rounded-full hover-lift-3d">
          Create New Event
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 animate-fade-in">
      {/* Header bar */}
      <section className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-default pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Custom Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center justify-between gap-4 h-12 px-5 rounded-xl glass-3d border-default hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left w-[280px] select-none text-[var(--text)] font-black uppercase tracking-tight"
            >
              <span className="truncate">{activeEvent ? activeEvent.name : "Select Event"}</span>
              <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", isDropdownOpen && "rotate-180 text-indigo-500")} />
            </button>

            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.1 }}
                  className="absolute left-0 mt-2 w-[300px] glass-3d border-default rounded-2xl p-2 z-50 shadow-2xl bg-[var(--surf)]/95 backdrop-blur-xl"
                >
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {events.map(evt => (
                      <button
                        key={evt.id}
                        onClick={() => handleEventSelect(evt.id)}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-xl text-left transition-all hover:bg-indigo-500/10 group",
                          selectedEventId === evt.id && "bg-indigo-500/10 border border-indigo-500/20"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase tracking-tight text-[var(--text)] truncate">{evt.name}</p>
                          <p className="text-[9px] font-bold text-muted uppercase mt-0.5">{evt.short_code} • {evt.status}</p>
                        </div>
                        {selectedEventId === evt.id && <Check className="h-4 w-4 text-indigo-500" />}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted">Today's Date</span>
            <span className="text-[13px] font-black uppercase text-[var(--text)]">{todayDateFormatted}</span>
          </div>
        </div>

        {/* Live Mode Toggle */}
        <div className="flex items-center gap-4 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default p-2.5 rounded-2xl shrink-0">
          <div className="flex flex-col pr-4 border-r border-default">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted">Auto-Refresh Mode</span>
            <span className="text-[9px] font-bold uppercase text-indigo-500">Fast Polling (15s)</span>
          </div>
          <button
            onClick={() => setLiveMode(!liveMode)}
            className={cn(
              "w-12 h-6 rounded-full p-0.5 transition-colors duration-300 focus:outline-none shrink-0 relative",
              liveMode ? "bg-indigo-600" : "bg-[var(--muted)]/20"
            )}
          >
            <motion.div
              layout
              className="w-5 h-5 rounded-full bg-white shadow-md"
              animate={{ x: liveMode ? 24 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </button>
        </div>
      </section>

      {/* Row 1 — Event Readiness Scorecards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {isDataLoading ? (
          [1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-32 w-full rounded-[2rem] bg-indigo-500/5 animate-pulse" />
          ))
        ) : summary?.scorecards ? (
          <>
            <motion.div
              whileHover={{ y: -6, scale: 1.02 }}
              onClick={() => router.push(`/events/${selectedEventId}/speaker/sessions`)}
              className="glass-3d p-6 rounded-[2rem] border-default cursor-pointer relative overflow-hidden group hover:border-indigo-500/40 transition-all shadow-xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-indigo-500" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-indigo-500 transition-colors" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Sessions Ready</p>
              <h3 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2">
                {summary.scorecards.sessions_ready.ready}/{summary.scorecards.sessions_ready.total}
              </h3>
              <div className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${summary.scorecards.sessions_ready.pct}%` }} />
              </div>
              <span className="text-[10px] font-bold text-indigo-500 mt-1 block">{summary.scorecards.sessions_ready.pct}% Complete</span>
            </motion.div>

            <motion.div
              whileHover={{ y: -6, scale: 1.02 }}
              onClick={() => router.push(`/events/${selectedEventId}/speaker/speakers`)}
              className="glass-3d p-6 rounded-[2rem] border-default cursor-pointer relative overflow-hidden group hover:border-indigo-500/40 transition-all shadow-xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Users className="h-5 w-5 text-indigo-500" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-indigo-500 transition-colors" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Speakers Confirmed</p>
              <h3 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2">
                {summary.scorecards.speakers_confirmed.ready}/{summary.scorecards.speakers_confirmed.total}
              </h3>
              <div className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${summary.scorecards.speakers_confirmed.pct}%` }} />
              </div>
              <span className="text-[10px] font-bold text-indigo-500 mt-1 block">{summary.scorecards.speakers_confirmed.pct}% Confirmed</span>
            </motion.div>

            <motion.div
              whileHover={{ y: -6, scale: 1.02 }}
              onClick={() => router.push(`/events/${selectedEventId}/registration/participants`)}
              className="glass-3d p-6 rounded-[2rem] border-default cursor-pointer relative overflow-hidden group hover:border-indigo-500/40 transition-all shadow-xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-indigo-500" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-indigo-500 transition-colors" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Registrations</p>
              <h3 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2">
                {summary.scorecards.registrations.ready}/{summary.scorecards.registrations.total}
              </h3>
              <div className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${summary.scorecards.registrations.pct}%` }} />
              </div>
              <span className="text-[10px] font-bold text-indigo-500 mt-1 block">{summary.scorecards.registrations.pct}% Capacity</span>
            </motion.div>

            <motion.div
              whileHover={{ y: -6, scale: 1.02 }}
              onClick={() => router.push(`/events/${selectedEventId}/speaker/files`)}
              className="glass-3d p-6 rounded-[2rem] border-default cursor-pointer relative overflow-hidden group hover:border-indigo-500/40 transition-all shadow-xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <FileVideo className="h-5 w-5 text-indigo-500" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-indigo-500 transition-colors" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Files Validated</p>
              <h3 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2">
                {summary.scorecards.files_validated.ready}/{summary.scorecards.files_validated.total}
              </h3>
              <div className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${summary.scorecards.files_validated.pct}%` }} />
              </div>
              <span className="text-[10px] font-bold text-indigo-500 mt-1 block">{summary.scorecards.files_validated.pct}% Validated</span>
            </motion.div>

            <motion.div
              whileHover={{ y: -6, scale: 1.02 }}
              onClick={() => router.push(`/events/${selectedEventId}/speaker/rooms`)}
              className="glass-3d p-6 rounded-[2rem] border-default cursor-pointer relative overflow-hidden group hover:border-indigo-500/40 transition-all shadow-xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-indigo-500" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-indigo-500 transition-colors" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">Rooms Configured</p>
              <h3 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2">
                {summary.scorecards.rooms_configured.ready}/{summary.scorecards.rooms_configured.total}
              </h3>
              <div className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${summary.scorecards.rooms_configured.pct}%` }} />
              </div>
              <span className="text-[10px] font-bold text-indigo-500 mt-1 block">{summary.scorecards.rooms_configured.pct}% Configured</span>
            </motion.div>
          </>
        ) : (
          <div className="col-span-full text-center text-muted font-black uppercase text-[12px] py-12">Failed to load statistics summary</div>
        )}
      </section>

      {/* Row 2 — Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Registration Timeline AreaChart (60%) */}
        <div className="glass-3d p-8 rounded-[2.5rem] border-default lg:col-span-2 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-[14px] font-black uppercase tracking-widest text-[var(--text)]">Registration Timeline</h3>
              <p className="text-[10px] font-bold text-muted uppercase mt-0.5">30-day cumulative timeline + forecast projection</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                <span className="text-[9px] font-black text-muted uppercase">Registered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                <span className="text-[9px] font-black text-muted uppercase">Paid</span>
              </div>
            </div>
          </div>

          <div className="h-[300px] w-full mt-4">
            {isTimelineLoading ? (
              <Skeleton className="h-full w-full rounded-2xl bg-indigo-500/5 animate-pulse" />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRegistered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "rgba(30, 41, 59, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1rem" }}
                    labelStyle={{ fontWeight: "bold", color: "#F8FAFC" }}
                  />
                  {/* Actual lines */}
                  <Area type="monotone" dataKey="registered" stroke="#6366F1" strokeWidth={3} fillOpacity={1} fill="url(#colorRegistered)" />
                  <Area type="monotone" dataKey="paid" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorPaid)" />
                  {/* Forecast lines (Dashed) */}
                  <Area type="monotone" dataKey="forecast_registered" stroke="#6366F1" strokeWidth={2} strokeDasharray="5 5" fill="none" />
                  <Area type="monotone" dataKey="forecast_paid" stroke="#3B82F6" strokeWidth={2} strokeDasharray="5 5" fill="none" />
                  
                  {/* Today line */}
                  <ReferenceLine x="Today" stroke="var(--warn)" strokeDasharray="3 3" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted font-bold uppercase text-[11px]">No timeline data available</div>
            )}
          </div>
        </div>

        {/* Role Breakdown DonutChart (40%) */}
        <div className="glass-3d p-8 rounded-[2.5rem] border-default relative overflow-hidden flex flex-col justify-between">
          <div>
            <h3 className="text-[14px] font-black uppercase tracking-widest text-[var(--text)]">Registration by Role</h3>
            <p className="text-[10px] font-bold text-muted uppercase mt-0.5">Attendee distribution by role category</p>
          </div>

          <div className="h-[220px] w-full flex items-center justify-center relative mt-4">
            {isRolesLoading ? (
              <Skeleton className="h-40 w-40 rounded-full bg-indigo-500/5 animate-pulse" />
            ) : rolesData && rolesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rolesData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {rolesData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: "rgba(30, 41, 59, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1rem" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-muted font-bold uppercase text-[11px]">No role data available</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            {rolesData && rolesData.map((role, idx) => (
              <div key={role.name} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                <span className="text-[10px] font-black uppercase tracking-tight text-[var(--text)] truncate max-w-[100px]">{role.name}</span>
                <Badge variant="outline" className="text-[9px] font-black border-default text-muted py-0 px-1.5 shrink-0 ml-auto">{role.value}</Badge>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plan Usage Section */}
      <section className="w-full">
        <PlanUsageWidget />
      </section>

      {/* Row 3 — Three task panels */}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Pending Actions */}
        <div className="glass-3d p-8 rounded-[2.5rem] border-default relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6 border-b border-default pb-4">
            <h3 className="text-[12px] font-black uppercase tracking-[0.25em] text-[var(--text)] flex items-center gap-3">
              <CheckSquare className="h-4 w-4 text-indigo-500" /> Pending Actions
            </h3>
            <Badge variant="outline" className="text-[9px] border-default text-muted font-black">
              {pendingActions ? pendingActions.filter(a => a.count > 0).length : 0} CRITICAL
            </Badge>
          </div>

          <div className="space-y-4 flex-1">
            {isActionsLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-2xl bg-indigo-500/5 animate-pulse" />)
            ) : pendingActions && pendingActions.length > 0 ? (
              pendingActions.map((action) => (
                <div key={action.type} className="flex flex-col border border-default/40 rounded-2xl bg-[color-mix(in_srgb,var(--text)_2%,transparent)] transition-all overflow-hidden">
                  <div
                    onClick={() => {
                      if (action.count > 0) {
                        setExpandedAction(expandedAction === action.type ? null : action.type);
                      }
                    }}
                    className={cn(
                      "flex items-center justify-between p-4 cursor-pointer hover:bg-indigo-500/5 transition-all select-none",
                      action.count > 0 ? "text-[var(--text)]" : "text-muted"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <AlertCircle className={cn("h-4 w-4", action.count > 0 ? "text-indigo-500" : "text-muted opacity-40")} />
                      <span className="text-[11px] font-bold tracking-tight">{action.message}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-[9px] font-black border-0 rounded-full px-2 py-0.5", action.count > 0 ? "bg-indigo-500/10 text-indigo-500" : "bg-transparent text-muted")}>
                        {action.count}
                      </Badge>
                      {action.count > 0 && (
                        <ChevronDown className={cn("h-4.5 w-4.5 text-muted transition-transform", expandedAction === action.type && "rotate-180")} />
                      )}
                    </div>
                  </div>

                  {/* Collapsible inline detail list */}
                  <AnimatePresence>
                    {expandedAction === action.type && action.count > 0 && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-t border-default/40 p-4 space-y-3"
                      >
                        <p className="text-[10px] font-bold text-muted uppercase">Organizer items requiring attention:</p>
                        <Button 
                          onClick={() => router.push(action.action_link)}
                          className="h-10 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-[9px] rounded-xl flex items-center justify-center border-0 shadow-lg"
                        >
                          Resolve Now <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-muted font-bold uppercase text-[10px]">No pending actions found</div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="glass-3d p-8 rounded-[2.5rem] border-default relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6 border-b border-default pb-4">
            <h3 className="text-[12px] font-black uppercase tracking-[0.25em] text-[var(--text)] flex items-center gap-3">
              <Activity className="h-4 w-4 text-indigo-500" /> Recent Activity
            </h3>
            <Badge variant="outline" className="text-[9px] border-default text-muted font-black uppercase">
              Last 24h
            </Badge>
          </div>

          <div className="space-y-4 flex-1 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
            {isActivityLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-2xl bg-indigo-500/5 animate-pulse" />)
            ) : activityData && activityData.length > 0 ? (
              activityData.filter(a => a.registrations > 0 || a.files > 0 || a.speakers > 0).map((act, index) => (
                <div key={index} className="flex gap-4 items-start border-l border-default/60 pl-4 relative group ml-2 pb-2">
                  <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-indigo-600 group-hover:scale-125 transition-transform" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-muted uppercase tracking-wider">{act.hour}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {act.registrations > 0 && (
                        <Badge variant="outline" className="text-[9px] border-default text-indigo-500 font-bold bg-indigo-500/5 px-2 rounded-lg">
                          +{act.registrations} Registrations
                        </Badge>
                      )}
                      {act.files > 0 && (
                        <Badge variant="outline" className="text-[9px] border-default text-blue-500 font-bold bg-blue-500/5 px-2 rounded-lg">
                          +{act.files} File Uploads
                        </Badge>
                      )}
                      {act.speakers > 0 && (
                        <Badge variant="outline" className="text-[9px] border-default text-emerald-500 font-bold bg-emerald-500/5 px-2 rounded-lg">
                          +{act.speakers} Speakers Confirmed
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )).reverse() // Show most recent at top
            ) : (
              <div className="py-12 text-center text-muted font-bold uppercase text-[10px]">No activity in the last 24h</div>
            )}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="glass-3d p-8 rounded-[2.5rem] border-default relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6 border-b border-default pb-4">
            <h3 className="text-[12px] font-black uppercase tracking-[0.25em] text-[var(--text)] flex items-center gap-3">
              <Calendar className="h-4 w-4 text-indigo-500" /> Milestones & Deadlines
            </h3>
            <Sparkles className="h-4 w-4 text-indigo-500" />
          </div>

          <div className="space-y-4 flex-1">
            {isDeadlinesLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-2xl bg-indigo-500/5 animate-pulse" />)
            ) : deadlines && deadlines.length > 0 ? (
              deadlines.map((dl, index) => {
                let urgencyColor = "text-indigo-500 bg-indigo-500/5";
                let urgencyBorder = "border-default/40";
                
                if (dl.days_remaining >= 0 && dl.days_remaining <= 2) {
                  urgencyColor = "text-red-500 bg-red-500/5";
                  urgencyBorder = "border-red-500/30";
                } else if (dl.days_remaining >= 0 && dl.days_remaining <= 7) {
                  urgencyColor = "text-amber-500 bg-amber-500/5";
                  urgencyBorder = "border-amber-500/30";
                }

                return (
                  <div key={index} className={cn("p-4 border rounded-2xl flex items-center justify-between", urgencyBorder)}>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-tight text-[var(--text)] truncate">{dl.name}</p>
                      <p className="text-[9px] font-bold text-muted uppercase mt-0.5">Target: {dl.date}</p>
                    </div>
                    <Badge variant="outline" className={cn("text-[9px] font-black px-2 py-1 rounded-xl uppercase shrink-0 border-0", urgencyColor)}>
                      {dl.days_remaining < 0 ? "Passed/NA" : dl.days_remaining === 0 ? "Today" : `${dl.days_remaining} days left`}
                    </Badge>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-muted font-bold uppercase text-[10px]">No upcoming deadlines</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
