"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Briefcase,
  Building,
  Calendar,
  CheckCircle,
  Copy,
  CreditCard,
  DollarSign,
  Globe,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Printer,
  QrCode,
  Save,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiPatch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useOperationAccess } from "@/lib/capabilities";

export interface Participant {
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

export interface Role {
  id: string;
  name: string;
  role_code: string;
  is_active: boolean;
}

interface ParticipantDrawerProps {
  participant: Participant;
  eventId: string;
  roles: Role[];
  badgeDesign?: any;
  printing?: boolean;
  onClose: () => void;
  onPrint: () => void;
  onUpdate: (updated: Participant) => void;
  onDelete: (id: string, name: string) => Promise<void>;
  onTogglePayment: (participant: Participant) => Promise<void>;
  onIssueQr: (participant: Participant) => Promise<void>;
}

type DrawerTab = "contact" | "credentials" | "financials";

export function ParticipantDrawer({
  participant,
  eventId,
  roles,
  badgeDesign,
  printing = false,
  onClose,
  onPrint,
  onUpdate,
  onDelete,
  onTogglePayment,
  onIssueQr,
}: ParticipantDrawerProps) {
  const registrationAccess = useOperationAccess("registration.manage");
  const paymentAccess = useOperationAccess("registration.payments.manage");
  const confirmationQrAccess = useOperationAccess("registration.confirmation_qr.manage");

  const [activeTab, setActiveTab] = useState<DrawerTab>("contact");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [issuingQr, setIssuingQr] = useState(false);

  const [form, setForm] = useState({
    first_name: participant.first_name || participant.name?.split(" ")[0] || "",
    last_name:
      participant.last_name ||
      (participant.name?.includes(" ")
        ? participant.name.split(" ").slice(1).join(" ")
        : "") ||
      "",
    email: participant.email || "",
    phone: participant.phone || "",
    company: participant.company || "",
    designation: participant.designation || "",
    role: participant.role || roles[0]?.name || "Attendee",
  });

  const handleSave = async () => {
    if (!registrationAccess.enabled) {
      toast.error("You do not have permission to edit participants.");
      return;
    }
    setSaveError("");
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        company: form.company.trim() || undefined,
        designation: form.designation.trim() || undefined,
        role: form.role,
      };

      const updated = await apiPatch<Participant>(
        `/events/${eventId}/participants/${participant.id}`,
        payload
      );

      onUpdate({ ...participant, ...updated });
      setIsEditing(false);
      toast.success("Participant record updated.");
    } catch (err: any) {
      const msg = err.message || "Failed to update participant record.";
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleIssueQr = async () => {
    setIssuingQr(true);
    try {
      await onIssueQr(participant);
    } finally {
      setIssuingQr(false);
    }
  };

  const tabs: { key: DrawerTab; label: string; icon: any }[] = [
    { key: "contact", label: "Contact & Info", icon: User },
    { key: "credentials", label: "Credentials & QR", icon: QrCode },
    { key: "financials", label: "Payment & Pass", icon: CreditCard },
  ];

  const fullName =
    participant.name ||
    `${form.first_name} ${form.last_name}`.trim() ||
    "Attendee";

  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AT";

  const photoUrl =
    participant.photo || participant.avatar || participant.profile_picture;

  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-[1px] rounded-[16px] overflow-hidden pointer-events-auto">
      {/* Backdrop click to dismiss */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 cursor-pointer"
      />

      {/* Slide-Over Drawer Panel (matches SpeakerDrawer layout) */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative w-[600px] max-w-full bg-[var(--card)] border-l border-[var(--border-default)] flex flex-col h-full overflow-hidden rounded-r-[16px] shadow-2xl z-10"
      >
        {/* Top Header Section */}
        <div className="flex-shrink-0 p-6 border-b border-[var(--border-subtle)]">
          {/* Top Actions & Close Button */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
                  >
                    {saving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setSaveError("");
                      setForm({
                        first_name:
                          participant.first_name ||
                          participant.name?.split(" ")[0] ||
                          "",
                        last_name:
                          participant.last_name ||
                          (participant.name?.includes(" ")
                            ? participant.name.split(" ").slice(1).join(" ")
                            : "") ||
                          "",
                        email: participant.email || "",
                        phone: participant.phone || "",
                        company: participant.company || "",
                        designation: participant.designation || "",
                        role: participant.role || roles[0]?.name || "Attendee",
                      });
                    }}
                    className="h-8 px-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  disabled={!registrationAccess.enabled}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-xs transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <Pencil className="size-3.5" />
                  Edit Participant
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Hero Profile Card */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-lg font-bold text-[var(--pri)] border border-[var(--pri)]/20 overflow-hidden">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt={fullName}
                  className="size-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex gap-2">
                  <input
                    value={form.first_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, first_name: e.target.value }))
                    }
                    placeholder="First name"
                    className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] font-bold focus:border-[var(--pri)] focus:outline-none"
                  />
                  <input
                    value={form.last_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, last_name: e.target.value }))
                    }
                    placeholder="Last name"
                    className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] font-bold focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight truncate">
                    {fullName}
                  </h2>
                  <p className="text-xs font-medium text-[var(--pri)] truncate">
                    {[participant.designation, participant.company]
                      .filter(Boolean)
                      .join(" • ") || "Registered Delegate"}
                  </p>
                </>
              )}

              {/* Status Chips Row */}
              <div className="flex gap-2 mt-2 flex-wrap items-center">
                <span className="inline-flex items-center rounded bg-[var(--pri)]/10 text-[var(--pri)] text-[10px] font-bold px-2 py-0.5 border border-[var(--pri)]/20">
                  {participant.role.toUpperCase()}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded text-[10px] font-bold px-2 py-0.5 border",
                    participant.is_free
                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
                      : participant.paid_status === "Paid"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                  )}
                >
                  {participant.is_free
                    ? "FREE PASS"
                    : participant.paid_status.toUpperCase()}
                </span>
                <span className="inline-flex items-center rounded bg-[var(--bg-surface-2)] text-[var(--text-secondary)] font-mono text-[10px] font-bold px-2 py-0.5 border border-[var(--border-default)]">
                  {participant.regno}
                </span>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {saveError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium mb-3">
              <AlertCircle className="size-4 shrink-0" />
              {saveError}
            </div>
          )}

          {/* Tab Navigation Strip */}
          <div className="flex gap-1 p-1 bg-[var(--bg-surface-2)] rounded-lg border border-[var(--border-default)]">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-bold transition-all cursor-pointer",
                    isActive
                      ? "bg-[var(--card)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {/* ──────── TAB 1: Contact & Info ──────── */}
          {activeTab === "contact" && (
            <div className="space-y-4">
              {isEditing ? (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, email: e.target.value }))
                      }
                      className="h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] font-medium focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Phone Number
                    </label>
                    <input
                      value={form.phone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      className="h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] font-medium focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Company / Organization
                      </label>
                      <input
                        value={form.company}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, company: e.target.value }))
                        }
                        className="h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] font-medium focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Designation
                      </label>
                      <input
                        value={form.designation}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, designation: e.target.value }))
                        }
                        className="h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] font-medium focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Ticket Role
                    </label>
                    <select
                      value={form.role}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, role: e.target.value }))
                      }
                      className="h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] font-medium focus:border-[var(--pri)] focus:outline-none"
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
                <div className="space-y-3">
                  {/* Registration Number Card */}
                  <div className="flex items-center justify-between p-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                    <div className="flex items-center gap-3">
                      <Briefcase className="size-4 text-[var(--text-tertiary)]" />
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                          Registration ID
                        </span>
                        <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                          {participant.regno}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(participant.regno);
                        toast.success("Registration ID copied to clipboard.");
                      }}
                      className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:bg-[var(--card)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                      title="Copy Registration ID"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>

                  {/* Email Card */}
                  <div className="flex items-center justify-between p-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                    <div className="flex items-center gap-3 truncate mr-2">
                      <Mail className="size-4 text-[var(--text-tertiary)] shrink-0" />
                      <div className="truncate">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                          Email Address
                        </span>
                        <span className="text-xs text-[var(--text-primary)] truncate block font-medium">
                          {participant.email}
                        </span>
                      </div>
                    </div>
                    <a
                      href={`mailto:${participant.email}`}
                      className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:bg-[var(--card)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                      title="Send email"
                    >
                      <Mail className="size-3.5" />
                    </a>
                  </div>

                  {/* Phone Card */}
                  <div className="flex items-center justify-between p-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                    <div className="flex items-center gap-3">
                      <Phone className="size-4 text-[var(--text-tertiary)]" />
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                          Phone Contact
                        </span>
                        <span className="text-xs text-[var(--text-primary)] font-medium">
                          {participant.phone || "Not provided"}
                        </span>
                      </div>
                    </div>
                    {participant.phone && (
                      <a
                        href={`tel:${participant.phone}`}
                        className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:bg-[var(--card)] hover:text-[var(--text-primary)] transition-colors"
                        title="Call phone"
                      >
                        <Phone className="size-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Organization & Designation Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                      <div className="flex items-center gap-2 mb-1">
                        <Building className="size-3.5 text-[var(--text-tertiary)]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Organization
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {participant.company || "Not provided"}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="size-3.5 text-[var(--text-tertiary)]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Designation
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {participant.designation || "Not provided"}
                      </p>
                    </div>
                  </div>

                  {/* Metadata: Source & Registered Date */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                      <div className="flex items-center gap-2 mb-1">
                        <Globe className="size-3.5 text-[var(--text-tertiary)]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Intake Source
                        </span>
                      </div>
                      <p className="text-xs uppercase font-bold text-[var(--text-primary)]">
                        {participant.source || "Web"}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="size-3.5 text-[var(--text-tertiary)]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Registered At
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        {participant.registered_at
                          ? new Date(participant.registered_at).toLocaleDateString(
                              "en-IN",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }
                            )
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ──────── TAB 2: Credentials & QR ──────── */}
          {activeTab === "credentials" && (
            <div className="space-y-4">
              {/* QR Code Pass Card */}
              <div className="p-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-center space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <QrCode className="size-4 text-[var(--pri)]" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      Confirmation QR Pass
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                      participant.qr_code_url
                        ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                    )}
                  >
                    {participant.qr_code_url ? "Active" : "Not Issued"}
                  </span>
                </div>

                {participant.qr_code_url ? (
                  <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl shadow-xs mx-auto w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={participant.qr_code_url}
                      alt={`QR Pass for ${fullName}`}
                      className="size-48 object-contain"
                    />
                    <span className="mt-1 font-mono text-[10px] font-bold text-zinc-900 tracking-wider">
                      {participant.regno}
                    </span>
                  </div>
                ) : (
                  <div className="p-8 border border-dashed border-[var(--border-default)] rounded-xl text-center space-y-2">
                    <QrCode className="size-10 text-[var(--text-tertiary)] mx-auto opacity-40" />
                    <p className="text-xs font-semibold text-[var(--text-secondary)]">
                      No confirmation QR has been issued for this attendee yet.
                    </p>
                  </div>
                )}

                <div className="pt-2 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleIssueQr}
                    disabled={
                      issuingQr ||
                      confirmationQrAccess.loading ||
                      !confirmationQrAccess.enabled
                    }
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] text-xs font-bold shadow-sm hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer"
                  >
                    {issuingQr ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <QrCode className="size-3.5" />
                    )}
                    {participant.qr_code_url
                      ? "Rotate QR Pass"
                      : "Issue Confirmation QR"}
                  </button>
                </div>
              </div>

              {/* Badge Preview Information */}
              <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                  Badge Design Status
                </span>
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  {badgeDesign?.templateName
                    ? `Linked Template: ${badgeDesign.templateName}`
                    : "Standard On-site Delegate Badge Layout"}
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onPrint}
                    disabled={printing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                  >
                    <Printer className="size-3.5 text-[var(--pri)]" />
                    {printing ? "Generating PDF..." : "Export & Print Badge"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ──────── TAB 3: Payment & Ticket ──────── */}
          {activeTab === "financials" && (
            <div className="space-y-4">
              {/* Ticket Role Card */}
              <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Assigned Ticket Tier
                    </span>
                    <h4 className="text-base font-bold text-[var(--text-primary)]">
                      {participant.role}
                    </h4>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-[var(--pri)]/10 text-[var(--pri)] font-bold text-xs border border-[var(--pri)]/20">
                    Active Pass
                  </span>
                </div>
              </div>

              {/* Payment Status & Toggle Card */}
              <div className="p-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <DollarSign className="size-5 text-[var(--text-tertiary)]" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                        Payment Classification
                      </span>
                      <span
                        className={cn(
                          "text-sm font-black",
                          participant.is_free
                            ? "text-sky-600 dark:text-sky-400"
                            : participant.paid_status === "Paid"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        )}
                      >
                        {participant.is_free
                          ? "Complimentary Free Pass"
                          : `Status: ${participant.paid_status}`}
                      </span>
                    </div>
                  </div>

                  {!participant.is_free && (
                    <button
                      type="button"
                      disabled={
                        paymentAccess.loading ||
                        registrationAccess.loading ||
                        !paymentAccess.enabled ||
                        !registrationAccess.enabled
                      }
                      onClick={() => onTogglePayment(participant)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
                    >
                      Mark as {participant.paid_status === "Paid" ? "Unpaid" : "Paid"}
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-[var(--text-tertiary)] pt-2 border-t border-[var(--border-subtle)]">
                  Toggle status to reconcile cash, bank transfers, or on-site manual desk transactions.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Bottom Actions Footer */}
        <div className="p-6 border-t border-[var(--border-subtle)] shrink-0 flex items-center justify-between gap-3 bg-[var(--card)]">
          <button
            type="button"
            onClick={onPrint}
            disabled={printing}
            className="flex-1 flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            {printing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" />
            )}
            Print Badge
          </button>

          <button
            type="button"
            onClick={async () => {
              await onDelete(participant.id, fullName);
            }}
            disabled={
              registrationAccess.loading || !registrationAccess.enabled
            }
            className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold text-xs hover:bg-rose-500/20 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="size-4" />
            Archive
          </button>
        </div>
      </motion.div>
    </div>
  );
}
