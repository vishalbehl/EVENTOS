"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Mail,
  Save,
  RefreshCw,
  SlidersHorizontal,
  Send,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Palette,
  ShieldCheck,
  Building,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { OrganiserPage, Panel } from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { designStudioService, EmailSettingsData } from "@/services/design-studio-service";

export default function EmailSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<EmailSettingsData>({
    from_name: "Conference Operations Team",
    from_email: "",
    reply_to: "",
    brand_logo_url: "",
    brand_primary_color: "#6366F1",
    footer_text: "",
    company_address: "",
    enable_registration_trigger: true,
    enable_payment_trigger: true,
    enable_speaker_trigger: true,
    enable_abstract_trigger: true,
    enable_certificate_trigger: true,
  });

  const loadSettings = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const data = await designStudioService.emails.get(eventId);
      setFormData(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load email settings");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!eventId) return;
    setSaving(true);
    try {
      const updated = await designStudioService.emails.update(eventId, formData);
      setFormData(updated);
      toast.success("Email sender and branding settings saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save email settings");
    } finally {
      setSaving(false);
    }
  };

  const triggerItems = [
    {
      key: "enable_registration_trigger" as const,
      label: "Registration & Digital Entry Pass",
      desc: "Instantly send pass confirmation QR code and receipt upon delegate checkout.",
    },
    {
      key: "enable_payment_trigger" as const,
      label: "Tax Invoice & Payment Receipt",
      desc: "Send PDF tax invoice and transaction confirmation upon payment completion.",
    },
    {
      key: "enable_speaker_trigger" as const,
      label: "Speaker Slide Upload Reminders",
      desc: "Automated countdown reminders for faculty to submit slide decks.",
    },
    {
      key: "enable_abstract_trigger" as const,
      label: "Abstract Acceptance & Review Decisions",
      desc: "Notify submitting authors when committee renders peer review decisions.",
    },
    {
      key: "enable_certificate_trigger" as const,
      label: "Certificate Download Notifications",
      desc: "Notify checked-in delegates when verified certificates of attendance are ready.",
    },
  ];

  return (
    <OrganiserPage
      title="Email Settings & Sender Identity"
      description="Configure sender credentials, global email branding tokens, footer compliance notices, and automated event triggers."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/events/${eventId}/design-studio/emails/designer`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <Mail className="size-3.5 text-[var(--pri,#4f46e5)]" />
            Open Email Designer
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || loading}
            className="h-8 text-xs font-semibold gap-1.5 bg-[var(--pri,#4f46e5)] text-white hover:bg-[var(--pri-hover,#4338ca)] cursor-pointer"
          >
            {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save Settings
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="p-16 flex flex-col items-center justify-center space-y-3 text-center">
          <RefreshCw className="size-8 text-[var(--pri,#4f46e5)] animate-spin" />
          <p className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider">
            Loading Email Settings...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sender Identity */}
          <Panel title="Sender Identity & Routing" className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                From Name (Display Name)
              </label>
              <Input
                value={formData.from_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, from_name: e.target.value }))}
                placeholder="e.g. AI Summit 2026 Organizing Committee"
                className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                From Email Address
              </label>
              <Input
                type="email"
                value={formData.from_email || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, from_email: e.target.value }))}
                placeholder="notifications@yourconference.org"
                className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                Reply-To Email Address
              </label>
              <Input
                type="email"
                value={formData.reply_to || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, reply_to: e.target.value }))}
                placeholder="support@yourconference.org"
                className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
              />
            </div>
          </Panel>

          {/* Email Branding Tokens */}
          <Panel title="Global Email Branding & Tokens" className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                Brand Header Logo URL
              </label>
              <Input
                value={formData.brand_logo_url || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, brand_logo_url: e.target.value }))}
                placeholder="https://your-cdn.com/brand-logo.png"
                className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                Brand Primary Accent Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.brand_primary_color}
                  onChange={(e) => setFormData((prev) => ({ ...prev, brand_primary_color: e.target.value }))}
                  className="size-8 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <Input
                  value={formData.brand_primary_color}
                  onChange={(e) => setFormData((prev) => ({ ...prev, brand_primary_color: e.target.value }))}
                  className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white font-mono max-w-[140px]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                Footer Copyright & Physical Mailing Address
              </label>
              <Textarea
                rows={3}
                value={formData.company_address || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, company_address: e.target.value }))}
                placeholder="Convention Center Blvd, Suite 400, San Francisco, CA"
                className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
              />
            </div>
          </Panel>

          {/* Automated Event Notification Triggers */}
          <Panel title="Automated Event Email Triggers" className="space-y-3 md:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {triggerItems.map((item) => {
                const isEnabled = formData[item.key];
                return (
                  <div
                    key={item.key}
                    onClick={() => setFormData((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isEnabled
                        ? "bg-[var(--surface-ground,#09090b)] border-[var(--pri,#4f46e5)]/30"
                        : "bg-[var(--surface-ground,#09090b)]/40 border-[var(--border-default,#27272a)] opacity-60 hover:opacity-100"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold text-white block">{item.label}</span>
                      <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">{item.desc}</span>
                    </div>

                    <button type="button" className="cursor-pointer shrink-0 ml-3">
                      {isEnabled ? (
                        <ToggleRight className="size-6 text-[var(--pri,#4f46e5)]" />
                      ) : (
                        <ToggleLeft className="size-6 text-zinc-600" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}
    </OrganiserPage>
  );
}
