"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Award,
  Save,
  RefreshCw,
  SlidersHorizontal,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Download,
  QrCode,
  Sparkles,
  Layers,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { OrganiserPage, Panel } from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api-client";
import { designStudioService, CertificateSettingsData } from "@/services/design-studio-service";

interface RoleRecord {
  id: string;
  name: string;
  code: string;
  is_default: boolean;
  is_active?: boolean;
}

interface TemplateRecord {
  id: string;
  name: string;
  template_type: string;
  is_default?: boolean;
}

export default function CertificateSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);

  const [formData, setFormData] = useState<CertificateSettingsData>({
    use_same_design_for_all_users: true,
    default_template_id: "",
    role_template_assignments: {},
    auto_issue_on_checkin: false,
    auto_issue_on_session_complete: true,
    enable_public_verification: true,
    allow_download: true,
    download_cutoff_date: "",
    paper_size: "a4",
    orientation: "landscape",
  });

  const loadData = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [settingsRes, rolesRes, templatesRes] = await Promise.all([
        designStudioService.certificates.get(eventId).catch(() => ({
          use_same_design_for_all_users: true,
          default_template_id: "",
          role_template_assignments: {},
          auto_issue_on_checkin: false,
          auto_issue_on_session_complete: true,
          enable_public_verification: true,
          allow_download: true,
          download_cutoff_date: "",
          paper_size: "a4",
          orientation: "landscape",
        })),
        apiGet<RoleRecord[]>(`/events/${eventId}/registration/roles`).catch(() => []),
        apiGet<TemplateRecord[]>(`/events/${eventId}/registration/print-templates`).catch(() => []),
      ]);

      setFormData(settingsRes);
      setRoles(rolesRes || []);
      const certTpls = (templatesRes || []).filter((t) => t.template_type === "certificate");
      setTemplates(certTpls);
    } catch (err: any) {
      toast.error(err.message || "Failed to load certificate configuration");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!eventId) return;
    setSaving(true);
    try {
      const updated = await designStudioService.certificates.update(eventId, formData);
      setFormData(updated);
      toast.success("Certificate design assignment policy and settings saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save certificate settings");
    } finally {
      setSaving(false);
    }
  };

  const handleRoleAssignment = (roleName: string, templateId: string) => {
    setFormData((prev) => {
      const updated = { ...prev.role_template_assignments };
      if (!templateId) {
        delete updated[roleName];
      } else {
        updated[roleName] = templateId;
      }
      return {
        ...prev,
        role_template_assignments: updated,
      };
    });
  };

  return (
    <OrganiserPage
      title="Certificate Settings & Role Mappings"
      description="Centralized certificate generation rules. Configure whether all attendees receive a uniform certificate or dedicated honors per role, along with issuance triggers and verification policies."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/events/${eventId}/design-studio/certificates/designer`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <Award className="size-3.5 text-[var(--pri,#4f46e5)]" />
            Open Certificate Designer
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
            Loading Certificate Settings...
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Policy Toggle Card */}
          <div className="p-5 rounded-2xl bg-[var(--surface-panel,#18181b)] border border-[var(--border-default,#27272a)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--pri,#4f46e5)] block mb-1">
                  POLICY CONFIGURATION
                </span>
                <h3 className="text-base font-bold text-white">Certificate Template Assignment Mode</h3>
                <p className="text-xs text-[var(--text-secondary,#a1a1aa)] mt-0.5">
                  Choose whether all participants share one standard certificate of attendance or receive specialized certificates tailored to their role.
                </p>
              </div>

              {/* Segmented Switch */}
              <div className="flex items-center p-1 bg-black/40 border border-zinc-800 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, use_same_design_for_all_users: true }))}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    formData.use_same_design_for_all_users
                      ? "bg-[var(--pri,#4f46e5)] text-white shadow"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Uniform Default Certificate
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, use_same_design_for_all_users: false }))}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !formData.use_same_design_for_all_users
                      ? "bg-[var(--pri,#4f46e5)] text-white shadow"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Custom Per-Role Certificates
                </button>
              </div>
            </div>

            {/* Default Fallback Selector */}
            <div className="pt-4 border-t border-[var(--border-default,#27272a)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="text-xs font-bold text-white block">Default Fallback Certificate Template</label>
                <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                  Used for any participant classification without an explicit custom certificate template.
                </span>
              </div>

              <select
                value={formData.default_template_id || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, default_template_id: e.target.value }))}
                className="bg-black/50 border border-[var(--border-default,#27272a)] text-xs font-semibold text-white px-3 py-2 rounded-lg max-w-xs"
              >
                <option value="">Standard Certificate of Attendance</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Role to Certificate Mappings Matrix */}
          {!formData.use_same_design_for_all_users && (
            <Panel
              title="Per-Role Certificate Assignment Matrix"
              className="space-y-3"
            >
              {roles.length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary,#71717a)] italic text-center py-6">
                  No custom participant roles found. Configure roles in the Registration section first.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border-default,#27272a)] text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary,#71717a)]">
                        <th className="py-2.5 px-3">Role Classification</th>
                        <th className="py-2.5 px-3">Prefix Code</th>
                        <th className="py-2.5 px-3">Assigned Certificate Template</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default,#27272a)]">
                      {roles.map((role) => {
                        const currentAssigned = formData.role_template_assignments[role.name] || "";
                        return (
                          <tr key={role.id || role.name} className="hover:bg-zinc-900/40 transition-colors">
                            <td className="py-3 px-3">
                              <span className="font-bold text-white block">{role.name}</span>
                            </td>
                            <td className="py-3 px-3">
                              <Badge className="bg-zinc-800 text-zinc-300 font-mono text-[10px]">
                                {role.code || "DEL"}
                              </Badge>
                            </td>
                            <td className="py-3 px-3">
                              <select
                                value={currentAssigned}
                                onChange={(e) => handleRoleAssignment(role.name, e.target.value)}
                                className="bg-black/50 border border-[var(--border-default,#27272a)] text-xs text-white px-3 py-1.5 rounded-lg w-full max-w-xs focus:border-[var(--pri,#4f46e5)]"
                              >
                                <option value="">Default Certificate (Fallback)</option>
                                {templates.map((tpl) => (
                                  <option key={tpl.id} value={tpl.id}>
                                    {tpl.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3 px-3 text-right">
                              {currentAssigned ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold">
                                  <CheckCircle2 className="size-3" /> Custom Certificate
                                </span>
                              ) : (
                                <span className="text-[10px] text-zinc-500 font-semibold">Using Default</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {/* Issuance & Verification Rules */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Panel title="Automated Issuance Triggers" className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)]">
                <div>
                  <span className="text-xs font-bold text-white block">Auto-Issue Upon Venue Check-in</span>
                  <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                    Make certificate available as soon as the delegate scans into the venue.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, auto_issue_on_checkin: !prev.auto_issue_on_checkin }))}
                  className="cursor-pointer"
                >
                  {formData.auto_issue_on_checkin ? (
                    <ToggleRight className="size-6 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="size-6 text-zinc-600" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)]">
                <div>
                  <span className="text-xs font-bold text-white block">Auto-Issue on Session Completion</span>
                  <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                    Generate certificate automatically when the conference concluding remarks end.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, auto_issue_on_session_complete: !prev.auto_issue_on_session_complete }))}
                  className="cursor-pointer"
                >
                  {formData.auto_issue_on_session_complete ? (
                    <ToggleRight className="size-6 text-[var(--pri,#4f46e5)]" />
                  ) : (
                    <ToggleLeft className="size-6 text-zinc-600" />
                  )}
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  Certificate Download Expiration Cutoff Date
                </label>
                <Input
                  type="date"
                  value={formData.download_cutoff_date || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, download_cutoff_date: e.target.value }))}
                  className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
                />
              </div>
            </Panel>

            <Panel title="Verification & Security Protocols" className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)]">
                <div>
                  <span className="text-xs font-bold text-white block">Public Verification URL</span>
                  <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                    Provide a public verification landing page for institutions to authenticate credentials.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, enable_public_verification: !prev.enable_public_verification }))}
                  className="cursor-pointer"
                >
                  {formData.enable_public_verification ? (
                    <ToggleRight className="size-6 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="size-6 text-zinc-600" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)]">
                <div>
                  <span className="text-xs font-bold text-white block">Allow Participant PDF Download</span>
                  <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                    Permit attendees to download high-resolution vector PDF copies from portal.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, allow_download: !prev.allow_download }))}
                  className="cursor-pointer"
                >
                  {formData.allow_download ? (
                    <ToggleRight className="size-6 text-[var(--pri,#4f46e5)]" />
                  ) : (
                    <ToggleLeft className="size-6 text-zinc-600" />
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                    Paper Size
                  </label>
                  <select
                    value={formData.paper_size}
                    onChange={(e) => setFormData((prev) => ({ ...prev, paper_size: e.target.value }))}
                    className="bg-[var(--surface-input,#09090b)] border border-[var(--border-default,#27272a)] text-xs text-white px-3 py-2 rounded-md w-full"
                  >
                    <option value="a4">A4 (297 x 210 mm)</option>
                    <option value="letter">Letter (279.4 x 215.9 mm)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                    Orientation
                  </label>
                  <select
                    value={formData.orientation}
                    onChange={(e) => setFormData((prev) => ({ ...prev, orientation: e.target.value }))}
                    className="bg-[var(--surface-input,#09090b)] border border-[var(--border-default,#27272a)] text-xs text-white px-3 py-2 rounded-md w-full"
                  >
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </OrganiserPage>
  );
}
