"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Save,
  Users,
  Plus,
  Trash2,
  Building,
  Calendar,
  Edit3,
  CheckCircle2,
  X,
  Lock,
  Unlock,
  Sliders,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface StationRule {
  id: string;
  station_name: string;
  type: string;
  allowed_roles: string[];
  max_checkins_per_delegate: number; // 0 = unlimited
  station_capacity: number;
  updated_by?: string;
  updated_reason?: string;
  updated_at?: string;
}

export default function CapacityTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isEventCapModalOpen, setIsEventCapModalOpen] = useState(false);

  // Selected Rule for Update Modal
  const [editingRule, setEditingRule] = useState<StationRule | null>(null);
  const [editStationName, setEditStationName] = useState("");
  const [editStationType, setEditStationType] = useState("Room");
  const [editStationCapacity, setEditStationCapacity] = useState(500);
  const [editMaxCheckins, setEditMaxCheckins] = useState(0);
  const [editAllowedRoles, setEditAllowedRoles] = useState<string[]>(["All"]);
  const [savingRuleEdit, setSavingRuleEdit] = useState(false);

  // New Station Modal State
  const [newStationName, setNewStationName] = useState("");
  const [newStationType, setNewStationType] = useState("Room");
  const [newStationCapacity, setNewStationCapacity] = useState(500);
  const [newMaxCheckins, setNewMaxCheckins] = useState(0);
  const [newAllowedRoles, setNewAllowedRoles] = useState<string[]>(["All"]);
  const [creatingRule, setCreatingRule] = useState(false);

  // Event Overall Capacity Modal State
  const [eventCapacityInput, setEventCapacityInput] = useState(5000);
  const [savingEventCap, setSavingEventCap] = useState(false);

  // Deleting State
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  const [capacityData, setCapacityData] = useState<any>({
    total_event_limit: 0,
    event_name: "Tech Conference 2026",
    total_registered: 0,
    registered_roles: ["Delegate", "Speaker", "VIP", "Exhibitor", "Media", "Sponsor"],
    roles: [],
    stations: [],
  });

  const fetchCapacity = async () => {
    try {
      setLoading(true);
      const res: any = await apiClient.get("/venue/registration/capacity");
      if (res) {
        setCapacityData(res);
        setEventCapacityInput(res.total_event_limit || 5000);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load capacity settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCapacity();
  }, []);

  const availableRoles =
    capacityData.registered_roles || ["Delegate", "Speaker", "VIP", "Exhibitor", "Media", "Sponsor"];

  // Open Update Rule Modal
  const handleOpenUpdateModal = (stn: StationRule) => {
    setEditingRule(stn);
    setEditStationName(stn.station_name);
    setEditStationType(stn.type || "Room");
    setEditStationCapacity(stn.station_capacity || 500);
    setEditMaxCheckins(stn.max_checkins_per_delegate || 0);
    setEditAllowedRoles(stn.allowed_roles && stn.allowed_roles.length > 0 ? stn.allowed_roles : ["All"]);
    setIsUpdateModalOpen(true);
  };

  // Toggle Role Selection for Add Modal
  const toggleNewRole = (role: string) => {
    if (role === "All") {
      setNewAllowedRoles(["All"]);
      return;
    }
    let next = newAllowedRoles.filter((r) => r !== "All");
    if (next.includes(role)) {
      next = next.filter((r) => r !== role);
    } else {
      next.push(role);
    }
    if (next.length === 0) next = ["All"];
    setNewAllowedRoles(next);
  };

  // Toggle Role Selection for Edit Modal
  const toggleEditRole = (role: string) => {
    if (role === "All") {
      setEditAllowedRoles(["All"]);
      return;
    }
    let next = editAllowedRoles.filter((r) => r !== "All");
    if (next.includes(role)) {
      next = next.filter((r) => r !== role);
    } else {
      next.push(role);
    }
    if (next.length === 0) next = ["All"];
    setEditAllowedRoles(next);
  };

  // Submit Add Station Rule
  const handleAddStationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStationName.trim()) {
      toast.error("Station Name is required.");
      return;
    }

    const payload = {
      station_name: newStationName.trim(),
      type: newStationType,
      allowed_roles: newAllowedRoles.includes("All") ? [...availableRoles] : newAllowedRoles,
      max_checkins_per_delegate: newMaxCheckins,
      station_capacity: newStationCapacity,
    };

    try {
      setCreatingRule(true);
      await apiClient.post("/venue/registration/capacity/rules", payload);
      toast.success(`Station Rule "${newStationName}" created successfully!`);
      setNewStationName("");
      setNewMaxCheckins(0);
      setNewAllowedRoles(["All"]);
      setIsAddModalOpen(false);
      fetchCapacity();
    } catch (err: any) {
      toast.error(err.message || "Failed to create station rule.");
    } finally {
      setCreatingRule(false);
    }
  };

  // Submit Update Station Rule
  const handleUpdateStationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    if (!editStationName.trim()) {
      toast.error("Station Name is required.");
      return;
    }

    const payload = {
      station_name: editStationName.trim(),
      type: editStationType,
      allowed_roles: editAllowedRoles.includes("All") ? [...availableRoles] : editAllowedRoles,
      max_checkins_per_delegate: editMaxCheckins,
      station_capacity: editStationCapacity,
    };

    try {
      setSavingRuleEdit(true);
      await apiClient.put(`/venue/registration/capacity/rules/${editingRule.id}`, payload);
      toast.success(`Station Rule "${editStationName}" updated successfully!`);
      setIsUpdateModalOpen(false);
      setEditingRule(null);
      fetchCapacity();
    } catch (err: any) {
      toast.error(err.message || "Failed to update station rule.");
    } finally {
      setSavingRuleEdit(false);
    }
  };

  // Delete Station Rule
  const handleDeleteStation = async (id: string, name: string) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete the station rule "${name}"?`);
    if (!confirmDelete) return;

    try {
      setDeletingRuleId(id);
      await apiClient.delete(`/venue/registration/capacity/rules/${id}`);
      toast.success(`Station rule "${name}" deleted.`);
      fetchCapacity();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete station rule.");
    } finally {
      setDeletingRuleId(null);
    }
  };

  // Submit Update Overall Event Capacity
  const handleUpdateEventCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (eventCapacityInput <= 0) {
      toast.error("Capacity must be greater than 0.");
      return;
    }

    try {
      setSavingEventCap(true);
      await apiClient.post("/venue/registration/capacity/override", {
        target_type: "event",
        new_capacity: eventCapacityInput,
        reason: "Capacity Updated via Admin Console",
        admin_name: "Admin",
      });
      toast.success(`Organiser overall event capacity updated to ${eventCapacityInput.toLocaleString()} delegates!`);
      setIsEventCapModalOpen(false);
      fetchCapacity();
    } catch (err: any) {
      toast.error(err.message || "Failed to update event capacity.");
    } finally {
      setSavingEventCap(false);
    }
  };

  const overallPct = Math.min(
    100,
    Math.round(
      ((capacityData.total_registered || 0) / (capacityData.total_event_limit || 1)) * 100
    )
  );

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Top Banner */}
      <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-[var(--text)] tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--acc)]" /> Venue Check-in Gates Builder
            </h2>
            {capacityData.event_name && (
              <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
                {capacityData.event_name}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Manage overall event capacity ceiling, configure station checkpoint intake rules, and enforce delegate access limits
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={fetchCapacity} disabled={loading} className="h-10 text-xs font-bold border-[var(--border)] bg-[var(--surf)] text-[var(--text)]">
            <RefreshCw className={cn("w-4 h-4 mr-1.5", loading && "animate-spin")} /> Refresh Rules
          </Button>

          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="h-10 bg-[var(--pri)] text-[var(--primary-contrast)] font-bold gap-2 shadow-md hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Add Check-in Gate
          </Button>
        </div>
      </div>

      {/* Overview Stat Cards 3-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Organiser Portal Event Capacity Limit */}
        <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-3 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[var(--pri)]" /> Organiser Overall Capacity
              </span>
              <button
                onClick={() => setIsEventCapModalOpen(true)}
                className="px-2 py-1 rounded-lg bg-[var(--surf)] text-[var(--text)] hover:border-[var(--pri)] text-[10px] font-bold flex items-center gap-1 border border-[var(--border)] transition-all cursor-pointer"
                title="Update Event Overall Capacity"
              >
                <Edit3 className="w-3 h-3 text-[var(--pri)]" /> Update Limit
              </button>
            </div>

            <h3 className="text-2xl font-black text-[var(--text)] mt-2">
              {(capacityData.total_registered || 0).toLocaleString()} / {capacityData.total_event_limit ? capacityData.total_event_limit.toLocaleString() : "Unlimited"} Delegates
            </h3>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-[11px] font-bold text-[var(--muted)]">
              <span>Overall Utilization</span>
              <span className="text-[var(--acc)] font-black">{overallPct}% Full</span>
            </div>
            <div className="w-full h-2.5 bg-[var(--surf)] border border-[var(--border)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--pri)] to-[var(--acc)] rounded-full transition-all duration-500"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Intake & Station Rules Summary */}
        <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-blue-500" /> Active Check-in Gates
              </span>
              <span className="text-xs font-bold text-[var(--muted)]">{capacityData.stations.length} Configured</span>
            </div>

            <h3 className="text-2xl font-black text-[var(--text)] mt-2">
              {capacityData.stations.length} Check-in Gates
            </h3>
          </div>

          <p className="text-xs text-[var(--muted)]">
            Configured access checkpoints for Main Entrance, dining halls, sessions, workshops, and restricted rooms.
          </p>

          <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
            <span className="text-[10px] font-black uppercase text-[var(--muted)]">Types:</span>
            <div className="flex flex-wrap gap-1">
              <span className="px-2 py-0.5 text-[9px] font-bold rounded-md bg-[var(--surf)] border border-[var(--border)] text-[var(--text)]">Intake</span>
              <span className="px-2 py-0.5 text-[9px] font-bold rounded-md bg-[var(--surf)] border border-[var(--border)] text-[var(--text)]">Room</span>
              <span className="px-2 py-0.5 text-[9px] font-bold rounded-md bg-[var(--surf)] border border-[var(--border)] text-[var(--text)]">Dining</span>
            </div>
          </div>
        </div>

        {/* Card 3: Active Registered Participant Roles */}
        <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-500" /> Inherited Roles
              </span>
              <span className="text-xs font-bold text-[var(--muted)]">{availableRoles.length} Active</span>
            </div>

            <h3 className="text-2xl font-black text-[var(--text)] mt-2">
              {availableRoles.length} Roles Synced
            </h3>
          </div>

          <p className="text-xs text-[var(--muted)]">Synchronized live from participant directory with role-based rule gating.</p>

          <div className="flex flex-wrap gap-1 pt-1 border-t border-[var(--border)]">
            {availableRoles.slice(0, 4).map((r: string) => (
              <span
                key={r}
                className="px-2 py-0.5 bg-[var(--surf)] border border-[var(--border)] text-[var(--text)] text-[9px] font-black uppercase rounded-md"
              >
                {r}
              </span>
            ))}
            {availableRoles.length > 4 && (
              <span className="px-2 py-0.5 bg-[var(--raised)] border border-[var(--border)] text-[var(--muted)] text-[9px] font-black rounded-md">
                +{availableRoles.length - 4} more
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Check-in Gates Section */}
      <div className="space-y-4">
        <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-[var(--text)] flex items-center gap-2">
              <Building className="w-5 h-5 text-[var(--pri)]" /> Check-in Gates Catalogue (3-Column View)
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Read-only rule summary cards. Click "Update Rule" to adjust station limits, frequency rules, and role permissions.
            </p>
          </div>

          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-[var(--pri)] text-[var(--primary-contrast)] font-extrabold text-xs gap-1.5 h-9 shrink-0"
          >
            <Plus className="w-4 h-4" /> Add Check-in Gate
          </Button>
        </div>

        {/* 3-Column Clean Rule Cards Grid (Read-Only Metrics on Card, Inputs inside Update Window) */}
        {capacityData.stations.length === 0 ? (
          <div className="bg-[var(--card)] p-12 rounded-2xl border border-[var(--border)] shadow-sm text-center space-y-3">
            <Building className="w-10 h-10 mx-auto text-[var(--muted)]" />
            <h4 className="text-base font-black text-[var(--text)]">No Venue Check-in Gates Configured</h4>
            <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
              You currently have no custom check-in gates. Click "Add Check-in Gate" to create a gate for room, dining, or session access.
            </p>
            <Button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-[var(--pri)] text-[var(--primary-contrast)] font-extrabold text-xs gap-1.5 h-9"
            >
              <Plus className="w-4 h-4" /> Create First Check-in Gate
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {capacityData.stations.map((stn: StationRule) => {
              const roles = stn.allowed_roles || ["All"];
              const isAllRoles = roles.length === availableRoles.length || roles.includes("All");

              return (
                <div
                  key={stn.id}
                  className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 flex flex-col justify-between hover:border-[var(--pri)] transition-all"
                >
                  <div className="space-y-3.5">
                    {/* Card Header & Actions */}
                    <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
                      <div>
                        <h4 className="text-base font-black text-[var(--text)]">{stn.station_name}</h4>
                        <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-full bg-[var(--surf)] text-[var(--acc)] border border-[var(--border)] mt-1 inline-block">
                          {stn.type || "Room"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Update Rule Button */}
                        <button
                          onClick={() => handleOpenUpdateModal(stn)}
                          className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--pri)] transition-all cursor-pointer"
                          title="Update Station Rule"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Rule Button */}
                        <button
                          onClick={() => handleDeleteStation(stn.id, stn.station_name)}
                          disabled={deletingRuleId === stn.id}
                          className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-red-500 hover:border-red-500 transition-all cursor-pointer"
                          title="Delete Station Rule"
                        >
                          <Trash2 className={cn("w-3.5 h-3.5", deletingRuleId === stn.id && "animate-spin")} />
                        </button>
                      </div>
                    </div>

                    {/* Rule Metric Indicators (Read-Only Badges) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-xl bg-[var(--surf)] border border-[var(--border)] space-y-0.5">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--muted)] block">Capacity Ceiling</span>
                        <div className="text-sm font-black text-[var(--text)]">
                          {stn.station_capacity > 0 ? `${stn.station_capacity.toLocaleString()} delegates` : "Unlimited"}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[var(--surf)] border border-[var(--border)] space-y-0.5">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--muted)] block">Check-In Limit</span>
                        <div className="text-sm font-black text-emerald-500">
                          {stn.max_checkins_per_delegate > 0 ? `${stn.max_checkins_per_delegate} / delegate` : "Unlimited"}
                        </div>
                      </div>
                    </div>

                    {/* Allowed Roles Badges (Read-Only) */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
                        <span>Allowed Roles:</span>
                        <span className="text-[var(--acc)] font-bold">{isAllRoles ? "All Roles" : `${roles.length} Selected`}</span>
                      </div>

                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar">
                        {isAllRoles ? (
                          <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            ✓ All Participant Roles Allowed
                          </span>
                        ) : (
                          roles.map((role) => (
                            <span key={role} className="px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-[var(--surf)] border border-[var(--border)] text-[var(--text)]">
                              {role}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Trigger */}
                  <Button
                    onClick={() => handleOpenUpdateModal(stn)}
                    variant="outline"
                    className="w-full h-8 text-xs font-bold border-[var(--border)] bg-[var(--surf)] text-[var(--text)] hover:bg-[var(--raised)] gap-1.5 mt-2"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[var(--pri)]" /> Update Rule Parameters
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 1: ADD NEW STATION RULE                                 */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[var(--pri)]" /> Create Check-in Gate
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStationSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1">Gate Name *</label>
                <Input
                  required
                  placeholder="e.g. Main Entrance Gate 1, Lunch Hall A, Workshop Room 302"
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Station Type</label>
                  <select
                    value={newStationType}
                    onChange={(e) => setNewStationType(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--surf)] text-[var(--text)]"
                  >
                    <option value="Main Entrance">Main Entrance Intake</option>
                    <option value="Room">Conference Room / Hall</option>
                    <option value="Session">Workshop / Session Gate</option>
                    <option value="Dining">Dining / Lunch Counter</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Station Capacity Ceiling</label>
                  <Input
                    type="number"
                    min={0}
                    value={newStationCapacity}
                    onChange={(e) => setNewStationCapacity(parseInt(e.target.value) || 0)}
                    className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1">Check-In Limit / Delegate</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0 = Unlimited"
                  value={newMaxCheckins === 0 ? "" : newMaxCheckins}
                  onChange={(e) => setNewMaxCheckins(parseInt(e.target.value) || 0)}
                  className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                />
                <span className="text-[10px] text-[var(--muted)] font-medium mt-0.5 block">0 = unlimited check-ins allowed for this station</span>
              </div>

              {/* Allowed Roles Selection */}
              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1.5">Authorized Participant Roles</label>
                <div className="p-3 bg-[var(--surf)] border border-[var(--border)] rounded-xl space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAllowedRoles.includes("All")}
                      onChange={() => toggleNewRole("All")}
                      className="rounded border-[var(--border)] text-[var(--pri)] accent-[var(--pri)]"
                    />
                    <span>All Participant Roles (Universal Access)</span>
                  </label>

                  {availableRoles.map((role: string) => (
                    <label key={role} className="flex items-center gap-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newAllowedRoles.includes(role)}
                        onChange={() => toggleNewRole(role)}
                        className="rounded border-[var(--border)] text-[var(--pri)] accent-[var(--pri)]"
                      />
                      <span>{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)} className="border-[var(--border)] bg-[var(--surf)] text-[var(--text)]">
                  Cancel
                </Button>
                <Button type="submit" disabled={creatingRule} className="bg-[var(--pri)] text-[var(--primary-contrast)] font-bold">
                  {creatingRule ? "Creating Gate..." : "Create Check-in Gate"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 2: UPDATE STATION RULE (ALL INPUT FIELDS ARE HERE)       */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isUpdateModalOpen && editingRule && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[var(--pri)]" /> Update Check-in Gate
              </h3>
              <button
                onClick={() => { setIsUpdateModalOpen(false); setEditingRule(null); }}
                className="text-[var(--muted)] hover:text-[var(--text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateStationSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1">Gate Name *</label>
                <Input
                  required
                  value={editStationName}
                  onChange={(e) => setEditStationName(e.target.value)}
                  className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Station Type</label>
                  <select
                    value={editStationType}
                    onChange={(e) => setEditStationType(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--surf)] text-[var(--text)]"
                  >
                    <option value="Main Entrance">Main Entrance Intake</option>
                    <option value="Room">Conference Room / Hall</option>
                    <option value="Session">Workshop / Session Gate</option>
                    <option value="Dining">Dining / Lunch Counter</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Station Capacity Ceiling</label>
                  <Input
                    type="number"
                    min={0}
                    value={editStationCapacity}
                    onChange={(e) => setEditStationCapacity(parseInt(e.target.value) || 0)}
                    className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1">Check-In Limit / Delegate</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0 = Unlimited"
                  value={editMaxCheckins === 0 ? "" : editMaxCheckins}
                  onChange={(e) => setEditMaxCheckins(parseInt(e.target.value) || 0)}
                  className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                />
                <span className="text-[10px] text-[var(--muted)] font-medium mt-0.5 block">0 = unlimited check-ins allowed for this station</span>
              </div>

              {/* Authorized Roles Selection for Edit */}
              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1.5">Authorized Participant Roles</label>
                <div className="p-3 bg-[var(--surf)] border border-[var(--border)] rounded-xl space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editAllowedRoles.includes("All")}
                      onChange={() => toggleEditRole("All")}
                      className="rounded border-[var(--border)] text-[var(--pri)] accent-[var(--pri)]"
                    />
                    <span>All Participant Roles (Universal Access)</span>
                  </label>

                  {availableRoles.map((role: string) => (
                    <label key={role} className="flex items-center gap-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editAllowedRoles.includes(role)}
                        onChange={() => toggleEditRole(role)}
                        className="rounded border-[var(--border)] text-[var(--pri)] accent-[var(--pri)]"
                      />
                      <span>{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setIsUpdateModalOpen(false); setEditingRule(null); }}
                  className="border-[var(--border)] bg-[var(--surf)] text-[var(--text)]"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={savingRuleEdit} className="bg-[var(--pri)] text-[var(--primary-contrast)] font-bold">
                  {savingRuleEdit ? "Saving Changes..." : "Save Rule Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 3: UPDATE ORGANISER OVERALL EVENT CAPACITY               */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isEventCapModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[var(--pri)]" /> Update Event Capacity Limit
              </h3>
              <button
                onClick={() => setIsEventCapModalOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateEventCapacity} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1">Total Event Capacity Limit (Delegates) *</label>
                <Input
                  type="number"
                  min={1}
                  required
                  value={eventCapacityInput}
                  onChange={(e) => setEventCapacityInput(parseInt(e.target.value) || 0)}
                  className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                />
                <span className="text-[10px] text-[var(--muted)] font-medium mt-1 block">
                  Synchronized with organiser capacity enforcement and registration intake gates.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEventCapModalOpen(false)}
                  className="border-[var(--border)] bg-[var(--surf)] text-[var(--text)]"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={savingEventCap} className="bg-[var(--pri)] text-[var(--primary-contrast)] font-bold">
                  {savingEventCap ? "Updating..." : "Update Capacity"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
