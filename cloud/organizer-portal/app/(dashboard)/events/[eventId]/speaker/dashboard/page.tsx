"use client";

import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Users, FileUp, ClipboardCheck, Clock, XCircle, 
  TrendingUp, Calendar, AlertCircle, Plus, Mail,
  CheckSquare, LayoutGrid, ChevronRight, MoreHorizontal,
  History, ArrowRight, Activity, Zap, BarChart
} from "lucide-react";
import { useEvent, useDashboardStats, useActivity } from "@/hooks/useEvents";
import { useFiles } from "@/hooks/useFiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";

import { DailyUploadsChart } from "@/components/dashboard/DailyUploadsChart";
import { RoomReadinessChart } from "@/components/dashboard/RoomReadinessChart";
import { ReadinessHeatmap } from "@/components/dashboard/ReadinessHeatmap";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";

export default function EventOverviewPage() {
  const { eventId } = useParams();
  const router = useRouter();
  const { data: event, isLoading: eventLoading } = useEvent(eventId as string);
  const { data: stats, isLoading: statsLoading } = useDashboardStats(eventId as string);
  const { data: activity } = useActivity(eventId as string, 4);

  const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);

  useEffect(() => {
    setToolbarActions([
      { label: "Import Schedule", icon: Plus, onClick: () => console.log("Import"), color: "bg-[var(--pri)]/10" },
      { label: "Send Reminders", icon: Mail, onClick: () => console.log("Reminders") },
      { label: "Bulk Approve", icon: CheckSquare, onClick: () => console.log("Approve") },
    ]);
  }, [setToolbarActions]);

  const metrics = [
    { label: "Speakers Invited", value: stats?.total_speakers || 0, icon: Users, color: "text-[var(--pri)]" },
    { label: "Uploaded", value: stats?.files_uploaded || 0, icon: FileUp, color: "text-[var(--sec)]" },
    { label: "Approved", value: stats?.files_approved || 0, icon: ClipboardCheck, color: "text-[var(--success)]" },
    { label: "Pending", value: stats?.files_pending || 0, icon: Clock, color: "text-[var(--warn)]" },
    { label: "Rejected", value: stats?.files_rejected || 0, icon: XCircle, color: "text-[var(--dan)]" },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-12 pb-20 animate-fade-in perspective-1000">
        {/* Event Header */}
        <section className="flex flex-col md:flex-row items-center justify-between gap-6 px-2">
          <div className="flex items-center gap-6">
             <div className="h-20 w-20 glass-3d rounded-[2rem] flex flex-col items-center justify-center border-[var(--pri)]/30 shadow-2xl transform -rotate-3 hover:rotate-0 transition-transform">
                <span className="text-[10px] font-black text-[var(--pri)] uppercase tracking-widest">{new Date(event?.start_date || "").toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' })}</span>
                <span className="text-3xl font-black text-[var(--text)]">{event?.start_date ? new Date(event.start_date).toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' }) : '--'}</span>
             </div>
             <div>
                <div className="flex items-center gap-3 mb-2">
                   <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
                     {eventLoading ? <Skeleton className="h-10 w-48 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" /> : event?.name}
                   </h1>
                   <Badge className="bg-[var(--pri)]/10 text-[var(--pri)] border-0 font-black text-[10px] px-3">{event?.short_code}</Badge>
                </div>
                <p className="text-[11px] font-bold text-muted uppercase tracking-[0.3em]">Event Surveillance Dashboard</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-right mr-4 hidden xl:block">
                <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Overall Progress</p>
                <div className="flex items-center gap-2">
                   <span className="text-2xl font-black text-[var(--text)]">{stats?.approval_rate_pct?.toFixed(0) || 0}%</span>
                   <div className="h-1.5 w-24 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full overflow-hidden">
                      <div 
                         className="h-full bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] transition-all duration-1000" 
                         style={{ width: `${stats?.approval_rate_pct || 0}%` }} 
                      />
                   </div>
                </div>
             </div>
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

        {/* Top Metrics Row */}
        <section className="grid gap-6 grid-cols-2 lg:grid-cols-5">
          {metrics.map((metric, i) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass-3d p-6 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center group-hover:bg-[var(--pri)]/10 group-hover:border-[var(--pri)]/30 transition-all">
                  <metric.icon className={cn("h-5 w-5", metric.color)} />
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">{metric.label}</p>
              <h3 className="text-3xl font-black text-[var(--text)] tracking-tighter">
                {statsLoading ? <Skeleton className="h-8 w-12 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" /> : metric.value}
              </h3>
            </motion.div>
          ))}
        </section>

        {/* Middle Visualizations */}
        <div className="grid gap-10 lg:grid-cols-[1fr_400px_450px]">
          
          {/* Upload Trend Chart */}
          <Card className="glass-3d border-default rounded-[2.5rem] p-8 flex flex-col">
             <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted mb-1">Intake Velocity</h3>
                  <p className="text-[10px] text-muted uppercase font-bold tracking-widest">Speaker uploads over the last 14 days</p>
                </div>
                <Activity className="h-4 w-4 text-[var(--pri)]" />
             </div>
             <div className="flex-1 min-h-[250px]">
                <DailyUploadsChart data={stats?.daily_uploads || []} />
             </div>
          </Card>

          {/* Readiness Gauge */}
          <Card className="glass-3d border-default rounded-[2.5rem] p-10 flex flex-col items-center justify-center text-center">
             <div className="flex items-center justify-between w-full mb-12">
                <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted">Readiness Score</h3>
                <Zap className="h-4 w-4 text-[var(--sec)]" />
             </div>
             
             <div className="relative h-56 w-56 mb-10">
                <svg className="h-full w-full transform -rotate-90">
                   <circle cx="112" cy="112" r="100" fill="transparent" stroke="currentColor" strokeWidth="10" className="text-muted/10" />
                   <motion.circle 
                     cx="112" 
                     cy="112" 
                     r="100" 
                     fill="transparent" 
                     stroke="currentColor" 
                     strokeWidth="10" 
                     className="text-[var(--pri)]" 
                     strokeDasharray={628} 
                     initial={{ strokeDashoffset: 628 }}
                     animate={{ strokeDashoffset: 628 - (628 * (stats?.approval_rate_pct || 0) / 100) }}
                     transition={{ duration: 2, ease: "easeOut" }}
                     strokeLinecap="round" 
                   />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                   <span className="text-5xl font-black text-[var(--text)] tracking-tighter">{Math.round(stats?.approval_rate_pct || 0) || 0}%</span>
                   <span className="text-[9px] font-black text-[var(--sec)] uppercase tracking-[0.2em] mt-2">Validated Assets</span>
                </div>
             </div>
             
             <div className="grid grid-cols-2 gap-4 w-full">
                <div className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default">
                   <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">Upload Rate</p>
                   <p className="text-sm font-bold text-[var(--text)]">{stats?.upload_rate_pct?.toFixed(1) || 0}%</p>
                </div>
                <div className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default">
                   <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">Total Rooms</p>
                   <p className="text-sm font-bold text-[var(--text)]">{stats?.total_rooms || 0}</p>
                </div>
             </div>
          </Card>

          {/* Upload Funnel */}
          <Card className="glass-3d border-default rounded-[2.5rem] overflow-hidden p-8 flex flex-col">
             <div className="flex items-center justify-between mb-8">
                <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted">Submission Funnel</h3>
                <TrendingUp className="h-4 w-4 text-[var(--pri)]" />
             </div>
             
             <div className="flex flex-col gap-4 flex-1 justify-center">
               {[
                  { label: "Invited", val: stats?.total_speakers || 0, color: "bg-[var(--pri)]/20", p: 100 },
                  { label: "Uploaded", val: stats?.files_uploaded || 0, color: "bg-[var(--pri)]/40", p: (stats?.total_speakers || 0) > 0 ? Math.round(((stats?.files_uploaded || 0) / (stats?.total_speakers || 1)) * 100) : 0 },
                  { label: "Validated", val: stats?.files_approved || 0, color: "bg-[var(--pri)]/60", p: (stats?.total_speakers || 0) > 0 ? Math.round(((stats?.files_approved || 0) / (stats?.total_speakers || 1)) * 100) : 0 },
                  { label: "Ready", val: stats?.sessions_ready || 0, color: "bg-[var(--pri)]", p: (stats?.total_sessions || 0) > 0 ? Math.round(((stats?.sessions_ready || 0) / (stats?.total_sessions || 1)) * 100) : 0 },
                ].map((stage, i) => (
                  <div key={stage.label} className="space-y-1">
                     <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-muted">
                        <span>{stage.label}</span>
                        <span>{stage.val}</span>
                     </div>
                     <div className="h-8 w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-lg overflow-hidden relative border border-default/50">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${stage.p}%` }}
                          transition={{ delay: i * 0.2, duration: 1 }}
                          className={cn("h-full relative overflow-hidden", stage.color)}
                        >
                           <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent" />
                        </motion.div>
                     </div>
                  </div>
                ))}
             </div>
          </Card>
        </div>

        {/* Venue Surveillance Section */}
        <section className="space-y-8">
          <div className="flex items-center justify-between px-2">
             <div>
                <h2 className="text-2xl font-black tracking-tighter text-[var(--text)] uppercase">Venue Surveillance</h2>
                <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">Real-time room readiness & completion monitoring</p>
             </div>
             <div className="flex items-center gap-2">
                <Badge className="bg-[var(--success)]/10 text-[var(--success)] border-0 font-black text-[10px]">Active Node Scanning</Badge>
             </div>
          </div>

          <div className="grid gap-10 lg:grid-cols-[1fr_500px]">
             {/* Room Heatmap */}
             <Card className="glass-3d border-default rounded-[2.5rem] p-10">
                <div className="flex items-center justify-between mb-10">
                   <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted">Readiness Heatmap</h3>
                   <LayoutGrid className="h-4 w-4 text-[var(--pri)]" />
                </div>
                <ReadinessHeatmap data={stats?.room_heatmap || []} />
             </Card>

             {/* Room Breakdown Chart */}
             <Card className="glass-3d border-default rounded-[2.5rem] p-10">
                <div className="flex items-center justify-between mb-10">
                   <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted">Room-Wise Completion</h3>
                   <BarChart className="h-4 w-4 text-[var(--pri)]" />
                </div>
                <RoomReadinessChart data={stats?.room_readiness || []} />
             </Card>
          </div>
        </section>

        {/* Bottom Section: Table + Response Bar */}
        <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
           <Card className="glass-3d border-default rounded-[2.5rem] overflow-hidden">
              <div className="p-6 border-b border-default flex items-center justify-between bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                 <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted flex items-center gap-3">
                    <History className="h-4 w-4" /> Recent Activity
                 </h3>
                 <Button variant="ghost" className="text-[10px] font-black text-muted uppercase tracking-widest hover:text-[var(--text)]">View All</Button>
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
                       {activity?.map((item: any, i: number) => (
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
                               <span className="text-[10px] font-mono text-muted">{new Date(item.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST</span>
                            </td>
                         </tr>
                       ))}
                       {(!activity || activity.length === 0) && (
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

           <aside className="space-y-6">
              <Card className="glass-3d border-default rounded-[2.5rem] p-8">
                 <div className="flex items-center justify-between mb-10">
                    <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-muted">Upcoming Deadlines</h3>
                    <Calendar className="h-4 w-4 text-[var(--warn)]" />
                 </div>
                 
                 <div className="space-y-10 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                    {[
                      { 
                        title: "Submission Deadline", 
                        time: event?.upload_deadline ? new Date(event.upload_deadline).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', timeZone: 'Asia/Kolkata' }) : "TBD", 
                        status: event?.upload_deadline && new Date(event.upload_deadline) < new Date() ? "Passed" : "Critical", 
                        color: "bg-[var(--dan)]" 
                      },
                      { 
                        title: "Event Operations Start", 
                        time: event?.start_date ? new Date(event.start_date).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', timeZone: 'Asia/Kolkata' }) : "TBD", 
                        status: "Upcoming", 
                        color: "bg-[var(--warn)]" 
                      },
                      { 
                        title: "Event Wrap", 
                        time: event?.end_date ? new Date(event.end_date).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', timeZone: 'Asia/Kolkata' }) : "TBD", 
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

              <div className="p-8 rounded-[2.5rem] glass-3d border-dashed border-default flex flex-col items-center justify-center text-center group cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
                 <div className="h-14 w-14 rounded-full bg-[var(--pri)]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Badge className="bg-[var(--pri)] text-[var(--text)] font-black text-lg p-3 rounded-full">{stats?.files_pending || 0}</Badge>
                 </div>
                 <h4 className="text-[12px] font-black text-muted uppercase tracking-widest mb-1">Approval Queue</h4>
                 <p className="text-[11px] text-muted uppercase tracking-tighter">Requires Attention</p>
              </div>
           </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}
