"use client";

import { useParams } from "next/navigation";
import { Bell, CheckCircle, Clock, FileUp, Mail, AlertCircle, Search, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NotificationsPage() {
  const { eventId } = useParams();

  const notifications = [
    {
      id: 1,
      title: "New Speaker Registration",
      description: "Dr. Sarah Jenkins has completed her registration for the 'Quantum Computing' session.",
      time: "2 hours ago",
      type: "success",
      icon: CheckCircle,
    },
    {
      id: 2,
      title: "File Upload Pending",
      description: "Presentation materials for 'AI in Healthcare' are awaiting review.",
      time: "4 hours ago",
      type: "warning",
      icon: FileUp,
    },
    {
      id: 3,
      title: "Email Campaign Update",
      description: "The 'Final Reminder' campaign has been sent to 45 speakers.",
      time: "6 hours ago",
      type: "info",
      icon: Mail,
    },
    {
      id: 4,
      title: "System Alert",
      description: "Room 101 capacity threshold reached for Session S-402.",
      time: "Yesterday",
      type: "error",
      icon: AlertCircle,
    },
  ];

  return (
    <div className="space-y-10 animate-fade-in">
      <header className="flex flex-col md:flex-row items-center justify-between gap-6 px-2">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2 text-glow-indigo">
            Notification <span className="text-[var(--sec)]">Center</span>
          </h1>
          <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">Command all communications</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-full px-6 border-default text-[11px] font-black uppercase tracking-widest">Mark All Read</Button>
          <Button className="h-12 px-8 bg-[var(--pri)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-lg border-0">Settings</Button>
        </div>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-6 px-2">
        <div className="flex-1 min-w-[320px] max-w-md relative group">
          <div className="relative neomorphic-inset rounded-2xl p-0.5 border border-default focus-within:border-[var(--pri)]/50 transition-all">
            <Search className="absolute left-5 top-4 h-4 w-4 text-muted" />
            <Input
              placeholder="Search notifications..."
              className="h-12 bg-transparent border-0 pl-14 text-[13px] font-bold text-[var(--text)] focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
           <Button variant="ghost" className="h-12 px-6 rounded-2xl glass-3d border-default flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted hover:text-[var(--text)]">
             <Filter className="h-4 w-4" /> Filters
           </Button>
        </div>
      </section>

      <div className="grid gap-6">
        {notifications.map((n) => (
          <Card key={n.id} className="glass-3d border-default rounded-3xl p-6 hover-lift-3d transition-all">
            <div className="flex items-start gap-6">
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border border-default
                ${n.type === 'success' ? 'bg-[var(--success)]/10 text-[var(--success)]' : 
                  n.type === 'warning' ? 'bg-[var(--warn)]/10 text-[var(--warn)]' : 
                  n.type === 'error' ? 'bg-[var(--dan)]/10 text-[var(--dan)]' : 
                  'bg-[var(--pri)]/10 text-[var(--pri)]'}`}>
                <n.icon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[16px] font-black text-[var(--text)]">{n.title}</h3>
                  <span className="text-[10px] font-black text-muted uppercase tracking-widest">{n.time}</span>
                </div>
                <p className="text-[13px] font-bold text-muted leading-relaxed">{n.description}</p>
                <div className="mt-4 flex items-center gap-3">
                  <Button variant="ghost" className="h-8 px-4 text-[10px] font-black uppercase tracking-widest text-[var(--pri)] hover:bg-[var(--pri)]/10 rounded-lg">View Details</Button>
                  <Button variant="ghost" className="h-8 px-4 text-[10px] font-black uppercase tracking-widest text-muted hover:text-[var(--text)] rounded-lg">Dismiss</Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
