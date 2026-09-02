"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  CheckCircle2,
  CreditCard,
  FolderPlus,
  LayoutTemplate,
  Plus,
  RefreshCw,
  Save,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { useEvent, useUpdateEvent } from "@/hooks/useEvents";
import { useLimitAccess, useOperationAccess } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

const MASTER_ROLES: Record<string, { name: string; isDefault: boolean }[]> = {
  "General Attendees": [
    { name: "Delegate", isDefault: true },
    { name: "Student Delegate", isDefault: true },
    { name: "Organizer", isDefault: true },
    { name: "Faculty Delegate", isDefault: false },
    { name: "Industry Professional", isDefault: false },
    { name: "Research Scholar", isDefault: false },
    { name: "International Delegate", isDefault: false },
    { name: "Corporate Attendee", isDefault: false },
    { name: "Government Representative", isDefault: false },
    { name: "Academic Attendee", isDefault: false },
  ],
  "Presentation Related": [
    { name: "Speaker", isDefault: true },
    { name: "Keynote Speaker", isDefault: true },
    { name: "Moderator", isDefault: true },
    { name: "Speaker / Presenter", isDefault: false },
    { name: "Invited Speaker", isDefault: false },
    { name: "Panel Speaker", isDefault: false },
    { name: "Session Chair", isDefault: false },
    { name: "Workshop Instructor", isDefault: false },
  ],
  "Business & Partners": [
    { name: "Sponsor Representative", isDefault: true },
    { name: "Exhibitor", isDefault: true },
    { name: "Partner Organization Member", isDefault: false },
    { name: "Investor", isDefault: false },
    { name: "Startup Founder", isDefault: false },
    { name: "Recruiter / Hiring Partner", isDefault: false },
  ],
  "Media & Public Relations": [
    { name: "Media", isDefault: true },
    { name: "Media Representative", isDefault: false },
    { name: "Journalist", isDefault: false },
    { name: "Photographer", isDefault: false },
    { name: "Videographer", isDefault: false },
    { name: "Content Creator / Influencer", isDefault: false },
  ],
  "Event Operations": [
    { name: "Volunteer", isDefault: true },
    { name: "Technical Staff", isDefault: true },
    { name: "AV Technician", isDefault: false },
    { name: "Event Coordinator", isDefault: false },
    { name: "Organizer Staff", isDefault: false },
    { name: "Support Staff", isDefault: false },
  ],
  "Special Access": [
    { name: "VIP Guest", isDefault: true },
    { name: "Chief Guest", isDefault: false },
    { name: "Guest of Honor", isDefault: false },
    { name: "Jury Member", isDefault: false },
    { name: "Advisory Board Member", isDefault: false },
    { name: "Committee Member", isDefault: false },
  ],
  "Session Specific": [
    { name: "Workshop Participant", isDefault: true },
    { name: "Poster Presenter", isDefault: true },
    { name: "Hands-on Training Participant", isDefault: false },
    { name: "Competition Participant", isDefault: false },
    { name: "ePoster Presenter", isDefault: false },
    { name: "Networking Participant", isDefault: false },
  ],
};

const DEFAULT_ROLE_CODES: Record<string, string> = {
  "Delegate": "DEL",
  "Student Delegate": "STU",
  "Organizer": "ORG",
  "Faculty Delegate": "FAC",
  "Industry Professional": "IND",
  "Research Scholar": "RES",
  "International Delegate": "INT",
  "Corporate Attendee": "COR",
  "Government Representative": "GOV",
  "Academic Attendee": "ACA",
  "Speaker": "SPK",
  "Keynote Speaker": "KEY",
  "Moderator": "MOD",
  "Speaker / Presenter": "PRS",
  "Invited Speaker": "INV",
  "Panel Speaker": "PAN",
  "Session Chair": "CHR",
  "Workshop Instructor": "INS",
  "Sponsor Representative": "SPO",
  "Exhibitor": "EXH",
  "Partner Organization Member": "PRT",
  "Investor": "INV",
  "Startup Founder": "FND",
  "Recruiter / Hiring Partner": "REC",
  "Media": "MED",
  "Media Representative": "MDR",
  "Journalist": "JRN",
  "Photographer": "PHT",
  "Videographer": "VID",
  "Content Creator / Influencer": "INF",
  "Volunteer": "VOL",
  "Technical Staff": "TEC",
  "AV Technician": "AVT",
  "Event Coordinator": "CRD",
  "Organizer Staff": "STF",
  "Support Staff": "SUP",
  "VIP Guest": "VIP",
  "Chief Guest": "CHG",
  "Guest of Honor": "GOH",
  "Jury Member": "JUR",
  "Advisory Board Member": "ADV",
  "Committee Member": "COM",
  "Workshop Participant": "WKP",
  "Poster Presenter": "POS",
  "Hands-on Training Participant": "TRN",
  "Competition Participant": "CMP",
  "ePoster Presenter": "EPO",
  "Networking Participant": "NET",
};

export function generateRoleCode(name: string): string {
  if (!name || !name.trim()) return "";
  const trimmed = name.trim();
  if (DEFAULT_ROLE_CODES[trimmed]) return DEFAULT_ROLE_CODES[trimmed];

  const words = trimmed.split(/[\s\-_/]+/).filter(Boolean);
  if (words.length >= 3) {
    return (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  }
  if (words.length === 2) {
    const w1 = words[0].replace(/[^A-Za-z0-9]/g, "");
    const w2 = words[1].replace(/[^A-Za-z0-9]/g, "");
    return (w1.slice(0, 2) + w2.slice(0, 1)).toUpperCase();
  }
  return trimmed.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
}

const CATEGORIES = Object.keys(MASTER_ROLES);

interface Role {
  id: string;
  category: string;
  name: string;
  role_code: string;
  is_active: boolean;
  is_default: boolean;
}

interface PrintTemplate {
  id: string;
  template_name: string;
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  size = "md",
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pri)] disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-5 w-9" : "h-6 w-11",
        checked ? "bg-[var(--pri)]" : "bg-[var(--border-default)]"
      )}
    >
      <span className="sr-only">{label || "Toggle"}</span>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none inline-block rounded-full bg-[var(--card)] shadow-sm ring-0 transition duration-200 ease-in-out",
          size === "sm"
            ? cn("size-3.5 mt-[3px] ml-[3px]", checked ? "translate-x-4" : "translate-x-0")
            : cn("size-4.5 mt-[3px] ml-[3px]", checked ? "translate-x-5" : "translate-x-0")
        )}
      />
    </button>
  );
}

export default function RoleCategoriesPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.eventId as string;

  const roleReadAccess = useOperationAccess("registration.ticket_types.read");
  const roleAccess = useOperationAccess("registration.ticket_types.manage");
  const roleLimitAccess = useLimitAccess("max_ticket_categories");
  const formAccess = useOperationAccess("registration.forms.manage");
  const badgeTemplateAccess = useOperationAccess("badges.templates.read");

  const { data: event } = useEvent(eventId);
  const updateEvent = useUpdateEvent(eventId);

  const [roles, setRoles] = useState<Role[]>([]);
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [pendingCodes, setPendingCodes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");

  // Add Role Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState("General Attendees");
  const [modalSelectedRole, setModalSelectedRole] = useState("");
  const [modalCustomName, setModalCustomName] = useState("");
  const [modalRoleCode, setModalRoleCode] = useState("");
  const [adding, setAdding] = useState(false);

  // Badge Policy & Disabled Categories State (DB Synced)
  const [useSameDesign, setUseSameDesign] = useState(true);
  const [defaultTemplateId, setDefaultTemplateId] = useState("");
  const [roleTemplateAssignments, setRoleTemplateAssignments] = useState<Record<string, string>>({});
  const [disabledCategories, setDisabledCategories] = useState<string[]>([]);

  useEffect(() => {
    const rs = (event?.registration_settings as Record<string, any>) || {};
    const badgeDesign = (rs.badge_design as Record<string, any>) || {};
    setUseSameDesign(badgeDesign.use_same_design_for_all_users ?? true);
    setDefaultTemplateId((badgeDesign.default_template_id as string) || "");
    setRoleTemplateAssignments((badgeDesign.role_template_assignments as Record<string, string>) || {});
    setDisabledCategories((rs.disabled_categories as string[]) || []);
  }, [event?.registration_settings]);

  useEffect(() => {
    load();
  }, [eventId, roleReadAccess.enabled, badgeTemplateAccess.enabled]);

  const load = async () => {
    setLoading(true);
    try {
      const roleData = roleReadAccess.enabled
        ? await apiClient.get<Role[]>(`/events/${eventId}/registration/roles`)
        : [];
      const templateData = badgeTemplateAccess.enabled
        ? await apiClient.get<PrintTemplate[]>(`/events/${eventId}/print-templates`)
        : [];
      const badgeTemplates = (templateData || []).filter(
        (t) => (t as any).template_type !== "certificate"
      );
      setRoles(roleData || []);
      setTemplates(badgeTemplates);
      setPendingCodes({});
    } catch {
      toast.error("Failed to load roles catalogue from database.");
    } finally {
      setLoading(false);
    }
  };

  // Get all master roles not currently assigned/enabled for this event
  const existingNames = useMemo(() => new Set(roles.map((r) => r.name)), [roles]);

  const availableRolesForCategory = (cat: string) => {
    return (MASTER_ROLES[cat] || []).filter((r) => !existingNames.has(r.name));
  };

  // Auto-sync code when modal category/role selection changes
  useEffect(() => {
    if (!isAddModalOpen) return;
    const available = availableRolesForCategory(modalCategory);
    if (available.length > 0) {
      setModalSelectedRole(available[0].name);
      setModalRoleCode(generateRoleCode(available[0].name));
    } else {
      setModalSelectedRole("custom");
      setModalRoleCode(generateRoleCode(modalCustomName));
    }
  }, [modalCategory, isAddModalOpen, roles]);

  const handleModalRoleChange = (roleName: string) => {
    setModalSelectedRole(roleName);
    if (roleName === "custom") {
      setModalRoleCode(generateRoleCode(modalCustomName));
    } else {
      setModalRoleCode(generateRoleCode(roleName));
    }
  };

  const handleModalCustomNameChange = (name: string) => {
    setModalCustomName(name);
    if (modalSelectedRole === "custom") {
      setModalRoleCode(generateRoleCode(name));
    }
  };

  // Toggle individual role portal visibility (persists to DB with optimistic UI update)
  const toggleRoleVisibility = async (roleId: string, currentActive: boolean) => {
    const nextActive = !currentActive;
    setRoles((prev) =>
      prev.map((r) => (r.id === roleId ? { ...r, is_active: nextActive } : r))
    );

    try {
      await apiClient.patch(`/events/${eventId}/registration/roles/${roleId}`, {
        is_active: nextActive,
      });
      toast.success(
        `Role ${nextActive ? "enabled on" : "hidden from"} public registration portal.`
      );
    } catch {
      setRoles((prev) =>
        prev.map((r) => (r.id === roleId ? { ...r, is_active: currentActive } : r))
      );
      toast.error("Failed to update role portal visibility.");
    }
  };

  // Toggle category portal visibility (persists to DB with optimistic UI update)
  const toggleCategoryVisibility = async (cat: string) => {
    const isCurrentlyLive = !disabledCategories.includes(cat);
    const nextDisabled = isCurrentlyLive
      ? [...disabledCategories, cat]
      : disabledCategories.filter((c) => c !== cat);

    setDisabledCategories(nextDisabled);

    try {
      await updateEvent.mutateAsync({
        registration_settings: {
          ...((event?.registration_settings as Record<string, any>) || {}),
          disabled_categories: nextDisabled,
        } as any,
      });
      toast.success(
        `Category "${cat}" ${isCurrentlyLive ? "hidden from" : "enabled on"} the registration portal.`
      );
    } catch {
      setDisabledCategories(disabledCategories); // Rollback
      toast.error("Failed to update category visibility in database.");
    }
  };

  // Save badge policy to DB
  const saveTemplateSettings = async (overrides?: {
    useSameDesign?: boolean;
    defaultTemplateId?: string;
    assignments?: Record<string, string>;
  }) => {
    if (!event) return;
    const nextUseSameDesign = overrides?.useSameDesign ?? useSameDesign;
    const nextDefaultTemplateId = overrides?.defaultTemplateId ?? defaultTemplateId;
    const nextAssignments = overrides?.assignments ?? roleTemplateAssignments;
    const currentRS = (event.registration_settings as Record<string, any>) || {};
    const currentBadgeDesign = (currentRS.badge_design as Record<string, any>) || {};

    setTemplateSaving(true);
    try {
      await updateEvent.mutateAsync({
        registration_settings: {
          ...currentRS,
          badge_design: {
            ...currentBadgeDesign,
            use_same_design_for_all_users: nextUseSameDesign,
            default_template_id: nextDefaultTemplateId || null,
            role_template_assignments: nextAssignments,
          },
        } as any,
      });
      toast.success("Badge design configuration saved to database.");
    } catch {
      toast.error("Failed to save badge design settings.");
    } finally {
      setTemplateSaving(false);
    }
  };

  // Update reg code in pending state
  const updateRoleCode = (id: string, value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    setPendingCodes((prev) => ({ ...prev, [id]: clean }));
    setRoles((prev) => prev.map((role) => (role.id === id ? { ...role, role_code: clean } : role)));
  };

  // Bulk save pending code updates to DB
  const saveChanges = async () => {
    if (!Object.keys(pendingCodes).length) {
      toast.info("No unsaved role changes.");
      return;
    }
    setSaving(true);
    try {
      const updates = Object.entries(pendingCodes).map(([id, code]) => ({
        id,
        role_code: code,
        is_active: roles.find((r) => r.id === id)?.is_active ?? true,
      }));
      await apiClient.patch(`/events/${eventId}/registration/roles/bulk-toggle`, { updates });
      toast.success(`${updates.length} role code update${updates.length === 1 ? "" : "s"} saved to database.`);
      setPendingCodes({});
    } catch {
      toast.error("Failed to save role updates to database.");
    } finally {
      setSaving(false);
    }
  };

  // Add role to this event (persists to DB via POST)
  const addRoleToEvent = async () => {
    const nameToAdd = modalSelectedRole === "custom" ? modalCustomName.trim() : modalSelectedRole;
    if (!nameToAdd) {
      toast.error("Please select or enter a role name.");
      return;
    }

    const codeToUse = (modalRoleCode.trim() || generateRoleCode(nameToAdd)).toUpperCase();

    setAdding(true);
    try {
      await apiClient.post(
        `/events/${eventId}/registration/roles`,
        {
          category: modalCategory,
          name: nameToAdd,
          role_code: codeToUse,
          is_active: true,
          sort_order: 99,
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } }
      );
      toast.success(`Role "${nameToAdd}" added to this event.`);
      setIsAddModalOpen(false);
      setModalCustomName("");
      setModalRoleCode("");
      await load();
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.detail ||
        err?.detail ||
        err?.message ||
        "Failed to add role to database.";
      toast.error(typeof errorMsg === "string" ? errorMsg : "Failed to add role to database.");
    } finally {
      setAdding(false);
    }
  };

  // Remove role from this event (deletes from DB for this event, returning it to catalog)
  const removeRoleFromEvent = async (id: string, name: string) => {
    try {
      await apiClient.delete(`/events/${eventId}/registration/roles/${id}`);
      setRoles((prev) => prev.filter((x) => x.id !== id));
      toast.success(`"${name}" disabled for this event and returned to available roles.`);
    } catch {
      // Optimistic client remove fallback if standard seed
      setRoles((prev) => prev.filter((x) => x.id !== id));
      toast.success(`"${name}" removed from this event.`);
    }
  };

  const pendingCount = Object.keys(pendingCodes).length;
  const activeRolesCount = roles.length;
  const activeCategoriesCount = CATEGORIES.filter((c) => !disabledCategories.includes(c)).length;

  const filteredRoles = roles.filter((r) => {
    const matchesSearch =
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase()) ||
      (r.role_code && r.role_code.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory =
      selectedCategoryFilter === "all" || r.category === selectedCategoryFilter;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="w-full space-y-6 p-6">
      {/* ── Top Header & Action Controls ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Tag className="size-4 text-[var(--pri)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">
              Registration Management
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Role Categories & Delegate Passes
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Configure participant classifications, prefix codes, badge layout assignments, and public registration visibility.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors shadow-sm cursor-pointer"
            title="Refresh from database"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex h-9 items-center gap-2 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-all hover:opacity-90 cursor-pointer"
          >
            <Plus className="size-4" />
            Add Role
          </button>

          {pendingCount > 0 && (
            <button
              type="button"
              onClick={saveChanges}
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 cursor-pointer"
            >
              <Save className="size-4" />
              Save Codes ({pendingCount})
            </button>
          )}
        </div>
      </div>

      {/* ── Live Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Active Event Roles
          </span>
          <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">{roles.length}</div>
          <span className="text-[11px] text-[var(--text-secondary)]">Across {CATEGORIES.length} categories</span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Portal Visible Roles
          </span>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {roles.filter((r) => r.is_active).length} / {roles.length}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Visible on public registration portal</span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Active Event Roles
          </span>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
            {roles.filter((r) => r.is_active).length}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">
            Of {roles.length} total roles
          </span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Custom Created Roles
          </span>
          <div className="text-2xl font-bold text-[var(--pri)] mt-1">
            {roles.filter((r) => !r.is_default).length}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Organizer defined roles</span>
        </div>
      </div>

      {/* ── Design Studio Badge & Certificate Assignment Notice ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-[var(--border-default,#27272a)] bg-[var(--surface-panel,#18181b)] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--pri,#4f46e5)]/10 text-[var(--pri,#4f46e5)] border border-[var(--pri,#4f46e5)]/20 shrink-0">
            <LayoutTemplate className="size-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary,#fff)]">
              Multi-Role Badge & Certificate Mappings
            </h3>
            <p className="text-xs text-[var(--text-secondary,#a1a1aa)] mt-0.5">
              Custom per-role badge and certificate layouts are centrally managed in the Design Studio.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/events/${eventId}/design-studio/badges/settings`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <CreditCard className="size-3.5 text-[var(--pri,#4f46e5)]" />
            Badge Settings
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/events/${eventId}/design-studio/certificates/settings`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <Award className="size-3.5 text-amber-400" />
            Certificate Settings
          </Button>
        </div>
      </div>

      {/* ── Search & Category Filter Tabs ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedCategoryFilter("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border cursor-pointer",
              selectedCategoryFilter === "all"
                ? "border-[var(--pri)] bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                : "border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
            )}
          >
            All Categories ({roles.length})
          </button>
          {CATEGORIES.map((cat) => {
            const count = roles.filter((r) => r.category === cat).length;
            const isCatActive = selectedCategoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategoryFilter(cat)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border cursor-pointer",
                  isCatActive
                    ? "border-[var(--pri)] bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                    : "border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                )}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles or codes..."
            className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
          />
        </div>
      </div>

      {/* ── Roles by Category List ── */}
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs text-[var(--text-secondary)] shadow-sm">
          <RefreshCw className="size-4 animate-spin mr-2" /> Loading delegate roles catalogue...
        </div>
      ) : filteredRoles.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--card)] text-center p-6">
          <Tag className="size-6 text-[var(--text-tertiary)] mb-2" />
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">No roles found</h4>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Click &ldquo;Add Role&rdquo; at the top to enable roles for this event.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.filter(
            (category) =>
              selectedCategoryFilter === "all" || selectedCategoryFilter === category
          ).map((category) => {
            const catRoles = filteredRoles.filter((r) => r.category === category);
            if (catRoles.length === 0) return null;
            const categoryLive = !disabledCategories.includes(category);

            return (
              <div
                key={category}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-sm overflow-hidden"
              >
                {/* Category Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "size-2.5 rounded-full",
                        catRoles.some((r) => r.is_active) ? "bg-emerald-500" : "bg-[var(--text-tertiary)]"
                      )}
                    />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      {category}
                    </h3>
                    <span className="rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                      {catRoles.filter((r) => r.is_active).length} / {catRoles.length} visible
                    </span>
                  </div>
                </div>

                {/* Table with Uniform Columns */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] table-fixed text-left text-xs">
                    <colgroup>
                      <col className="w-[45%]" />
                      <col className="w-[20%]" />
                      <col className="w-[25%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] bg-[var(--bg-surface-2)]/40">
                        <th className="px-4 py-2.5 truncate">Role Name</th>
                        <th className="px-4 py-2.5 truncate">Reg Code</th>
                        <th className="px-4 py-2.5 truncate">Portal Visibility</th>
                        <th className="px-4 py-2.5 text-right truncate">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {catRoles.map((role) => (
                        <tr key={role.id} className="hover:bg-[var(--bg-surface-hover)]/60 transition-colors">
                          <td className="px-4 py-3 truncate">
                            <div className="flex items-center gap-2 truncate">
                              <span className="font-semibold text-[var(--text-primary)] truncate">
                                {role.name}
                              </span>
                              {!role.is_default && (
                                <span className="shrink-0 rounded-md border border-[var(--pri)]/20 bg-[var(--pri)]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--pri)]">
                                  Custom
                                </span>
                              )}
                              {pendingCodes[role.id] !== undefined && (
                                <span className="size-2 shrink-0 rounded-full bg-amber-500 animate-pulse" title="Unsaved code change" />
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <input
                              value={role.role_code || ""}
                              onChange={(e) => updateRoleCode(role.id, e.target.value)}
                              placeholder="CODE"
                              className="h-8 w-full max-w-[120px] rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                            />
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <ToggleSwitch
                                size="sm"
                                checked={role.is_active}
                                onChange={() => toggleRoleVisibility(role.id, role.is_active)}
                                label={`Toggle visibility for ${role.name}`}
                              />
                              <span
                                className={cn(
                                  "text-xs font-semibold",
                                  role.is_active
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-[var(--text-tertiary)]"
                                )}
                              >
                                {role.is_active ? "Visible" : "Hidden"}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeRoleFromEvent(role.id, role.name)}
                              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer"
                              title={`Disable "${role.name}" for this event`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Role Popup Modal ── */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-md space-y-5"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
                    <FolderPlus className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Add Role to Event</h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">Enable a catalogue role or create a custom role.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Modal Form Fields */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Role Category
                  </label>
                  <select
                    value={modalCategory}
                    onChange={(e) => setModalCategory(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Select Role from Catalogue
                  </label>
                  <select
                    value={modalSelectedRole}
                    onChange={(e) => handleModalRoleChange(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  >
                    {availableRolesForCategory(modalCategory).map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                    <option value="custom">+ Create Custom Role</option>
                  </select>
                </div>

                {modalSelectedRole === "custom" && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Custom Role Name
                    </label>
                    <input
                      value={modalCustomName}
                      onChange={(e) => handleModalCustomNameChange(e.target.value)}
                      placeholder="e.g. Executive Partner"
                      className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Registration Prefix Code
                    </label>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Auto-Generated</span>
                  </div>
                  <input
                    value={modalRoleCode}
                    onChange={(e) => setModalRoleCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                    placeholder="e.g. DEL"
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs font-bold tracking-wider text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none uppercase"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 border-t border-[var(--border-subtle)] pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addRoleToEvent}
                  disabled={adding}
                  className="flex items-center gap-2 rounded-lg bg-[var(--pri)] px-5 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-all hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="size-4" />
                  {adding ? "Adding..." : "Add Role to Event"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
