"use client";

import { useState } from "react";
import { 
  Database, Plus, Search, Filter, Mail, Globe, 
  Cloud, Zap, ShieldCheck, ChevronRight, Share2, 
  Settings, Key, Webhook, Box
} from "lucide-react";
import { PageHeader } from "@/components/organizer/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function ConnectionsPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const connections = [
    { name: "Postmark", type: "Email Service", status: "Active", icon: Mail, color: "text-[var(--warn)]" },
    { name: "AWS S3", type: "Storage Hub", status: "Active", icon: Cloud, color: "text-[var(--pri)]" },
    { name: "Twilio WhatsApp", type: "Communications", status: "Inactive", icon: Share2, color: "text-[var(--success)]" },
    { name: "Global Webhook v1", type: "Event Bridge", status: "Active", icon: Webhook, color: "text-[var(--sec)]" },
  ];

  return (
    <div className="space-y-10 max-w-[1400px] mx-auto pb-20 animate-fade-in perspective-1000">
      <PageHeader 
        title="Global Connections" 
        description="Integrate with external cloud services, communication hubs, and event bridges."
      >
        <Button className="h-11 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-bold px-6 rounded-xl shadow-lg border-0">
          <Plus className="mr-2 h-4 w-4" /> New Connection
        </Button>
      </PageHeader>

      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {connections.map((conn, i) => (
          <div key={conn.name} className="glass-card p-6 rounded-[2rem] border-default relative group overflow-hidden">
            <div className="absolute top-0 right-0 h-24 w-24 bg-[var(--pri)]/5 blur-3xl rounded-full" />
            <div className="flex items-center justify-between mb-8">
              <div className="h-14 w-14 rounded-2xl bg-[var(--card)] border border-default flex items-center justify-center group-hover:border-[var(--pri)]/50 group-hover:bg-[var(--pri)]/10 transition-all">
                <conn.icon className={cn("h-7 w-7 transition-transform group-hover:scale-110", conn.color)} />
              </div>
              <Badge className={cn(
                "px-3 py-1 rounded-lg text-[9px] font-black tracking-widest border-0",
                conn.status === 'Active' ? "bg-[var(--success)]/20 text-[var(--success)]" : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted"
              )}>
                {conn.status.toUpperCase()}
              </Badge>
            </div>
            <div>
               <h3 className="text-xl font-black text-[var(--text)] mb-1 group-hover:text-[var(--sec)] transition-colors">{conn.name}</h3>
               <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted mb-6">{conn.type}</p>
            </div>
            <div className="pt-6 border-t border-default flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <button className="text-muted hover:text-[var(--text)] transition-colors"><Settings className="h-4 w-4" /></button>
                  <button className="text-muted hover:text-[var(--text)] transition-colors"><Key className="h-4 w-4" /></button>
               </div>
               <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest text-[var(--pri)] hover:bg-[var(--pri)]/10 h-8 px-3 rounded-lg">
                  Configure <ChevronRight className="ml-1 h-3 w-3" />
               </Button>
            </div>
          </div>
        ))}

        {/* Empty / Add Card */}
        <button className="border-2 border-dashed border-default rounded-[2rem] flex flex-col items-center justify-center gap-4 transition-all hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--pri)]/20 group">
           <div className="h-14 w-14 rounded-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center group-hover:bg-[var(--pri)]/10 transition-all">
              <Plus className="h-6 w-6 text-muted group-hover:text-[var(--pri)]" />
           </div>
           <span className="text-[11px] font-black uppercase tracking-[0.2em] text-muted group-hover:text-muted transition-colors">Add Integration</span>
        </button>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1fr_400px]">
         {/* Webhook Monitor */}
         <Card className="glass-panel border-default rounded-[2.5rem] p-8">
            <div className="flex items-center justify-between mb-8">
               <div>
                  <p className="text-[10px] font-bold text-[var(--warn)] uppercase tracking-[0.2em] mb-1">Live Endpoint</p>
                  <CardTitle className="text-2xl font-black text-[var(--text)]">Event Bridges</CardTitle>
               </div>
               <Badge className="bg-[var(--warn)]/10 text-[var(--warn)] border-0 text-[10px] font-bold px-3 py-1 uppercase tracking-widest">3 Nodes Online</Badge>
            </div>
            <div className="space-y-4">
               {[
                 { event: "speaker.upload_complete", endpoint: "https://api.internal.sync/v1", latency: "24ms" },
                 { event: "session.schedule_update", endpoint: "https://webhooks.partner.com/inbound", latency: "142ms" },
                 { event: "user.auth_success", endpoint: "https://audit.log.stream/pulse", latency: "8ms" },
               ].map((bridge, i) => (
                 <div key={i} className="flex items-center justify-between p-5 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default group hover:border-[var(--pri)]/30 transition-all">
                    <div className="space-y-1">
                       <p className="text-[12px] font-bold text-[var(--text)] tracking-wide">{bridge.event}</p>
                       <p className="text-[10px] font-mono text-muted truncate max-w-sm">{bridge.endpoint}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[11px] font-bold text-muted">{bridge.latency}</p>
                       <div className="flex items-center gap-1 justify-end mt-1">
                          <div className="h-1 w-1 rounded-full bg-[var(--success)] animate-pulse" />
                          <span className="text-[8px] font-bold text-[var(--success)] uppercase tracking-widest">Operational</span>
                       </div>
                    </div>
                 </div>
               ))}
            </div>
         </Card>

         {/* Connection Health Sidebar */}
         <aside className="space-y-6">
            <div className="glass-panel p-8 rounded-[2.5rem] space-y-8">
               <h3 className="text-sm font-black text-muted uppercase tracking-[0.25em] px-1">Network Integrity</h3>
               <div className="space-y-6">
                  <div>
                     <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-muted mb-3 px-1">
                        <span>API Throughput</span>
                        <span>84.2 MB/s</span>
                     </div>
                     <div className="h-1.5 w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] w-[72%] rounded-full shadow-[0_0_15px_var(--pri)]" />
                     </div>
                  </div>
                  <div>
                     <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-muted mb-3 px-1">
                        <span>Database Sync</span>
                        <span>100%</span>
                     </div>
                     <div className="h-1.5 w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--success)] w-full rounded-full shadow-[0_0_15px_var(--success)]" />
                     </div>
                  </div>
               </div>
               
               <div className="pt-8 border-t border-default">
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--pri)]/5 border border-[var(--pri)]/10">
                     <ShieldCheck className="h-6 w-6 text-[var(--pri)]" />
                     <p className="text-[11px] text-muted leading-relaxed font-medium">
                        All external nodes are responding within <span className="text-[var(--text)] font-bold">200ms</span>. Global sync lock is active.
                     </p>
                  </div>
               </div>
            </div>

            <div className="p-8 rounded-[2.5rem] glass-card border-0 bg-gradient-to-br from-[var(--sec)]/10 to-transparent">
               <h4 className="text-sm font-black text-muted uppercase tracking-widest mb-4">Enterprise Keys</h4>
               <p className="text-[11px] text-muted leading-relaxed mb-6">Manage high-security access keys for hall systems and partner APIs.</p>
               <Button className="w-full h-11 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default text-muted hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)] rounded-xl text-[11px] font-black uppercase tracking-widest">
                  Rotate System Keys
               </Button>
            </div>
         </aside>
      </section>
    </div>
  );
}
