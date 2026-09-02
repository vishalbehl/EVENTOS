"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  Search,
  RefreshCw,
  ClipboardList,
  Clock,
  CheckSquare,
  Square,
  ThumbsUp,
  ThumbsDown,
  UserCheck,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  FileText,
  X,
  MapPin,
  Building,
  User,
  Phone,
  Mail,
  Box,
  Plus,
  Pencil,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
  Loader2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { formatApiError, cn } from "@/lib/utils";
import { CapabilityAction, useOperationAccess } from "@/lib/capabilities";
import { useSessions } from "@/hooks/useSessions";
import {
  OrganiserPage,
  Panel,
  MetricCard,
  StatusBadge,
} from "@/components/organizer/workspace/OrganiserPrimitives";

interface ParticipantRegistration {
  id: string;
  event_id: string;
  participant_id?: string;
  registration_status: "submitted" | "approved" | "waitlisted" | "rejected";
  registration_data: {
    name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    company?: string;
    designation?: string;
    country?: string;
    country_state?: string;
    state?: string;
    role?: string;
    paid_status?: string;
    custom_fields?: Record<string, any>;
    [key: string]: any;
  };
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  waitlist_position?: number;
  rejection_reason?: string;
  approval_source: string;
}

interface CapacityStatus {
  id: string;
  level: "event" | "session" | "room";
  target_id: string;
  target_name: string;
  capacity: number;
  current_occupancy: number;
  waitlist_count: number;
  occupancy_rate: number;
}

interface Room {
  id: string;
  name: string;
}

interface Session {
  id: string;
  name: string;
}

type TabKey = "submitted" | "waitlisted" | "approved" | "rejected";

export default function CapacityAndApprovalPage() {
  const { eventId } = useParams();
  const eid = eventId as string;

  const reviewAccess = useOperationAccess("registration.approve");
  const checkinAccess = useOperationAccess("registration.checkin");
  const { data: sessions = [] } = useSessions(eid);
  const [checkinSessionId, setCheckinSessionId] = useState("");

  // Primary View Mode
  const [viewMode, setViewMode] = useState<"approvals" | "capacity">("approvals");

  // ── Approvals State ────────────────────────────────────────────────────────
  const [registrations, setRegistrations] = useState<ParticipantRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("submitted");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedCustomFieldsId, setExpandedCustomFieldsId] = useState<string | null>(null);

  // Approvals Dialog States
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<"approve" | "reject" | "bulk_approve" | "bulk_reject">("approve");
  const [selectedReg, setSelectedReg] = useState<ParticipantRegistration | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // ── Capacity State ─────────────────────────────────────────────────────────
  const [capacityStatuses, setCapacityStatuses] = useState<CapacityStatus[]>([]);
  const [capacityRooms, setCapacityRooms] = useState<Room[]>([]);
  const [capacitySessions, setCapacitySessions] = useState<Session[]>([]);
  const [capacityLoading, setCapacityLoading] = useState(true);
  const [promotingWaitlist, setPromotingWaitlist] = useState(false);

  // Capacity Dialog States
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<CapacityStatus | null>(null);
  const [ruleLevel, setRuleLevel] = useState<"event" | "session" | "room">("event");
  const [ruleTargetId, setRuleTargetId] = useState("");
  const [ruleCapacity, setRuleCapacity] = useState<number>(100);
  const [ruleWaitlistEnabled, setRuleWaitlistEnabled] = useState(true);
  const [ruleAutoPromote, setRuleAutoPromote] = useState(true);
  const [savingRule, setSavingRule] = useState(false);

  // ── Fetching Data ──────────────────────────────────────────────────────────
  const fetchRegistrations = async () => {
    try {
      setLoading(true);
      const res = await apiGet<ParticipantRegistration[]>(`/events/${eid}/registrations`);
      setRegistrations(res || []);
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load registration queue.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCapacityData = async () => {
    try {
      setCapacityLoading(true);
      const [statusRes, roomsRes, sessionsRes] = await Promise.all([
        apiGet<CapacityStatus[]>(`/events/${eid}/capacity/status`),
        apiGet<Room[]>(`/events/${eid}/rooms`),
        apiGet<Session[]>(`/events/${eid}/sessions`),
      ]);
      setCapacityStatuses(statusRes || []);
      setCapacityRooms(roomsRes || []);
      setCapacitySessions(sessionsRes || []);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load capacity rules.");
    } finally {
      setCapacityLoading(false);
    }
  };

  useEffect(() => {
    if (eid) {
      fetchRegistrations();
      fetchCapacityData();
    }
  }, [eid]);

  // ── Approvals Handlers ─────────────────────────────────────────────────────
  const queueCounts = useMemo(() => {
    return {
      submitted: registrations.filter((r) => r.registration_status === "submitted").length,
      waitlisted: registrations.filter((r) => r.registration_status === "waitlisted").length,
      approved: registrations.filter((r) => r.registration_status === "approved").length,
      rejected: registrations.filter((r) => r.registration_status === "rejected").length,
    };
  }, [registrations]);

  const filteredRegistrations = useMemo(() => {
    return registrations.filter((reg) => {
      const isStatusMatch = reg.registration_status === activeTab;
      if (!isStatusMatch) return false;

      const data = reg.registration_data || {};
      const fullName = (data.name || `${data.first_name || ""} ${data.last_name || ""}`).toLowerCase();
      const email = (data.email || "").toLowerCase();
      const company = (data.company || "").toLowerCase();
      const role = (data.role || "").toLowerCase();
      const country = (data.country || "").toLowerCase();
      const query = searchQuery.toLowerCase();

      return (
        fullName.includes(query) ||
        email.includes(query) ||
        company.includes(query) ||
        role.includes(query) ||
        country.includes(query)
      );
    });
  }, [registrations, activeTab, searchQuery]);

  const handleSelectToggle = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAllToggle = () => {
    if (selectedIds.size === filteredRegistrations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRegistrations.map((r) => r.id)));
    }
  };

  const openReviewModal = (reg: ParticipantRegistration, action: "approve" | "reject") => {
    setSelectedReg(reg);
    setModalAction(action);
    setReviewNotes("");
    setRejectionReason("");
    setNotesModalOpen(true);
  };

  const openBulkReviewModal = (action: "bulk_approve" | "bulk_reject") => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one registration to proceed.");
      return;
    }
    setSelectedReg(null);
    setModalAction(action);
    setReviewNotes("");
    setRejectionReason("");
    setNotesModalOpen(true);
  };

  const submitReview = async () => {
    try {
      if (modalAction === "approve" && selectedReg) {
        await apiPatch(`/events/${eid}/registrations/${selectedReg.id}/approve`, {
          review_notes: reviewNotes,
        });
        toast.success(`Approved registration for ${selectedReg.registration_data.name || "participant"}`);
      } else if (modalAction === "reject" && selectedReg) {
        if (!rejectionReason.trim()) {
          toast.error("Rejection reason is required.");
          return;
        }
        await apiPatch(`/events/${eid}/registrations/${selectedReg.id}/reject`, {
          rejection_reason: rejectionReason,
          review_notes: reviewNotes,
        });
        toast.success(`Rejected registration for ${selectedReg.registration_data.name || "participant"}`);
      } else if (modalAction === "bulk_approve") {
        await apiPost(`/events/${eid}/registrations/bulk-approve`, {
          registration_ids: Array.from(selectedIds),
          review_notes: reviewNotes,
        });
        toast.success(`Approved ${selectedIds.size} registrations.`);
      } else if (modalAction === "bulk_reject") {
        if (!rejectionReason.trim()) {
          toast.error("Rejection reason is required for bulk rejections.");
          return;
        }
        await apiPost(`/events/${eid}/registrations/bulk-reject`, {
          registration_ids: Array.from(selectedIds),
          rejection_reason: rejectionReason,
          review_notes: reviewNotes,
        });
        toast.success(`Rejected ${selectedIds.size} registrations.`);
      }

      setNotesModalOpen(false);
      fetchRegistrations();
      fetchCapacityData();
    } catch (err: any) {
      console.error(err);
      toast.error(formatApiError(err, "Action failed. Check capacities or limits."));
    }
  };

  const handleWaitlist = async (id: string, name: string) => {
    try {
      await apiPatch(`/events/${eid}/registrations/${id}/waitlist`, {});
      toast.success(`Moved ${name || "registration"} to Waitlist`);
      fetchRegistrations();
      fetchCapacityData();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to waitlist registration.");
    }
  };

  const handlePromote = async (id: string, name: string) => {
    try {
      await apiPatch(`/events/${eid}/registrations/${id}/promote`, {});
      toast.success(`Promoted & Approved ${name || "registration"} from Waitlist`);
      fetchRegistrations();
      fetchCapacityData();
    } catch (err: any) {
      console.error(err);
      toast.error(formatApiError(err, "Failed to promote registration. Capacities might be full."));
    }
  };

  const handleCheckin = async (registration: ParticipantRegistration, name: string) => {
    if (!checkinAccess.enabled || !registration.participant_id || !checkinSessionId) {
      toast.error(
        !checkinSessionId
          ? "Select a session before checking in."
          : "This registration has no linked participant record."
      );
      return;
    }
    try {
      await apiPost(
        `/events/${eid}/participants/${registration.participant_id}/checkin`,
        { session_id: checkinSessionId },
        { headers: { "Idempotency-Key": crypto.randomUUID() } }
      );
      toast.success(`${name || "Participant"} checked in.`);
    } catch (err: any) {
      toast.error(formatApiError(err, "Check-in failed."));
    }
  };

  // ── Capacity Handlers ──────────────────────────────────────────────────────
  const openCreateRuleModal = () => {
    setSelectedRule(null);
    setRuleLevel("event");
    setRuleTargetId("");
    setRuleCapacity(100);
    setRuleWaitlistEnabled(true);
    setRuleAutoPromote(true);
    setRuleModalOpen(true);
  };

  const openEditRuleModal = (rule: CapacityStatus) => {
    setSelectedRule(rule);
    setRuleLevel(rule.level);
    setRuleTargetId(rule.target_id);
    setRuleCapacity(rule.capacity);
    setRuleWaitlistEnabled(true);
    setRuleAutoPromote(true);
    setRuleModalOpen(true);
  };

  const submitCapacityRule = async () => {
    try {
      if (!selectedRule && ruleLevel !== "event" && !ruleTargetId) {
        toast.error(`Please select a ${ruleLevel} before saving the capacity rule.`);
        return;
      }

      setSavingRule(true);
      if (selectedRule) {
        await apiPatch(`/events/${eid}/capacity/${selectedRule.id}`, {
          capacity: ruleCapacity,
          waitlist_enabled: ruleWaitlistEnabled,
          auto_promote: ruleAutoPromote,
        });
        toast.success("Capacity rule updated successfully.");
      } else {
        const payload: any = {
          capacity: ruleCapacity,
          waitlist_enabled: ruleWaitlistEnabled,
          auto_promote: ruleAutoPromote,
        };
        if (ruleLevel === "session") payload.session_id = ruleTargetId;
        if (ruleLevel === "room") payload.room_id = ruleTargetId;

        await apiPost(`/events/${eid}/capacity`, payload);
        toast.success("Capacity rule created successfully.");
      }
      setRuleModalOpen(false);
      fetchCapacityData();
    } catch (err: any) {
      console.error(err);
      toast.error(formatApiError(err, "Failed to save capacity rule."));
    } finally {
      setSavingRule(false);
    }
  };

  const triggerCapacityPromotion = async () => {
    try {
      setPromotingWaitlist(true);
      const res = await apiPost<any[]>(`/events/${eid}/capacity/promote`, {});
      if (res && res.length > 0) {
        toast.success(`Successfully promoted ${res.length} participant(s) from waitlist!`);
      } else {
        toast.info("No participants met the promotion criteria or capacity is full.");
      }
      fetchCapacityData();
      fetchRegistrations();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to run promotions.");
    } finally {
      setPromotingWaitlist(false);
    }
  };

  const tabs: { id: TabKey; label: string; icon: any; iconColor: "warning" | "brand" | "success" | "danger" }[] = [
    { id: "submitted", label: "Review Queue", icon: ClipboardList, iconColor: "warning" },
    { id: "waitlisted", label: "Waitlist", icon: Clock, iconColor: "brand" },
    { id: "approved", label: "Approved", icon: CheckCircle, iconColor: "success" },
    { id: "rejected", label: "Rejected", icon: XCircle, iconColor: "danger" },
  ];

  return (
    <OrganiserPage
      title="Capacity & Approval"
      description="Manage attendee review queues, manual admissions, event capacity limits, session seat caps, and waitlist auto-promotion."
      actions={
        viewMode === "approvals" ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRegistrations}
              disabled={loading}
              className="flex items-center gap-1.5 h-9"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin text-[var(--pri)]")} />
              <span>Refresh Queue</span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={triggerCapacityPromotion}
              disabled={promotingWaitlist || capacityLoading}
              className="flex items-center gap-1.5 h-9 text-xs font-bold"
            >
              <ArrowUpRight className={cn("size-3.5", promotingWaitlist && "animate-spin")} />
              <span>Run Auto-Promotions</span>
            </Button>
            <Button
              size="sm"
              onClick={openCreateRuleModal}
              className="bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-[var(--primary-contrast)] flex items-center gap-1.5 h-9 text-xs font-bold shadow-sm"
            >
              <Plus className="size-3.5" />
              <span>Add Capacity Rule</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCapacityData}
              disabled={capacityLoading}
              className="flex items-center justify-center h-9 w-9 p-0"
            >
              <RefreshCw className={cn("size-3.5", capacityLoading && "animate-spin text-[var(--pri)]")} />
            </Button>
          </div>
        )
      }
    >
      {/* Top View Mode Switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] w-fit mb-6">
        <button
          type="button"
          onClick={() => setViewMode("approvals")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            viewMode === "approvals"
              ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <UserCheck className="h-3.5 w-3.5" />
          <span>Approval Queue ({queueCounts.submitted + queueCounts.waitlisted})</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode("capacity")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            viewMode === "capacity"
              ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Box className="h-3.5 w-3.5" />
          <span>Capacity &amp; Allocation ({capacityStatuses.length})</span>
        </button>
      </div>

      {/* ── VIEW 1: CAPACITY & ALLOCATION ──────────────────────────────────── */}
      {viewMode === "capacity" && (
        <div className="space-y-6">
          {capacityLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-[var(--text-tertiary)]">
              <RefreshCw className="h-8 w-8 animate-spin text-[var(--pri)] mb-3" />
              <p className="text-xs font-medium text-[var(--text-secondary)]">Analyzing capacity and occupation matrix...</p>
            </div>
          ) : capacityStatuses.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--card)] space-y-4">
              <Box className="h-12 w-12 text-[var(--text-tertiary)] mx-auto" />
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">No Capacity Limits Configured</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
                  Set seat limits and waitlist thresholds at the event level, room level, or breakout sessions.
                </p>
              </div>
              <Button onClick={openCreateRuleModal} className="bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs">
                <Plus className="size-3.5 mr-1.5" />
                Create First Capacity Rule
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {capacityStatuses.map((status) => {
                const percentage = Math.round(status.occupancy_rate * 100);
                const isNearCapacity = status.occupancy_rate >= 0.9;
                const isFull = status.occupancy_rate >= 1.0;

                let badgeColor = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
                let progressColor = "bg-emerald-500";
                if (isFull) {
                  badgeColor = "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
                  progressColor = "bg-rose-500";
                } else if (isNearCapacity) {
                  badgeColor = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
                  progressColor = "bg-amber-500";
                }

                return (
                  <div
                    key={status.id}
                    className="rounded-2xl border border-[var(--border-default)] bg-[var(--card)] p-5 flex flex-col justify-between hover:border-[var(--pri)]/40 transition-all shadow-sm space-y-4"
                  >
                    <div className="space-y-3">
                      {/* Level and Status Badge */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-black tracking-widest text-[var(--pri)] bg-[var(--pri)]/10 px-2 py-0.5 rounded border border-[var(--pri)]/20">
                          {status.level} level
                        </span>
                        <span className={`text-[10px] uppercase font-bold border px-2 py-0.5 rounded-full ${badgeColor}`}>
                          {isFull ? "Full" : isNearCapacity ? "Near Limit" : "Optimal"}
                        </span>
                      </div>

                      {/* Target Name */}
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)] leading-tight line-clamp-1">
                          {status.target_name}
                        </h3>
                      </div>

                      {/* Occupancy Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-[var(--text-secondary)]">Occupancy</span>
                          <span className="font-bold text-[var(--text-primary)]">{percentage}%</span>
                        </div>
                        <div className="h-2 w-full bg-[var(--bg-surface-2)] rounded-full overflow-hidden border border-[var(--border-default)]">
                          <div
                            className={`h-full ${progressColor} transition-all duration-500`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Metric Counters */}
                      <div className="grid grid-cols-3 gap-2 bg-[var(--bg-surface-2)] p-2.5 rounded-xl border border-[var(--border-default)] text-center">
                        <div>
                          <div className="text-[10px] text-[var(--text-secondary)] font-semibold uppercase">Active</div>
                          <div className="text-sm font-bold text-[var(--text-primary)]">{status.current_occupancy}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-secondary)] font-semibold uppercase">Limit</div>
                          <div className="text-sm font-bold text-[var(--text-primary)]">{status.capacity}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-secondary)] font-semibold uppercase">Waitlist</div>
                          <div className="text-sm font-bold text-[var(--pri)]">{status.waitlist_count}</div>
                        </div>
                      </div>
                    </div>

                    {/* Lower Action Row */}
                    <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                      <div className="text-xs text-[var(--text-secondary)] font-medium flex items-center gap-1">
                        {status.waitlist_count > 0 ? (
                          <span className="text-[var(--pri)] flex items-center gap-1 font-bold text-[11px]">
                            <Users className="h-3 w-3" /> {status.waitlist_count} in Waitlist
                          </span>
                        ) : (
                          <span className="text-emerald-500 flex items-center gap-1 text-[11px] font-semibold">
                            <CheckCircle2 className="h-3 w-3" /> Seats Available
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditRuleModal(status)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Edit</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── VIEW 2: APPROVAL QUEUE ─────────────────────────────────────────── */}
      {viewMode === "approvals" && (
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div
              onClick={() => {
                setActiveTab("submitted");
                setSelectedIds(new Set());
              }}
              className="cursor-pointer"
            >
              <MetricCard
                label="Pending Review"
                value={queueCounts.submitted}
                hint="Awaiting organizer approval"
                icon={<ClipboardList className="size-4" />}
                iconColor="warning"
              />
            </div>
            <div
              onClick={() => {
                setActiveTab("waitlisted");
                setSelectedIds(new Set());
              }}
              className="cursor-pointer"
            >
              <MetricCard
                label="Waitlist Queue"
                value={queueCounts.waitlisted}
                hint="Pending capacity allocation"
                icon={<Clock className="size-4" />}
                iconColor="brand"
              />
            </div>
            <div
              onClick={() => {
                setActiveTab("approved");
                setSelectedIds(new Set());
              }}
              className="cursor-pointer"
            >
              <MetricCard
                label="Approved Attendees"
                value={queueCounts.approved}
                hint="Active credentials granted"
                icon={<CheckCircle className="size-4" />}
                iconColor="success"
              />
            </div>
            <div
              onClick={() => {
                setActiveTab("rejected");
                setSelectedIds(new Set());
              }}
              className="cursor-pointer"
            >
              <MetricCard
                label="Rejected Submissions"
                value={queueCounts.rejected}
                hint="Declined applications"
                icon={<XCircle className="size-4" />}
                iconColor="danger"
              />
            </div>
          </div>

          {/* Tab & Filter Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1 gap-1 shadow-sm">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const count = queueCounts[tab.id];
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setSelectedIds(new Set());
                    }}
                    className={cn(
                      "flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                      isActive
                        ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        "ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                        isActive
                          ? "bg-[var(--primary-contrast)]/20 text-[var(--primary-contrast)]"
                          : "bg-[var(--bg-surface)] text-[var(--text-tertiary)]"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, role..."
                  className="h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              {/* Bulk Actions */}
              {activeTab === "submitted" && selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => openBulkReviewModal("bulk_approve")}
                    className="h-8 bg-[var(--status-success)] text-white hover:opacity-90 flex items-center gap-1 text-xs"
                  >
                    <ThumbsUp className="size-3.5" />
                    Approve ({selectedIds.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openBulkReviewModal("bulk_reject")}
                    className="h-8 border-[var(--status-danger)] text-[var(--status-danger)] hover:bg-[var(--status-danger)] hover:text-white flex items-center gap-1 text-xs"
                  >
                    <ThumbsDown className="size-3.5" />
                    Reject ({selectedIds.size})
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Main Table Panel */}
          <Panel
            title={`${tabs.find((t) => t.id === activeTab)?.label} (${filteredRegistrations.length})`}
            action={
              <span className="text-xs text-[var(--text-secondary)] font-medium">
                Showing {filteredRegistrations.length} registrations
              </span>
            }
          >
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-[var(--text-tertiary)]">
                <RefreshCw className="size-8 animate-spin text-[var(--pri)] mb-3" />
                <p className="text-xs font-medium text-[var(--text-secondary)]">Loading registration queue...</p>
              </div>
            ) : filteredRegistrations.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-[var(--text-tertiary)]">
                <ClipboardList className="size-10 mb-2 opacity-30" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">No registrations in this queue</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {searchQuery ? "No entries match your search query." : "All registrations in this category are up to date."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      <th className="py-3 px-4 w-10">
                        {activeTab === "submitted" && (
                          <button
                            type="button"
                            onClick={handleSelectAllToggle}
                            className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--pri)]"
                          >
                            {selectedIds.size === filteredRegistrations.length && filteredRegistrations.length > 0 ? (
                              <CheckSquare className="size-4 text-[var(--pri)]" />
                            ) : (
                              <Square className="size-4" />
                            )}
                          </button>
                        )}
                      </th>
                      <th className="py-3 px-4">Participant Profile</th>
                      <th className="py-3 px-4">Role Category</th>
                      <th className="py-3 px-4">Submission Details</th>
                      {activeTab === "waitlisted" && <th className="py-3 px-4">Waitlist Priority</th>}
                      {activeTab === "rejected" && <th className="py-3 px-4">Rejection Reason</th>}
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredRegistrations.map((reg) => {
                      const data = reg.registration_data || {};
                      const fullName = data.name || `${data.first_name || ""} ${data.last_name || ""}`.trim() || "Anonymous";
                      const isSelected = selectedIds.has(reg.id);
                      const stateVal = data.state || data.country_state;
                      const hasCustomFields = data.custom_fields && Object.keys(data.custom_fields).length > 0;
                      const isCustomExpanded = expandedCustomFieldsId === reg.id;

                      return (
                        <tr
                          key={reg.id}
                          className={cn(
                            "hover:bg-[var(--bg-surface-hover)] transition-colors",
                            isSelected && "bg-[var(--bg-surface-2)]"
                          )}
                        >
                          {/* Selection checkbox */}
                          <td className="py-3 px-4">
                            {activeTab === "submitted" && (
                              <button
                                type="button"
                                onClick={() => handleSelectToggle(reg.id)}
                                className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--pri)]"
                              >
                                {isSelected ? (
                                  <CheckSquare className="size-4 text-[var(--pri)]" />
                                ) : (
                                  <Square className="size-4" />
                                )}
                              </button>
                            )}
                          </td>

                          {/* Profile Details */}
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <p className="font-semibold text-xs text-[var(--text-primary)] flex items-center gap-1.5">
                                <span>{fullName}</span>
                                {data.title && (
                                  <span className="text-[10px] font-normal text-[var(--text-tertiary)]">
                                    ({data.title})
                                  </span>
                                )}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-secondary)]">
                                <span className="flex items-center gap-1">
                                  <Mail className="size-3 text-[var(--text-tertiary)]" />
                                  {data.email || "No email"}
                                </span>
                                {data.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="size-3 text-[var(--text-tertiary)]" />
                                    {data.phone}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                {data.company && (
                                  <span className="inline-flex items-center gap-1 rounded bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                                    <Building className="size-2.5" />
                                    {data.company} {data.designation ? `• ${data.designation}` : ""}
                                  </span>
                                )}
                                {data.country && (
                                  <span className="inline-flex items-center gap-1 rounded bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                                    <MapPin className="size-2.5 text-[var(--pri)]" />
                                    {data.country}{stateVal ? `, ${stateVal}` : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Role Category */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center rounded border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--text-primary)]">
                              {data.role || "Delegate"}
                            </span>
                          </td>

                          {/* Submission Metadata & Custom Fields */}
                          <td className="py-3 px-4">
                            <div className="space-y-1 text-[11px] text-[var(--text-secondary)]">
                              <p>
                                Source: <strong className="text-[var(--text-primary)]">{reg.approval_source || "portal"}</strong>
                              </p>
                              <p className="text-[10px] text-[var(--text-tertiary)]">
                                {new Date(reg.submitted_at).toLocaleString("en-US", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </p>
                              {hasCustomFields && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedCustomFieldsId(isCustomExpanded ? null : reg.id)}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--pri)] hover:underline mt-1 cursor-pointer"
                                >
                                  <FileText className="size-3" />
                                  {Object.keys(data.custom_fields || {}).length} Custom Answers
                                  {isCustomExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                                </button>
                              )}
                              {isCustomExpanded && data.custom_fields && (
                                <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-2.5 text-[10px] space-y-1.5">
                                  {Object.entries(data.custom_fields).map(([k, v]) => (
                                    <div key={k} className="flex flex-col">
                                      <span className="font-semibold text-[var(--text-tertiary)] uppercase tracking-wider text-[9px]">
                                        {k.replaceAll("_", " ")}
                                      </span>
                                      <span className="text-[var(--text-primary)] font-medium">
                                        {typeof v === "boolean" ? (v ? "Yes" : "No") : String(v || "—")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Waitlist Position */}
                          {activeTab === "waitlisted" && (
                            <td className="py-3 px-4">
                              <span className="font-mono text-sm font-bold text-[var(--pri)]">
                                #{reg.waitlist_position || "1"}
                              </span>
                            </td>
                          )}

                          {/* Rejection Details */}
                          {activeTab === "rejected" && (
                            <td className="py-3 px-4 max-w-xs">
                              <div className="text-[11px] text-[var(--status-danger)]">
                                <p className="font-semibold">{reg.rejection_reason || "No reason specified"}</p>
                                {reg.review_notes && (
                                  <p className="text-[10px] text-[var(--text-tertiary)] italic mt-0.5">
                                    Notes: "{reg.review_notes}"
                                  </p>
                                )}
                              </div>
                            </td>
                          )}

                          {/* Action Buttons */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {reg.registration_status === "submitted" && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => openReviewModal(reg, "approve")}
                                    className="h-7 px-2.5 text-xs bg-[var(--status-success)] text-white hover:opacity-90 font-semibold"
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openReviewModal(reg, "reject")}
                                    className="h-7 px-2.5 text-xs border-[var(--status-danger)] text-[var(--status-danger)] hover:bg-[var(--status-danger)] hover:text-white"
                                  >
                                    Reject
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleWaitlist(reg.id, fullName)}
                                    disabled={reviewAccess.loading || !reviewAccess.enabled}
                                    className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[var(--pri)]"
                                  >
                                    Waitlist
                                  </Button>
                                </>
                              )}

                              {reg.registration_status === "waitlisted" && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => handlePromote(reg.id, fullName)}
                                    disabled={reviewAccess.loading || !reviewAccess.enabled}
                                    className="h-7 px-2.5 text-xs bg-[var(--status-success)] text-white hover:opacity-90 flex items-center gap-1 font-semibold"
                                  >
                                    <ArrowUpRight className="size-3" />
                                    Promote
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openReviewModal(reg, "reject")}
                                    className="h-7 px-2.5 text-xs border-[var(--status-danger)] text-[var(--status-danger)] hover:bg-[var(--status-danger)] hover:text-white"
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}

                              {reg.registration_status === "approved" && (
                                <div className="flex items-center gap-2">
                                  <StatusBadge status="paid" />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleCheckin(reg, fullName)}
                                    disabled={
                                      checkinAccess.loading ||
                                      !checkinAccess.enabled ||
                                      !checkinSessionId ||
                                      !reg.participant_id
                                    }
                                    className="h-7 px-2.5 text-xs"
                                  >
                                    Check in
                                  </Button>
                                </div>
                              )}

                              {reg.registration_status === "rejected" && (
                                <StatusBadge status="failed" />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ── MODAL 1: REVIEW / APPROVAL DIALOG ──────────────────────────────── */}
      {notesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                {modalAction.includes("approve") ? (
                  <ThumbsUp className="size-4 text-[var(--status-success)]" />
                ) : (
                  <ThumbsDown className="size-4 text-[var(--status-danger)]" />
                )}
                {modalAction === "approve" && "Approve Attendee Registration"}
                {modalAction === "reject" && "Reject Attendee Registration"}
                {modalAction === "bulk_approve" && `Bulk Approve (${selectedIds.size} Registrations)`}
                {modalAction === "bulk_reject" && `Bulk Reject (${selectedIds.size} Registrations)`}
              </h2>
              <button
                type="button"
                onClick={() => setNotesModalOpen(false)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {selectedReg && (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3 text-xs space-y-1">
                <p className="font-semibold text-[var(--text-primary)]">
                  {selectedReg.registration_data.name || `${selectedReg.registration_data.first_name || ""} ${selectedReg.registration_data.last_name || ""}`}
                </p>
                <p className="text-[var(--text-secondary)]">{selectedReg.registration_data.email}</p>
                {selectedReg.registration_data.role && (
                  <span className="inline-block mt-1 text-[10px] font-bold uppercase rounded bg-[var(--card)] px-1.5 py-0.5 border border-[var(--border-subtle)] text-[var(--text-primary)]">
                    Role: {selectedReg.registration_data.role}
                  </span>
                )}
              </div>
            )}

            <div className="space-y-4">
              {modalAction.includes("reject") && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-[var(--status-danger)] uppercase tracking-wider">
                    Rejection Reason *
                  </label>
                  <select
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full h-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--status-danger)] focus:outline-none mb-1.5"
                  >
                    <option value="">-- Choose preset reason or type below --</option>
                    <option value="Event capacity has reached its limit">Event capacity has reached its limit</option>
                    <option value="Duplicate attendee submission">Duplicate attendee submission</option>
                    <option value="Invalid or unverified organization credentials">Invalid or unverified organization credentials</option>
                    <option value="Registration details incomplete">Registration details incomplete</option>
                    <option value="Not meeting category eligibility criteria">Not meeting category eligibility criteria</option>
                  </select>
                  <Input
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Invalid credential documents, duplicate submission"
                    className="h-8 text-xs bg-[var(--bg-surface-2)] border-[var(--border-default)] focus-visible:ring-[var(--status-danger)]"
                    required
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Internal Review Notes (Optional)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add internal notes visible only to organizers..."
                  rows={3}
                  className="w-full rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] p-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--pri)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNotesModalOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <CapabilityAction operation="registration.approve">
                <Button
                  size="sm"
                  onClick={submitReview}
                  className={cn(
                    "h-8 text-xs font-bold text-white",
                    modalAction.includes("approve")
                      ? "bg-[var(--status-success)] hover:opacity-90"
                      : "bg-[var(--status-danger)] hover:opacity-90"
                  )}
                >
                  Confirm Action
                </Button>
              </CapabilityAction>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: CAPACITY RULE CREATION & EDIT DIALOG ───────────────────── */}
      {ruleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Box className="h-4 w-4 text-[var(--pri)]" />
                <span>{selectedRule ? "Edit Capacity Limit Rule" : "Create New Capacity Limit Rule"}</span>
              </h2>
              <button
                type="button"
                onClick={() => setRuleModalOpen(false)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Level selector (disabled on edit) */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
                  Capacity Level
                </label>
                <select
                  disabled={!!selectedRule}
                  value={ruleLevel}
                  onChange={(e: any) => {
                    setRuleLevel(e.target.value);
                    setRuleTargetId("");
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none disabled:opacity-50"
                >
                  <option value="event">Overall Event Level</option>
                  <option value="session">Specific Session Level</option>
                  <option value="room">Physical Room Level</option>
                </select>
              </div>

              {/* Target Selector */}
              {ruleLevel === "session" && !selectedRule && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
                    Target Session *
                  </label>
                  <select
                    value={ruleTargetId}
                    onChange={(e) => setRuleTargetId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  >
                    <option value="">-- Choose Session --</option>
                    {capacitySessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {ruleLevel === "room" && !selectedRule && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
                    Target Room *
                  </label>
                  <select
                    value={ruleTargetId}
                    onChange={(e) => setRuleTargetId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  >
                    <option value="">-- Choose Room --</option>
                    {capacityRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Capacity limit input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
                  Maximum Headcount Capacity *
                </label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={ruleCapacity}
                  onChange={(e) => setRuleCapacity(Math.max(1, Number(e.target.value)))}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              {/* Waitlist toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">Enable Waitlist</span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    Hold excess registrations in waitlist when capacity is reached.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRuleWaitlistEnabled(!ruleWaitlistEnabled)}
                  className={`h-5 w-9 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border ${
                    ruleWaitlistEnabled ? 'bg-[var(--pri)] border-[var(--pri)]' : 'bg-[var(--bg-surface-3)] border-[var(--border-default)]'
                  }`}
                >
                  <div className={`h-3.5 w-3.5 rounded-full transition-transform duration-300 shadow-sm ${
                    ruleWaitlistEnabled ? 'translate-x-4 bg-[var(--primary-contrast)]' : 'translate-x-0.5 bg-[var(--text-secondary)]'
                  }`} />
                </button>
              </div>

              {/* Auto-promote toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">Auto-Promote on Cancellation</span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    Automatically promote waitlisted attendees when seats free up.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRuleAutoPromote(!ruleAutoPromote)}
                  className={`h-5 w-9 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border ${
                    ruleAutoPromote ? 'bg-[var(--pri)] border-[var(--pri)]' : 'bg-[var(--bg-surface-3)] border-[var(--border-default)]'
                  }`}
                >
                  <div className={`h-3.5 w-3.5 rounded-full transition-transform duration-300 shadow-sm ${
                    ruleAutoPromote ? 'translate-x-4 bg-[var(--primary-contrast)]' : 'translate-x-0.5 bg-[var(--text-secondary)]'
                  }`} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRuleModalOpen(false)}
                className="h-8 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={submitCapacityRule}
                disabled={savingRule}
                className="h-8 text-xs font-bold bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-95 shadow-sm"
              >
                {savingRule ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                <span>{selectedRule ? "Update Rule" : "Create Rule"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </OrganiserPage>
  );
}
