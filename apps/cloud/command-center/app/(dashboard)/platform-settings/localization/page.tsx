"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useGlobalSettings, 
  useUpdateGlobalSettings 
} from "@/services/super-admin-service";
import { 
  Settings2, Globe, AlertOctagon, Megaphone, RefreshCw, Mail, 
  Slack, HelpCircle, Save, Eye, EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];

const CURRENCIES = [
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
  { code: "INR", symbol: "₹" },
  { code: "CAD", symbol: "C$" },
  { code: "AUD", symbol: "A$" },
  { code: "SGD", symbol: "S$" },
];

const generalSchema = z.object({
  timezone: z.string().min(1, "Timezone is required"),
  maintenance_mode: z.boolean().default(false),
  currency: z.string().min(1, "Currency is required"),
  broadcast_enabled: z.boolean().default(false),
  broadcast_message: z.string().optional().default(""),
});

const smtpSchema = z.object({
  smtp_host: z.string().optional().default(""),
  smtp_port: z.coerce.number().min(1).max(65535).default(587),
  smtp_user: z.string().optional().default(""),
  smtp_password: z.string().optional().default(""),
  support_email: z.string().email("Must be a valid email").or(z.literal("")),
  slack_webhook_url: z.string().url("Must be a valid URL").or(z.literal("")),
});

type GeneralFormData = z.infer<typeof generalSchema>;
type SmtpFormData = z.infer<typeof smtpSchema>;

export default function GeneralSettingsPage() {
  const { data: settings, isLoading, refetch } = useGlobalSettings();
  const updateSettingsMutation = useUpdateGlobalSettings();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register: registerGeneral,
    handleSubmit: handleSubmitGeneral,
    setValue: setGeneralVal,
    watch: watchGeneral,
    formState: { errors: errorsGeneral, isSubmitting: isSubmittingGeneral }
  } = useForm<GeneralFormData>({
    resolver: zodResolver(generalSchema)
  });

  const {
    register: registerSmtp,
    handleSubmit: handleSubmitSmtp,
    setValue: setSmtpVal,
    formState: { errors: errorsSmtp, isSubmitting: isSubmittingSmtp }
  } = useForm<SmtpFormData>({
    resolver: zodResolver(smtpSchema)
  });

  // Watch for switch states
  const maintenanceMode = watchGeneral("maintenance_mode");
  const broadcastEnabled = watchGeneral("broadcast_enabled");

  useEffect(() => {
    if (settings) {
      setGeneralVal("timezone", settings.timezone || "UTC");
      setGeneralVal("maintenance_mode", settings.maintenance_mode || false);
      setGeneralVal("currency", settings.currency || "USD");
      setGeneralVal("broadcast_enabled", settings.broadcast_enabled || false);
      setGeneralVal("broadcast_message", settings.broadcast_message || "");

      setSmtpVal("smtp_host", settings.smtp_host || "");
      setSmtpVal("smtp_port", settings.smtp_port || 587);
      setSmtpVal("smtp_user", settings.smtp_user || "");
      setSmtpVal("smtp_password", settings.smtp_password || "");
      setSmtpVal("support_email", settings.support_email || "");
      setSmtpVal("slack_webhook_url", settings.slack_webhook_url || "");
    }
  }, [settings, setGeneralVal, setSmtpVal]);

  const onSaveGeneral = async (data: GeneralFormData) => {
    try {
      await updateSettingsMutation.mutateAsync(data);
      toast.success("General settings saved successfully");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save general settings");
    }
  };

  const onSaveSmtp = async (data: SmtpFormData) => {
    try {
      await updateSettingsMutation.mutateAsync(data);
      toast.success("SMTP & Notification settings saved successfully");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save notification settings");
    }
  };

  return (
    <PageContainer>
      <SectionHeader
        title="General Configs"
        description="Configure global cluster regional parameters, currency settings, maintenance states, and SMTP transports."
        breadcrumb={["Console", "Settings", "General"]}
        actions={
          <Button
            variant="outline"
            onClick={() => refetch()}
            size="sm"
            className="border-border"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]", isLoading && "animate-spin")} />
            Sync Configuration
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-start">
        {/* General & Regional Forms */}
        <div className="lg:col-span-6 space-y-6">
          <form onSubmit={handleSubmitGeneral(onSaveGeneral)} className="space-y-6">
            
            {/* Regional Card */}
            <div className="rounded-xl border border-border bg-surface p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2 uppercase tracking-wider">
                <Globe className="w-4 h-4 text-[var(--brand-primary)]" /> Regional & Currency Controls
              </h3>
              <div className="h-px bg-border/60" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Global Timezone</label>
                  <select
                    {...registerGeneral("timezone")}
                    className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-primary)]"
                  >
                    {COMMON_TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  {errorsGeneral.timezone && <p className="text-[10px] text-[var(--danger)]">{errorsGeneral.timezone.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Settlement Currency</label>
                  <select
                    {...registerGeneral("currency")}
                    className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-primary)]"
                  >
                    {CURRENCIES.map(curr => (
                      <option key={curr.code} value={curr.code}>{curr.code} ({curr.symbol})</option>
                    ))}
                  </select>
                  {errorsGeneral.currency && <p className="text-[10px] text-[var(--danger)]">{errorsGeneral.currency.message}</p>}
                </div>
              </div>
            </div>

            {/* Cluster Modes Card */}
            <div className="rounded-xl border border-border bg-surface p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2 uppercase tracking-wider">
                <AlertOctagon className="w-4 h-4 text-[var(--brand-primary)]" /> System State & Lockouts
              </h3>
              <div className="h-px bg-border/60" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-[var(--text-primary)] block">Maintenance Mode</span>
                    <span className="text-[10px] text-[var(--text-tertiary)] block">Block organizer logins and APIs to perform DB schema migrations.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={maintenanceMode || false}
                    onChange={(e) => setGeneralVal("maintenance_mode", e.target.checked)}
                    className="rounded border-border bg-surface text-[var(--brand-primary)] focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-border/40 pt-4">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-[var(--text-primary)] block">Ecosystem Broadcast</span>
                    <span className="text-[10px] text-[var(--text-tertiary)] block">Push dashboard-wide message banner notifications to all organizers.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={broadcastEnabled || false}
                    onChange={(e) => setGeneralVal("broadcast_enabled", e.target.checked)}
                    className="rounded border-border bg-surface text-[var(--brand-primary)] focus:ring-0 cursor-pointer"
                  />
                </div>

                {broadcastEnabled && (
                  <div className="space-y-1.5 pt-2 animate-in fade-in duration-200">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Broadcast Message</label>
                    <textarea
                      {...registerGeneral("broadcast_message")}
                      placeholder="Type banner message content..."
                      className="w-full h-16 rounded-xl bg-surface-2 border border-border p-3 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmittingGeneral} className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 text-white font-semibold text-xs h-9 px-4 flex gap-1.5">
                <Save className="w-3.5 h-3.5" /> Save General Settings
              </Button>
            </div>
          </form>
        </div>

        {/* SMTP Transport Form */}
        <div className="lg:col-span-4">
          <form onSubmit={handleSubmitSmtp(onSaveSmtp)} className="space-y-6">
            
            <div className="rounded-xl border border-border bg-surface p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2 uppercase tracking-wider">
                <Mail className="w-4 h-4 text-[var(--brand-primary)]" /> SMTP Transport
              </h3>
              <div className="h-px bg-border/60" />

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Host Server</label>
                  <input
                    type="text"
                    {...registerSmtp("smtp_host")}
                    placeholder="mail.postmarkapp.com"
                    className="w-full rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Port</label>
                  <input
                    type="number"
                    {...registerSmtp("smtp_port")}
                    placeholder="587"
                    className="w-full rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Username</label>
                  <input
                    type="text"
                    {...registerSmtp("smtp_user")}
                    className="w-full rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      {...registerSmtp("smtp_password")}
                      className="w-full rounded-xl bg-surface border border-border pl-3 pr-9 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Sender Email Address</label>
                  <input
                    type="email"
                    {...registerSmtp("support_email")}
                    placeholder="support@eventos.com"
                    className="w-full rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
                  />
                  {errorsSmtp.support_email && <p className="text-[10px] text-[var(--danger)]">{errorsSmtp.support_email.message}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block flex items-center gap-1">
                    <Slack className="w-3.5 h-3.5 text-emerald-400" /> Slack Channel Webhook
                  </label>
                  <input
                    type="text"
                    {...registerSmtp("slack_webhook_url")}
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
                  />
                  {errorsSmtp.slack_webhook_url && <p className="text-[10px] text-[var(--danger)]">{errorsSmtp.slack_webhook_url.message}</p>}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmittingSmtp} className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 text-white font-semibold text-xs h-9 px-4 flex gap-1.5">
                <Save className="w-3.5 h-3.5" /> Save Transports
              </Button>
            </div>
          </form>
        </div>
      </div>
    </PageContainer>
  );
}
