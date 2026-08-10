"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Package, Plus, RefreshCw, Search, Box, Edit3, Trash2,
  CheckCircle2, X, AlertCircle, Shield, Check, Hash
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface KitItem {
  id: string;
  kit_name: string;
  category: string;
  total_quantity: number;
  distributed_quantity: number;
  remaining_quantity: number;
  max_per_participant: number;
  description?: string;
  target_roles?: string[];
}

export default function AdminKitsPage() {
  const [kits, setKits] = useState<KitItem[]>([]);
  const [kpis, setKpis] = useState({
    total_available: 0,
    total_distributed: 0,
    total_remaining: 0,
    total_types: 0
  });
  const [loading, setLoading] = useState(true);
  const [availableRoles, setAvailableRoles] = useState<string[]>([
    "VIP Guest", "Exhibitor", "Organizer", "Delegate", "Media", "Student Delegate", "Speaker", "Sponsor Representative", "Technical Staff"
  ]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");

  // Add Kit Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKitName, setNewKitName] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [newQuantity, setNewQuantity] = useState("500");
  const [newMaxPerParticipant, setNewMaxPerParticipant] = useState("1");
  const [newDescription, setNewDescription] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["All"]);
  const [addingKit, setAddingKit] = useState(false);

  // Edit Kit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingKit, setEditingKit] = useState<KitItem | null>(null);
  const [editKitName, setEditKitName] = useState("");
  const [editCategory, setEditCategory] = useState("General");
  const [editQuantity, setEditQuantity] = useState("500");
  const [editMaxPerParticipant, setEditMaxPerParticipant] = useState("1");
  const [editDescription, setEditDescription] = useState("");
  const [editSelectedRoles, setEditSelectedRoles] = useState<string[]>(["All"]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Deleting State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch Kit Summary Data + Participant Roles
  const loadKitsData = async () => {
    try {
      setLoading(true);
      const [kitsRes, partRes]: [any, any] = await Promise.all([
        apiClient.get("/venue/registration/kits/summary"),
        apiClient.get("/venue/registration/participants?limit=5000")
      ]);

      if (kitsRes) {
        setKpis(kitsRes.kpis || { total_available: 0, total_distributed: 0, total_remaining: 0, total_types: 0 });
        setKits(kitsRes.kits || []);
      }

      const pItems = partRes?.items || [];
      const rolesSet = new Set<string>();
      pItems.forEach((p: any) => {
        if (p.role) rolesSet.add(p.role.trim());
      });
      if (rolesSet.size > 0) {
        setAvailableRoles(Array.from(rolesSet).sort());
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load kit catalogue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKitsData();
  }, []);

  // Filtered Kits for 3-Column Catalogue Grid
  const filteredKits = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return kits;
    return kits.filter(
      (k) =>
        k.kit_name.toLowerCase().includes(q) ||
        k.category.toLowerCase().includes(q) ||
        (k.description && k.description.toLowerCase().includes(q))
    );
  }, [kits, searchQuery]);

  // Handle Role Checkbox Toggle for Add Modal
  const toggleRoleSelection = (role: string) => {
    if (role === "All") {
      setSelectedRoles(["All"]);
      return;
    }

    let next = selectedRoles.filter((r) => r !== "All");
    if (next.includes(role)) {
      next = next.filter((r) => r !== role);
    } else {
      next.push(role);
    }

    if (next.length === 0) next = ["All"];
    setSelectedRoles(next);
  };

  // Handle Role Checkbox Toggle for Edit Modal
  const toggleEditRoleSelection = (role: string) => {
    if (role === "All") {
      setEditSelectedRoles(["All"]);
      return;
    }

    let next = editSelectedRoles.filter((r) => r !== "All");
    if (next.includes(role)) {
      next = next.filter((r) => r !== role);
    } else {
      next.push(role);
    }

    if (next.length === 0) next = ["All"];
    setEditSelectedRoles(next);
  };

  // Submit Create Kit
  const handleCreateKitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKitName.trim()) {
      toast.error("Kit Name is required.");
      return;
    }
    const qty = parseInt(newQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Total quantity must be greater than 0.");
      return;
    }
    const maxPerPerson = parseInt(newMaxPerParticipant);
    if (isNaN(maxPerPerson) || maxPerPerson <= 0) {
      toast.error("Max kits allowed per delegate must be at least 1.");
      return;
    }

    try {
      setAddingKit(true);
      await apiClient.post("/venue/registration/kits", {
        kit_name: newKitName.trim(),
        category: newCategory,
        total_quantity: qty,
        max_per_participant: maxPerPerson,
        description: newDescription.trim(),
        target_roles: selectedRoles
      });

      toast.success(`New Kit '${newKitName}' created successfully!`);
      setShowAddModal(false);
      setNewKitName("");
      setNewDescription("");
      setNewQuantity("500");
      setNewMaxPerParticipant("1");
      setSelectedRoles(["All"]);
      loadKitsData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to create kit.");
    } finally {
      setAddingKit(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (kit: KitItem) => {
    setEditingKit(kit);
    setEditKitName(kit.kit_name);
    setEditCategory(kit.category || "General");
    setEditQuantity(String(kit.total_quantity));
    setEditMaxPerParticipant(String(kit.max_per_participant || 1));
    setEditDescription(kit.description || "");
    setEditSelectedRoles(kit.target_roles || ["All"]);
    setShowEditModal(true);
  };

  // Submit Edit Kit
  const handleEditKitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKit) return;
    if (!editKitName.trim()) {
      toast.error("Kit Name is required.");
      return;
    }
    const qty = parseInt(editQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Total quantity must be greater than 0.");
      return;
    }
    const maxPerPerson = parseInt(editMaxPerParticipant);
    if (isNaN(maxPerPerson) || maxPerPerson <= 0) {
      toast.error("Max kits allowed per delegate must be at least 1.");
      return;
    }

    try {
      setSavingEdit(true);
      await apiClient.put(`/venue/registration/kits/${editingKit.id}`, {
        kit_name: editKitName.trim(),
        category: editCategory,
        total_quantity: qty,
        max_per_participant: maxPerPerson,
        description: editDescription.trim(),
        target_roles: editSelectedRoles
      });

      toast.success(`Kit '${editKitName}' updated successfully!`);
      setShowEditModal(false);
      setEditingKit(null);
      loadKitsData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to update kit.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Delete Kit
  const handleDeleteKit = async (kit: KitItem) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete '${kit.kit_name}' from the catalogue?`);
    if (!confirmDelete) return;

    try {
      setDeletingId(kit.id);
      await apiClient.delete(`/venue/registration/kits/${kit.id}`);
      toast.success(`Kit '${kit.kit_name}' deleted.`);
      loadKitsData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to delete kit.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 w-full pb-10">
      
      {/* Top Header */}
      <div className="bg-[var(--card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
            <Package className="w-6 h-6 text-[var(--pri)]" /> Event Kit Management Catalogue
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Configure event intake kits, assign role restrictions, and enforce per-delegate claim limits</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={loadKitsData} disabled={loading} className="h-10 px-4 border-[var(--border)] bg-[var(--surf)] text-[var(--text)] hover:bg-[var(--raised)]">
            <RefreshCw className={cn("w-4 h-4 mr-1.5", loading && "animate-spin")} /> Refresh
          </Button>

          <Button onClick={() => setShowAddModal(true)} className="bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 font-bold h-10 px-5 rounded-xl shadow-md gap-2">
            <Plus className="w-4 h-4" /> Add New Kit Type
          </Button>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm space-y-1">
          <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Total Available</span>
          <div className="text-2xl font-black text-[var(--text)]">{kpis.total_available.toLocaleString()}</div>
          <p className="text-xs text-[var(--muted)] font-medium">In catalog inventory</p>
        </div>

        <div className="p-5 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm space-y-1">
          <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Total Distributed</span>
          <div className="text-2xl font-black text-emerald-500">{kpis.total_distributed.toLocaleString()}</div>
          <p className="text-xs text-[var(--muted)] font-medium">Issued to participants</p>
        </div>

        <div className="p-5 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm space-y-1">
          <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Remaining Stock</span>
          <div className="text-2xl font-black text-[var(--text)]">{kpis.total_remaining.toLocaleString()}</div>
          <p className="text-xs text-[var(--muted)] font-medium">Ready for issuance</p>
        </div>

        <div className="p-5 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm space-y-1">
          <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Kit Types</span>
          <div className="text-2xl font-black text-[var(--text)]">{kpis.total_types}</div>
          <p className="text-xs text-[var(--muted)] font-medium">Configured categories</p>
        </div>
      </div>

      {/* Control & Search Bar */}
      <div className="bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)] shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <Input
            className="pl-10 h-10 bg-[var(--surf)] border-[var(--border)] text-[var(--text)] text-xs font-semibold placeholder:text-[var(--muted)]"
            placeholder="Search kits by name, category, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <span className="text-xs font-semibold text-[var(--muted)]">{filteredKits.length} kit types configured</span>
      </div>

      {/* 3-Column Catalogue Grid as Requested */}
      <div className="space-y-4">
        <h3 className="text-xs font-black text-[var(--text)] uppercase tracking-wider">Kit Inventory Catalogue (3-Column View)</h3>

        {loading ? (
          <div className="py-20 text-center text-[var(--muted)] bg-[var(--card)] rounded-2xl border border-[var(--border)]">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[var(--pri)] mb-2" />
            Loading kit catalogue...
          </div>
        ) : filteredKits.length === 0 ? (
          <div className="py-20 text-center text-[var(--muted)] bg-[var(--card)] rounded-2xl border border-[var(--border)] space-y-3">
            <Package className="w-10 h-10 text-[var(--muted)] mx-auto" />
            <p className="font-bold text-sm text-[var(--text)]">No kit types created yet.</p>
            <Button onClick={() => setShowAddModal(true)} className="bg-[var(--pri)] text-[var(--primary-contrast)] text-xs font-bold">
              <Plus className="w-4 h-4 mr-1" /> Add First Kit
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {filteredKits.map((kit) => {
              const remaining = kit.remaining_quantity ?? Math.max(0, kit.total_quantity - kit.distributed_quantity);
              const pct = kit.total_quantity > 0 ? Math.round((kit.distributed_quantity / kit.total_quantity) * 100) : 0;
              const roles = kit.target_roles || ["All"];
              const maxAllowed = kit.max_per_participant || 1;

              return (
                <div key={kit.id} className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm p-6 space-y-4 flex flex-col justify-between hover:border-[var(--pri)] transition-all">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="p-3 rounded-xl bg-[var(--surf)] border border-[var(--border)] text-[var(--text)]">
                        <Box className="w-5 h-5" />
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full bg-[var(--raised)] text-[var(--text)] border border-[var(--border)]">
                          {kit.category || "General"}
                        </span>

                        <span className="px-2 py-1 text-[10px] font-bold uppercase rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" title="Max claim allowance per participant">
                          Max {maxAllowed}/person
                        </span>
                        
                        {/* Edit Action Button */}
                        <button
                          onClick={() => handleOpenEditModal(kit)}
                          title="Edit Kit"
                          className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--pri)] transition-all cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Action Button */}
                        <button
                          onClick={() => handleDeleteKit(kit)}
                          disabled={deletingId === kit.id}
                          title="Delete Kit"
                          className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-red-500 hover:border-red-500 transition-all cursor-pointer"
                        >
                          <Trash2 className={cn("w-3.5 h-3.5", deletingId === kit.id && "animate-spin")} />
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-[var(--text)]">{kit.kit_name}</h4>
                      <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{kit.description || "Official Event Package Kit"}</p>
                    </div>

                    {/* Target Roles Badges */}
                    <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase text-[var(--muted)] block">Assigned Roles:</span>
                      <div className="flex flex-wrap gap-1">
                        {roles.map((role) => (
                          <span key={role} className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-[var(--raised)] border border-[var(--border)] text-[var(--text)]">
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Quantity Breakdown & Progress Bar */}
                  <div className="space-y-2 pt-4 border-t border-[var(--border)]">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-[var(--muted)]">Distributed: {kit.distributed_quantity} / {kit.total_quantity}</span>
                      <span className="text-[var(--text)]">{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-[var(--raised)] rounded-full overflow-hidden border border-[var(--border)]">
                      <div className="h-full bg-[var(--pri)] transition-all duration-300 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-[11px] text-[var(--muted)] font-semibold pt-1">
                      <span>Stock: {kit.total_quantity}</span>
                      <span className="text-emerald-500 font-bold">Remaining: {remaining}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Kit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[var(--pri)]" /> Create Event Kit Catalogue Item
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-[var(--muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateKitSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1">Kit Name *</label>
                <Input
                  required
                  value={newKitName}
                  onChange={(e) => setNewKitName(e.target.value)}
                  placeholder="e.g. Delegate Welcome Kit, VIP Gift Box"
                  className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--surf)] text-[var(--text)]"
                  >
                    <option value="General">General</option>
                    <option value="VIP">VIP / Speaker</option>
                    <option value="Exhibitor">Exhibitor</option>
                    <option value="Sponsor">Sponsor</option>
                    <option value="Media">Media</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Total Stock *</label>
                  <Input
                    type="number"
                    required
                    min={1}
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Max / Delegate *</label>
                  <Input
                    type="number"
                    required
                    min={1}
                    value={newMaxPerParticipant}
                    onChange={(e) => setNewMaxPerParticipant(e.target.value)}
                    className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                  />
                </div>
              </div>

              {/* Target Roles Checkboxes */}
              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1.5">Assign to Roles (Target Category)</label>
                <div className="p-3 bg-[var(--surf)] border border-[var(--border)] rounded-xl space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes("All")}
                      onChange={() => toggleRoleSelection("All")}
                      className="rounded border-[var(--border)] text-[var(--pri)] accent-[var(--pri)]"
                    />
                    <span>All Participant Roles (Universal Kit)</span>
                  </label>

                  {availableRoles.map((role) => (
                    <label key={role} className="flex items-center gap-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role)}
                        onChange={() => toggleRoleSelection(role)}
                        className="rounded border-[var(--border)] text-[var(--pri)] accent-[var(--pri)]"
                      />
                      <span>{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1">Kit Description / Bag Contents</label>
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="e.g. Conference badge, program booklet, pen, branded water bottle"
                  className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)} className="border-[var(--border)] bg-[var(--surf)] text-[var(--text)]">
                  Cancel
                </Button>
                <Button type="submit" disabled={addingKit} className="bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 font-bold">
                  {addingKit ? "Creating Kit..." : "Create Kit"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Kit Modal */}
      {showEditModal && editingKit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[var(--pri)]" /> Edit Event Kit Catalogue Item
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-[var(--muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditKitSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1">Kit Name *</label>
                <Input
                  required
                  value={editKitName}
                  onChange={(e) => setEditKitName(e.target.value)}
                  placeholder="e.g. Delegate Welcome Kit, VIP Gift Box"
                  className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--surf)] text-[var(--text)]"
                  >
                    <option value="General">General</option>
                    <option value="VIP">VIP / Speaker</option>
                    <option value="Exhibitor">Exhibitor</option>
                    <option value="Sponsor">Sponsor</option>
                    <option value="Media">Media</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Total Stock *</label>
                  <Input
                    type="number"
                    required
                    min={1}
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Max / Delegate *</label>
                  <Input
                    type="number"
                    required
                    min={1}
                    value={editMaxPerParticipant}
                    onChange={(e) => setEditMaxPerParticipant(e.target.value)}
                    className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                  />
                </div>
              </div>

              {/* Target Roles Checkboxes for Edit */}
              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1.5">Assign to Roles (Target Category)</label>
                <div className="p-3 bg-[var(--surf)] border border-[var(--border)] rounded-xl space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editSelectedRoles.includes("All")}
                      onChange={() => toggleEditRoleSelection("All")}
                      className="rounded border-[var(--border)] text-[var(--pri)] accent-[var(--pri)]"
                    />
                    <span>All Participant Roles (Universal Kit)</span>
                  </label>

                  {availableRoles.map((role) => (
                    <label key={role} className="flex items-center gap-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editSelectedRoles.includes(role)}
                        onChange={() => toggleEditRoleSelection(role)}
                        className="rounded border-[var(--border)] text-[var(--pri)] accent-[var(--pri)]"
                      />
                      <span>{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1">Kit Description / Bag Contents</label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="e.g. Conference badge, program booklet, pen, branded water bottle"
                  className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)} className="border-[var(--border)] bg-[var(--surf)] text-[var(--text)]">
                  Cancel
                </Button>
                <Button type="submit" disabled={savingEdit} className="bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 font-bold">
                  {savingEdit ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
