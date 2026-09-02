"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Globe,
  Save,
  RefreshCw,
  SlidersHorizontal,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Code2,
  Eye,
  Laptop,
} from "lucide-react";
import { toast } from "sonner";
import { OrganiserPage, Panel } from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { designStudioService, WebsiteSettingsData } from "@/services/design-studio-service";

export default function WebsiteSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [formData, setFormData] = useState<WebsiteSettingsData>({
    is_published: true,
    custom_domain: "",
    subdomain: "",
    meta_title: "",
    meta_description: "",
    favicon_url: "",
    og_image_url: "",
    ga_tracking_id: "",
    meta_pixel_id: "",
    custom_head_scripts: "",
    custom_body_scripts: "",
    maintenance_mode: false,
  });

  const loadSettings = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const data = await designStudioService.website.get(eventId);
      setFormData(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load website settings");
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
      const updated = await designStudioService.website.update(eventId, formData);
      setFormData(updated);
      toast.success("Website configuration and SEO settings saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save website settings");
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Copied website URL to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const publicUrl = formData.custom_domain
    ? `https://${formData.custom_domain}`
    : `https://${formData.subdomain || "event"}.eventos.live`;

  return (
    <OrganiserPage
      title="Website Settings & Domains"
      description="Manage custom domains, SEO meta tags, Google Analytics scripts, and publishing lifecycle for your event website."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/events/${eventId}/design-studio/website/designer`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <Globe className="size-3.5 text-[var(--pri,#4f46e5)]" />
            Open Website Designer
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
            Loading Website Settings...
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Live URL & Status Banner */}
          <div className="p-4 rounded-xl bg-[var(--surface-panel,#18181b)] border border-[var(--border-default,#27272a)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Globe className="size-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary,#71717a)] block">
                  Live Website URL
                </span>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-white hover:text-[var(--pri,#4f46e5)] flex items-center gap-1.5 transition-colors"
                >
                  {publicUrl}
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyUrl(publicUrl)}
                className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
              >
                <Copy className="size-3.5" />
                {copied ? "Copied" : "Copy Link"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Domain Configuration */}
            <Panel title="Domain & Routing" className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  Platform Subdomain
                </label>
                <div className="flex items-center">
                  <Input
                    value={formData.subdomain || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, subdomain: e.target.value.toLowerCase() }))}
                    placeholder="summit2026"
                    className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white rounded-r-none"
                  />
                  <span className="px-3 py-2 bg-zinc-800 border border-l-0 border-[var(--border-default,#27272a)] text-xs font-semibold text-zinc-400 rounded-r-md">
                    .eventos.live
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  Custom Domain (CNAME)
                </label>
                <Input
                  value={formData.custom_domain || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, custom_domain: e.target.value.toLowerCase() }))}
                  placeholder="summit.yourcompany.org"
                  className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
                />
                <p className="text-[11px] text-[var(--text-tertiary,#71717a)] mt-1">
                  Point a CNAME DNS record for this domain to <code className="text-zinc-300">cname.eventos.live</code>.
                </p>
              </div>
            </Panel>

            {/* SEO Metadata */}
            <Panel title="SEO & Social Media Preview" className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  Page Meta Title
                </label>
                <Input
                  value={formData.meta_title || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, meta_title: e.target.value }))}
                  placeholder="Global Innovation Summit 2026 — Official Website"
                  className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  Meta Description
                </label>
                <Textarea
                  rows={3}
                  value={formData.meta_description || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, meta_description: e.target.value }))}
                  placeholder="Join 5,000+ industry pioneers for 3 days of inspiring keynotes, technical tracks, and peer networking."
                  className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  OpenGraph Social Share Image URL
                </label>
                <Input
                  value={formData.og_image_url || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, og_image_url: e.target.value }))}
                  placeholder="https://your-cdn.com/og-banner.png"
                  className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
                />
              </div>
            </Panel>

            {/* Analytics & Pixel Tracking */}
            <Panel title="Analytics & Conversion Pixels" className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  Google Analytics 4 Measurement ID
                </label>
                <Input
                  value={formData.ga_tracking_id || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, ga_tracking_id: e.target.value }))}
                  placeholder="G-XXXXXXXXXX"
                  className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  Meta (Facebook) Pixel ID
                </label>
                <Input
                  value={formData.meta_pixel_id || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, meta_pixel_id: e.target.value }))}
                  placeholder="123456789012345"
                  className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white font-mono"
                />
              </div>
            </Panel>

            {/* Custom Scripts & Code Injection */}
            <Panel title="Custom Code & Scripts Injection" className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  Custom &lt;head&gt; Scripts
                </label>
                <Textarea
                  rows={4}
                  value={formData.custom_head_scripts || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, custom_head_scripts: e.target.value }))}
                  placeholder="<!-- Custom Fonts, Hotjar, or Tracking tags -->"
                  className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  Custom &lt;body&gt; Closing Scripts
                </label>
                <Textarea
                  rows={3}
                  value={formData.custom_body_scripts || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, custom_body_scripts: e.target.value }))}
                  placeholder="<!-- Live Chat Widget or conversion event listeners -->"
                  className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white font-mono"
                />
              </div>
            </Panel>
          </div>
        </div>
      )}
    </OrganiserPage>
  );
}
