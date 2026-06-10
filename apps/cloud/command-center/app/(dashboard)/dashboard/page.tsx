"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar, Users, Plus, 
  Copy, Bell, Activity, Search, Globe, 
  ChevronRight, TrendingUp, ClipboardCheck
} from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";
import { useEffect } from "react";
import { CreateEventDialog } from "@/components/organizer/CreateEventDialog";
import { Portal } from "@/components/ui/portal";
import { useNotificationStore } from "@/store/useNotificationStore";
import * as Icons from "lucide-react";

export default function PlatformDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("active");
  const { data: events, isLoading } = useEvents({ search: searchQuery });
  const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);
  
  const notifications = useNotificationStore(state => state.notifications);
  const tasks = useNotificationStore(state => state.tasks);
  const toggleTask = useNotificationStore(state => state.toggleTask);
  const connect = useNotificationStore(state => state.connect);
  const disconnect = useNotificationStore(state => state.disconnect);

  useEffect(() => {
    if (events && events.length > 0) {
      connect(events.map(e => e.id));
    }
    return () => disconnect();
  }, [events, connect, disconnect]);

  useEffect(() => {
    setToolbarActions([
      { label: "Create Event", icon: Plus, onClick: () => setIsCreateDialogOpen(true), color: "bg-[var(--pri)]/10" },
      { label: "Search", icon: Search, onClick: () => console.log("Search") },
      { label: "Status", icon: Globe, onClick: () => console.log("Status") },
    ]);
  }, [setToolbarActions]);

  const metrics = [
    { label: "Total Events", value: (events || []).length, icon: Calendar, color: "text-[var(--pri)]", trend: "All Time" },
    { label: "Active Events", value: (events || []).filter(e => e.status === 'active').length, icon: Globe, color: "text-[var(--sec)]", trend: "Live Events" },
    { label: "Upcoming", value: (events || []).filter(e => e.status === 'draft').length, icon: TrendingUp, color: "text-[var(--warn)]", trend: "Draft Events" },
    { label: "System Status", value: "Healthy", icon: Activity, color: "text-[var(--success)]", trend: "Online" },
  ];

  const swimlanes = [
    { id: "active", label: "Active Events", statuses: ['active', 'draft'] },
    { id: "upcoming", label: "Upcoming Events", statuses: ['draft'] },
    { id: "past", label: "Past Events", statuses: ['completed', 'archived'] },
  ];

  return (
    <div className="space-y-10 pb-20 animate-fade-in perspective-1000">
      <Portal>
        <CreateEventDialog 
          isOpen={isCreateDialogOpen} 
          onClose={() => setIsCreateDialogOpen(false)} 
        />
      </Portal>
      
      {/* Top Header & Actions */}
      <section className="flex flex-col md:flex-row items-center justify-between gap-6 px-2">
        <div>
           <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2 text-glow-indigo">
             Event <span className="text-[var(--sec)]">Manager</span>
           </h1>
           <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">Conference Management System</p>
        </div>
        <div className="flex items-center gap-4">
           <div className="relative group hidden xl:block">
              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search all events..."
                className="w-80 h-12 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-full pl-12 pr-4 text-[11px] font-black uppercase tracking-widest text-[var(--text)] group-focus-within:border-[var(--pri)]/50 transition-all placeholder:text-muted"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted group-focus-within:text-[var(--pri)] transition-colors" />
           </div>
           <Button 
             onClick={() => setIsCreateDialogOpen(true)}
             className="h-12 px-8 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] border-0 hover-lift-3d"
           >
             <Plus className="mr-2 h-4 w-4" /> Create Event
           </Button>
           <Button variant="outline" className="h-12 px-8 border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted hover:text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full hover-lift-3d">
             <Copy className="mr-2 h-4 w-4" /> Duplicate Previous
           </Button>
         </div>
      </section>

      {/* Global Metrics Row */}
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-3d p-6 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 h-32 w-32 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-[var(--pri)]/5 transition-all" />
            <div className="flex items-center justify-between mb-8">
              <div className="h-12 w-12 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center group-hover:border-[var(--pri)]/50 group-hover:bg-[var(--pri)]/10 transition-all">
                <metric.icon className={cn("h-6 w-6", metric.color)} />
              </div>
              <Badge variant="outline" className="text-[9px] border-default text-muted font-black tracking-tighter uppercase">
                {metric.trend}
              </Badge>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">{metric.label}</p>
            <h3 className="text-4xl font-black text-[var(--text)] tracking-tighter">
               {isLoading && metric.label !== "System Status" ? <Skeleton className="h-10 w-16 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" /> : metric.value}
            </h3>
          </motion.div>
        ))}
      </section>

      {/* Main Grid: Kanban + Sidebar */}
      <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
        
        {/* Strategic Tab Navigation */}
        <section className="flex flex-col gap-10 min-w-0">
           <div className="flex flex-col md:flex-row items-center justify-between gap-6 px-2">
              <div className="flex bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-3xl p-2 border border-default/50 backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-br from-[var(--pri)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                 {swimlanes.map((lane) => (
                   <button
                     key={lane.id}
                     onClick={() => setActiveTab(lane.id)}
                     className={cn(
                       "relative px-10 py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-500 z-10",
                       activeTab === lane.id 
                         ? "text-[var(--text)]" 
                         : "text-muted hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)]"
                     )}
                   >
                     {activeTab === lane.id && (
                       <motion.div
                         layoutId="active-dashboard-tab"
                         className="absolute inset-0 bg-[var(--pri)] rounded-2xl shadow-[0_10px_30px_var(--pri)/30] z-[-1]"
                         transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                       />
                     )}
                     {lane.label}
                   </button>
                 ))}
              </div>
              
              <div className="flex items-center gap-4">
                 <Badge variant="outline" className="h-10 px-6 border-default text-muted font-black text-[10px] tracking-widest rounded-xl">
                    {events?.filter(e => swimlanes.find(l => l.id === activeTab)?.statuses.includes(e.status)).length || 0} EVENTS FOUND
                 </Badge>
              </div>
           </div>

           {/* Event Cluster Grid */}
           <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-8 pb-20">
              <AnimatePresence>
                 {isLoading ? (
                   [1, 2, 3].map(i => (
                     <motion.div
                       key={`skeleton-${i}`}
                       initial={{ opacity: 0, y: 20 }}
                       animate={{ opacity: 1, y: 0 }}
                       exit={{ opacity: 0, y: -20 }}
                       className="h-[340px] w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[3rem] animate-pulse"
                     />
                   ))
                 ) : (
                    events?.filter(e => swimlanes.find(l => l.id === activeTab)?.statuses.includes(e.status)).length === 0 ? (
                       <motion.div 
                         initial={{ opacity: 0, scale: 0.95 }}
                         animate={{ opacity: 1, scale: 1 }}
                         className="col-span-full py-32 flex flex-col items-center justify-center border-2 border-dashed border-default rounded-[4rem] text-center space-y-6"
                       >
                          <div className="h-20 w-20 rounded-3xl bg-[var(--pri)]/5 flex items-center justify-center border border-default shadow-xl">
                             <Globe className="h-10 w-10 text-muted opacity-30" />
                          </div>
                          <div className="space-y-2">
                             <h3 className="text-xl font-black text-[var(--text)] tracking-tight">No Events Found</h3>
                             <p className="text-[12px] font-bold text-muted uppercase tracking-widest">Selected list is currently empty</p>
                          </div>
                       </motion.div>
                    ) : (
                       events?.filter(e => swimlanes.find(l => l.id === activeTab)?.statuses.includes(e.status)).map((event, idx) => (
                         <motion.div
                           key={event.id}
                           initial={{ opacity: 0, y: 30, rotateX: -5 }}
                           animate={{ opacity: 1, y: 0, rotateX: 0 }}
                           exit={{ opacity: 0, scale: 0.95 }}
                           transition={{ delay: idx * 0.05, type: "spring", damping: 20 }}
                         >
                           <Link href={`/events/${event.id}`} className="block group h-full">
                             <motion.div
                               whileHover={{ y: -12, scale: 1.02 }}
                               className="glass-3d p-10 rounded-[3.5rem] border-default relative overflow-hidden group-hover:border-[var(--pri)]/40 transition-all duration-500 shadow-2xl h-[340px] flex flex-col justify-between"
                             >
                                <div className="absolute top-0 right-0 h-48 w-48 bg-[var(--pri)]/10 blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                
                                <div className="space-y-8">
                                   <div className="flex items-center justify-between">
                                      <div className="h-14 w-14 rounded-2xl bg-[color-mix(in_srgb,var(--base)_40%,transparent)] flex items-center justify-center border border-default shadow-xl group-hover:border-[var(--pri)]/30 transition-colors">
                                         <Globe className="h-7 w-7 text-[var(--pri)]" />
                                      </div>
                                      <div className="flex gap-2">
                                         <Badge className="bg-[var(--pri)]/10 text-[var(--pri)] border-0 font-black text-[10px] px-4 py-1.5 rounded-full">{event.short_code}</Badge>
                                         <Badge variant="outline" className="border-default text-muted font-black text-[10px] px-3 py-1.5 rounded-full uppercase">{event.status}</Badge>
                                      </div>
                                   </div>

                                   <div className="space-y-3">
                                      <h3 className="text-[26px] font-black text-[var(--text)] group-hover:text-[var(--sec)] transition-colors line-clamp-1 leading-tight tracking-tighter">
                                         {event.name}
                                      </h3>
                                      <p className="text-[11px] font-bold text-muted line-clamp-2 uppercase tracking-widest leading-relaxed">
                                         {event.location || "Hybrid Venue"} • Digital Environment
                                      </p>
                                   </div>
                                </div>

                                <div className="flex items-center justify-between pt-10 border-t border-default/50 mt-auto">
                                   <div className="flex items-center gap-6">
                                      <div className="relative h-14 w-14">
                                         <svg className="h-full w-full transform -rotate-90">
                                            <circle cx="28" cy="28" r="24" fill="transparent" stroke="currentColor" strokeWidth="4" className="text-muted/10" />
                                            <motion.circle 
                                              cx="28" cy="28" r="24" 
                                              fill="transparent" 
                                              stroke={event.status === 'active' ? 'var(--success)' : 'var(--pri)'} 
                                              strokeWidth="4" 
                                              strokeDasharray={151} 
                                              initial={{ strokeDashoffset: 151 }}
                                              animate={{ strokeDashoffset: 151 - (151 * 0.84) }}
                                              transition={{ duration: 2, ease: "easeOut" }}
                                              strokeLinecap="round" 
                                            />
                                         </svg>
                                         <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-[var(--text)]">84%</span>
                                      </div>
                                      <div className="space-y-1">
                                         <p className="text-[10px] font-black text-muted uppercase tracking-widest">Setup Progress</p>
                                         <div className="flex items-center gap-2">
                                            <div className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                                            <p className="text-[12px] font-bold text-[var(--text)] uppercase tracking-tighter">Ready</p>
                                         </div>
                                      </div>
                                   </div>
                                   <div className="h-14 w-14 rounded-full glass-3d border-default flex items-center justify-center text-muted group-hover:text-[var(--pri)] group-hover:border-[var(--pri)]/30 group-hover:scale-110 transition-all shadow-xl">
                                      <ChevronRight className="h-7 w-7" />
                                    </div>
                                </div>
                             </motion.div>
                           </Link>
                         </motion.div>
                       ))
                    )
                 )}
              </AnimatePresence>
           </div>
        </section>

         {/* Right Sidebar: Notification + Task Center */}
         <aside className="space-y-10">
            {/* Notification Center */}
            <div className="glass-3d p-8 rounded-[2.5rem] border-default relative overflow-hidden group">
               <div className="absolute top-0 right-0 h-32 w-32 bg-[var(--pri)]/5 blur-3xl -mr-16 -mt-16 group-hover:bg-[var(--pri)]/10 transition-all" />
               <div className="flex items-center justify-between mb-8">
                  <h2 className="text-[12px] font-black uppercase tracking-[0.3em] text-[var(--text)] flex items-center gap-3">
                     <Bell className="h-4 w-4 text-[var(--pri)]" /> Notifications
                  </h2>
                  <div className="h-2 w-2 rounded-full bg-[var(--success)] animate-pulse" />
               </div>
               
               <div className="space-y-6">
                  {notifications.map((notif) => {
                    const IconComponent = Icons[notif.icon as keyof typeof Icons] || Activity;
                    return (
                    <div key={notif.id} className="flex gap-4 group/item">
                       <div className="h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center shrink-0 group-hover/item:border-[var(--pri)]/30 transition-all">
                          {/* @ts-ignore */}
                          <IconComponent className={cn("h-4 w-4", notif.color)} />
                       </div>
                       <div>
                          <div className="flex items-center gap-2 mb-1">
                             <p className="text-[11px] font-black text-[var(--text)] tracking-tight">{notif.title}</p>
                             <span className="text-[9px] font-bold text-muted uppercase">{notif.time}</span>
                          </div>
                          <p className="text-[10px] font-bold text-muted leading-tight">{notif.desc}</p>
                       </div>
                    </div>
                  )})}
               </div>
            </div>

            {/* Tactical Task Center */}
            <div className="glass-3d p-8 rounded-[2.5rem] border-default bg-gradient-to-br from-[var(--sec)]/5 to-transparent">
               <div className="flex items-center justify-between mb-8">
                  <h2 className="text-[12px] font-black uppercase tracking-[0.3em] text-[var(--text)] flex items-center gap-3">
                     <ClipboardCheck className="h-4 w-4 text-[var(--sec)]" /> Tasks
                  </h2>
                  <Badge variant="outline" className="text-[9px] border-default text-muted font-black">
                    {tasks.filter(t => !t.done).length} PENDING
                  </Badge>
               </div>
               
               <div className="space-y-4">
                  {tasks.map((task) => (
                    <div 
                       key={task.id} 
                       onClick={() => toggleTask(task.id)}
                       className="cursor-pointer flex items-center justify-between p-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default/50 group/task hover:border-[var(--sec)]/30 transition-all"
                    >
                       <p className={cn("text-[11px] font-bold tracking-tight", task.done ? "text-muted line-through" : "text-[var(--text)]")}>
                          {task.label}
                       </p>
                       <div className={cn(
                          "h-5 w-5 rounded-md border border-default flex items-center justify-center transition-all",
                          task.done ? "bg-[var(--success)] border-[var(--success)]" : "group-hover/task:border-[var(--sec)]"
                       )}>
                          {task.done && <Plus className="h-3 w-3 text-[var(--base)] rotate-45" />}
                       </div>
                    </div>
                  ))}
               </div>
            </div>
         </aside>
      </div>
    </div>
  );
}
