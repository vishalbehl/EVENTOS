"use client";

import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useGlobalSettings, 
  useUpdateGlobalSettings 
} from "@/services/super-admin-service";
import { 
  ShieldCheck, RefreshCw, Key, Lock, Layers, Save, ListFilter 
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";

const securitySchema = z.object({
  security_max_lockout_attempts: z.coerce.number().min(3, "Must be at least 3 attempts").max(20).default(5),
  security_idle_timeout_min: z.coerce.number().min(5, "Timeout must be at least 5 minutes").max(1440).default(30),
  security_enforce_2fa_super_admin: z.boolean().default(false),
  security_enforce_2fa_org_admin: z.boolean().default(false),
  security_enforce_2fa_speaker: z.boolean().default(false),
  security_enforce_2fa_attendee: z.boolean().default(false),
  security_ip_allowlist: z.string().refine((val) => {
    if (!val) return true;
    const lines = val.split("\n").map(l => l.trim()).filter(Boolean);
    const ipOrCidrRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/(3[0-2]|[12]?[0-9]))?$/;
    return lines.every(line => ipOrCidrRegex.test(line));
  }, "All lines must be valid IP addresses or CIDR blocks (e.g. 192.168.1.1 or 10.0.0.0/24)"),
});

type SecurityFormData = z.infer<typeof securitySchema>;

export default function SecuritySettingsPage() {
  const { data: settings, isLoading, refetch } = useGlobalSettings();
  const updateSettingsMutation = useUpdateGlobalSettings();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<SecurityFormData>({
    resolver: zodResolver(securitySchema)
  });

  const enforceSuperAdmin = watch("security_enforce_2fa_super_admin");
  const enforceOrgAdmin = watch("security_enforce_2fa_org_admin");
  const enforceSpeaker = watch("security_enforce_2fa_speaker");
  const enforceAttendee = watch("security_enforce_2fa_attendee");

  useEffect(() => {
    if (settings) {
      setValue("security_max_lockout_attempts", settings.security_max_lockout_attempts || 5);
      setValue("security_idle_timeout_min", settings.security_idle_timeout_min || 30);
      setValue("security_enforce_2fa_super_admin", settings.security_enforce_2fa_super_admin || false);
      setValue("security_enforce_2fa_org_admin", settings.security_enforce_2fa_org_admin || false);
      setValue("security_enforce_2fa_speaker", settings.security_enforce_2fa_speaker || false);
      setValue("security_enforce_2fa_attendee", settings.security_enforce_2fa_attendee || false);
      setValue("security_ip_allowlist", settings.security_ip_allowlist || "");
    }
  }, [settings, setValue]);

  const onSaveSecurity = async (data: SecurityFormData) => {
    try {
      await updateSettingsMutation.mutateAsync(data);
      toast.success("Security Policies saved successfully");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save security parameters");
    }
  };

  return (
    <PageContainer>
      <SectionHeader
        title="Security Policies"
        description="Configure account lockout limits, session idle timers, MFA credentials enforcement, and firewall IP allowlists."
        breadcrumb={["Console", "Settings", "Security"]}
        actions={
          <Button
            variant="outline"
            onClick={() => refetch()}
            size="sm"
            className="border-border"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]", isLoading && "animate-spin")} />
            Sync Policies
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSaveSecurity)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-start">
          
          {/* Main Controls (Lockouts, MFA) */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Lockout & Timers */}
            <div className="rounded-xl border border-border bg-surface p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2 uppercase tracking-wider">
                <Lock className="w-4 h-4 text-[var(--brand-primary)]" /> Account Thresholds & Session Idle
              </h3>
              <div className="h-px bg-border/60" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Max Lockout Attempts</label>
                  <input
                    type="number"
                    {...register("security_max_lockout_attempts")}
                    className="w-full rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
                  />
                  {errors.security_max_lockout_attempts && (
                    <p className="text-[10px] text-[var(--danger)]">{errors.security_max_lockout_attempts.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Idle Session Timeout (Minutes)</label>
                  <input
                    type="number"
                    {...register("security_idle_timeout_min")}
                    className="w-full rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
                  />
                  {errors.security_idle_timeout_min && (
                    <p className="text-[10px] text-[var(--danger)]">{errors.security_idle_timeout_min.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* MFA Mandate Controls */}
            <div className="rounded-xl border border-border bg-surface p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-[var(--brand-primary)]" /> Multi-Factor Authentication Mandates
              </h3>
              <div className="h-px bg-border/60" />

              <div className="space-y-4">
                {[
                  { key: "security_enforce_2fa_super_admin", label: "Super Admin Accounts", val: enforceSuperAdmin },
                  { key: "security_enforce_2fa_org_admin", label: "Organizer Administrator Accounts", val: enforceOrgAdmin },
                  { key: "security_enforce_2fa_speaker", label: "Conference Speakers", val: enforceSpeaker },
                  { key: "security_enforce_2fa_attendee", label: "General Attendees / Participants", val: enforceAttendee }
                ].map((mfaRule) => (
                  <div key={mfaRule.key} className="flex items-center justify-between border-b border-border/40 last:border-0 pb-3 last:pb-0">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-[var(--text-primary)] block">{mfaRule.label}</span>
                      <span className="text-[10px] text-[var(--text-tertiary)] block">Enforce 2FA verification setup before dashboard access.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={mfaRule.val || false}
                      onChange={(e) => setValue(mfaRule.key as any, e.target.checked)}
                      className="rounded border-border bg-surface text-[var(--brand-primary)] focus:ring-0 cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Firewall IP Allowlist */}
          <div className="lg:col-span-4">
            <div className="rounded-xl border border-border bg-surface p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2 uppercase tracking-wider">
                <Layers className="w-4 h-4 text-[var(--brand-primary)]" /> Firewall IP Allowlist
              </h3>
              <div className="h-px bg-border/60" />

              <div className="space-y-2.5">
                <span className="text-[10px] text-[var(--text-tertiary)] block leading-relaxed">
                  Restrict Super Admin console endpoints to requests matching these client IP ranges. Enter one IP address or CIDR block per line. Leave empty for all access.
                </span>
                <textarea
                  {...register("security_ip_allowlist")}
                  placeholder="e.g.&#10;192.168.1.1&#10;10.0.0.0/24"
                  className="w-full h-48 rounded-xl bg-surface-2 border border-border p-3 text-xs text-[var(--text-primary)] font-mono placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]"
                />
                {errors.security_ip_allowlist && (
                  <p className="text-[10px] text-[var(--danger)]">{errors.security_ip_allowlist.message}</p>
                )}
              </div>
            </div>
          </div>

        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting} className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 text-white font-semibold text-xs h-9 px-4 flex gap-1.5">
            <Save className="w-3.5 h-3.5" /> Save Security Policies
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
