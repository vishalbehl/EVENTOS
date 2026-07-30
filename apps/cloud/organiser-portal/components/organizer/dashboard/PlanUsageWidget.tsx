"use client";

import { motion } from "framer-motion";
import { 
  Shield, Calendar, Users, BarChart3, Database, 
  AlertTriangle, CheckCircle, ArrowRight 
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBillingPlan } from "@/hooks/useEvents";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

export function PlanUsageWidget() {
  const router = useRouter();
  const { data, isLoading, isError } = useBillingPlan();

  if (isLoading) {
    return (
      <div className="glass-3d p-8 rounded-[2.5rem] border-default space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40 bg-indigo-500/10" />
            <Skeleton className="h-4 w-60 bg-indigo-500/10" />
          </div>
          <Skeleton className="h-8 w-24 bg-indigo-500/10 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20 bg-indigo-500/10" />
                <Skeleton className="h-4 w-12 bg-indigo-500/10" />
              </div>
              <Skeleton className="h-3 w-full bg-indigo-500/10 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="glass-3d p-8 rounded-[2.5rem] border-default flex flex-col items-center justify-center text-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-widest">
          Subscription System Offline
        </h4>
        <p className="text-[11px] text-muted max-w-sm uppercase font-bold">
          Could not retrieve plan usage stats. Please verify your internet connection or contact support.
        </p>
      </div>
    );
  }

  const { plan, usage, status, current_period_end, trial_ends_at } = data;

  // Format date
  const dateStr = trial_ends_at || current_period_end;
  const formattedDate = dateStr 
    ? new Date(dateStr).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric"
      })
    : "N/A";

  const isTrial = status?.toUpperCase() === "TRIAL";

  // Meter configuration
  const meters = [
    {
      name: "Events",
      used: usage.events.used,
      max: usage.events.max,
      icon: Calendar,
      color: "from-blue-500 to-indigo-500",
      bgClass: "bg-blue-500/10",
      iconColor: "text-blue-400"
    },
    {
      name: "Team Users",
      used: usage.users.used,
      max: usage.users.max,
      icon: Users,
      color: "from-purple-500 to-pink-500",
      bgClass: "bg-purple-500/10",
      iconColor: "text-purple-400"
    },
    {
      name: "Registrations",
      used: usage.registrations.used,
      max: usage.registrations.max,
      icon: BarChart3,
      color: "from-emerald-500 to-teal-500",
      bgClass: "bg-emerald-500/10",
      iconColor: "text-emerald-400"
    },
    {
      name: "Storage Used",
      used: usage.storage.used_mb,
      max: usage.storage.max_mb,
      unit: "MB",
      icon: Database,
      color: "from-amber-500 to-orange-500",
      bgClass: "bg-amber-500/10",
      iconColor: "text-amber-400"
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-3d p-8 rounded-[2.5rem] border-default relative overflow-hidden shadow-2xl flex flex-col justify-between"
    >
      {/* Background glow matching plan color */}
      <div className="absolute top-0 right-0 w-64 h-64 opacity-5 blur-[80px] rounded-full pointer-events-none"
           style={{ backgroundColor: plan.color_hex || "#6366F1" }} />

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-default/40 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-[14px] font-black uppercase tracking-widest text-[var(--text)]">
              Subscription Plan
            </h3>
            <Badge 
              style={{ 
                background: plan.color_hex ? `linear-gradient(135deg, ${plan.color_hex}22, ${plan.color_hex}44)` : undefined,
                borderColor: plan.color_hex ? `${plan.color_hex}55` : undefined,
                color: plan.color_hex || undefined
              }}
              className="text-[10px] font-black border uppercase px-3 py-0.5 rounded-full"
            >
              {plan.name}
            </Badge>
          </div>
          <p className="text-[11px] font-medium text-muted mt-1 uppercase tracking-wider">
            {plan.tagline || "Capability details are resolved from the active commercial contract."}
          </p>
        </div>

        <div className="flex flex-col sm:items-end text-left sm:text-right">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
              {status} {isTrial && "(Trial)"}
            </span>
          </div>
          <p className="text-[10px] font-bold text-muted uppercase mt-0.5">
            {isTrial ? `Trial Ends: ${formattedDate}` : `Renewal Date: ${formattedDate}`}
          </p>
        </div>
      </div>

      {/* Usage Progress Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {meters.map((meter) => {
          const isUnavailable = meter.max === null || meter.max === undefined;
          const isBlocked = !isUnavailable && meter.max <= 0;
          const percentage =
            !isUnavailable && !isBlocked
              ? Math.min(100, (meter.used / meter.max) * 100)
              : 0;
          const isNearLimit = !isUnavailable && !isBlocked && percentage >= 90;

          return (
            <div key={meter.name} className="p-4 border border-default/40 rounded-2xl bg-[color-mix(in_srgb,var(--text)_2%,transparent)] space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className={cn("p-2 rounded-lg", meter.bgClass)}>
                    <meter.icon className={cn("h-4 w-4", meter.iconColor)} />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-tight text-[var(--text)]">
                    {meter.name}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[var(--text)]">
                    {meter.used.toLocaleString()}
                    <span className="text-muted"> / </span>
                    {isUnavailable ? "Not configured" : meter.max.toLocaleString()}
                    {meter.unit && ` ${meter.unit}`}
                  </span>
                  {isNearLimit && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-full overflow-hidden relative">
                {!isUnavailable && !isBlocked && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={cn("h-full rounded-full bg-gradient-to-r", meter.color)}
                  />
                )}
                {(isUnavailable || isBlocked) && (
                  <div className="h-full w-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-full" />
                )}
              </div>

              {/* Percentage label or unlimited badge */}
              <div className="flex justify-between items-center text-[9px] font-bold text-muted uppercase">
                <span>
                  {isUnavailable ? (
                    <span className="text-muted font-black">Allowance unavailable</span>
                  ) : isBlocked ? (
                    <span className="text-red-500/80 font-black">Capability blocked</span>
                  ) : (
                    `${percentage.toFixed(0)}% Consumed`
                  )}
                </span>
                {isNearLimit && (
                  <span className="text-amber-500 font-black">Near limit warning</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer / Call to Action */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-default/40 mt-auto">
        <div className="flex items-center gap-2 text-[10px] font-bold text-muted uppercase">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <span>Usage and allowances come from canonical capability resolution</span>
        </div>

        <Button 
          onClick={() => router.push("/settings")}
          className="h-10 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-[9px] rounded-xl flex items-center justify-center border-0 px-6 group transition-all"
        >
          Manage Settings
          <ArrowRight className="ml-2 h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </motion.div>
  );
}
