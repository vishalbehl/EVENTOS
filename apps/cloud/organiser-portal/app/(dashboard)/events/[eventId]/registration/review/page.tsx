"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle, XCircle, Search, RefreshCw, ClipboardList, Clock, 
  AlertTriangle, CheckSquare, Square, ThumbsUp, ThumbsDown, Info, 
  MessageSquare, UserCheck, ArrowUpRight, HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { formatApiError } from "@/lib/utils";
import { CapabilityAction, useOperationAccess } from "@/lib/capabilities";
import { useSessions } from "@/hooks/useSessions";

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
    role?: string;
    paid_status?: string;
    custom_fields?: Record<string, any>;
  };
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  waitlist_position?: number;
  rejection_reason?: string;
  approval_source: string;
}

export default function ReviewPage() {
  const { eventId } = useParams();
  const reviewAccess = useOperationAccess("registration.approve");
  const checkinAccess = useOperationAccess("registration.checkin");
  const { data: sessions = [] } = useSessions(eventId as string);
  const [checkinSessionId, setCheckinSessionId] = useState("");
  
  const [registrations, setRegistrations] = useState<ParticipantRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"submitted" | "waitlisted" | "approved" | "rejected">("submitted");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Dialog States
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<"approve" | "reject" | "bulk_approve" | "bulk_reject">("approve");
  const [selectedReg, setSelectedReg] = useState<ParticipantRegistration | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchRegistrations = async () => {
    try {
      setLoading(true);
      const res = await apiGet<ParticipantRegistration[]>(`/events/${eventId}/registrations`);
      setRegistrations(res || []);
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load registration queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchRegistrations();
    }
  }, [eventId]);

  const filteredRegistrations = useMemo(() => {
    return registrations.filter(reg => {
      const isStatusMatch = reg.registration_status === activeTab;
      if (!isStatusMatch) return false;

      const data = reg.registration_data || {};
      const fullName = (data.name || `${data.first_name || ""} ${data.last_name || ""}`).toLowerCase();
      const email = (data.email || "").toLowerCase();
      const company = (data.company || "").toLowerCase();
      const query = searchQuery.toLowerCase();

      return fullName.includes(query) || email.includes(query) || company.includes(query);
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
      setSelectedIds(new Set(filteredRegistrations.map(r => r.id)));
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
      toast.warning("No registrations selected.");
      return;
    }
    setModalAction(action);
    setSelectedReg(null);
    setReviewNotes("");
    setRejectionReason("");
    setNotesModalOpen(true);
  };

  const submitReview = async () => {
    try {
      if (modalAction === "approve" && selectedReg) {
        await apiPatch(`/events/${eventId}/registrations/${selectedReg.id}/approve`, {
          review_notes: reviewNotes
        });
        toast.success(`Approved ${selectedReg.registration_data.name || "registration"}`);
      } else if (modalAction === "reject" && selectedReg) {
        if (!rejectionReason.trim()) {
          toast.error("Rejection reason is required.");
          return;
        }
        await apiPatch(`/events/${eventId}/registrations/${selectedReg.id}/reject`, {
          rejection_reason: rejectionReason,
          review_notes: reviewNotes
        });
        toast.success(`Rejected ${selectedReg.registration_data.name || "registration"}`);
      } else if (modalAction === "bulk_approve") {
        let count = 0;
        for (const id of Array.from(selectedIds)) {
          try {
            await apiPatch(`/events/${eventId}/registrations/${id}/approve`, {
              review_notes: reviewNotes
            });
            count++;
          } catch (e) {
            console.error(`Failed to approve ${id}`, e);
          }
        }
        toast.success(`Successfully approved ${count} of ${selectedIds.size} registrations.`);
      } else if (modalAction === "bulk_reject") {
        if (!rejectionReason.trim()) {
          toast.error("Rejection reason is required.");
          return;
        }
        let count = 0;
        for (const id of Array.from(selectedIds)) {
          try {
            await apiPatch(`/events/${eventId}/registrations/${id}/reject`, {
              rejection_reason: rejectionReason,
              review_notes: reviewNotes
            });
            count++;
          } catch (e) {
            console.error(`Failed to reject ${id}`, e);
          }
        }
        toast.success(`Successfully rejected ${count} of ${selectedIds.size} registrations.`);
      }
      setNotesModalOpen(false);
      fetchRegistrations();
    } catch (err: any) {
      console.error(err);
      toast.error(formatApiError(err, "Action failed. Check event capacity limits."));
    }
  };

  const handleWaitlist = async (id: string, name: string) => {
    try {
      await apiPatch(`/events/${eventId}/registrations/${id}/waitlist`, {});
      toast.success(`Moved ${name || "registration"} to Waitlist`);
      fetchRegistrations();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to waitlist registration.");
    }
  };

  const handlePromote = async (id: string, name: string) => {
    try {
      await apiPatch(`/events/${eventId}/registrations/${id}/promote`, {});
      toast.success(`Promoted & Approved ${name || "registration"} from Waitlist`);
      fetchRegistrations();
    } catch (err: any) {
      console.error(err);
      toast.error(formatApiError(err, "Failed to promote registration. Capacities might be full."));
    }
  };

  const handleCheckin = async (registration: ParticipantRegistration, name: string) => {
    if (!checkinAccess.enabled || !registration.participant_id || !checkinSessionId) {
      toast.error(!checkinSessionId ? "Select a session before checking in." : "This registration has no linked participant record.");
      return;
    }
    try {
      await apiPost(
        `/events/${eventId}/participants/${registration.participant_id}/checkin`,
        { session_id: checkinSessionId },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      toast.success(`${name || "Participant"} checked in.`);
    } catch (err: any) {
      toast.error(formatApiError(err, "Check-in failed."));
    }
  };

  const tabs = [
    { id: "submitted", label: "Review Queue", icon: ClipboardList, color: "text-amber-500", bg: "bg-amber-500/10" },
    { id: "waitlisted", label: "Waitlist", icon: Clock, color: "text-indigo-400", bg: "bg-indigo-500/10" },
    { id: "approved", label: "Approved", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { id: "rejected", label: "Rejected", icon: XCircle, color: "text-rose-500", bg: "bg-rose-500/10" }
  ];

  return (
    <div className="flex-1 flex flex-col space-y-6 min-h-0 text-[var(--text)]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--text)] flex items-center gap-3">
            <ClipboardList className="h-8 w-8 text-[var(--pri)]" />
            Registration Review
          </h1>
          <p className="text-sm text-muted mt-1">
            Manage incoming online registrations, waitlists, and manual credential allocations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Check-in session"
            value={checkinSessionId}
            onChange={event => setCheckinSessionId(event.target.value)}
            disabled={checkinAccess.loading || !checkinAccess.enabled}
            title={checkinAccess.enabled ? "Session used for attendee check-in" : `Unavailable: ${(checkinAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}`}
            className="h-9 max-w-64 rounded-lg border border-white/10 bg-[var(--surf)] px-3 text-xs disabled:opacity-50"
          >
            <option value="">Select check-in session</option>
            {sessions.map(session => <option key={session.id} value={session.id}>{session.name}</option>)}
          </select>
          <Button 
            variant="outline" 
            size="sm"
            onClick={fetchRegistrations}
            disabled={loading}
            className="glass-3d flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh Queue
          </Button>
        </div>
      </div>

      {/* Tabs / Queue selection */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tabs.map((tab) => {
          const count = registrations.filter(r => r.registration_status === tab.id).length;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setSelectedIds(new Set());
              }}
              className={`relative flex flex-col p-4 rounded-xl border glass-3d text-left transition-all duration-300 group overflow-hidden ${
                isActive 
                  ? "border-[var(--pri)] shadow-[0_0_15px_color-mix(in_srgb,var(--pri)_20%,transparent)]" 
                  : "border-default hover:border-[var(--pri)]/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${tab.bg}`}>
                  <tab.icon className={`h-5 w-5 ${tab.color}`} />
                </div>
                <span className="text-2xl font-black">{count}</span>
              </div>
              <span className="text-sm font-semibold mt-3 text-muted group-hover:text-[var(--text)] transition-colors">
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[var(--pri)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Control bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-[var(--surf)]/40 p-4 rounded-xl border border-default glass-3d">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, company..."
            className="pl-9 bg-background/50 border-default focus-visible:ring-[var(--pri)]"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {activeTab === "submitted" && selectedIds.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openBulkReviewModal("bulk_approve")}
                className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 glass-3d flex items-center gap-2"
              >
                <ThumbsUp className="h-4 w-4" />
                Approve Selected ({selectedIds.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openBulkReviewModal("bulk_reject")}
                className="bg-rose-500/10 text-rose-500 border-rose-500/30 hover:bg-rose-500/20 glass-3d flex items-center gap-2"
              >
                <ThumbsDown className="h-4 w-4" />
                Reject Selected ({selectedIds.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Table / Queue view */}
      <Card className="flex-1 glass-3d overflow-hidden border-default bg-[var(--surf)]/20 rounded-[2rem] flex flex-col min-h-0">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted">
            <RefreshCw className="h-8 w-8 animate-spin text-[var(--pri)] mb-4" />
            <p className="text-sm font-medium">Fetching registrations...</p>
          </div>
        ) : filteredRegistrations.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted">
            <ClipboardList className="h-12 w-12 text-muted/40 mb-4" />
            <p className="text-lg font-bold">Queue is empty</p>
            <p className="text-sm mt-1">No registrations match the selected filters.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-default bg-[var(--surf)]/50 text-xs font-bold uppercase tracking-wider text-muted">
                  <th className="p-4 w-10">
                    {activeTab === "submitted" && (
                      <button 
                        onClick={handleSelectAllToggle}
                        className="text-muted hover:text-[var(--pri)]"
                      >
                        {selectedIds.size === filteredRegistrations.length ? (
                          <CheckSquare className="h-4 w-4 text-[var(--pri)]" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </th>
                  <th className="p-4">Participant Details</th>
                  <th className="p-4">Requested Role</th>
                  <th className="p-4">Submission Meta</th>
                  {activeTab === "waitlisted" && <th className="p-4">Position</th>}
                  {activeTab === "rejected" && <th className="p-4">Reason</th>}
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {filteredRegistrations.map((reg) => {
                    const data = reg.registration_data || {};
                    const fullName = data.name || `${data.first_name || ""} ${data.last_name || ""}`;
                    const isSelected = selectedIds.has(reg.id);

                    return (
                      <motion.tr
                        key={reg.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`border-b border-default transition-colors hover:bg-[var(--surf)]/40 ${
                          isSelected ? "bg-[var(--pri)]/5" : ""
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-4">
                          {activeTab === "submitted" && (
                            <button
                              onClick={() => handleSelectToggle(reg.id)}
                              className="text-muted hover:text-[var(--pri)]"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-[var(--pri)]" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </td>

                        {/* Participant Details */}
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-base">{fullName}</span>
                            <span className="text-xs text-muted mt-0.5">{data.email}</span>
                            {data.company && (
                              <span className="text-xs text-[var(--pri)] mt-1 font-medium bg-[var(--pri)]/5 px-2 py-0.5 rounded-full w-fit">
                                {data.company} {data.designation ? `• ${data.designation}` : ""}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Requested Role */}
                        <td className="p-4">
                          <span className="text-sm font-semibold uppercase px-2 py-1 rounded bg-[var(--surf)] border border-default">
                            {data.role || "Delegate"}
                          </span>
                        </td>

                        {/* Metadata */}
                        <td className="p-4">
                          <div className="flex flex-col text-xs text-muted space-y-1">
                            <span>Source: <strong className="text-[var(--text)]">{reg.approval_source}</strong></span>
                            <span>Date: {new Date(reg.submitted_at).toLocaleString()}</span>
                          </div>
                        </td>

                        {/* Waitlist Position */}
                        {activeTab === "waitlisted" && (
                          <td className="p-4">
                            <div className="flex items-center gap-1">
                              <span className="text-lg font-black text-indigo-400">
                                #{reg.waitlist_position || "-"}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* Rejection Reason */}
                        {activeTab === "rejected" && (
                          <td className="p-4 max-w-xs">
                            <div className="flex flex-col text-xs text-rose-400">
                              <span className="font-semibold">{reg.rejection_reason || "No reason specified"}</span>
                              {reg.review_notes && <span className="text-muted mt-1 italic">Notes: "{reg.review_notes}"</span>}
                            </div>
                          </td>
                        )}

                        {/* Actions */}
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {reg.registration_status === "submitted" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openReviewModal(reg, "approve")}
                                  className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 glass-3d"
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openReviewModal(reg, "reject")}
                                  className="text-rose-500 border-rose-500/30 hover:bg-rose-500/10 glass-3d"
                                >
                                  Reject
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleWaitlist(reg.id, fullName)}
                                  disabled={reviewAccess.loading || !reviewAccess.enabled}
                                  title={!reviewAccess.enabled ? `Unavailable: ${(reviewAccess.reason || "capability unavailable").replaceAll("_", " ").toLowerCase()}` : undefined}
                                  className="text-indigo-400 hover:bg-indigo-500/10"
                                >
                                  Waitlist
                                </Button>
                              </>
                            )}

                            {reg.registration_status === "waitlisted" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePromote(reg.id, fullName)}
                                  disabled={reviewAccess.loading || !reviewAccess.enabled}
                                  title={!reviewAccess.enabled ? `Unavailable: ${(reviewAccess.reason || "capability unavailable").replaceAll("_", " ").toLowerCase()}` : undefined}
                                  className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 glass-3d flex items-center gap-1"
                                >
                                  <ArrowUpRight className="h-4 w-4" />
                                  Promote
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openReviewModal(reg, "reject")}
                                  className="text-rose-500 border-rose-500/30 hover:bg-rose-500/10 glass-3d"
                                >
                                  Reject
                                </Button>
                              </>
                            )}

                            {reg.registration_status === "approved" && (
                              <>
                                <div className="flex items-center gap-1 text-emerald-400 text-xs font-bold uppercase">
                                  <UserCheck className="h-4 w-4" /> Approved
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleCheckin(reg, fullName)}
                                  disabled={checkinAccess.loading || !checkinAccess.enabled || !checkinSessionId || !reg.participant_id}
                                  title={checkinAccess.enabled ? "Check in to selected session" : `Unavailable: ${(checkinAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}`}
                                >
                                  Check in
                                </Button>
                              </>
                            )}

                            {reg.registration_status === "rejected" && (
                              <div className="flex items-center gap-1 text-rose-500 text-xs font-bold uppercase">
                                <XCircle className="h-4 w-4" /> Rejected
                              </div>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Review Dialog Modal */}
      {notesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-[var(--surf)] border border-default p-6 rounded-2xl glass-3d space-y-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                {modalAction.includes("approve") ? (
                  <ThumbsUp className="h-5 w-5 text-emerald-400" />
                ) : (
                  <ThumbsDown className="h-5 w-5 text-rose-500" />
                )}
                {modalAction === "approve" && "Approve Registration"}
                {modalAction === "reject" && "Reject Registration"}
                {modalAction === "bulk_approve" && `Bulk Approve (${selectedIds.size})`}
                {modalAction === "bulk_reject" && `Bulk Reject (${selectedIds.size})`}
              </h2>
              <button 
                onClick={() => setNotesModalOpen(false)}
                className="text-muted hover:text-white"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {selectedReg && (
              <div className="bg-background/40 p-3 rounded-lg border border-default text-xs space-y-1">
                <div>Participant: <strong>{selectedReg.registration_data.name}</strong></div>
                <div>Email: <span className="text-muted">{selectedReg.registration_data.email}</span></div>
              </div>
            )}

            <div className="space-y-4">
              {modalAction.includes("reject") && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                    Rejection Reason *
                  </label>
                  <Input
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Invalid credential documents, duplicate submission"
                    className="bg-background/50 border-default focus-visible:ring-rose-500"
                    required
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">
                  Internal Review Notes (Optional)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add internal notes visible only to organizers..."
                  rows={3}
                  className="w-full rounded-md bg-background/50 border border-default p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--pri)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setNotesModalOpen(false)}
                className="glass-3d"
              >
                Cancel
              </Button>
              <CapabilityAction operation="registration.approve">
                <Button
                  onClick={submitReview}
                  className={
                    modalAction.includes("approve")
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                      : "bg-rose-600 hover:bg-rose-700 text-white font-bold"
                  }
                >
                  Confirm Action
                </Button>
              </CapabilityAction>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
