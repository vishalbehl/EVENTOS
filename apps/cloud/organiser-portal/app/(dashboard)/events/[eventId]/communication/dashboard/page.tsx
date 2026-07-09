"use client";

import { use, useState } from "react";
import { 
  Mail, MessageSquare, Bell, Megaphone, TrendingUp, RefreshCw,
  CheckCircle2, AlertCircle, Sparkles, Send, Users, ArrowUpRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function CommunicationDashboardPage({ params: paramsPromise }: { params: Promise<{ eventId: string }> }) {
  const params = use(paramsPromise);
  const { eventId } = params;

  const [refreshing, setRefreshing] = useState(false);

  const triggerRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <div className="relative w-full max-w-full overflow-x-hidden p-6">
      {/* Background Aesthetics */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[var(--pri)] rounded-full blur-[120px] opacity-10 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-[var(--sec)] rounded-full blur-[120px] opacity-10" />
      </div>

      <div className="relative z-10 w-full space-y-6">
        {/* Header section */}
        <header className="flex flex-col gap-4 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Mail className="h-4 w-4 text-[var(--pri)]" />
              <span className="text-[9px] font-black uppercase tracking-[0.35em] text-[var(--pri)]">Overview</span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-[var(--text)]">
              COMMUNICATION <span className="text-[var(--pri)]">HUB</span>
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted mt-1">
              Campaigns Dashboard · Channels Status · Dispatch Analytics
            </p>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={triggerRefresh}
            className="w-fit bg-white/5 border-white/10 hover:bg-white/10 gap-2 text-xs font-semibold rounded-xl"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-[var(--pri)]" : ""}`} />
            Refresh Logs
          </Button>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Emails", value: "1,482", sub: "98.8% Deliverability", icon: Mail },
            { label: "Open Rate", value: "68.4%", sub: "Industry Avg: 24%", icon: TrendingUp },
            { label: "Bulletins Feed", value: "8", sub: "3 Pinned Broadcasts", icon: Megaphone },
            { label: "Alerts Pushed", value: "34", sub: "Real-time updates", icon: Bell },
          ].map((stat, i) => (
            <Card key={i} className="glass-3d border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-2xl">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase text-muted tracking-widest">{stat.label}</span>
                  <h3 className="text-2xl font-black text-[var(--text)] mt-1">{stat.value}</h3>
                  <span className="text-[9px] text-indigo-400 font-semibold block mt-0.5">{stat.sub}</span>
                </div>
                <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-muted">
                  <stat.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Channels Integrations & Dispatch status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Channel Status */}
          <Card className="lg:col-span-1 glass-3d border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-[2rem] p-6 space-y-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] border-b border-white/5 pb-3">
              Delivery Channels
            </h3>
            
            <div className="space-y-4">
              {[
                { name: "SMTP Email Service", desc: "AWS SES Outbound Node", status: "Connected", style: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { name: "WhatsApp Business API", desc: "Twilio Sandbox Connected", status: "Active", style: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { name: "Push Notifications", desc: "Firebase Cloud Messaging", status: "Connected", style: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { name: "Slack & Webhooks", desc: "External Endpoint Relays", status: "Disabled", style: "text-muted bg-white/5 border-white/10" }
              ].map((chan, i) => (
                <div key={i} className="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/[0.01]">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text)]">{chan.name}</h4>
                    <span className="text-[9px] text-muted">{chan.desc}</span>
                  </div>
                  <Badge className={`rounded-md text-[8px] font-bold uppercase tracking-wider border ${chan.style}`}>
                    {chan.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent Campaigns Run */}
          <Card className="lg:col-span-2 glass-3d border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-[2rem] p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)]">
                Recent Outbound Campaigns
              </h3>
              <Badge className="bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20 rounded-md text-[8px] font-bold tracking-wider uppercase">
                Active Campaigns
              </Badge>
            </div>

            <div className="space-y-4">
              {[
                { title: "Early Bird Extension Announcement", type: "Participant Email", sent: 842, opens: "72.4%", status: "Sent" },
                { title: "Presentation Slide Upload Reminders", type: "Speaker Campaign", sent: 120, opens: "89.2%", status: "Sending" },
                { title: "Badge QR Code Dispatch", type: "Participant Email", sent: 520, opens: "54.1%", status: "Queued" }
              ].map((camp, i) => {
                const sending = camp.status === "Sending";
                const sent = camp.status === "Sent";

                const badgeStyle = sending 
                  ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" 
                  : sent 
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                  : "bg-white/5 text-muted border-white/10";

                return (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-white/5 bg-white/[0.01] rounded-2xl">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-black text-[var(--text)]">{camp.title}</h4>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] text-muted uppercase font-semibold">{camp.type}</span>
                        <span className="h-1 w-1 bg-white/20 rounded-full" />
                        <span className="text-[9px] text-indigo-400 font-semibold">{camp.sent} recipients</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 shrink-0 text-right">
                      <div>
                        <span className="text-[8px] font-black uppercase tracking-widest text-muted block">Opens</span>
                        <span className="text-xs font-black text-[var(--text)]">{camp.opens}</span>
                      </div>
                      <Badge className={`rounded-md text-[8px] font-black uppercase tracking-widest border ${badgeStyle}`}>
                        {camp.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
