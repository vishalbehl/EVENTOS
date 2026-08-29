"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Building,
  Calendar,
  CheckCircle,
  CheckSquare,
  Copy,
  DollarSign,
  Eye,
  Globe,
  Lock,
  Mail,
  Pencil,
  Phone,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Tag,
  Trash2,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { compileTemplateToPdf } from "@/lib/pdf-compiler";
import AddParticipantModal from "@/components/organizer/registration/AddParticipantModal";
import { useOperationAccess } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

interface Participant {
  id: string;
  regno: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  company?: string;
  designation?: string;
  photo?: string;
  avatar?: string;
  profile_picture?: string;
  role: string;
  paid_status: string;
  source: string;
  registered_at: string;
  is_free?: boolean;
  qr_code_url?: string | null;
}

interface PrintTemplate {
  id: string;
  templateName: string;
  templateData: any;
}

interface Role {
  id: string;
  name: string;
  role_code: string;
  is_active: boolean;
}

export default function ParticipantsDirectory() {
  const params = useParams();
  const eventId = params?.eventId as string;

  const readAccess = useOperationAccess("registration.read");
  const registrationAccess = useOperationAccess("registration.manage");
  const paymentAccess = useOperationAccess("registration.payments.manage");
  const speakerAccess = useOperationAccess("speakers.manage");
  const roleReadAccess = useOperationAccess("registration.ticket_types.read");
  const badgeTemplateAccess = useOperationAccess("badges.templates.read");
  const confirmationQrAccess = useOperationAccess("registration.confirmation_qr.manage");

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [badgeDesign, setBadgeDesign] = useState<any>({});
  const [eventDetails, setEventDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedParticipantForDrawer, setSelectedParticipantForDrawer] = useState<Participant | null>(null);
  const [issuingQrFor, setIssuingQrFor] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company: "",
    designation: "",
    role: "",
  });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [paidFilter, setPaidFilter] = useState("all");

  const roleByName = useMemo(() => new Map(roles.map((role) => [role.name, role])), [roles]);
  const roleByNameLower = useMemo(
    () => new Map(roles.map((role) => [role.name.toLowerCase(), role])),
    [roles]
  );

  const fetchData = async () => {
    if (!readAccess.enabled) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const queryParams: string[] = [];
      if (search) queryParams.push(`search=${encodeURIComponent(search)}`);
      if (roleFilter !== "all") queryParams.push(`role=${encodeURIComponent(roleFilter)}`);
      if (paidFilter !== "all") queryParams.push(`paid_status=${encodeURIComponent(paidFilter)}`);

      const url = `/events/${eventId}/participants${queryParams.length ? `?${queryParams.join("&")}` : ""}`;
      const [list, eventRes] = await Promise.all([
        apiGet<Participant[]>(url),
        apiGet<any>(`/events/${eventId}`),
      ]);
      const [templatesRes, rolesRes] = await Promise.all([
        badgeTemplateAccess.enabled
          ? apiGet<any[]>(`/events/${eventId}/print-templates`).then((res) =>
              (res || []).filter((t) => t.template_type !== "certificate")
            )
          : Promise.resolve([]),
        roleReadAccess.enabled
          ? apiGet<Role[]>(`/events/${eventId}/registration/roles`)
          : Promise.resolve([]),
      ]);

      setParticipants(list || []);
      setRoles(rolesRes || []);
      setEventDetails(eventRes);
      setBadgeDesign(eventRes?.registration_settings?.badge_design || {});
      setTemplates(
        (templatesRes || []).map((t) => ({
          id: t.id,
          templateName: t.template_name || t.templateName || "Unnamed Template",
          templateData: t.template_data || t.templateData || {},
        }))
      );
      setSelectedIds((prev) => new Set(Array.from(prev).filter((id) => list.some((p) => p.id === id))));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load delegates registry.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = async () => {
    setSearch("");
    setRoleFilter("all");
    setPaidFilter("all");
    try {
      setLoading(true);
      const url = `/events/${eventId}/participants`;
      const [list, eventRes] = await Promise.all([
        apiGet<Participant[]>(url),
        apiGet<any>(`/events/${eventId}`),
      ]);
      setParticipants(list || []);
      setEventDetails(eventRes);
      setSelectedIds(new Set());
    } catch {
      toast.error("Failed to reset filters.");
    } finally {
      setLoading(false);
    }
  };

  const issueConfirmationQr = async (participant: Participant) => {
    if (!confirmationQrAccess.enabled) return;
    setIssuingQrFor(participant.id);
    try {
      let version = 0;
      try {
        const existing = await apiGet<{ version: number }>(
          `/events/${eventId}/participants/${participant.id}/confirmation-qr`
        );
        version = existing.version;
      } catch (error: any) {
        if (error?.status !== 404) throw error;
      }
      const issued = await apiPost<{ image_url: string; version: number }>(
        `/events/${eventId}/participants/${participant.id}/confirmation-qr`,
        {
          reason:
            version > 0
              ? "Rotated from the participant registry"
              : "Issued from the participant registry",
          case_reference: null,
        },
        {
          headers: {
            "If-Match": version,
            "Idempotency-Key": crypto.randomUUID(),
          },
        }
      );
      setParticipants((current) =>
        current.map((item) =>
          item.id === participant.id ? { ...item, qr_code_url: issued.image_url } : item
        )
      );
      setSelectedParticipantForDrawer((current) =>
        current?.id === participant.id ? { ...current, qr_code_url: issued.image_url } : current
      );
      toast.success(version > 0 ? "Confirmation QR rotated." : "Confirmation QR issued.");
    } catch (error: any) {
      toast.error(error?.message || "Confirmation QR could not be issued.");
    } finally {
      setIssuingQrFor(null);
    }
  };

  const handleSyncFromSpeakers = async () => {
    if (!registrationAccess.enabled || !speakerAccess.enabled) return;
    try {
      setSyncing(true);
      const res = await apiPost<{ message: string }>(
        `/events/${eventId}/participants/fetch-from-speakers`,
        undefined,
        {
          headers: { "Idempotency-Key": `speaker-participant-sync-${crypto.randomUUID()}` },
        }
      );
      toast.success(res.message || "Sync completed successfully.");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to sync participants from speakers.");
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenDrawer = (p: Participant) => {
    setSelectedParticipantForDrawer(p);
    setIsEditing(false);
    setEditForm({
      first_name: p.first_name || p.name?.split(" ")[0] || "",
      last_name:
        p.last_name || (p.name?.includes(" ") ? p.name.split(" ").slice(1).join(" ") : "") || "",
      email: p.email || "",
      phone: p.phone || "",
      company: p.company || "",
      designation: p.designation || "",
      role: p.role || "",
    });
  };

  const handleSaveChanges = async () => {
    if (!selectedParticipantForDrawer) return;
    try {
      const payload = {
        ...editForm,
        name: `${editForm.first_name} ${editForm.last_name}`.trim(),
      };
      const updated = await apiPatch<Participant>(
        `/events/${eventId}/participants/${selectedParticipantForDrawer.id}`,
        payload
      );
      toast.success("Delegate information updated.");
      setIsEditing(false);
      setSelectedParticipantForDrawer(updated);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update delegate details.");
    }
  };

  useEffect(() => {
    if (eventId && !readAccess.loading) fetchData();
  }, [eventId, roleFilter, paidFilter, readAccess.enabled, badgeTemplateAccess.enabled, roleReadAccess.enabled]);

  const resolveTemplateForParticipant = (participant: Participant, designOverride?: any) => {
    const design = designOverride || badgeDesign;
    const pRoleClean = (participant.role || "").trim().toLowerCase();

    let role = roleByName.get(participant.role) || roleByNameLower.get(pRoleClean);
    if (!role) {
      role = roles.find((r) => (r.name || "").trim().toLowerCase() === pRoleClean);
    }

    const assignments = design.role_template_assignments || {};
    let roleTemplateId = assignments[participant.role];
    if (role) {
      roleTemplateId = assignments[role.id] || assignments[role.name] || roleTemplateId;
    }

    const isSameDesign = design.use_same_design_for_all_users;
    const useRoleSpecific = isSameDesign === false || String(isSameDesign).toLowerCase() === "false";

    const templateId = useRoleSpecific
      ? roleTemplateId || design.default_template_id
      : design.default_template_id;

    return (
      templates.find((template) => String(template.id).toLowerCase() === String(templateId || "").toLowerCase()) ||
      null
    );
  };

  const handleTogglePayment = async (participant: Participant) => {
    if (!registrationAccess.enabled || !paymentAccess.enabled) return;
    try {
      const nextStatus = participant.paid_status === "Paid" ? "Unpaid" : "Paid";
      await apiPatch(`/events/${eventId}/participants/${participant.id}`, { paid_status: nextStatus });
      toast.success(`Payment updated to ${nextStatus}.`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update payment status.");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!registrationAccess.enabled) return;
    if (!window.confirm(`Archive participant "${name}"? The record remains recoverable.`)) return;
    try {
      await apiDelete(`/events/${eventId}/participants/${id}`);
      toast.success("Delegate registration archived.");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove delegate.");
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0 || !registrationAccess.enabled) return;
    if (!window.confirm(`Archive ${selectedIds.size} selected participant registrations?`)) return;
    try {
      await apiPost(`/events/${eventId}/participants/bulk-delete`, Array.from(selectedIds));
      toast.success("Selected participants archived.");
      setSelectedIds(new Set());
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete selected participants.");
    }
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === participants.length ? new Set() : new Set(participants.map((p) => p.id))
    );
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const printParticipants = async (list: Participant[]) => {
    if (list.length === 0) {
      toast.error("Select at least one participant to print.");
      return;
    }

    try {
      await apiPost(
        `/events/${eventId}/badges/export-authorizations?participant_count=${list.length}`,
        undefined,
        { headers: { "Idempotency-Key": crypto.randomUUID() } }
      );
    } catch (err: any) {
      toast.error(err.message || "Badge export could not be authorized.");
      return;
    }

    let printBadgeDesign = badgeDesign;
    let freshEventDetails = eventDetails;
    try {
      const [freshEvent, freshTemplates] = await Promise.all([
        apiGet<any>(`/events/${eventId}`),
        apiGet<any[]>(`/events/${eventId}/print-templates`).then((res) =>
          (res || []).filter((t) => t.template_type !== "certificate")
        ),
      ]);
      printBadgeDesign = freshEvent?.registration_settings?.badge_design || {};
      setBadgeDesign(printBadgeDesign);
      freshEventDetails = freshEvent;
      setEventDetails(freshEvent);

      const newTemplates = freshTemplates.map((t) => ({
        id: t.id,
        templateName: t.template_name || t.templateName || "Unnamed Template",
        templateData: t.template_data || t.templateData || {},
      }));
      setTemplates(newTemplates);
    } catch {
      // Continue with current state
    }

    const resolvedList = list.map((p) => {
      let tpl = resolveTemplateForParticipant(p, printBadgeDesign);
      if (!tpl && templates.length > 0) {
        tpl = templates[0];
      }
      return { participant: p, template: tpl };
    });

    const missingTemplates = resolvedList.filter((item) => !item.template);
    if (missingTemplates.length === resolvedList.length) {
      toast.error("No badge templates are configured or assigned for this event yet.");
      return;
    }

    setPrinting(true);
    toast.info(`Generating ${resolvedList.filter((i) => i.template).length} badge(s)...`);

    try {
      const groups: Record<string, { template: PrintTemplate; participants: Participant[] }> = {};
      resolvedList.forEach((item) => {
        if (!item.template) return;
        if (!groups[item.template.id]) {
          groups[item.template.id] = { template: item.template, participants: [] };
        }
        groups[item.template.id].participants.push(item.participant);
      });

      for (const group of Object.values(groups)) {
        const pdf = await compileTemplateToPdf(
          group.participants,
          group.template.templateData,
          freshEventDetails
        );
        window.open(URL.createObjectURL(pdf.output("blob")), "_blank");
      }
      toast.success("Badge PDF(s) generated.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to generate badge PDF.");
    } finally {
      setPrinting(false);
    }
  };

  const selectedParticipants = participants.filter((p) => selectedIds.has(p.id));

  // Live KPI statistics
  const totalCount = participants.length;
  const paidCount = participants.filter((p) => p.paid_status === "Paid" || p.is_free).length;
  const unpaidCount = participants.filter((p) => p.paid_status === "Unpaid" && !p.is_free).length;
  const qrIssuedCount = participants.filter((p) => Boolean(p.qr_code_url)).length;

  if (!readAccess.loading && !readAccess.enabled) {
    return (
      <div className="m-6 rounded-lg border border-amber-500/20 bg-amber-500/5 p-8 text-center">
        <Lock className="mx-auto size-8 text-amber-500" />
        <h1 className="mt-4 text-base font-bold text-[var(--text-primary)]">Participant Access Locked</h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Your role or this event contract does not permit viewing participant records.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 p-6">
      {/* ── Top Header & Action Controls ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="size-4 text-[var(--pri)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">
              Registration Management
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Participants & Delegates Registry
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Monitor attendee registrations, manage payment statuses, issue QR credentials, and print badges.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading || syncing}
            className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors shadow-sm cursor-pointer"
            title="Refresh participants"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>

          <button
            type="button"
            onClick={handleSyncFromSpeakers}
            disabled={
              syncing ||
              loading ||
              registrationAccess.loading ||
              speakerAccess.loading ||
              !registrationAccess.enabled ||
              !speakerAccess.enabled
            }
            className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors shadow-sm disabled:opacity-40 cursor-pointer"
          >
            <Sparkles className={cn("size-3.5 text-amber-500", syncing && "animate-spin")} />
            Sync Speakers
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            disabled={registrationAccess.loading || !registrationAccess.enabled}
            className="flex h-9 items-center gap-2 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-all hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            <Plus className="size-4" />
            Add Participant
          </button>
        </div>
      </div>

      {/* ── Live KPI Stat Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Total Registered
          </span>
          <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">{totalCount}</div>
          <span className="text-[11px] text-[var(--text-secondary)]">All attendee passes</span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Paid & Completed
          </span>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {paidCount}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Settled registrations</span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Unpaid / Pending
          </span>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {unpaidCount}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Awaiting settlement</span>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            QR Credentials Active
          </span>
          <div className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">
            {qrIssuedCount}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Issued confirmation passes</span>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search by name, email, company, or reg no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchData()}
            className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none shadow-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none shadow-sm cursor-pointer"
          >
            <option value="all">All Roles</option>
            {roles.map((role) => (
              <option key={role.id} value={role.name}>
                {role.name}
              </option>
            ))}
          </select>

          <select
            value={paidFilter}
            onChange={(e) => setPaidFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none shadow-sm cursor-pointer"
          >
            <option value="all">All Payment Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Free">Free</option>
          </select>

          <button
            type="button"
            onClick={handleResetFilters}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors shadow-sm cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* ── Multi-Select Batch Actions Bar ── */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-[var(--pri)]/30 bg-[var(--pri)]/5 p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-[var(--pri)] text-[10px] font-bold text-[var(--primary-contrast)]">
              {selectedIds.size}
            </span>
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {selectedIds.size} participant{selectedIds.size === 1 ? "" : "s"} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => printParticipants(selectedParticipants)}
              disabled={printing}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--pri)] px-3 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              <Printer className="size-3.5" />
              Print Badges ({selectedIds.size})
            </button>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={registrationAccess.loading || !registrationAccess.enabled}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Trash2 className="size-3.5" />
              Archive Selected
            </button>
          </div>
        </div>
      )}

      {/* ── Participants Table ── */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[4%]" />
              <col className="w-[12%]" />
              <col className="w-[28%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] select-none">
                <th className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                    title="Select all"
                  >
                    {participants.length > 0 && selectedIds.size === participants.length ? (
                      <CheckSquare className="size-4 text-[var(--pri)]" />
                    ) : (
                      <Square className="size-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 truncate">Reg No</th>
                <th className="px-4 py-3 truncate">Attendee Profile</th>
                <th className="px-4 py-3 truncate">Role Type</th>
                <th className="px-4 py-3 truncate">Payment</th>
                <th className="px-4 py-3 truncate">Source</th>
                <th className="px-4 py-3 text-right truncate">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-[var(--text-secondary)]">
                    <RefreshCw className="size-5 text-[var(--pri)] animate-spin mx-auto mb-2" />
                    Loading attendees registry...
                  </td>
                </tr>
              ) : participants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-[var(--text-secondary)]">
                    <Users className="size-6 text-[var(--text-tertiary)] mx-auto mb-2" />
                    No attendees found matching search parameters.
                  </td>
                </tr>
              ) : (
                participants.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => handleOpenDrawer(p)}
                    className="hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => toggleSelected(p.id)}
                        className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        {selectedIds.has(p.id) ? (
                          <CheckSquare className="size-4 text-[var(--pri)]" />
                        ) : (
                          <Square className="size-4" />
                        )}
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-[var(--pri)]">
                        {p.regno}
                      </span>
                    </td>

                    <td className="px-4 py-3 truncate">
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--pri)]/10 text-[var(--pri)] font-bold text-[10px] border border-[var(--pri)]/20 overflow-hidden">
                          {p.photo || p.avatar || p.profile_picture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.photo || p.avatar || p.profile_picture}
                              alt={p.name}
                              className="size-full object-cover"
                            />
                          ) : (
                            p.name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase() || "AT"
                          )}
                        </div>
                        <div className="flex flex-col truncate">
                          <span className="font-semibold text-[var(--text-primary)] truncate">
                            {p.name}
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] truncate">
                            {p.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-primary)]">
                        {p.role}
                      </span>
                    </td>

                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {p.is_free ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">
                          <CheckCircle className="size-3" /> Free
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={
                            paymentAccess.loading ||
                            registrationAccess.loading ||
                            !paymentAccess.enabled ||
                            !registrationAccess.enabled
                          }
                          onClick={() => handleTogglePayment(p)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-40",
                            p.paid_status === "Paid"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                              : "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20"
                          )}
                        >
                          {p.paid_status === "Paid" ? (
                            <CheckCircle className="size-3" />
                          ) : (
                            <XCircle className="size-3" />
                          )}
                          {p.paid_status}
                        </button>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase">
                        {p.source || "manual"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenDrawer(p)}
                          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                          title="View attendee details"
                        >
                          <Eye className="size-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => issueConfirmationQr(p)}
                          disabled={
                            confirmationQrAccess.loading ||
                            !confirmationQrAccess.enabled ||
                            issuingQrFor === p.id
                          }
                          className="inline-flex size-7 items-center justify-center rounded-md text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer disabled:opacity-40"
                          title={p.qr_code_url ? "Rotate QR Pass" : "Issue QR Pass"}
                        >
                          <QrCode className="size-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => printParticipants([p])}
                          disabled={printing}
                          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--pri)] hover:bg-[var(--pri)]/10 transition-colors cursor-pointer"
                          title="Print badge"
                        >
                          <Printer className="size-3.5" />
                        </button>

                        <button
                          type="button"
                          disabled={registrationAccess.loading || !registrationAccess.enabled}
                          onClick={() => handleDelete(p.id, p.name)}
                          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer disabled:opacity-40"
                          title="Archive participant"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Slide-Over Attendee Details & Edit Drawer ── */}
      <AnimatePresence>
        {selectedParticipantForDrawer && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedParticipantForDrawer(null)}
              className="absolute inset-0"
            />

            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full max-w-md bg-[var(--card)] border-l border-[var(--border-default)] p-6 shadow-md z-10 flex flex-col h-full overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Delegate Details
                  </span>
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-1 rounded-md bg-[var(--pri)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--pri)] hover:bg-[var(--pri)]/20 transition-colors cursor-pointer"
                    >
                      <Pencil className="size-2.5" />
                      Edit
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedParticipantForDrawer(null)}
                  className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Drawer Scrollable Body */}
              <div className="flex-1 overflow-y-auto py-4 space-y-5">
                {isEditing ? (
                  <div className="space-y-3.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        First Name
                      </label>
                      <input
                        value={editForm.first_name}
                        onChange={(e) => setEditForm((p) => ({ ...p, first_name: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Last Name
                      </label>
                      <input
                        value={editForm.last_name}
                        onChange={(e) => setEditForm((p) => ({ ...p, last_name: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Phone Number
                      </label>
                      <input
                        value={editForm.phone}
                        onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Company / Organization
                      </label>
                      <input
                        value={editForm.company}
                        onChange={(e) => setEditForm((p) => ({ ...p, company: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Designation
                      </label>
                      <input
                        value={editForm.designation}
                        onChange={(e) => setEditForm((p) => ({ ...p, designation: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Role Type
                      </label>
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.name}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Attendee Profile Hero */}
                    <div className="flex flex-col items-center text-center pb-5 border-b border-[var(--border-subtle)]">
                      <div className="flex size-16 items-center justify-center rounded-full bg-[var(--pri)]/10 text-[var(--pri)] font-bold text-lg border border-[var(--pri)]/20 overflow-hidden mb-2.5">
                        {selectedParticipantForDrawer.photo ||
                        selectedParticipantForDrawer.avatar ||
                        selectedParticipantForDrawer.profile_picture ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              selectedParticipantForDrawer.photo ||
                              selectedParticipantForDrawer.avatar ||
                              selectedParticipantForDrawer.profile_picture
                            }
                            alt={selectedParticipantForDrawer.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          selectedParticipantForDrawer.name
                            ?.split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase() || "AT"
                        )}
                      </div>
                      <h2 className="text-base font-bold text-[var(--text-primary)]">
                        {selectedParticipantForDrawer.name}
                      </h2>
                      <span className="mt-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-0.5 text-[10px] font-semibold text-[var(--text-primary)]">
                        {selectedParticipantForDrawer.role}
                      </span>
                    </div>

                    {/* Information Tiles */}
                    <div className="space-y-2.5">
                      {/* Reg No with Copy */}
                      <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                        <div className="flex items-center gap-2.5">
                          <Briefcase className="size-4 text-[var(--text-tertiary)]" />
                          <div>
                            <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                              Registration Number
                            </span>
                            <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                              {selectedParticipantForDrawer.regno}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedParticipantForDrawer.regno);
                            toast.success("Registration number copied.");
                          }}
                          className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--card)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                          title="Copy Reg No"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      </div>

                      {/* Confirmation QR */}
                      <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                        <div className="flex items-center gap-2.5">
                          <QrCode className="size-4 text-sky-500" />
                          <div>
                            <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                              Confirmation QR Pass
                            </span>
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                              {selectedParticipantForDrawer.qr_code_url ? "Active Pass" : "Not Issued"}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => issueConfirmationQr(selectedParticipantForDrawer)}
                          disabled={
                            confirmationQrAccess.loading ||
                            !confirmationQrAccess.enabled ||
                            issuingQrFor === selectedParticipantForDrawer.id
                          }
                          className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          {selectedParticipantForDrawer.qr_code_url ? "Rotate" : "Issue"}
                        </button>
                      </div>

                      {/* Email */}
                      <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                        <div className="flex items-center gap-2.5 truncate mr-2">
                          <Mail className="size-4 text-[var(--text-tertiary)] shrink-0" />
                          <div className="truncate">
                            <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                              Email
                            </span>
                            <span className="text-xs text-[var(--text-primary)] truncate block">
                              {selectedParticipantForDrawer.email}
                            </span>
                          </div>
                        </div>
                        <a
                          href={`mailto:${selectedParticipantForDrawer.email}`}
                          className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--card)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                          title="Send email"
                        >
                          <Mail className="size-3.5" />
                        </a>
                      </div>

                      {/* Phone */}
                      {selectedParticipantForDrawer.phone && (
                        <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                          <div className="flex items-center gap-2.5">
                            <Phone className="size-4 text-[var(--text-tertiary)]" />
                            <div>
                              <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                                Phone
                              </span>
                              <span className="text-xs text-[var(--text-primary)]">
                                {selectedParticipantForDrawer.phone}
                              </span>
                            </div>
                          </div>
                          <a
                            href={`tel:${selectedParticipantForDrawer.phone}`}
                            className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--card)] hover:text-[var(--text-primary)] transition-colors"
                            title="Call phone"
                          >
                            <Phone className="size-3.5" />
                          </a>
                        </div>
                      )}

                      {/* Company & Designation */}
                      {(selectedParticipantForDrawer.company || selectedParticipantForDrawer.designation) && (
                        <div className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] space-y-2">
                          {selectedParticipantForDrawer.company && (
                            <div className="flex items-center gap-2.5">
                              <Building className="size-4 text-[var(--text-tertiary)]" />
                              <div>
                                <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                                  Company
                                </span>
                                <span className="text-xs text-[var(--text-primary)] font-medium">
                                  {selectedParticipantForDrawer.company}
                                </span>
                              </div>
                            </div>
                          )}
                          {selectedParticipantForDrawer.designation && (
                            <div className="flex items-center gap-2.5">
                              <User className="size-4 text-[var(--text-tertiary)]" />
                              <div>
                                <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                                  Designation
                                </span>
                                <span className="text-xs text-[var(--text-primary)]">
                                  {selectedParticipantForDrawer.designation}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Payment Status */}
                      <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                        <div className="flex items-center gap-2.5">
                          <DollarSign className="size-4 text-[var(--text-tertiary)]" />
                          <div>
                            <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                              Payment Status
                            </span>
                            <span
                              className={cn(
                                "text-xs font-bold",
                                selectedParticipantForDrawer.is_free
                                  ? "text-sky-600 dark:text-sky-400"
                                  : selectedParticipantForDrawer.paid_status === "Paid"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              )}
                            >
                              {selectedParticipantForDrawer.is_free
                                ? "Free Pass"
                                : selectedParticipantForDrawer.paid_status}
                            </span>
                          </div>
                        </div>
                        {!selectedParticipantForDrawer.is_free && (
                          <button
                            type="button"
                            disabled={
                              paymentAccess.loading ||
                              registrationAccess.loading ||
                              !paymentAccess.enabled ||
                              !registrationAccess.enabled
                            }
                            onClick={async () => {
                              const updated = {
                                ...selectedParticipantForDrawer,
                                paid_status:
                                  selectedParticipantForDrawer.paid_status === "Paid" ? "Unpaid" : "Paid",
                              };
                              await handleTogglePayment(selectedParticipantForDrawer);
                              setSelectedParticipantForDrawer(updated);
                            }}
                            className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                          >
                            Mark {selectedParticipantForDrawer.paid_status === "Paid" ? "Unpaid" : "Paid"}
                          </button>
                        )}
                      </div>

                      {/* Source & Date */}
                      <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                        <div className="flex items-center gap-2.5">
                          <Globe className="size-4 text-[var(--text-tertiary)]" />
                          <div>
                            <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                              Source
                            </span>
                            <span className="text-xs uppercase text-[var(--text-primary)]">
                              {selectedParticipantForDrawer.source}
                            </span>
                          </div>
                        </div>

                        {selectedParticipantForDrawer.registered_at && (
                          <div className="text-right">
                            <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                              Registered Date
                            </span>
                            <span className="text-xs text-[var(--text-secondary)]">
                              {new Date(selectedParticipantForDrawer.registered_at).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Drawer Footer Actions */}
              <div className="border-t border-[var(--border-subtle)] pt-4 shrink-0 space-y-2">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--card)] py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveChanges}
                      disabled={registrationAccess.loading || !registrationAccess.enabled}
                      className="flex-1 rounded-lg bg-[var(--pri)] py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-90 transition-all cursor-pointer"
                    >
                      Save Changes
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => printParticipants([selectedParticipantForDrawer])}
                      disabled={printing}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--pri)] py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-90 transition-all cursor-pointer"
                    >
                      <Printer className="size-3.5" />
                      Print Badge
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const p = selectedParticipantForDrawer;
                        setSelectedParticipantForDrawer(null);
                        await handleDelete(p.id, p.name);
                      }}
                      disabled={registrationAccess.loading || !registrationAccess.enabled}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                      Archive
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Add Participant Modal ── */}
      <AddParticipantModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        eventId={eventId}
        onSuccess={fetchData}
      />
    </div>
  );
}
