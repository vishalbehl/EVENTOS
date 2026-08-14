"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Edit3,
  Search,
  Printer,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  User,
  CheckCircle2,
  X,
  Package,
  RotateCcw,
  Users,
  Building,
  Mail,
  Phone,
  CheckSquare,
  ShieldCheck,
  CreditCard,
  Lock,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compileTemplateToPdf } from "@/lib/pdf-compiler";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CountryStateEntry, fallbackCountryStates, fetchCountryStates, getStatesForCountry } from "@/lib/country-states";
import { evaluatePolicyAction, VenueOperationalPolicy, DEFAULT_VENUE_POLICY } from "@/lib/policy-evaluator";

const BULK_BADGE_PDF_BATCH_SIZE = 25;

const isCheckedInForBadgePrint = (participant: any) =>
  Boolean(
    participant?.checked_in ||
      participant?.is_checked_in ||
      participant?.checked_in_at ||
      String(participant?.checkin_status || "").toLowerCase() === "checked_in"
  );

const formatSkippedPrintNames = (participants: any[]) => {
  const names = participants
    .map((participant) => participant?.name || participant?.regno || "Unknown")
    .filter(Boolean);
  const visible = names.slice(0, 8).join(", ");
  return names.length > 8 ? `${visible}, +${names.length - 8} more` : visible;
};

export interface Participant {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  regno: string;
  role: string;
  company?: string;
  designation?: string;
  paid_status?: string;
  badge_status?: string;
  checked_in?: boolean;
  kit_issued?: boolean;
  [key: string]: any;
}

interface Companion {
  id: string;
  name: string;
  relationship?: string;
  email?: string;
  phone?: string;
  badge_code?: string;
  badge_status?: string;
  checked_in?: boolean;
  checked_in_at?: string;
}

interface ParticipantTableProps {
  participants: Participant[];
  loading?: boolean;
  onRefresh?: () => void;
  title?: string;
  subtitle?: string;
  showPrintAction?: boolean;
}

export function getPaymentStatusBadgeClass(status?: string): string {
  const s = (status || "Paid").trim().toLowerCase();
  switch (s) {
    case "paid":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "unpaid":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
    case "pending":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    case "partially paid":
    case "partial":
      return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";
    case "refunded":
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    case "complimentary":
    case "complimentary / n/a":
    case "free":
      return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    case "waived":
    case "exempted":
      return "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20";
    default:
      return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
  }
}

export default function ParticipantTable({
  participants,
  loading = false,
  onRefresh,
  title = "Participant Directory",
  subtitle = "Live registered delegates, speakers, VIPs, and partners",
  showPrintAction = true,
}: ParticipantTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [checkinFilter, setCheckinFilter] = useState<"All" | "CheckedIn" | "NotCheckedIn">("All");
  const [paidFilter, setPaidFilter] = useState("All");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [bulkActionInProgress, setBulkActionInProgress] = useState<"print" | "delete" | null>(null);
  const [bulkPrintProgress, setBulkPrintProgress] = useState("");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  // Sorting state: Default sort by Registration Code (regno) in Ascending order
  const [sortField, setSortField] = useState<"regno" | "name">("regno");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Modal State
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [isEditingParticipant, setIsEditingParticipant] = useState(false);
  const [savingParticipant, setSavingParticipant] = useState(false);
  const [deletingParticipant, setDeletingParticipant] = useState(false);
  const [editParticipantForm, setEditParticipantForm] = useState({
    first_name: "",
    last_name: "",
    name: "",
    email: "",
    phone: "",
    role: "Delegate",
    company: "",
    designation: "",
    country: "",
    state: "",
    paid_status: "Unpaid",
  });
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>(fallbackCountryStates);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loadingCompanions, setLoadingCompanions] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Dynamically inherit all distinct roles present in dataset
  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    participants.forEach((p) => {
      if (p.role && p.role.trim() !== "") {
        set.add(p.role.trim());
      }
    });
    return Array.from(set).sort();
  }, [participants]);

  // Dynamically inherit all distinct payment statuses present in dataset (e.g. Paid, Unpaid, Free, Complimentary)
  const availablePaidStatuses = useMemo(() => {
    const set = new Set<string>(["Paid", "Unpaid"]);
    participants.forEach((p) => {
      if (p.paid_status && typeof p.paid_status === "string" && p.paid_status.trim() !== "") {
        set.add(p.paid_status.trim());
      }
    });
    return Array.from(set).sort();
  }, [participants]);

  const availableStates = useMemo(
    () => getStatesForCountry(countryStates, editParticipantForm.country),
    [countryStates, editParticipantForm.country]
  );

  useEffect(() => {
    let mounted = true;
    fetchCountryStates()
      .then((entries) => {
        if (mounted) setCountryStates(entries);
      })
      .catch(() => {
        if (mounted) setCountryStates(fallbackCountryStates);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Handle header click to toggle sorting
  const handleSortClick = (field: "regno" | "name") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter & Sort
  const filteredParticipants = useMemo(() => {
    const list = participants.filter((p) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.regno && p.regno.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.phone && p.phone.toLowerCase().includes(q)) ||
        (p.company && p.company.toLowerCase().includes(q));

      const matchesRole = roleFilter === "All" || p.role === roleFilter;

      const isCheckedIn = Boolean(p.checked_in || (p as any).is_checked_in);
      const matchesCheckin =
        checkinFilter === "All" ||
        (checkinFilter === "CheckedIn" ? isCheckedIn : !isCheckedIn);

      const matchesPaid =
        paidFilter === "All" ||
        (p.paid_status && p.paid_status.toLowerCase() === paidFilter.toLowerCase()) ||
        (!p.paid_status && paidFilter.toLowerCase() === "unpaid");

      return matchesSearch && matchesRole && matchesCheckin && matchesPaid;
    });

    return list.sort((a, b) => {
      const valA = ((sortField === "regno" ? a.regno : a.name) || "").toLowerCase();
      const valB = ((sortField === "regno" ? b.regno : b.name) || "").toLowerCase();

      const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [participants, searchTerm, roleFilter, checkinFilter, paidFilter, sortField, sortDirection]);

  // Reset page to 1 whenever filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, checkinFilter, paidFilter, pageSize]);

  // Pagination calculation
  const totalEntries = filteredParticipants.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedData = filteredParticipants.slice(startIndex, endIndex);
  const selectedParticipants = participants.filter((participant) => selectedParticipantIds.includes(participant.id));
  const visibleParticipantIds = paginatedData.map((participant) => participant.id);
  const allVisibleSelected =
    visibleParticipantIds.length > 0 && visibleParticipantIds.every((id) => selectedParticipantIds.includes(id));

  const toggleParticipantSelection = (participantId: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(participantId) ? prev.filter((id) => id !== participantId) : [...prev, participantId]
    );
  };

  const toggleVisibleSelection = () => {
    setSelectedParticipantIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleParticipantIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleParticipantIds]));
    });
  };

  // Action Summary & Audit Logs State
  const [actionStats, setActionStats] = useState<{
    print_count: number;
    reprint_count: number;
    checkin_count: number;
    total_badge_prints: number;
    kit_issued: boolean;
    kit_status?: string;
    is_kit_eligible?: boolean;
    checked_in: boolean;
  }>({
    print_count: 0,
    reprint_count: 0,
    checkin_count: 0,
    total_badge_prints: 0,
    kit_issued: false,
    kit_status: "Pending",
    is_kit_eligible: true,
    checked_in: false,
  });
  const [actionLogs, setActionLogs] = useState<any[]>([]);
  const [capacityMatrix, setCapacityMatrix] = useState<any[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const assignedCapacityMatrix = useMemo(() => {
    if (!selectedParticipant) return [];
    const participantRole = String(selectedParticipant.role || "").trim().toLowerCase();
    return capacityMatrix.filter((station) => {
      const allowedRoles = Array.isArray(station.allowed_roles) ? station.allowed_roles : [];
      const cleanRoles = allowedRoles.map((role: any) => String(role || "").trim().toLowerCase()).filter(Boolean);
      return station.is_role_allowed === true && (!cleanRoles.length || cleanRoles.includes("all") || cleanRoles.includes(participantRole));
    });
  }, [capacityMatrix, selectedParticipant]);

  // Badge PDF Preview State
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const formatActionLogLabel = (actionType: string) => {
    switch (actionType) {
      case "badge_print": return "Badge Print";
      case "badge_reprint": return "Badge Reprint";
      case "companion_badge_print": return "Companion Print";
      case "companion_badge_reprint": return "Companion Reprint";
      case "checkin": return "Gate Check-In";
      case "checkout": return "Gate Check-Out";
      case "checkin_reset": return "Check-In Reset";
      case "kit_issue": return "Kit Issued";
      case "kit_reset": return "Kit Reset";
      case "participant_update": return "Profile Update";
      case "self_checkin_update": return "Self Check-In Update";
      case "registration_update": return "Registration Update";
      default: return actionType ? actionType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Action";
    }
  };

  const formatActionLogDetails = (log: any) => {
    if (!log) return "Action performed";
    const details = log.details;
    if (!details) return formatActionLogLabel(log.action_type);
    if (typeof details === "string") {
      const s = details.trim();
      if (s.startsWith("{") && s.endsWith("}")) {
        try {
          const parsed = JSON.parse(s);
          if (parsed && typeof parsed === "object") {
            if (parsed.before && parsed.after) {
              const changes: string[] = [];
              const b = parsed.before || {};
              const a = parsed.after || {};
              const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
              const labels: Record<string, string> = {
                paid_status: "Payment Status",
                role: "Role",
                first_name: "First Name",
                last_name: "Last Name",
                name: "Full Name",
                email: "Email",
                phone: "Phone",
                company: "Company",
                designation: "Designation",
                country: "Country",
                state: "State",
                photo_url: "Photo",
              };
              for (const k of keys) {
                if (["custom_fields", "created_at", "updated_at", "id"].includes(k)) continue;
                const valB = String(b[k] ?? "").trim();
                const valA = String(a[k] ?? "").trim();
                if (valB !== valA) {
                  const label = labels[k] || k.replace(/_/g, " ");
                  if (valB && valA) changes.push(`${label} (${valB} → ${valA})`);
                  else if (valA) changes.push(`${label} set to '${valA}'`);
                  else if (valB) changes.push(`${label} cleared`);
                }
              }
              const prefix = log.action_type === "self_checkin_update" ? "Self check-in update" : "Profile update";
              return changes.length > 0 ? `${prefix}: ${changes.join(", ")}` : `${prefix}: Details modified`;
            }
            if (parsed.type === "delegate_checkin_reset") {
              return parsed.station_id && parsed.station_id !== "all"
                ? `Check-in reset for gate ID: ${parsed.station_id}`
                : "Check-in reset for all gates";
            }
            if (parsed.type === "companion_checkin_reset") {
              return `Check-in reset for companion ${parsed.companion_name || "companion"}`;
            }
          }
        } catch {
          // keep as string
        }
      }
      return details;
    }
    return String(details);
  };

  // Open Participant Modal & Load Companions + Action Logs
  const handleOpenParticipantModal = async (participant: Participant) => {
    setSelectedParticipant(participant);
    setIsEditingParticipant(false);
    setEditParticipantForm({
      first_name: participant.first_name || "",
      last_name: participant.last_name || "",
      name: participant.name || "",
      email: participant.email || "",
      phone: participant.phone || "",
      role: participant.role || "Delegate",
      company: participant.company || "",
      designation: participant.designation || "",
      country: participant.country || "",
      state: participant.state || participant.custom_fields?.state || participant.custom_fields?.province || "",
      paid_status: participant.paid_status || "Unpaid",
    });
    setCompanions([]);
    setActionLogs([]);
    setCapacityMatrix([]);
    setPdfPreviewUrl(null);
    try {
      setLoadingCompanions(true);
      setLoadingActions(true);

      const [compRes, actRes]: [any, any] = await Promise.all([
        apiClient.get(`/venue/registration/companions?primary_participant_id=${participant.id}`).catch(() => []),
        apiClient.get(`/venue/registration/participants/${participant.id}/actions`).catch(() => null),
      ]);

      setCompanions(Array.isArray(compRes) ? compRes : []);
      if (actRes) {
        if (actRes.action_stats) setActionStats(actRes.action_stats);
        if (Array.isArray(actRes.action_logs)) setActionLogs(actRes.action_logs);
        if (Array.isArray(actRes.capacity_matrix)) setCapacityMatrix(actRes.capacity_matrix);
      }
    } catch (e) {
      console.warn("Error fetching companions or actions:", e);
    } finally {
      setLoadingCompanions(false);
      setLoadingActions(false);
    }
  };

  // Admin Reset Kit Modal State
  const [showAdminResetModal, setShowAdminResetModal] = useState(false);
  const [adminUsernameInput, setAdminUsernameInput] = useState("admin");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");

  // Admin Reset Checkin Modal State
  const [showAdminResetCheckinModal, setShowAdminResetCheckinModal] = useState(false);
  const [resetCheckinUsername, setResetCheckinUsername] = useState("admin");
  const [resetCheckinPassword, setResetCheckinPassword] = useState("");
  const [targetStationToReset, setTargetStationToReset] = useState<any | null>(null);

  // Operational Policy & Admin Override State
  const [policy, setPolicy] = useState<VenueOperationalPolicy>(DEFAULT_VENUE_POLICY);
  const [showAdminOverrideModal, setShowAdminOverrideModal] = useState(false);
  const [overrideAction, setOverrideAction] = useState<"checkin" | "print" | "reprint" | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideUsername, setOverrideUsername] = useState("admin");
  const [overridePassword, setOverridePassword] = useState("");
  const [isOverriding, setIsOverriding] = useState(false);

  useEffect(() => {
    apiClient.get("/venue/registration/policies").then((res: any) => {
      if (res) setPolicy(res);
    }).catch(() => {});
  }, []);

  const handleAdminOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParticipant) return;
    if (!overridePassword) {
      toast.error("Admin password is required.");
      return;
    }

    try {
      setIsOverriding(true);
      if (overrideAction === "checkin") {
        await apiClient.post("/venue/registration/checkin", {
          participant_id: selectedParticipant.id,
          admin_override: true,
          admin_username: overrideUsername,
          admin_password: overridePassword,
          override_reason: overrideReason,
        });
        toast.success(`Admin Override: Check-in approved for ${selectedParticipant.name}!`);
        setShowAdminOverrideModal(false);
        setSelectedParticipant((prev) => (prev ? { ...prev, checked_in: true, is_checked_in: true } : null));
        setActionStats((prev) => ({ ...prev, checked_in: true, checkin_count: (prev.checkin_count || 0) + 1 }));
        if (onRefresh) onRefresh();
      } else if (overrideAction === "print" || overrideAction === "reprint") {
        await apiClient.post(`/venue/registration/participants/${selectedParticipant.id}/print-badge`, {
          admin_override: true,
          admin_username: overrideUsername,
          admin_password: overridePassword,
        });
        setShowAdminOverrideModal(false);
        await handlePrintBadge(selectedParticipant, true);
      }
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Admin override verification failed.";
      toast.error(msg);
    } finally {
      setIsOverriding(false);
    }
  };

  // 1. Handle Check In Action
  const handleCheckInAction = async (participant: Participant) => {
    const checkinEval = evaluatePolicyAction(participant, "checkin", policy, actionStats);
    if (!checkinEval.allowed) {
      toast.error(checkinEval.reason || "Check-in blocked by policy.");
      if (checkinEval.requiresAdminOverride) {
        setOverrideAction("checkin");
        setOverrideReason(checkinEval.reason || "Policy bypass");
        setShowAdminOverrideModal(true);
      }
      return;
    }

    try {
      setActionInProgress("checkin");
      toast.info(`Processing check-in for ${participant.name}...`);
      await apiClient.post("/venue/registration/checkin", {
        participant_id: participant.id,
      });
      toast.success(`Check-in successful for ${participant.name}!`);

      // Immediately update local state — no page reload needed
      setSelectedParticipant((prev) => (prev ? { ...prev, checked_in: true, is_checked_in: true } : null));

      // Update action stats to reflect new checked-in state
      setActionStats((prev) => ({
        ...prev,
        checked_in: true,
        checkin_count: (prev.checkin_count || 0) + 1,
      }));

      // Re-fetch actions to get updated capacity matrix
      try {
        const actRes: any = await apiClient.get(`/venue/registration/participants/${participant.id}/actions`);
        if (actRes) {
          if (actRes.action_stats) setActionStats(actRes.action_stats);
          if (Array.isArray(actRes.capacity_matrix)) setCapacityMatrix(actRes.capacity_matrix);
          if (Array.isArray(actRes.action_logs)) setActionLogs(actRes.action_logs);
        }
      } catch (_) { /* ignore refresh errors */ }

      if (onRefresh) onRefresh();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Check-in failed.";
      toast.error(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Companion Direct Check In
  const handleCheckInCompanion = async (comp: any) => {
    try {
      toast.info(`Processing check-in for companion ${comp.name}...`);
      const res: any = await apiClient.post("/venue/registration/checkin", {
        participant_id: comp.id,
        badge_code: comp.badge_code,
      });
      toast.success(res?.message || `Successfully checked in companion ${comp.name}!`);

      setCompanions((prev) =>
        prev.map((c) => (c.id === comp.id ? { ...c, checked_in: true } : c))
      );

      if (selectedParticipant) {
        try {
          const actRes: any = await apiClient.get(`/venue/registration/participants/${selectedParticipant.id}/actions`);
          if (actRes?.action_logs) setActionLogs(actRes.action_logs);
        } catch (_) {}
      }
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Companion check-in failed.";
      toast.error(msg);
    }
  };

  const loadActiveBadgeTemplate = async () => {
    const templatesRes: any = await apiClient.get("/venue/registration/templates");
    const templates = Array.isArray(templatesRes) ? templatesRes : [];
    const badgeTemplates = templates.filter((t: any) => t.template_type !== "certificate");

    return badgeTemplates.length > 0
      ? badgeTemplates[0].template_data || badgeTemplates[0].templateData || badgeTemplates[0]
      : {
          width_mm: 76,
          height_mm: 100,
          pages: [
            {
              backgroundColor: "#FFFFFF",
              fields: [
                { type: "text", placeholder: "{{name}}", x_mm: 5, y_mm: 20, w_mm: 66, h_mm: 12, fontSize: 16, bold: true, color: "#1E293B", align: "center" },
                { type: "text", placeholder: "{{role}}", x_mm: 5, y_mm: 35, w_mm: 66, h_mm: 8, fontSize: 12, bold: true, color: "#2563EB", align: "center" },
                { type: "text", placeholder: "{{company}}", x_mm: 5, y_mm: 45, w_mm: 66, h_mm: 8, fontSize: 10, color: "#64748B", align: "center" },
                { type: "qr", qrValue: "{{regno}}", x_mm: 23, y_mm: 58, w_mm: 30, h_mm: 30 },
              ],
            },
          ],
        };
  };

  // 2. Handle Print Badge Action
  const handlePrintBadge = async (participant: Participant, skipPolicyCheck = false) => {
    if (!skipPolicyCheck) {
      const printEval = evaluatePolicyAction(participant, "print", policy, actionStats);
      if (!printEval.allowed) {
        toast.error(printEval.reason || "Badge print blocked by policy.");
        if (printEval.requiresAdminOverride) {
          setOverrideAction("print");
          setOverrideReason(printEval.reason || "Policy bypass");
          setShowAdminOverrideModal(true);
        }
        return;
      }
    }

    try {
      setPrintingId(participant.id);
      setActionInProgress("print");
      toast.info(`Generating badge for ${participant.name}...`);

      // Notify backend of badge print — creates DB record
      try {
        await apiClient.post(`/venue/registration/participants/${participant.id}/print-badge`, {});
      } catch (e) {
        console.warn("Backend print log notice:", e);
      }

      const activeTemplate = await loadActiveBadgeTemplate();

      const pdf = await compileTemplateToPdf([participant as any], activeTemplate, { name: "EventX OS" });
      const blob = pdf.output("blob");
      const blobUrl = URL.createObjectURL(blob);

      // Set the inline preview URL so the badge shows in the modal iframe
      setPdfPreviewUrl(blobUrl);
      toast.success("Badge PDF compiled! Preview shown below — click Print to open full page.");

      setSelectedParticipant((prev) => (prev ? { ...prev, badge_status: "printed" } : null));
      // Refresh action stats
      try {
        const actRes: any = await apiClient.get(`/venue/registration/participants/${participant.id}/actions`);
        if (actRes?.action_stats) setActionStats(actRes.action_stats);
        if (Array.isArray(actRes?.action_logs)) setActionLogs(actRes.action_logs);
      } catch (_) {}
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to generate badge PDF.");
    } finally {
      setPrintingId(null);
      setActionInProgress(null);
    }
  };

  // 3. Handle Re-Print Badge Action
  const handleReprintBadgeAction = async (participant: Participant) => {
    const reprintEval = evaluatePolicyAction(participant, "reprint", policy, actionStats);
    if (!reprintEval.allowed) {
      toast.error(reprintEval.reason || "Badge reprint blocked by policy.");
      if (reprintEval.requiresAdminOverride) {
        setOverrideAction("reprint");
        setOverrideReason(reprintEval.reason || "Policy bypass");
        setShowAdminOverrideModal(true);
      }
      return;
    }

    try {
      setActionInProgress("reprint");
      toast.info(`Requesting reprint log for ${participant.name}...`);
      await apiClient.post(`/venue/registration/participants/${participant.id}/reprint-badge`, {
        reason: "Delegate Request",
      });
      await handlePrintBadge(participant, true);
      toast.success(`Badge reprinted for ${participant.name}!`);
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Reprint request failed.";
      toast.error(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  // 4. Handle Kit Distribution Action
  const handleKitDistributionAction = async (participant: Participant) => {
    const kitEval = evaluatePolicyAction(participant, "issue_kit", policy, actionStats);
    if (!kitEval.allowed) {
      toast.error(kitEval.reason || "Kit issuance blocked by policy.");
      return;
    }

    try {
      setActionInProgress("kit");
      toast.info(`Issuing event kit to ${participant.name}...`);
      await apiClient.post("/venue/registration/kits/issue", {
        participant_id: participant.id,
      });
      toast.success(`Event Kit successfully issued to ${participant.name}!`);

      setSelectedParticipant((prev) => (prev ? { ...prev, kit_issued: true } : null));
      if (onRefresh) onRefresh();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Kit distribution failed.";
      toast.error(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  // 5. Handle Admin Reset Kit Action
  const handleAdminResetKit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParticipant) return;
    try {
      setActionInProgress("reset_kit");
      await apiClient.post("/venue/registration/kits/reset", {
        participant_id: selectedParticipant.id,
        admin_username: adminUsernameInput,
        admin_password: adminPasswordInput,
      });
      toast.success(`Kit issuance for '${selectedParticipant.name}' has been reset!`);

      setActionStats((prev) => ({ ...prev, kit_issued: false }));
      setSelectedParticipant((prev) => (prev ? {
        ...prev,
        kit_issued: false,
        custom_fields: { ...(prev.custom_fields || {}), kit_status: "Pending" }
      } : null));

      // Re-fetch actions to sync state
      try {
        const actRes: any = await apiClient.get(`/venue/registration/participants/${selectedParticipant.id}/actions`);
        if (actRes) {
          if (actRes.action_stats) setActionStats(actRes.action_stats);
          if (Array.isArray(actRes.capacity_matrix)) setCapacityMatrix(actRes.capacity_matrix);
          if (Array.isArray(actRes.action_logs)) setActionLogs(actRes.action_logs);
        }
      } catch (_) {}

      setShowAdminResetModal(false);
      setAdminPasswordInput("");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Invalid Admin Password.";
      toast.error(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  // 6. Handle Admin Reset Check-in Action
  const handleAdminResetCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParticipant) return;
    try {
      setActionInProgress("reset_checkin");
      await apiClient.post("/venue/registration/checkin/reset", {
        participant_id: selectedParticipant.id,
        admin_username: resetCheckinUsername,
        admin_password: resetCheckinPassword,
        station_id: targetStationToReset?.station_id || undefined,
      });
      const gateName = targetStationToReset?.station_name ? `gate '${targetStationToReset.station_name}'` : "all check-in gates";
      toast.success(`Check-in for ${gateName} has been reset for '${selectedParticipant.name}'!`);

      // Re-fetch actions to sync state
      try {
        const actRes: any = await apiClient.get(`/venue/registration/participants/${selectedParticipant.id}/actions`);
        if (actRes) {
          if (actRes.action_stats) {
            setActionStats(actRes.action_stats);
            setSelectedParticipant((prev) => (prev ? { ...prev, checked_in: actRes.action_stats.checked_in, is_checked_in: actRes.action_stats.checked_in } : null));
          }
          if (Array.isArray(actRes.capacity_matrix)) setCapacityMatrix(actRes.capacity_matrix);
          if (Array.isArray(actRes.action_logs)) setActionLogs(actRes.action_logs);
        }
      } catch (_) {}

      setShowAdminResetCheckinModal(false);
      setTargetStationToReset(null);
      setResetCheckinPassword("");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Invalid Admin Credentials.";
      toast.error(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSaveParticipantDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedParticipant) return;
    try {
      setSavingParticipant(true);
      const updated: any = await apiClient.put(`/venue/registration/participants/${selectedParticipant.id}`, {
        ...editParticipantForm,
        first_name: editParticipantForm.first_name.trim(),
        last_name: editParticipantForm.last_name.trim(),
        name: editParticipantForm.name.trim(),
        email: editParticipantForm.email.trim(),
        phone: editParticipantForm.phone.trim(),
        role: editParticipantForm.role.trim() || "Delegate",
        company: editParticipantForm.company.trim(),
        designation: editParticipantForm.designation.trim(),
        country: editParticipantForm.country.trim(),
        custom_fields: {
          ...(selectedParticipant.custom_fields || {}),
          state: editParticipantForm.state.trim(),
        },
        paid_status: editParticipantForm.paid_status.trim() || "Unpaid",
      });
      setSelectedParticipant(updated as Participant);
      setEditParticipantForm({
        first_name: updated.first_name || "",
        last_name: updated.last_name || "",
        name: updated.name || "",
        email: updated.email || "",
        phone: updated.phone || "",
        role: updated.role || "Delegate",
        company: updated.company || "",
        designation: updated.designation || "",
        country: updated.country || "",
        state: updated.state || updated.custom_fields?.state || updated.custom_fields?.province || "",
        paid_status: updated.paid_status || "Unpaid",
      });
      setIsEditingParticipant(false);
      toast.success("Participant details updated.");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Participant update failed.";
      toast.error(msg);
    } finally {
      setSavingParticipant(false);
    }
  };

  const handleDeleteParticipant = async (participant: Participant) => {
    const confirmed = window.confirm(`Delete ${participant.name} (${participant.regno}) and their local registration records? This cannot be undone from this workstation.`);
    if (!confirmed) return;
    try {
      setDeletingParticipant(true);
      await apiClient.delete(`/venue/registration/participants/${participant.id}`);
      toast.success(`Deleted ${participant.name}.`);
      setSelectedParticipant(null);
      setSelectedParticipantIds((prev) => prev.filter((id) => id !== participant.id));
      if (onRefresh) onRefresh();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Participant delete failed.";
      toast.error(msg);
    } finally {
      setDeletingParticipant(false);
    }
  };

  const handleBulkPrint = async () => {
    if (selectedParticipants.length === 0) return;
    const printableParticipants = selectedParticipants.filter(isCheckedInForBadgePrint);
    const skippedParticipants = selectedParticipants.filter((participant) => !isCheckedInForBadgePrint(participant));

    if (skippedParticipants.length > 0) {
      toast.warning(
        `Not printed for ${formatSkippedPrintNames(skippedParticipants)} — not checked in.`
      );
    }

    if (printableParticipants.length === 0) {
      toast.error("No selected participants are checked in, so no badges were printed.");
      return;
    }

    const batches: Participant[][] = [];
    for (let start = 0; start < printableParticipants.length; start += BULK_BADGE_PDF_BATCH_SIZE) {
      batches.push(printableParticipants.slice(start, start + BULK_BADGE_PDF_BATCH_SIZE));
    }

    try {
      setBulkActionInProgress("print");
      setBulkPrintProgress(`Preparing ${printableParticipants.length} checked-in badge(s) in ${batches.length} PDF batch(es)...`);
      toast.info(`Generating ${printableParticipants.length} checked-in badge(s) in ${batches.length} batch(es)...`);
      const activeTemplate = await loadActiveBadgeTemplate();

      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const startNumber = index * BULK_BADGE_PDF_BATCH_SIZE + 1;
        const endNumber = startNumber + batch.length - 1;
        setBulkPrintProgress(`Rendering batch ${index + 1}/${batches.length} · badges ${startNumber}-${endNumber}`);

        const pdf = await compileTemplateToPdf(batch as any[], activeTemplate, { name: "EventX OS" });
        const blobUrl = URL.createObjectURL(pdf.output("blob"));
        window.open(blobUrl, "_blank");

        setBulkPrintProgress(`Marking printed batch ${index + 1}/${batches.length} · badges ${startNumber}-${endNumber}`);
        await Promise.allSettled(
          batch.map((participant) =>
            apiClient.post(`/venue/registration/participants/${participant.id}/print-badge`, {})
          )
        );

        await new Promise((resolve) => setTimeout(resolve, 75));
      }

      toast.success(`Bulk badge PDFs ready for ${printableParticipants.length} checked-in participant(s).`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Bulk print failed.";
      toast.error(msg);
    } finally {
      setBulkPrintProgress("");
      setBulkActionInProgress(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedParticipants.length === 0) return;
    const confirmed = window.confirm(`Delete ${selectedParticipants.length} selected participant record(s)? This removes their local registration, badge, check-in, kit, companion, and audit records from this workstation database.`);
    if (!confirmed) return;
    try {
      setBulkActionInProgress("delete");
      const results = await Promise.allSettled(
        selectedParticipants.map((participant) =>
          apiClient.delete(`/venue/registration/participants/${participant.id}`)
        )
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed > 0) {
        toast.error(`${failed} delete request(s) failed. Refreshing the table.`);
      } else {
        toast.success(`Deleted ${selectedParticipants.length} selected participant record(s).`);
      }
      setSelectedParticipantIds([]);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Bulk delete failed.";
      toast.error(msg);
    } finally {
      setBulkActionInProgress(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden space-y-3">
      {/* Top Search & Filter Bar */}
      <div className="shrink-0 bg-[var(--surf)] p-3.5 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col md:flex-row gap-3 justify-between items-center">
        <div>
          <h3 className="text-base font-black tracking-tight text-[var(--text)]">{title}</h3>
          <p className="text-[11px] text-[var(--muted)]">{subtitle}</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Dynamic Role Filter Dropdown */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--card)] text-[var(--text)]"
          >
            <option value="All">All Roles ({participants.length})</option>
            {availableRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {/* Check-In Status Filter Dropdown */}
          <select
            value={checkinFilter}
            onChange={(e) => setCheckinFilter(e.target.value as any)}
            className="h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--card)] text-[var(--text)]"
          >
            <option value="All">All Check-In Statuses</option>
            <option value="CheckedIn">Checked In Only</option>
            <option value="NotCheckedIn">Not Checked In Only</option>
          </select>

          {/* Dynamic Payment Status Filter Dropdown */}
          <select
            value={paidFilter}
            onChange={(e) => setPaidFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--card)] text-[var(--text)]"
          >
            <option value="All">All Payment Statuses</option>
            {availablePaidStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          {/* Search Input */}
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <Input
              className="pl-10 h-10 bg-[var(--card)] border-[var(--border)] text-xs font-semibold focus:ring-1 focus:ring-[var(--pri)]"
              placeholder="Search Reg Code, Name, Email, Phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {onRefresh && (
            <Button variant="outline" onClick={onRefresh} disabled={loading} className="h-10 px-3">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
      </div>

      {selectedParticipantIds.length > 0 && (
        <div className="shrink-0 rounded-2xl border border-[var(--pri)]/30 bg-[var(--pri)]/10 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-sm">
          <div className="text-xs font-bold text-[var(--text)]">
            <span className="font-black text-[var(--pri)]">{selectedParticipantIds.length}</span> participant(s) selected
            <span className="ml-2 text-[var(--muted)]">
              {bulkPrintProgress || "Bulk actions apply to the selected table rows."}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleBulkPrint}
              disabled={bulkActionInProgress !== null}
              className="h-9 rounded-xl bg-[var(--pri)] px-3 text-xs font-black text-[var(--primary-contrast)]"
            >
              {bulkActionInProgress === "print" ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <Printer className="mr-1.5 size-3.5" />}
              Bulk Print
            </Button>
            <Button
              onClick={handleBulkDelete}
              disabled={bulkActionInProgress !== null}
              className="h-9 rounded-xl bg-red-600 px-3 text-xs font-black text-white hover:bg-red-700"
            >
              {bulkActionInProgress === "delete" ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <Trash2 className="mr-1.5 size-3.5" />}
              Bulk Delete
            </Button>
            <Button
              variant="outline"
              onClick={() => setSelectedParticipantIds([])}
              disabled={bulkActionInProgress !== null}
              className="h-9 rounded-xl px-3 text-xs font-bold"
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* Full Screen Flex Height Internal Scrollable Table Container */}
      <div className="flex-1 min-h-0 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[var(--surf)] border-b border-[var(--border)] z-10 shadow-sm">
              <tr className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                <th className="w-11 p-3.5">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleSelection}
                    aria-label="Select visible participants"
                    className="size-4 rounded border-[var(--border)] accent-[var(--pri)]"
                  />
                </th>
                {/* 1ST COLUMN: REGISTRATION CODE (SORTABLE) */}
                <th
                  onClick={() => handleSortClick("regno")}
                  className="p-3.5 cursor-pointer hover:text-[var(--pri)] select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Reg Code</span>
                    {sortField === "regno" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-[var(--pri)]" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-[var(--pri)]" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--muted)] opacity-50" />
                    )}
                  </div>
                </th>

                {/* 2ND COLUMN: PARTICIPANT NAME (SORTABLE) */}
                <th
                  onClick={() => handleSortClick("name")}
                  className="p-3.5 cursor-pointer hover:text-[var(--pri)] select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Participant Name</span>
                    {sortField === "name" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-[var(--pri)]" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-[var(--pri)]" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--muted)] opacity-50" />
                    )}
                  </div>
                </th>

                <th className="p-3.5">Role</th>
                <th className="p-3.5">Company / Org</th>
                <th className="p-3.5">Phone</th>
                <th className="p-3.5">Payment</th>
                <th className="p-3.5">Check-In Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-semibold text-[var(--text)]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center text-[var(--muted)]">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[var(--pri)] mb-2" />
                    Loading participant directory...
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-[var(--muted)]">
                    No participants found matching current search and filters.
                  </td>
                </tr>
              ) : (
                paginatedData.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => handleOpenParticipantModal(p)}
                    className="hover:bg-[var(--raised)] transition-colors cursor-pointer group"
                  >
                    <td className="p-3.5" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedParticipantIds.includes(p.id)}
                        onChange={() => toggleParticipantSelection(p.id)}
                        aria-label={`Select ${p.name}`}
                        className="size-4 rounded border-[var(--border)] accent-[var(--pri)]"
                      />
                    </td>
                    {/* 1ST COLUMN: REG CODE */}
                    <td className="p-3.5 font-mono text-xs font-bold text-[var(--acc)] group-hover:underline">
                      {p.regno}
                    </td>

                    {/* 2ND COLUMN: NAME & EMAIL */}
                    <td className="p-3.5">
                      <div className="font-bold text-[var(--text)] text-sm">{p.name}</div>
                      <div className="text-[11px] text-[var(--muted)] font-mono">{p.email}</div>
                    </td>

                    <td className="p-3.5">
                      <span className="px-2.5 py-1 bg-[var(--raised)] border border-[var(--border)] text-[var(--text)] text-[10px] font-black uppercase rounded-full">
                        {p.role || "Delegate"}
                      </span>
                    </td>
                    <td className="p-3.5 text-[var(--muted)]">{p.company || "N/A"}</td>
                    <td className="p-3.5 font-mono text-[var(--muted)]">{p.phone || "—"}</td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full border ${getPaymentStatusBadgeClass(
                          p.paid_status
                        )}`}
                      >
                        {p.paid_status || "Paid"}
                      </span>
                    </td>
                    <td className="p-3.5">
                      {p.checked_in || (p as any).is_checked_in ? (
                        <span className="px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1 w-fit">
                          <CheckSquare className="w-3 h-3" /> Checked In
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1 w-fit">
                          <ShieldCheck className="w-3 h-3" /> Pending Gate
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination Bar */}
        <div className="p-3 bg-[var(--surf)] border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 text-[var(--muted)] font-bold">
            <span>
              Showing <strong className="text-[var(--text)]">{totalEntries > 0 ? startIndex + 1 : 0}</strong> to{" "}
              <strong className="text-[var(--text)]">{endIndex}</strong> of{" "}
              <strong className="text-[var(--text)]">{totalEntries}</strong> entries
            </span>

            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[10px] uppercase tracking-wider">Per Page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 px-2 rounded-lg border border-[var(--border)] text-xs font-bold bg-[var(--card)] text-[var(--text)]"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 px-3 border-[var(--border)] text-xs font-bold"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Previous
            </Button>

            <span className="px-3 py-1 text-xs font-extrabold text-[var(--text)] bg-[var(--raised)] rounded-lg border border-[var(--border)]">
              Page {currentPage} of {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-3 border-[var(--border)] text-xs font-bold"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* PARTICIPANT FULL DETAILS & ACTIONS POPUP MODAL */}
      {selectedParticipant && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-[var(--surf)] border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[var(--pri)] text-[var(--primary-contrast)] flex items-center justify-center font-black text-xl shadow-md shrink-0">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[var(--text)] leading-tight">{selectedParticipant.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-xs font-bold text-[var(--acc)]">{selectedParticipant.regno}</span>
                    <span className="px-2 py-0.5 bg-[var(--raised)] border border-[var(--border)] text-[10px] font-black uppercase rounded-full text-[var(--text)]">
                      {selectedParticipant.role || "Delegate"}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-black uppercase rounded-full border ${getPaymentStatusBadgeClass(
                        selectedParticipant.paid_status
                      )}`}
                    >
                      {selectedParticipant.paid_status || "Paid"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditingParticipant((value) => !value)}
                  className="h-9 rounded-xl px-3 text-xs font-black"
                >
                  <Edit3 className="mr-1.5 size-3.5" />
                  {isEditingParticipant ? "Cancel Edit" : "Update"}
                </Button>
                <Button
                  type="button"
                  onClick={() => handleDeleteParticipant(selectedParticipant)}
                  disabled={deletingParticipant}
                  className="h-9 rounded-xl bg-red-600 px-3 text-xs font-black text-white hover:bg-red-700"
                >
                  {deletingParticipant ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <Trash2 className="mr-1.5 size-3.5" />}
                  Delete
                </Button>
                <button
                  onClick={() => setSelectedParticipant(null)}
                  className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--raised)] transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
              
              {/* Companion Banner if Companion */}
              {(selectedParticipant as any).is_companion && (
                <div className="p-3.5 bg-purple-500/10 border border-purple-500/30 rounded-2xl flex items-center gap-3 shadow-xs">
                  <div className="w-9 h-9 rounded-xl bg-purple-500 text-white font-black flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="text-xs">
                    <span className="font-black text-purple-600 uppercase tracking-wider block text-[10px]">Accompanying Companion</span>
                    <span className="text-[var(--text)] font-bold">
                      Companion of <strong className="text-[var(--pri)]">{(selectedParticipant as any).primary_delegate_name || "Primary Delegate"}</strong> ({(selectedParticipant as any).primary_delegate_regno || "REC"})
                    </span>
                  </div>
                </div>
              )}

              {/* 4 ACTION COUNTERS KPI GRID */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] flex flex-col">
                  <span className="text-[10px] font-black uppercase text-[var(--muted)]">Check-In Status</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    {selectedParticipant.checked_in || actionStats.checked_in ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="text-xs font-black text-emerald-600">Checked In ({actionStats.checkin_count || 1}x)</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-[var(--muted)] shrink-0" />
                        <span className="text-xs font-bold text-[var(--muted)]">Pending Gate</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] flex flex-col">
                  <span className="text-[10px] font-black uppercase text-[var(--muted)]">Initial Prints</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Printer className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-xs font-black text-[var(--text)] font-mono">
                      {actionStats.print_count || (selectedParticipant.badge_status === "printed" ? 1 : 0)} times
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] flex flex-col">
                  <span className="text-[10px] font-black uppercase text-[var(--muted)]">Reprints Count</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <RotateCcw className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xs font-black text-amber-600 font-mono">
                      {actionStats.reprint_count} times
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] flex flex-col">
                  <span className="text-[10px] font-black uppercase text-[var(--muted)]">Kit Package</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Package
                      className={cn(
                        "w-4 h-4 shrink-0",
                        selectedParticipant.kit_issued || actionStats.kit_issued
                          ? "text-purple-500"
                          : actionStats.kit_status === "Not Available" || actionStats.is_kit_eligible === false
                          ? "text-slate-400"
                          : "text-amber-500"
                      )}
                    />
                    <span
                      className={cn(
                        "text-xs font-black",
                        selectedParticipant.kit_issued || actionStats.kit_issued
                          ? "text-purple-600 font-mono"
                          : actionStats.kit_status === "Not Available" || actionStats.is_kit_eligible === false
                          ? "text-slate-400 font-mono"
                          : "text-amber-600 font-mono"
                      )}
                    >
                      {selectedParticipant.kit_issued || actionStats.kit_issued
                        ? "Issued"
                        : actionStats.kit_status === "Not Available" || actionStats.is_kit_eligible === false
                        ? "Not Available"
                        : "Pending"}
                    </span>
                  </div>
                </div>
              </div>

              {isEditingParticipant && (
                <form onSubmit={handleSaveParticipantDetails} className="rounded-2xl border border-[var(--pri)]/25 bg-[var(--pri)]/5 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-[var(--text)]">Update Participant Details</h4>
                      <p className="text-[11px] font-semibold text-[var(--muted)]">
                        Staffed registration edit mode. Changes are logged and queued for sync.
                      </p>
                    </div>
                    <Button
                      type="submit"
                      disabled={savingParticipant}
                      className="h-9 rounded-xl bg-[var(--pri)] px-4 text-xs font-black text-[var(--primary-contrast)]"
                    >
                      {savingParticipant ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <Save className="mr-1.5 size-3.5" />}
                      Save
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      ["first_name", "First Name"],
                      ["last_name", "Last Name"],
                      ["name", "Display Name"],
                      ["email", "Email"],
                      ["phone", "Phone"],
                      ["role", "Role"],
                      ["company", "Company"],
                      ["designation", "Designation"],
                    ].map(([field, label]) => (
                      <label key={field} className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">{label}</span>
                        <Input
                          value={(editParticipantForm as any)[field]}
                          onChange={(event) => setEditParticipantForm((prev) => ({ ...prev, [field]: event.target.value }))}
                          className="h-10 border-[var(--border)] bg-[var(--card)] text-xs font-bold"
                        />
                      </label>
                    ))}

                    <label className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Payment Status</span>
                      <select
                        value={editParticipantForm.paid_status}
                        onChange={(event) => setEditParticipantForm((prev) => ({ ...prev, paid_status: event.target.value }))}
                        className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--text)]"
                      >
                        {["Paid", "Unpaid", "Pending", "Partially Paid", "Refunded", "Complimentary", "Waived"].map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Country</span>
                      <select
                        value={editParticipantForm.country}
                        onChange={(event) => {
                          const country = event.target.value;
                          setEditParticipantForm((prev) => ({ ...prev, country, state: "" }));
                        }}
                        className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--text)]"
                      >
                        <option value="">Select country</option>
                        {countryStates.map((entry) => (
                          <option key={entry.country} value={entry.country}>{entry.country}</option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">State / Province</span>
                      <select
                        value={editParticipantForm.state}
                        onChange={(event) => setEditParticipantForm((prev) => ({ ...prev, state: event.target.value }))}
                        disabled={!editParticipantForm.country || availableStates.length === 0}
                        className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--text)] disabled:opacity-60"
                      >
                        <option value="">{availableStates.length ? "Select state / province" : "No state list available"}</option>
                        {availableStates.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </form>
              )}

              {/* Delegate Personal & Professional Details Grid */}
              <div className="bg-[var(--surf)] p-4 rounded-xl border border-[var(--border)] grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-black tracking-wider text-[var(--muted)] flex items-center gap-1">
                    <Mail className="w-3 h-3 text-[var(--pri)]" /> Email Address
                  </span>
                  <p className="font-bold font-mono text-[var(--text)]">{selectedParticipant.email}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-black tracking-wider text-[var(--muted)] flex items-center gap-1">
                    <Phone className="w-3 h-3 text-[var(--pri)]" /> Contact Phone
                  </span>
                  <p className="font-bold font-mono text-[var(--text)]">{selectedParticipant.phone || "N/A"}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-black tracking-wider text-[var(--muted)] flex items-center gap-1">
                    <Building className="w-3 h-3 text-[var(--pri)]" /> Organization / Company
                  </span>
                  <p className="font-bold text-[var(--text)]">{selectedParticipant.company || "N/A"}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-black tracking-wider text-[var(--muted)] flex items-center gap-1">
                    <User className="w-3 h-3 text-[var(--pri)]" /> Designation / Title
                  </span>
                  <p className="font-bold text-[var(--text)]">{selectedParticipant.designation || "N/A"}</p>
                </div>
              </div>

              {/* Companion Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-500" />
                    <span>Attached Companions ({companions.length})</span>
                  </h4>
                </div>

                {loadingCompanions ? (
                  <div className="py-4 text-center text-xs text-[var(--muted)]">Loading companions...</div>
                ) : companions.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-xs text-[var(--muted)]">
                    No companions attached to this participant.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {companions.map((comp) => (
                      <div
                        key={comp.id}
                        className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-black text-[var(--text)]">{comp.name}</p>
                            <span
                              className={cn(
                                "px-2 py-0.5 text-[9px] font-black uppercase rounded-full border",
                                comp.checked_in
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                              )}
                            >
                              {comp.checked_in ? "Checked In" : "Pending"}
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--muted)] font-semibold mt-0.5">
                            Relationship: {comp.relationship || "Guest"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[var(--acc)]">{comp.badge_code || comp.id}</span>
                          {!comp.checked_in && (
                            <Button
                              size="sm"
                              onClick={() => handleCheckInCompanion(comp)}
                              className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] rounded-lg shadow-sm gap-1"
                            >
                              <CheckSquare className="w-3 h-3" /> Check In
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CHECK-IN GATES ASSIGNED */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-500" />
                    <span>Check-in Gate(s) Assigned ({assignedCapacityMatrix.length})</span>
                  </h4>
                </div>

                {loadingActions ? (
                  <div className="py-4 text-center text-xs text-[var(--muted)]">Evaluating check-in gates...</div>
                ) : assignedCapacityMatrix.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-xs text-[var(--muted)]">
                    No custom check-in gates assigned for this participant's role. Default registration desk / self check-in applies.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {assignedCapacityMatrix.map((station) => (
                      <div
                        key={station.station_id || station.station_name}
                        className={`p-3 rounded-xl border flex flex-col justify-between space-y-2.5 ${
                          station.checked_in
                            ? "bg-emerald-500/5 border-emerald-500/30"
                            : "bg-[var(--surf)] border-[var(--border)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-extrabold text-[var(--text)] text-xs">{station.station_name}</p>
                            <p className="text-[10px] text-[var(--muted)] font-mono mt-0.5">
                              Type: {station.station_type} • Cap: {station.station_capacity ? station.station_capacity.toLocaleString() : "Unlimited"}
                            </p>
                          </div>
                          {station.checked_in ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 shrink-0">
                              Checked In
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0">
                              Pending Gate
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)]/60">
                          <span className="text-[9px] text-[var(--muted)] font-mono truncate">
                            {station.checked_in && station.checked_in_at
                              ? `At: ${new Date(station.checked_in_at).toLocaleTimeString()}`
                              : `Max: ${station.max_checkins_per_delegate || 1} entry`}
                          </span>
                          {station.checked_in && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setResetCheckinUsername("admin");
                                setResetCheckinPassword("");
                                setTargetStationToReset(station);
                                setShowAdminResetCheckinModal(true);
                              }}
                              className="h-6 px-2 text-[10px] font-bold text-amber-500 hover:text-amber-600 border-amber-500/30 hover:bg-amber-500/10 rounded-lg gap-1 shrink-0 shadow-xs"
                              title={`Admin authorization required to reset ${station.station_name}`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset Gate</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reset All Check-in Gate(s) Action Button */}
                <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3">
                  <div>
                    <p className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                      <span>Reset All Check-in Gate(s)</span>
                    </p>
                    <p className="text-[10px] text-[var(--muted)] mt-0.5">
                      Requires Admin credentials to clear all gate check-ins and reset entry limits for this delegate.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setResetCheckinUsername("admin");
                      setResetCheckinPassword("");
                      setTargetStationToReset(null);
                      setShowAdminResetCheckinModal(true);
                    }}
                    className="h-8 px-3 text-xs font-bold text-amber-500 hover:text-amber-600 border-amber-500/30 hover:bg-amber-500/10 rounded-xl gap-1.5 shrink-0 shadow-xs"
                    title="Admin authorization required to clear all check-in gates"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset All Gates</span>
                  </Button>
                </div>
              </div>

              {/* Action Audit Trail Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Action Audit History Log ({actionLogs.length})</span>
                  </h4>
                </div>

                {loadingActions ? (
                  <div className="py-4 text-center text-xs text-[var(--muted)]">Loading action audit history...</div>
                ) : actionLogs.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-xs text-[var(--muted)]">
                    No operational actions recorded for this delegate yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {actionLogs.map((log) => {
                      const label = formatActionLogLabel(log.action_type);
                      const desc = formatActionLogDetails(log);
                      const isAlert = log.action_type?.includes("reset");
                      const isSuccess = log.action_type?.includes("print") || log.action_type === "checkin" || log.action_type === "kit_issue";
                      return (
                        <div
                          key={log.id}
                          className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] flex items-center justify-between text-xs gap-3 hover:border-[var(--pri)]/40 transition-colors"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                isAlert ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                  : isSuccess ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                    : "bg-[var(--raised)] text-[var(--text)] border-[var(--border)]"
                              }`}>
                                {label}
                              </span>
                              <span className="font-bold text-[var(--text)] text-xs break-words">{desc}</span>
                            </div>
                            <p className="text-[10px] text-[var(--muted)] font-mono">Operator: {log.performed_by || "REG-DESK-01"}</p>
                          </div>
                          <span className="font-mono text-[10px] text-[var(--muted)] shrink-0">
                            {log.created_at ? new Date(log.created_at).toLocaleTimeString() : "Just Now"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Badge PDF Inline Preview Panel — shows after Print Badge is clicked */}
            {pdfPreviewUrl && (
              <div className="px-6 pb-4 space-y-2">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-2">
                    <Printer className="w-4 h-4 text-blue-500" />
                    <span>Badge PDF Preview (Real-Time Template)</span>
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.open(pdfPreviewUrl, "_blank")}
                      className="text-[10px] font-bold text-blue-500 hover:underline"
                    >
                      Open Full Page ↗
                    </button>
                    <button
                      onClick={() => setPdfPreviewUrl(null)}
                      className="p-1 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--raised)] transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-white">
                  <iframe
                    src={pdfPreviewUrl}
                    title="Badge PDF Preview"
                    className="w-full"
                    style={{ height: "340px", border: "none" }}
                  />
                </div>
              </div>
            )}

            {/* Modal Actions Footer Bar */}
            <div className="p-4 bg-[var(--surf)] border-t border-[var(--border)] grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* 1. Check In / Reset Checkin */}
              {selectedParticipant.checked_in || actionStats.checked_in ? (
                <Button
                  onClick={() => setShowAdminResetCheckinModal(true)}
                  disabled={actionInProgress === "reset_checkin"}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs h-10 rounded-xl flex items-center justify-center gap-1.5"
                  title="Admin Reset Check-In"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Check-In</span>
                </Button>
              ) : (
                <Button
                  onClick={() => handleCheckInAction(selectedParticipant)}
                  disabled={actionInProgress === "checkin"}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs h-10 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Check In</span>
                </Button>
              )}

              {/* 2. Print Badge */}
              <Button
                onClick={() => handlePrintBadge(selectedParticipant)}
                disabled={actionInProgress === "print" || (!selectedParticipant.checked_in && !selectedParticipant.is_checked_in && !actionStats.checked_in)}
                title={!selectedParticipant.checked_in && !actionStats.checked_in ? "Check-in required before printing badge" : "Print Badge"}
                className={cn(
                  "font-extrabold text-xs h-10 rounded-xl flex items-center justify-center gap-1.5",
                  (!selectedParticipant.checked_in && !actionStats.checked_in)
                    ? "bg-[var(--surf)] border border-[var(--border)] text-[var(--muted)] opacity-60 cursor-not-allowed"
                    : "bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-[var(--primary-contrast)]"
                )}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Badge</span>
              </Button>

              {/* 3. Re-Print Badge */}
              <Button
                onClick={() => handleReprintBadgeAction(selectedParticipant)}
                disabled={actionInProgress === "reprint" || (!selectedParticipant.checked_in && !selectedParticipant.is_checked_in && !actionStats.checked_in)}
                title={!selectedParticipant.checked_in && !actionStats.checked_in ? "Check-in required before reprinting badge" : "Re-Print Badge"}
                className={cn(
                  "font-extrabold text-xs h-10 rounded-xl flex items-center justify-center gap-1.5",
                  (!selectedParticipant.checked_in && !actionStats.checked_in)
                    ? "bg-[var(--surf)] border border-[var(--border)] text-[var(--muted)] opacity-60 cursor-not-allowed"
                    : "bg-amber-600 hover:bg-amber-700 text-white"
                )}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Re-Print Badge</span>
              </Button>

              {/* 4. Kit Distribution / Admin Reset / Not Available */}
              {actionStats.kit_issued || selectedParticipant.kit_issued ? (
                <Button
                  onClick={() => setShowAdminResetModal(true)}
                  disabled={actionInProgress === "reset_kit"}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs h-10 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Kit</span>
                </Button>
              ) : actionStats.kit_status === "Not Available" || actionStats.is_kit_eligible === false ? (
                <Button
                  disabled
                  title={`Kit package is not assigned to role '${selectedParticipant.role || "Delegate"}'`}
                  className="bg-[var(--surf)] border border-[var(--border)] text-[var(--muted)] opacity-50 cursor-not-allowed font-extrabold text-xs h-10 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Package className="w-3.5 h-3.5 text-slate-400" />
                  <span>Not Available</span>
                </Button>
              ) : (
                <Button
                  onClick={() => handleKitDistributionAction(selectedParticipant)}
                  disabled={
                    actionInProgress === "kit" ||
                    (!selectedParticipant.checked_in && !selectedParticipant.is_checked_in && !actionStats.checked_in)
                  }
                  title={
                    !selectedParticipant.checked_in && !actionStats.checked_in
                      ? "Check-in required before issuing kit"
                      : "Assign Kit"
                  }
                  className={cn(
                    "font-extrabold text-xs h-10 rounded-xl flex items-center justify-center gap-1.5",
                    !selectedParticipant.checked_in && !actionStats.checked_in
                      ? "bg-[var(--surf)] border border-[var(--border)] text-[var(--muted)] opacity-60 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-700 text-white shadow-md"
                  )}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Assign Kit</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin Password Reset Modal */}
      {showAdminResetModal && selectedParticipant && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--text)]">Admin Kit Reset Authorization</h3>
                <p className="text-xs text-[var(--muted)]">Password required to revoke kit for '{selectedParticipant.name}'</p>
              </div>
            </div>

            <form onSubmit={handleAdminResetKit} className="space-y-4">
              <p className="text-xs text-[var(--muted)] bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
                Resetting will restore 1 item to kit inventory and allow this delegate to be issued a kit again.
              </p>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-[var(--muted)]">Admin Username</label>
                  <Input
                    type="text"
                    value={adminUsernameInput}
                    onChange={(e) => setAdminUsernameInput(e.target.value)}
                    placeholder="e.g. admin"
                    required
                    className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-[var(--muted)]">Admin Password</label>
                  <Input
                    type="password"
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="Enter admin password"
                    required
                    className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <Button type="button" variant="outline" onClick={() => setShowAdminResetModal(false)} className="h-11 px-5 text-xs font-bold">
                  Cancel
                </Button>
                <Button type="submit" disabled={actionInProgress === "reset_kit"} className="h-11 px-6 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs">
                  {actionInProgress === "reset_kit" ? "Verifying..." : "Authorize Kit Reset"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Admin Password Reset Checkin Modal */}
      {showAdminResetCheckinModal && selectedParticipant && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[var(--text)]">
                  {targetStationToReset ? `Admin Reset: ${targetStationToReset.station_name}` : "Admin Check-In Reset (All Gates)"}
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  {targetStationToReset ? `Clear check-in for '${targetStationToReset.station_name}'` : "Requires super-admin or admin credentials to clear check-in"}
                </p>
              </div>
            </div>

            <form onSubmit={handleAdminResetCheckin} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">
                  Admin Username
                </label>
                <Input
                  type="text"
                  required
                  placeholder="admin"
                  value={resetCheckinUsername}
                  onChange={(e) => setResetCheckinUsername(e.target.value)}
                  className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">
                  Admin Password
                </label>
                <Input
                  type="password"
                  required
                  placeholder="Enter administrator password..."
                  value={resetCheckinPassword}
                  onChange={(e) => setResetCheckinPassword(e.target.value)}
                  className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAdminResetCheckinModal(false)}
                  className="h-9 px-4 text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={actionInProgress === "reset_checkin" || !resetCheckinPassword}
                  className="h-9 px-5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md gap-1.5"
                >
                  {actionInProgress === "reset_checkin" ? "Verifying..." : "Confirm Check-In Reset"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Policy Override Modal */}
      {showAdminOverrideModal && selectedParticipant && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-black shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[var(--text)]">
                  Admin Policy Override
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Bypass operational policy guardrail for '{selectedParticipant.name}'
                </p>
              </div>
            </div>

            <form onSubmit={handleAdminOverrideSubmit} className="space-y-4">
              <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs text-[var(--text)] space-y-1">
                <div className="font-bold text-purple-500">Action: {overrideAction?.toUpperCase()}</div>
                <div className="text-[11px] text-[var(--muted)]">{overrideReason}</div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">
                  Admin Username
                </label>
                <Input
                  type="text"
                  required
                  placeholder="admin"
                  value={overrideUsername}
                  onChange={(e) => setOverrideUsername(e.target.value)}
                  className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">
                  Admin Password
                </label>
                <Input
                  type="password"
                  required
                  placeholder="Enter administrator password..."
                  value={overridePassword}
                  onChange={(e) => setOverridePassword(e.target.value)}
                  className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">
                  Override Justification / Notes
                </label>
                <Input
                  type="text"
                  placeholder="e.g. VIP exemption / Onsite cash payment collected"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAdminOverrideModal(false)}
                  className="h-9 px-4 text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isOverriding || !overridePassword}
                  className="h-9 px-5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-xl shadow-md gap-1.5"
                >
                  {isOverriding ? "Authorizing..." : "Authorize & Proceed"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
