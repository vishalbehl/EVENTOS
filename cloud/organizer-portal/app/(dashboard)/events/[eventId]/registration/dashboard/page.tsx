"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight, Banknote, CheckCircle2, RefreshCw, Sparkles, TrendingUp, UserPlus, Users
} from "lucide-react";
import { useEvent } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { apiGet } from "@/lib/api-client";

interface Participant {
  id: string;
  regno: string;
  name: string;
  email: string;
  role: string;
  paid_status: string;
  source: string;
  registered_at: string;
}

const localeByCurrency: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  AUD: "en-AU",
  CAD: "en-CA",
};

export default function RegistrationDashboard() {
  const { eventId } = useParams();
  const { data: event } = useEvent(eventId as string);

  const [stats, setStats] = useState({ total: 0, checkedIn: 0, paid: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);
  const [recentParticipants, setRecentParticipants] = useState<Participant[]>([]);
  const [roleBreakdown, setRoleBreakdown] = useState<Record<string, number>>({});

  const currency = event?.currency || "INR";
  const timezone = event?.timezone || "Asia/Kolkata";
  const locale = localeByCurrency[currency] || "en-IN";
  const formatCurrency = (value: number) => new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
  const formatEventDateTime = (value: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const statsRes = await apiGet<any>(`/events/${eventId}/participants/stats`);
      const list = await apiGet<Participant[]>(`/events/${eventId}/participants`);
      const pricing = await apiGet<Record<string, number>>(`/events/${eventId}/pricing`);

      let revenue = 0;
      list.forEach(p => {
        if (p.paid_status === "Paid") revenue += pricing[`${p.role}_Standard`] || 0;
      });

      setStats({
        total: statsRes.total,
        checkedIn: statsRes.checkins,
        paid: statsRes.paid,
        revenue: revenue || statsRes.paid * 150,
      });
      setRoleBreakdown(statsRes.role_breakdown || {});
      setRecentParticipants(list.slice(0, 8));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load dashboard statistics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) fetchDashboardData();
  }, [eventId]);

  const statCards = [
    { label: "Total Delegates", value: stats.total, icon: Users, color: "text-[var(--pri)]", delay: 0.05 },
    { label: "Checked In", value: stats.checkedIn, icon: CheckCircle2, color: "text-emerald-500", delay: 0.1, suffix: stats.total > 0 ? `${Math.round((stats.checkedIn / stats.total) * 100)}%` : "0%" },
    { label: "Paid Registrations", value: stats.paid, icon: Banknote, color: "text-[var(--sec)]", delay: 0.15, suffix: stats.total > 0 ? `${Math.round((stats.paid / stats.total) * 100)}%` : "0%" },
    { label: "Est. Revenue", value: formatCurrency(stats.revenue), icon: TrendingUp, color: "text-amber-500", delay: 0.2 },
  ];

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--pri)] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]/85">Registration Hub</span>
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mt-1 text-glow-indigo">
            {event?.name ? `${event.name} Desk` : "Event Registration Desk"}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mt-1">
            Monitor intake, payments, check-ins, and recent participant activity in {currency} / {timezone}.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href={`/events/${eventId}/registration/register`}>
            <Button className="h-12 px-7 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border-0 hover-lift-3d">
              <UserPlus className="h-4 w-4 mr-2" />
              Register Participants
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
          <Button onClick={fetchDashboardData} disabled={loading} className="h-12 px-7 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default hover-lift-3d">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh Stats
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: card.delay }}>
            <Card className="glass-3d p-6 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-32 bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{card.label}</span>
                <div className="h-9 w-9 rounded-xl glass-3d flex items-center justify-center border-default shadow-md">
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-black text-[var(--text)] tracking-tighter">{card.value}</span>
                {card.suffix && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">{card.suffix}</span>}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 glass-3d p-6 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-6">Recent Registrations</h3>
          <div className="divide-y divide-default/30">
            {recentParticipants.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted font-bold">No registrations yet.</div>
            ) : recentParticipants.map(p => (
              <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
                <div>
                  <h4 className="text-sm font-black tracking-tight text-[var(--text)]">{p.name}</h4>
                  <p className="text-[9px] font-black uppercase tracking-wider text-muted mt-0.5">{p.email || p.regno}</p>
                  <p className="text-[9px] font-black uppercase tracking-wider text-muted/70 mt-0.5">{formatEventDateTime(p.registered_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] px-3 py-1.5 rounded-full bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">{p.role}</span>
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] px-3 py-1.5 rounded-full bg-white/5 text-muted border border-default">{p.source}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="glass-3d p-6 rounded-[2rem] border-default group hover-lift-3d relative overflow-hidden bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-6">Role Distribution</h3>
          <div className="space-y-4">
            {Object.keys(roleBreakdown).length === 0 ? (
              <div className="text-center py-6 text-xs text-muted font-bold">No distribution data.</div>
            ) : Object.entries(roleBreakdown).map(([role, count]) => {
              const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <div key={role} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--text)]">
                    <span>{role}</span>
                    <span>{count} ({Math.round(percentage)}%)</span>
                  </div>
                  <div className="h-2 w-full bg-[var(--base)]/25 rounded-full overflow-hidden border border-default/20">
                    <div className="h-full bg-[var(--pri)] rounded-full transition-all duration-500 shadow-[0_0_8px_var(--pri)]" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
