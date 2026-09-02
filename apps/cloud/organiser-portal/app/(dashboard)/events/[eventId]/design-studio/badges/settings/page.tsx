"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CreditCard,
  Save,
  RefreshCw,
  SlidersHorizontal,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Printer,
  QrCode,
  Sparkles,
  Layers,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { OrganiserPage, Panel } from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api-client";
import { designStudioService, BadgeSettingsData } from "@/services/design-studio-service";

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

export default function BadgeSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);

  const [formData, setFormData] = useState<BadgeSettingsData>({
    use_same_design_for_all_users: true,
    default_template_id: "",
    role_template_assignments: {},
    paper_size: "badge",
    orientation: "portrait",
    dpi: 300,
    double_sided: false,
    show_cut_marks: true,
    show_qr_code: true,
    show_barcode: false,
    auto_print_on_checkin: true,
  });

  const loadData = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [settingsRes, rolesRes, templatesRes] = await Promise.all([
        designStudioService.badges.get(eventId).catch(() => ({
          use_same_design_for_all_users: true,
          default_template_id: "",
          role_template_assignments: {},
          paper_size: "badge",
          orientation: "portrait",
          dpi: 300,
          double_sided: false,
          show_cut_marks: true,
          show_qr_code: true,
          show_barcode: false,
          auto_print_on_checkin: true,
        })),
        apiGet<RoleRecord[]>(`/events/${eventId}/registration/roles`).catch(() => []),
        apiGet<TemplateRecord[]>(`/events/${eventId}/registration/print-templates`).catch(() => []),
      ]);

      setFormData(settingsRes);
      setRoles(rolesRes || []);
      const badgeTpls = (templatesRes || []).filter((t) => t.template_type === "badge" || !t.template_type);
      setTemplates(badgeTpls);
    } catch (err: any) {
      toast.error(err.message || "Failed to load badge configuration");
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
      const updated = await designStudioService.badges.update(eventId, formData);
      setFormData(updated);
      toast.success("Badge design assignment policy and settings saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save badge settings");
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
      title="Badge Settings & Role Mappings"
      description="Centralized badge printing configuration. Choose between a uniform badge design for all attendees or dedicated custom badges per participant role."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/events/${eventId}/design-studio/badges/designer`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <CreditCard className="size-3.5 text-[var(--pri,#4f46e5)]" />
            Open Badge Designer
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
            Loading Badge Settings...
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
                <h3 className="text-base font-bold text-white">Badge Template Assignment Mode</h3>
                <p className="text-xs text-[var(--text-secondary,#a1a1aa)] mt-0.5">
                  Choose whether all registered delegates and faculty share one universal badge or have custom badges tailored to their role.
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
                  Uniform Default Badge
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
                  Custom Per-Role Badges
                </button>
              </div>
            </div>

            {/* Default Fallback Selector */}
            <div className="pt-4 border-t border-[var(--border-default,#27272a)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="text-xs font-bold text-white block">Default Fallback Badge Template</label>
                <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                  Used for any attendee role without an explicit custom badge assignment.
                </span>
              </div>

              <select
                value={formData.default_template_id || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, default_template_id: e.target.value }))}
                className="bg-black/50 border border-[var(--border-default,#27272a)] text-xs font-semibold text-white px-3 py-2 rounded-lg max-w-xs"
              >
                <option value="">Standard Default Badge Template</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Role to Badge Mappings Matrix */}
          {!formData.use_same_design_for_all_users && (
            <Panel
              title="Per-Role Badge Assignment Matrix"
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
                        <th className="py-2.5 px-3">Assigned Badge Template</th>
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
                                <option value="">Default Badge (Fallback)</option>
                                {templates.map((tpl) => (
                                  <option key={tpl.id} value={tpl.id}>
                                    {tpl.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3 px-3 text-right">
                              {currentAssigned ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                                  <CheckCircle2 className="size-3" /> Custom Badge
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

          {/* Print Hardware & Dimension Defaults */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Panel title="Paper Dimensions & Resolution" className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  Standard Badge Dimensions
                </label>
                <select
                  value={formData.paper_size}
                  onChange={(e) => setFormData((prev) => ({ ...prev, paper_size: e.target.value }))}
                  className="bg-[var(--surface-input,#09090b)] border border-[var(--border-default,#27272a)] text-xs text-white px-3 py-2 rounded-md w-full"
                >
                  <option value="badge">Thermal Badge (76 x 100 mm)</option>
                  <option value="a6">A6 Pocket Badge (105 x 148 mm)</option>
                  <option value="cr80">CR80 PVC Card (85.6 x 54 mm)</option>
                  <option value="a5">A5 Large Badge (148 x 210 mm)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                  Print Resolution (DPI)
                </label>
                <select
                  value={formData.dpi}
                  onChange={(e) => setFormData((prev) => ({ ...prev, dpi: Number(e.target.value) }))}
                  className="bg-[var(--surface-input,#09090b)] border border-[var(--border-default,#27272a)] text-xs text-white px-3 py-2 rounded-md w-full"
                >
                  <option value={300}>300 DPI (Standard High-Res)</option>
                  <option value={600}>600 DPI (Ultra Fine Detail)</option>
                  <option value={203}>203 DPI (Direct Thermal Kiosk)</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)]">
                <div>
                  <span className="text-xs font-bold text-white block">Double-Sided Printing</span>
                  <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                    Print schedule tracks and notes on reverse side of badge.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, double_sided: !prev.double_sided }))}
                  className="cursor-pointer"
                >
                  {formData.double_sided ? (
                    <ToggleRight className="size-6 text-[var(--pri,#4f46e5)]" />
                  ) : (
                    <ToggleLeft className="size-6 text-zinc-600" />
                  )}
                </button>
              </div>
            </Panel>

            <Panel title="On-Site Check-in & Kiosk Automation" className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)]">
                <div>
                  <span className="text-xs font-bold text-white block">Auto-Print Badge on Check-in</span>
                  <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                    Trigger physical thermal printing instantly when attendee scans entry QR code.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, auto_print_on_checkin: !prev.auto_print_on_checkin }))}
                  className="cursor-pointer"
                >
                  {formData.auto_print_on_checkin ? (
                    <ToggleRight className="size-6 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="size-6 text-zinc-600" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)]">
                <div>
                  <span className="text-xs font-bold text-white block">High-Density QR Code</span>
                  <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                    Embed encrypted participant token for fast scanner recognition.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, show_qr_code: !prev.show_qr_code }))}
                  className="cursor-pointer"
                >
                  {formData.show_qr_code ? (
                    <ToggleRight className="size-6 text-[var(--pri,#4f46e5)]" />
                  ) : (
                    <ToggleLeft className="size-6 text-zinc-600" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)]">
                <div>
                  <span className="text-xs font-bold text-white block">Crop Marks / Bleed Guides</span>
                  <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                    Render printer cutting guides on badge printouts.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, show_cut_marks: !prev.show_cut_marks }))}
                  className="cursor-pointer"
                >
                  {formData.show_cut_marks ? (
                    <ToggleRight className="size-6 text-[var(--pri,#4f46e5)]" />
                  ) : (
                    <ToggleLeft className="size-6 text-zinc-600" />
                  )}
                </button>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </OrganiserPage>
  );
}
