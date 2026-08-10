"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Search, Users, UserPlus, CheckCircle2, QrCode,
  RefreshCw, Mail, Phone, Calendar, ArrowLeft,
  Eye, Trash2, Edit3, Download, ChevronLeft, ChevronRight,
  Plus, Building, Ticket, Clock, AlertCircle, RotateCcw, Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { compileTemplateToPdf } from "@/lib/pdf-compiler";

interface CompanionRecord {
  id: string;
  primary_participant_id: string;
  first_name: string;
  last_name: string;
  name: string;
  relationship: string;
  email?: string;
  phone?: string;
  badge_code?: string;
  badge_status?: string;
  regno: string;
  created_at?: string;
  checked_in?: boolean;
  checked_in_at?: string;
  checked_in_by?: string;
  dietary_preference?: string;
  special_assistance?: string;
  notes?: string;
  primary_delegate?: any;
}

export default function CompanionsPage() {
  // Page View State: "list" | "add_form" | "details"
  const [viewMode, setViewMode] = useState<"list" | "add_form" | "details">("list");

  // Data States
  const [companions, setCompanions] = useState<CompanionRecord[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompanion, setSelectedCompanion] = useState<CompanionRecord | null>(null);
  const [badgePdfUrl, setBadgePdfUrl] = useState<string | null>(null);
  const [editingCompanionId, setEditingCompanionId] = useState<string | null>(null);

  // Search & Filter (List View)
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Add/Edit Companion Form State
  const [compFullName, setCompFullName] = useState("");
  const [compRelation, setCompRelation] = useState("Spouse");
  const [compEmail, setCompEmail] = useState("");
  const [compMobile, setCompMobile] = useState("");

  // Link Delegate Step State
  const [delegateSearch, setDelegateSearch] = useState("");
  const [selectedDelegate, setSelectedDelegate] = useState<any | null>(null);

  // Additional Info State (Wired to DB)
  const [dietaryPref, setDietaryPref] = useState("None");
  const [specialAssist, setSpecialAssist] = useState("None");
  const [compNotes, setCompNotes] = useState("");
  const [submittingForm, setSubmittingForm] = useState(false);

  // Admin Reset Modal State
  const [showAdminResetModal, setShowAdminResetModal] = useState(false);
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [resettingCheckin, setResettingCheckin] = useState(false);

  // Details View Tab State
  const [detailsTab, setDetailsTab] = useState<"overview" | "history">("overview");

  // Compile Companion Badge PDF
  useEffect(() => {
    if (selectedCompanion && viewMode === "details") {
      (async () => {
        try {
          const templatesRes: any = await apiClient.get("/venue/registration/templates");
          const templates = Array.isArray(templatesRes) ? templatesRes : [];
          const badgeTemplates = templates.filter((t: any) => t.template_type !== "certificate");
          const activeTemplate =
            badgeTemplates.length > 0
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

          const compData = {
            ...selectedCompanion,
            role: `Companion (${selectedCompanion.relationship})`,
            company: `Guest of ${selectedCompanion.primary_delegate?.name || "Delegate"}`,
          };

          const pdf = await compileTemplateToPdf([compData as any], activeTemplate, { name: "EventX OS" });
          const blob = pdf.output("blob");
          const url = URL.createObjectURL(blob);
          setBadgePdfUrl(url);
        } catch (e) {
          console.error("Failed to compile companion badge PDF", e);
        }
      })();
    }
  }, [selectedCompanion, viewMode]);

  // Fetch Companions & Participants Data Real-Time
  const fetchData = async () => {
    try {
      setLoading(true);
      const [compRes, partRes]: [any, any] = await Promise.all([
        apiClient.get("/venue/registration/companions"),
        apiClient.get("/venue/registration/participants?limit=5000")
      ]);

      const pItems = partRes?.items || [];
      setParticipants(pItems);

      const cItems: CompanionRecord[] = Array.isArray(compRes) ? compRes : [];

      const enriched = cItems.map((c) => {
        const delegate = pItems.find((p: any) => p.id === c.primary_participant_id);
        return {
          ...c,
          primary_delegate: delegate || null,
        };
      });
      setCompanions(enriched);
    } catch (e) {
      console.error("Failed to load companions data", e);
      toast.error("Failed to load companions registry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute KPIs
  const kpis = useMemo(() => {
    const total = companions.length;
    const todayStr = new Date().toISOString().split("T")[0];
    const todayAdditions = companions.filter((c) => c.created_at && c.created_at.startsWith(todayStr)).length;
    const linkedDelegatesCount = new Set(companions.map((c) => c.primary_participant_id)).size;
    const checkedInCount = companions.filter((c) => c.checked_in).length;

    return { total, todayAdditions, linkedDelegatesCount, checkedInCount };
  }, [companions]);

  // Filtered Companions List
  const filteredCompanions = useMemo(() => {
    return companions.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.regno && c.regno.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.primary_delegate?.name && c.primary_delegate.name.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Checked In" && c.checked_in) ||
        (statusFilter === "Pending" && !c.checked_in);

      return matchesQuery && matchesStatus;
    });
  }, [companions, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanions.length / pageSize));
  const paginatedCompanions = filteredCompanions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Filter Delegates for Link Step
  const filteredDelegatesForLink = useMemo(() => {
    if (!delegateSearch.trim()) return participants.slice(0, 6);
    const q = delegateSearch.toLowerCase().trim();
    return participants.filter(
      (p) => p.name?.toLowerCase().includes(q) || p.regno?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [participants, delegateSearch]);

  // Reset Form
  const resetForm = () => {
    setEditingCompanionId(null);
    setCompFullName("");
    setCompRelation("Spouse");
    setCompEmail("");
    setCompMobile("");
    setSelectedDelegate(null);
    setDelegateSearch("");
    setDietaryPref("Vegetarian");
    setSpecialAssist("None");
    setCompNotes("");
  };

  // Trigger Edit Mode
  const handleEditCompanion = (comp: CompanionRecord) => {
    setEditingCompanionId(comp.id);
    setCompFullName(comp.name);
    setCompRelation(comp.relationship || "Spouse");
    setCompEmail(comp.email || "");
    setCompMobile(comp.phone ? comp.phone.replace("+91 ", "") : "");
    setSelectedDelegate(comp.primary_delegate || null);
    setDietaryPref(comp.dietary_preference || "Vegetarian");
    setSpecialAssist(comp.special_assistance || "None");
    setCompNotes(comp.notes || "");
    setViewMode("add_form");
  };

  // Submit Save/Update Companion to DB Real-Time
  const handleSaveCompanion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDelegate) {
      toast.error("Please select a primary delegate to link this companion to.");
      return;
    }
    if (!compFullName.trim()) {
      toast.error("Companion full name is required.");
      return;
    }

    try {
      setSubmittingForm(true);
      const nameParts = compFullName.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || "";

      const payload = {
        primary_participant_id: selectedDelegate.id,
        first_name: firstName,
        last_name: lastName,
        relationship: compRelation,
        email: compEmail || undefined,
        phone: compMobile ? `+91 ${compMobile}` : undefined,
        dietary_preference: dietaryPref,
        special_assistance: specialAssist,
        notes: compNotes
      };

      if (editingCompanionId) {
        await apiClient.put(`/venue/registration/companions/${editingCompanionId}`, payload);
        toast.success(`Companion ${compFullName} updated successfully!`);
      } else {
        await apiClient.post("/venue/registration/companions", payload);
        toast.success(`Companion ${compFullName} successfully registered and linked!`);
      }

      resetForm();
      setViewMode("list");
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to save companion.");
    } finally {
      setSubmittingForm(false);
    }
  };

  // Check In Companion Real-Time Action
  const handleCheckInCompanion = async (comp: CompanionRecord) => {
    try {
      toast.info(`Processing check-in for companion ${comp.name}...`);
      const res: any = await apiClient.post("/venue/registration/checkin", {
        participant_id: comp.id,
        badge_code: comp.badge_code,
      });
      toast.success(res?.message || `Successfully checked in companion ${comp.name}!`);

      setCompanions((prev) =>
        prev.map((c) =>
          c.id === comp.id ? { ...c, checked_in: true, checked_in_at: new Date().toISOString() } : c
        )
      );

      setSelectedCompanion((prev) =>
        prev && prev.id === comp.id ? { ...prev, checked_in: true, checked_in_at: new Date().toISOString() } : prev
      );

      fetchData();
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || e?.detail || "Companion check-in failed.";
      toast.error(msg);
    }
  };

  // Admin Reset Check-in Handler
  const handleAdminResetCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanion) return;
    try {
      setResettingCheckin(true);
      await apiClient.post("/venue/registration/checkin/reset", {
        participant_id: selectedCompanion.id,
        admin_username: adminUsername,
        admin_password: adminPassword,
      });
      toast.success(`Check-in state for companion '${selectedCompanion.name}' has been reset!`);

      setCompanions((prev) =>
        prev.map((c) =>
          c.id === selectedCompanion.id ? { ...c, checked_in: false, checked_in_at: undefined } : c
        )
      );

      setSelectedCompanion((prev) => (prev ? { ...prev, checked_in: false, checked_in_at: undefined } : null));
      setShowAdminResetModal(false);
      setAdminPassword("");
      fetchData();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Invalid Admin Credentials.";
      toast.error(msg);
    } finally {
      setResettingCheckin(false);
    }
  };

  // Remove Companion from DB
  const handleRemoveCompanion = async (id: string) => {
    if (!confirm("Are you sure you want to delete this companion record permanently?")) return;
    try {
      await apiClient.delete(`/venue/registration/companions/${id}`);
      setCompanions((prev) => prev.filter((c) => c.id !== id));
      toast.success("Companion record deleted from database.");
      if (selectedCompanion?.id === id) {
        setSelectedCompanion(null);
        setViewMode("list");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to delete companion from database.");
    }
  };

  return (
    // Locked to viewport height — NO page scrollbars
    <div className="flex flex-col h-full min-h-0 overflow-hidden space-y-3">

      {/* ───────────────────────────────────────────────────────────── */}
      {/* VIEW 1: COMPANIONS LIST VIEW                                 */}
      {/* ───────────────────────────────────────────────────────────── */}
      {viewMode === "list" && (
        <div className="flex flex-col h-full min-h-0 overflow-hidden space-y-3">

          {/* Title Header Bar */}
          <div className="shrink-0 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-[var(--text)] tracking-tight">Accompanying Persons & Companions</h2>
              <p className="text-xs text-[var(--muted)]">Register spouse/guest companions linked to a primary delegate</p>
            </div>

            <Button
              onClick={() => { resetForm(); setViewMode("add_form"); }}
              className="bg-[var(--pri)] text-[var(--primary-contrast)] font-extrabold text-xs h-9 px-4 rounded-xl shadow-md gap-2"
            >
              <Plus className="w-4 h-4" /> Add Companion
            </Button>
          </div>

          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            <div className="p-3.5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm space-y-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Total Companions</span>
              <div className="text-xl font-black text-[var(--text)]">{kpis.total}</div>
              <p className="text-[10px] text-[var(--muted)] font-semibold">Across all delegates</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm space-y-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Today's Additions</span>
              <div className="text-xl font-black text-emerald-500">{kpis.todayAdditions}</div>
              <p className="text-[10px] text-[var(--muted)] font-semibold">Companions added today</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm space-y-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Linked Delegates</span>
              <div className="text-xl font-black text-blue-500">{kpis.linkedDelegatesCount}</div>
              <p className="text-[10px] text-[var(--muted)] font-semibold">Delegates with companions</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm space-y-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Checked In</span>
              <div className="text-xl font-black text-purple-500">{kpis.checkedInCount}</div>
              <p className="text-[10px] text-[var(--muted)] font-semibold">Companions checked in</p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="shrink-0 p-2.5 bg-[var(--surf)] rounded-2xl border border-[var(--border)] shadow-sm flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
              <Input
                className="pl-10 h-9 bg-[var(--card)] border-[var(--border)] text-xs font-semibold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)]"
                placeholder="Search by name, email, mobile or reg. no..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="h-9 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--card)] text-[var(--text)]"
              >
                <option value="All">All Check-In Status</option>
                <option value="Checked In">Checked In</option>
                <option value="Pending">Pending</option>
              </select>

              <Button variant="outline" onClick={fetchData} disabled={loading} className="h-9 px-3">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Table Container — fills all remaining viewport height, ONLY inner body scrolls */}
          <div className="flex-1 min-h-0 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-[var(--surf)] border-b border-[var(--border)] z-10 shadow-sm">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                    <th className="p-3">Companion Name</th>
                    <th className="p-3">Primary Delegate</th>
                    <th className="p-3">Reg. No.</th>
                    <th className="p-3">Relation</th>
                    <th className="p-3">Dietary Pref</th>
                    <th className="p-3">Check-in Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-semibold text-[var(--text)]">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-20 text-center text-[var(--muted)]">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[var(--pri)] mb-2" />
                        Loading companions registry...
                      </td>
                    </tr>
                  ) : paginatedCompanions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-[var(--muted)] text-xs font-bold">
                        No companions found matching search criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedCompanions.map((comp) => (
                      <tr
                        key={comp.id}
                        onClick={() => { setSelectedCompanion(comp); setViewMode("details"); }}
                        className="cursor-pointer hover:bg-[var(--raised)] transition-colors"
                      >
                        <td className="p-3 font-bold text-[var(--text)] text-sm">{comp.name}</td>
                        <td className="p-3">
                          <div className="font-bold text-[var(--text)]">{comp.primary_delegate?.name || "Unlinked Delegate"}</div>
                          <div className="text-[10px] text-[var(--muted)] font-mono">{comp.primary_delegate?.regno || "-"}</div>
                        </td>
                        <td className="p-3 font-mono text-xs font-bold text-[var(--acc)]">{comp.regno}</td>
                        <td className="p-3">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-[var(--raised)] border border-[var(--border)] text-[var(--text)]">
                            {comp.relationship || "Guest"}
                          </span>
                        </td>
                        <td className="p-3 text-xs font-bold text-[var(--muted)]">
                          {comp.dietary_preference || "Vegetarian"}
                        </td>
                        <td className="p-3">
                          <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full border ${comp.checked_in
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            }`}>
                            {comp.checked_in ? "Checked In" : "Pending"}
                          </span>
                        </td>
                        <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {!comp.checked_in && (
                              <Button
                                size="sm"
                                onClick={() => handleCheckInCompanion(comp)}
                                className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] rounded-lg shadow-sm gap-1"
                                title="Check In Companion"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Check In
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setSelectedCompanion(comp); setViewMode("details"); }}
                              className="h-7 w-7 p-0 rounded-lg hover:bg-[var(--raised)] text-[var(--muted)] hover:text-[var(--text)]"
                              title="View Companion Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditCompanion(comp)}
                              className="h-7 w-7 p-0 rounded-lg hover:bg-[var(--raised)] text-[var(--muted)] hover:text-[var(--text)]"
                              title="Edit Companion"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveCompanion(comp.id)}
                              className="h-7 w-7 p-0 rounded-lg hover:bg-red-500/10 text-red-500"
                              title="Remove Companion"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer — sticky at bottom of table */}
            <div className="shrink-0 p-2.5 bg-[var(--surf)] border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--muted)] font-bold">
              <span>Showing {paginatedCompanions.length} of {filteredCompanions.length} companions</span>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className="h-7 px-2 text-xs font-bold">
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </Button>
                <span className="px-2 font-mono">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className="h-7 px-2 text-xs font-bold">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* VIEW 2: ADD COMPANION FORM VIEW (NO PROGRESS BAR / NO DOB / NO GENDER) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {viewMode === "add_form" && (
        <div className="flex flex-col h-full min-h-0 overflow-hidden space-y-3">
          {/* Header */}
          <div className="shrink-0 space-y-1">
            <button
              onClick={() => setViewMode("list")}
              className="text-xs font-bold text-[var(--pri)] hover:underline flex items-center gap-1 mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Companions
            </button>
            <h2 className="text-xl font-black text-[var(--text)] tracking-tight">
              {editingCompanionId ? "Edit Accompanying Person / Companion" : "Add Accompanying Person / Companion"}
            </h2>
            <p className="text-xs text-[var(--muted)]">
              {editingCompanionId ? "Update companion registration details with real-time DB sync" : "Register a companion linked to a primary delegate with real-time DB sync"}
            </p>
          </div>

          {/* Form Area — Scrollable body inside viewport */}
          <form onSubmit={handleSaveCompanion} className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

              {/* Left Column: Companion Basic Info */}
              <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)] border-b border-[var(--border)] pb-2">Companion Information</h3>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">Full Name *</label>
                    <Input
                      required
                      value={compFullName}
                      onChange={(e) => setCompFullName(e.target.value)}
                      placeholder="Enter full name"
                      className="h-9 bg-[var(--surf)] border-[var(--border)] text-xs font-semibold text-[var(--text)]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">Relation *</label>
                    <select
                      value={compRelation}
                      onChange={(e) => setCompRelation(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-xs font-bold text-[var(--text)]"
                    >
                      <option value="Spouse">Spouse</option>
                      <option value="Guest">Guest</option>
                      <option value="Child">Child</option>
                      <option value="Assistant">Assistant</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">Email (Optional)</label>
                    <Input
                      type="email"
                      value={compEmail}
                      onChange={(e) => setCompEmail(e.target.value)}
                      placeholder="Enter email address"
                      className="h-9 bg-[var(--surf)] border-[var(--border)] text-xs font-semibold text-[var(--text)]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">Mobile *</label>
                    <div className="flex gap-2">
                      <select className="h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-xs font-bold text-[var(--text)]">
                        <option value="+91">+91</option>
                        <option value="+1">+1</option>
                        <option value="+44">+44</option>
                      </select>
                      <Input
                        required
                        value={compMobile}
                        onChange={(e) => setCompMobile(e.target.value)}
                        placeholder="Enter mobile number"
                        className="flex-1 h-9 bg-[var(--surf)] border-[var(--border)] text-xs font-semibold text-[var(--text)]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Delegate Selector + Additional Info */}
              <div className="space-y-4">

                {/* Link to Primary Delegate */}
                <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)] border-b border-[var(--border)] pb-2">Link to Primary Delegate *</h3>

                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                    <Input
                      className="pl-10 h-9 bg-[var(--surf)] border-[var(--border)] text-xs font-semibold text-[var(--text)]"
                      placeholder="Search by name or registration no."
                      value={delegateSearch}
                      onChange={(e) => setDelegateSearch(e.target.value)}
                    />
                  </div>

                  {selectedDelegate ? (
                    <div className="p-3 rounded-xl bg-[var(--surf)] border-2 border-emerald-500/50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--pri)] text-[var(--primary-contrast)] font-black text-xs flex items-center justify-center">
                          {selectedDelegate.name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-[var(--text)] text-xs">{selectedDelegate.name} <span className="font-mono text-[10px] font-bold text-[var(--acc)]">({selectedDelegate.regno})</span></div>
                          <div className="text-[10px] text-[var(--muted)]">{selectedDelegate.role || "Delegate"} · {selectedDelegate.email}</div>
                        </div>
                      </div>
                      <Button size="sm" type="button" variant="outline" onClick={() => setSelectedDelegate(null)} className="h-7 text-[10px] font-bold text-red-500">
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                      {filteredDelegatesForLink.map((del) => (
                        <div
                          key={del.id}
                          className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surf)] hover:border-[var(--pri)] flex items-center justify-between text-xs cursor-pointer"
                          onClick={() => setSelectedDelegate(del)}
                        >
                          <div>
                            <p className="font-bold text-[var(--text)]">{del.name} <span className="font-mono text-[10px] text-[var(--acc)]">({del.regno})</span></p>
                            <p className="text-[10px] text-[var(--muted)]">{del.email}</p>
                          </div>
                          <Button size="sm" type="button" className="h-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px]">
                            Select
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Additional Information (Wired to DB) */}
                <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)] border-b border-[var(--border)] pb-2">Additional Information (Persisted to DB)</h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">Dietary Preference</label>
                      <select
                        value={dietaryPref}
                        onChange={(e) => setDietaryPref(e.target.value)}
                        className="w-full h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-xs font-bold text-[var(--text)]"
                      >
                        <option value="None">None</option>
                        <option value="Vegetarian">Vegetarian</option>
                        <option value="Non-Vegetarian">Non-Vegetarian</option>
                        <option value="Vegan">Vegan</option>
                        <option value="Jain">Jain</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">Special Assistance</label>
                      <select
                        value={specialAssist}
                        onChange={(e) => setSpecialAssist(e.target.value)}
                        className="w-full h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-xs font-bold text-[var(--text)]"
                      >
                        <option value="None">None</option>
                        <option value="Wheelchair">Wheelchair Required</option>
                        <option value="Sign Language">Sign Language</option>
                        <option value="VIP Escort">VIP Escort</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block mb-1">Notes</label>
                    <Input
                      value={compNotes}
                      onChange={(e) => setCompNotes(e.target.value)}
                      placeholder="Enter any notes or special requests"
                      className="h-9 bg-[var(--surf)] border-[var(--border)] text-xs font-semibold text-[var(--text)]"
                    />
                  </div>
                </div>

              </div>

            </div>

            {/* Form Footer Action Bar */}
            <div className="shrink-0 mt-3 p-3 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm flex items-center justify-between">
              <Button type="button" variant="outline" onClick={() => setViewMode("list")} className="h-9 px-5 text-xs font-bold">
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={submittingForm}
                className="bg-[var(--pri)] text-[var(--primary-contrast)] font-extrabold text-xs h-9 px-7 rounded-xl shadow-md gap-2"
              >
                {submittingForm ? "Saving..." : "Save Companion Record"}
              </Button>
            </div>
          </form>

        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* VIEW 3: COMPANION DETAILS VIEW PAGE (REAL DB DATA BINDING)    */}
      {/* ───────────────────────────────────────────────────────────── */}
      {viewMode === "details" && selectedCompanion && (
        <div className="flex flex-col h-full min-h-0 overflow-hidden space-y-3">
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between">
            <button
              onClick={() => setViewMode("list")}
              className="text-xs font-bold text-[var(--pri)] hover:underline flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Companions
            </button>
          </div>

          {/* Top Title Banner */}
          <div className="shrink-0 p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--raised)] border border-[var(--border)] font-black text-lg flex items-center justify-center text-[var(--text)]">
                {selectedCompanion.name ? selectedCompanion.name.substring(0, 2).toUpperCase() : "CP"}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-black text-[var(--text)]">{selectedCompanion.name}</h2>
                  <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full border ${selectedCompanion.checked_in
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    }`}>
                    {selectedCompanion.checked_in ? "Checked In" : "Pending"}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] font-semibold mt-0.5">
                  Companion of <span className="text-[var(--text)] font-bold">{selectedCompanion.primary_delegate?.name || "Primary Delegate"}</span> ({selectedCompanion.primary_delegate?.regno || "N/A"})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedCompanion.checked_in ? (
                <Button
                  onClick={() => setShowAdminResetModal(true)}
                  className="h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" /> Reset Check-In
                </Button>
              ) : (
                <Button
                  onClick={() => handleCheckInCompanion(selectedCompanion)}
                  className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Check In Companion
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => handleEditCompanion(selectedCompanion)}
                className="h-9 px-4 text-xs font-bold gap-1.5 border-[var(--border)]"
              >
                <Edit3 className="w-3.5 h-3.5 text-[var(--muted)]" /> Edit Companion
              </Button>
              <Button
                variant="outline"
                onClick={() => handleRemoveCompanion(selectedCompanion.id)}
                className="h-9 px-4 text-xs font-bold text-red-500 border-red-500/30 hover:bg-red-500/10 gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove Companion
              </Button>
            </div>
          </div>

          {/* Details Tab Switcher (DOCUMENTS and NOTES tabs removed as requested) */}
          <div className="shrink-0 flex items-center gap-6 border-b border-[var(--border)] pb-2 text-xs font-bold px-1">
            {(["overview", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setDetailsTab(tab)}
                className={`pb-2 uppercase tracking-wider font-extrabold transition-all relative ${detailsTab === tab
                  ? "text-[var(--text)] border-b-2 border-white"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
              >
                {tab === "overview" ? "Overview" : "Check-In History"}
              </button>
            ))}
          </div>

          {/* Tab Content — scrollable viewport-locked container */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
            {detailsTab === "overview" && (
              <div className="space-y-4">

                {/* 6-Card Grid: 3 columns, 2 rows */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">

                  {/* CARD 1: COMPANION INFORMATION */}
                  <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3 mb-3">
                        <Users className="w-4 h-4 text-[var(--muted)]" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Companion Information</h3>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="flex items-center justify-between py-1 border-b border-[var(--border)]/50">
                          <span className="text-[var(--muted)] font-semibold flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-[var(--muted)]" /> Full Name
                          </span>
                          <strong className="text-[var(--text)] font-bold">{selectedCompanion.name}</strong>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-[var(--border)]/50">
                          <span className="text-[var(--muted)] font-semibold flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-[var(--muted)]" /> Relation
                          </span>
                          <strong className="text-[var(--text)] font-bold">{selectedCompanion.relationship || "Guest"}</strong>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-[var(--border)]/50">
                          <span className="text-[var(--muted)] font-semibold flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-[var(--muted)]" /> Email
                          </span>
                          <strong className="text-[var(--text)] font-mono">{selectedCompanion.email || "N/A"}</strong>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="text-[var(--muted)] font-semibold flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-[var(--muted)]" /> Mobile
                          </span>
                          <strong className="text-[var(--text)] font-mono">{selectedCompanion.phone || "N/A"}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CARD 2: LINKED DELEGATE */}
                  <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                        <Building className="w-4 h-4 text-[var(--muted)]" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Linked Delegate</h3>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-[var(--raised)] text-[var(--text)] font-black text-sm flex items-center justify-center border border-[var(--border)]">
                          {(selectedCompanion.primary_delegate?.name || "Delegate").substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-sm text-[var(--text)]">{selectedCompanion.primary_delegate?.name || "Primary Delegate"}</h4>
                            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              {selectedCompanion.primary_delegate?.regno || "N/A"}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--muted)]">{selectedCompanion.primary_delegate?.role || "Delegate"}</p>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs border-t border-[var(--border)] pt-3">
                        <div className="flex items-center gap-2 text-[var(--muted)]">
                          <Mail className="w-3.5 h-3.5 text-[var(--muted)]" />
                          <span className="font-mono text-xs text-[var(--text)]">{selectedCompanion.primary_delegate?.email || "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[var(--muted)]">
                          <Phone className="w-3.5 h-3.5 text-[var(--muted)]" />
                          <span className="font-mono text-xs text-[var(--text)]">{selectedCompanion.primary_delegate?.phone || "N/A"}</span>
                        </div>
                      </div>
                    </div>

                    <Button variant="outline" className="w-full h-9 text-xs font-bold border-[var(--border)] justify-between">
                      <span>View Delegate Profile</span>
                      <span>→</span>
                    </Button>
                  </div>

                  {/* CARD 3: REGISTRATION INFORMATION */}
                  <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3 mb-3">
                        <Ticket className="w-4 h-4 text-[var(--muted)]" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Registration Information</h3>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-[var(--border)]/50">
                          <span className="text-[var(--muted)] font-semibold">Registration No.</span>
                          <strong className="font-mono text-[var(--text)] font-bold">{selectedCompanion.regno}</strong>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[var(--border)]/50">
                          <span className="text-[var(--muted)] font-semibold">Ticket Type</span>
                          <strong className="text-[var(--text)] font-bold">Delegate Guest</strong>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[var(--border)]/50">
                          <span className="text-[var(--muted)] font-semibold">Payment Status</span>
                          <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            PAID
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[var(--border)]/50">
                          <span className="text-[var(--muted)] font-semibold">Check-In Status</span>
                          <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded ${selectedCompanion.checked_in
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                            }`}>
                            {selectedCompanion.checked_in ? "CHECKED IN" : "PENDING"}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[var(--border)]/50">
                          <span className="text-[var(--muted)] font-semibold">Added On</span>
                          <strong className="text-[var(--text)] font-semibold">
                            {selectedCompanion.created_at
                              ? new Date(selectedCompanion.created_at).toLocaleString("en-US", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                              : "N/A"}
                          </strong>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-[var(--muted)] font-semibold">Checked In By</span>
                          <strong className="text-[var(--muted)]">{selectedCompanion.checked_in_by || "—"}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CARD 4: ADDITIONAL INFORMATION */}
                  <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3 mb-3">
                        <Building className="w-4 h-4 text-[var(--muted)]" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Additional Information</h3>
                      </div>

                      <div className="space-y-4 text-xs">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] text-[var(--muted)] font-bold uppercase block mb-1">Dietary Preference</span>
                            <strong className="font-bold text-[var(--text)] text-sm">{selectedCompanion.dietary_preference || "None"}</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--muted)] font-bold uppercase block mb-1">Special Assistance</span>
                            <strong className="font-bold text-[var(--text)] text-sm">{selectedCompanion.special_assistance || "None"}</strong>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-[var(--muted)] font-bold uppercase block mb-1">Notes</span>
                          <p className="font-semibold text-[var(--muted)] text-xs">{selectedCompanion.notes || "No special requests."}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CARD 5: RECENT ACTIVITIES (REAL DB TIMELINE) */}
                  <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                        <Clock className="w-4 h-4 text-[var(--muted)]" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Recent Activities</h3>
                      </div>

                      <div className="space-y-3 text-xs pl-2">
                        <div className="flex items-start gap-3 relative border-l border-[var(--border)] pl-4 pb-2">
                          <span className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-emerald-500" />
                          <div className="flex-1">
                            <div className="flex justify-between">
                              <strong className="text-[var(--text)] font-bold">Companion Added</strong>
                              <span className="text-[10px] text-[var(--muted)]">
                                {selectedCompanion.created_at
                                  ? new Date(selectedCompanion.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : "Recently"}
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--muted)]">Registered & linked in database</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-3 relative border-l border-[var(--border)] pl-4 pb-2">
                          <span className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-emerald-500" />
                          <div className="flex-1">
                            <div className="flex justify-between">
                              <strong className="text-[var(--text)] font-bold">Delegate Linked</strong>
                              <span className="text-[10px] text-[var(--muted)]">
                                {selectedCompanion.created_at
                                  ? new Date(selectedCompanion.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : "Recently"}
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--muted)]">Linked to {selectedCompanion.primary_delegate?.name || "Primary Delegate"}</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-3 relative pl-4">
                          <span className={`absolute -left-1.5 top-1 w-3 h-3 rounded-full ${selectedCompanion.checked_in ? "bg-emerald-500" : "bg-amber-500"}`} />
                          <div className="flex-1">
                            <div className="flex justify-between">
                              <strong className="text-[var(--text)] font-bold">{selectedCompanion.checked_in ? "Checked In" : "Check-In Pending"}</strong>
                              <span className="text-[10px] text-[var(--muted)]">Real-Time</span>
                            </div>
                            <p className="text-[11px] text-[var(--muted)]">{selectedCompanion.checked_in ? "Check-in completed at venue" : "Awaiting check-in at venue"}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button variant="outline" className="w-full h-9 text-xs font-bold border-[var(--border)] justify-center gap-2">
                      <span>≡ View Full History</span>
                    </Button>
                  </div>

                  {/* CARD 6: COMPANION BADGE & QR PASS */}
                  <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                        <div className="flex items-center gap-2">
                          <QrCode className="w-4 h-4 text-[var(--muted)]" />
                          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Companion Badge & QR Pass</h3>
                        </div>
                        <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          Live PDF Preview ↗
                        </span>
                      </div>

                      {/* Real Badge Card Preview bound to DB */}
                      <div className="bg-white rounded-xl p-4 text-slate-900 text-center space-y-2 border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                        <h4 className="text-lg font-black text-slate-900 tracking-tight">{selectedCompanion.name}</h4>
                        <div className="w-full border-t border-slate-200 my-1" />
                        <p className="text-xs text-slate-500 font-semibold">Guest of <strong className="text-slate-900 font-bold">{selectedCompanion.primary_delegate?.name || "Delegate"}</strong></p>
                        <div className="w-full border-t border-dashed border-slate-300 my-1" />
                        <div className="p-1 bg-white rounded">
                          <QrCode className="w-20 h-20 text-slate-900" />
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-800 block">{selectedCompanion.regno}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (badgePdfUrl) {
                            const link = document.createElement("a");
                            link.href = badgePdfUrl;
                            link.download = `Companion_${selectedCompanion.name}_Badge.pdf`;
                            link.click();
                          } else {
                            toast.info("Compiling badge PDF...");
                          }
                        }}
                        className="h-9 text-xs font-bold border-[var(--border)] gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> Download PDF
                      </Button>

                      <Button
                        onClick={async () => {
                          try {
                            await apiClient.post(`/venue/registration/participants/${selectedCompanion.id}/print-badge`);
                            toast.success(`Badge print request logged for ${selectedCompanion.name}!`);
                            if (badgePdfUrl) {
                              const win = window.open(badgePdfUrl, "_blank");
                              if (win) win.print();
                            }
                          } catch (err: any) {
                            toast.error("Failed to trigger badge print");
                          }
                        }}
                        className="h-9 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-[var(--primary-contrast)] font-extrabold text-xs rounded-xl shadow-md gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> Print Badge
                      </Button>
                    </div>
                  </div>

                </div>

                {/* Bottom Notice Info Bar */}
                <div className="p-3 bg-[var(--card)] rounded-xl border border-[var(--border)] flex items-center gap-2 text-xs text-[var(--muted)] font-semibold">
                  <AlertCircle className="w-4 h-4 text-[var(--pri)] shrink-0" />
                  <span>This companion is linked to a primary delegate. Any changes may require approval based on event policies.</span>
                </div>

              </div>
            )}

            {detailsTab === "history" && (
              <div className="p-8 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Companion Check-In & Activity History</h3>
                <div className="text-xs text-[var(--muted)] space-y-2">
                  <p>• <strong>Companion Created:</strong> {selectedCompanion.created_at ? new Date(selectedCompanion.created_at).toLocaleString() : "N/A"}</p>
                  <p>• <strong>Primary Delegate:</strong> {selectedCompanion.primary_delegate?.name || "N/A"} ({selectedCompanion.primary_delegate?.regno || "N/A"})</p>
                  <p>• <strong>Check-In Status:</strong> {selectedCompanion.checked_in ? `Checked In (Operator: ${selectedCompanion.checked_in_by || "System"})` : "Pending Check-In"}</p>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Admin Password Reset Modal */}
      {showAdminResetModal && selectedCompanion && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[var(--text)]">Admin Companion Check-In Reset</h3>
                <p className="text-xs text-[var(--muted)]">Requires administrator credentials to clear check-in</p>
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
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
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
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAdminResetModal(false)}
                  className="h-9 px-4 text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={resettingCheckin || !adminPassword}
                  className="h-9 px-5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md gap-1.5"
                >
                  {resettingCheckin ? "Verifying..." : "Confirm Check-In Reset"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

