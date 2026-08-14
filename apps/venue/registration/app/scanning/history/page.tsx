"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Lock,
  X,
  Filter,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { fetchVenueNodeBootstrap } from "@/lib/node-workstation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ScanRow = {
  id: string;
  participant_id?: string | null;
  participant_name: string;
  regno: string;
  role?: string;
  company?: string;
  station_name?: string;
  station_id?: string | null;
  status: string;
  scan_type?: string;
  rejection_reason?: string | null;
  admin_overridden_by?: string | null;
  created_at?: string | null;
};

export default function ScanningHistoryPage() {
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stationId, setStationId] = useState<string | null>(null);
  const [stationName, setStationName] = useState("Assigned gate");

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  // Pagination & Row Selection states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Admin Override & Gate Reset Modal State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [targetRow, setTargetRow] = useState<ScanRow | null>(null);
  const [actionType, setActionType] = useState<"override" | "reset">("override");
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [overrideReason, setOverrideReason] = useState("Admin Gatekeeper Limit Override");
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    try {
      let assignedGate = stationId;
      if (!assignedGate) {
        const bootstrap = await fetchVenueNodeBootstrap().catch(() => null);
        if (bootstrap?.assignment?.mode === "scanning" && bootstrap.assignment.capacity_rule_id) {
          assignedGate = bootstrap.assignment.capacity_rule_id;
          setStationId(assignedGate);
        }
      }

      const params = new URLSearchParams({ limit: "1000" });
      if (assignedGate) params.set("station_id", assignedGate);
      const result = await apiClient.get<ScanRow[]>(`/venue/scanning/recent?${params.toString()}`);
      setRows(Array.isArray(result) ? result : []);
      const firstStation = result?.find((row) => row.station_name)?.station_name;
      if (firstStation) setStationName(firstStation);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load scan history.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(), 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inherit distinct roles dynamically from scan rows
  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.role && r.role.trim() !== "") {
        set.add(r.role.trim());
      }
    });
    return Array.from(set).sort();
  }, [rows]);

  // Overall KPIs (unfiltered)
  const kpis = useMemo(() => {
    const successful = rows.filter((row) => ["success", "admin_overridden"].includes(row.status)).length;
    const rejected = rows.filter((row) => row.status === "rejected").length;
    const overridden = rows.filter((row) => row.status === "admin_overridden").length;
    const lastScan = rows[0]?.created_at ? new Date(rows[0].created_at).toLocaleTimeString() : "No scans";
    return [
      { label: "Total scans", value: rows.length.toLocaleString(), icon: Activity, tone: "text-[var(--pri)] bg-[var(--pri)]/10" },
      { label: "Successful", value: successful.toLocaleString(), icon: CheckCircle2, tone: "text-emerald-500 bg-emerald-500/10" },
      { label: "Rejected", value: rejected.toLocaleString(), icon: AlertTriangle, tone: "text-red-500 bg-red-500/10" },
      { label: "Overrides", value: overridden.toLocaleString(), icon: ShieldCheck, tone: "text-amber-500 bg-amber-500/10" },
      { label: "Last scan", value: lastScan, icon: Clock, tone: "text-blue-500 bg-blue-500/10" },
    ];
  }, [rows]);

  // Filtered rows based on Search, Role, and Status
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (row.participant_name && row.participant_name.toLowerCase().includes(q)) ||
        (row.regno && row.regno.toLowerCase().includes(q)) ||
        (row.role && row.role.toLowerCase().includes(q)) ||
        (row.station_name && row.station_name.toLowerCase().includes(q)) ||
        (row.rejection_reason && row.rejection_reason.toLowerCase().includes(q)) ||
        (row.admin_overridden_by && row.admin_overridden_by.toLowerCase().includes(q));

      const matchesRole =
        roleFilter === "All" ||
        (row.role && row.role.toLowerCase() === roleFilter.toLowerCase());

      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "success" && ["success", "admin_overridden"].includes(row.status)) ||
        (statusFilter === "rejected" && row.status === "rejected") ||
        (statusFilter === "admin_overridden" && row.status === "admin_overridden");

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [rows, searchTerm, roleFilter, statusFilter]);

  // Paginated Rows
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredRows.slice(startIndex, startIndex + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, statusFilter, pageSize]);

  const hasActiveFilters = searchTerm !== "" || roleFilter !== "All" || statusFilter !== "All";

  const clearFilters = () => {
    setSearchTerm("");
    setRoleFilter("All");
    setStatusFilter("All");
    setCurrentPage(1);
  };

  // Row selection helpers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === paginatedRows.length && paginatedRows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedRows.map((r) => r.id)));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Open Admin Override / Reset Modal
  const openActionModal = (row: ScanRow, type: "override" | "reset") => {
    setTargetRow(row);
    setActionType(type);
    setAdminUsername("admin");
    setAdminPassword("");
    setOverrideReason(
      type === "override"
        ? `Admin Override Limit: ${row.rejection_reason || "Gate Capacity Reached"}`
        : "Reset Check-in Gate Status"
    );
    setAuthModalOpen(true);
  };

  // Submit Admin Override or Gate Reset Action
  const handleAuthorizeAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRow) return;
    if (!adminUsername || !adminPassword) {
      toast.error("Both Admin Username and Admin Password are required.");
      return;
    }

    setIsAuthorizing(true);
    try {
      const identifier = targetRow.participant_id || targetRow.regno;

      if (actionType === "override") {
        await apiClient.post("/venue/scanning/override-scan", {
          participant_id: identifier,
          station_id: targetRow.station_id || stationId || undefined,
          admin_username: adminUsername.trim(),
          admin_password: adminPassword,
          reason: overrideReason || "Admin Gatekeeper Limit Override",
        });
        toast.success(`Admin Override authorized for ${targetRow.participant_name} (${targetRow.regno}).`);
      } else {
        await apiClient.post("/venue/registration/checkin/reset", {
          participant_id: identifier,
          admin_username: adminUsername.trim(),
          admin_password: adminPassword,
        });
        toast.success(`Check-in gate reset successfully for ${targetRow.participant_name} (${targetRow.regno}).`);
      }

      setAuthModalOpen(false);
      setTargetRow(null);
      setAdminPassword("");
      await loadHistory();
    } catch (error: any) {
      toast.error(error?.message || `Failed to execute ${actionType} authorization.`);
    } finally {
      setIsAuthorizing(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden space-y-3">
      {/* Top Banner */}
      <section className="shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
              <History className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-500">Scanning mode</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--surf)] border border-[var(--border)] text-[9px] font-bold text-[var(--muted)]">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live 15s
                </span>
              </div>
              <h1 className="text-lg font-black tracking-tight text-[var(--text)] leading-tight">Gate Scan History</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={loadHistory}
              disabled={loading}
              className="h-9 gap-1.5 bg-[var(--pri)] text-xs font-black text-[var(--primary-contrast)] rounded-xl"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {/* KPI Cards Row */}
      <section className="shrink-0 grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">{label}</p>
              <span className={cn("grid size-7 place-items-center rounded-lg", tone)}>
                <Icon className="size-3.5" />
              </span>
            </div>
            <p className="mt-1.5 truncate text-lg font-black text-[var(--text)]">{value}</p>
          </div>
        ))}
      </section>

      {/* Table Container Card */}
      <section className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        {/* Search and Filters Toolbar */}
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surf)] p-3 flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-[var(--text)] uppercase tracking-wider">
              Scan Logs
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[var(--card)] border border-[var(--border)] text-[10px] font-bold text-[var(--muted)]">
              {filteredRows.length} {filteredRows.length === 1 ? "record" : "records"}
            </span>
            {selectedIds.size > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20 text-[10px] font-black uppercase">
                {selectedIds.size} Selected
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Dynamic Role Filter Dropdown */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--card)] text-[var(--text)] cursor-pointer focus:ring-1 focus:ring-[var(--pri)]"
            >
              <option value="All">All Roles ({rows.length})</option>
              {availableRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>

            {/* Status Filter Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--card)] text-[var(--text)] cursor-pointer focus:ring-1 focus:ring-[var(--pri)]"
            >
              <option value="All">All Statuses</option>
              <option value="success">Successful Scans</option>
              <option value="rejected">Rejected Scans</option>
              <option value="admin_overridden">Overrides Only</option>
            </select>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
              <Input
                className="pl-8 pr-7 h-9 bg-[var(--card)] border-[var(--border)] text-xs font-semibold focus:ring-1 focus:ring-[var(--pri)] rounded-xl"
                placeholder="Search Reg Code, Name, Gate..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] p-0.5"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="h-9 px-2.5 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)] rounded-xl"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Scrollable Table Viewport */}
        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
          <table className="w-full min-w-[960px] text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--surf)] border-b border-[var(--border)] text-[10px] font-black uppercase tracking-wider text-[var(--muted)] shadow-sm">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === paginatedRows.length && paginatedRows.length > 0}
                    onChange={handleToggleSelectAll}
                    className="size-3.5 rounded border-[var(--border)] accent-[var(--pri)] cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">Reg Code</th>
                <th className="px-4 py-3">Attendee Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Gate / Station</th>
                <th className="px-4 py-3">Check-In Time</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Reason / Override Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-medium">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-[var(--muted)] text-xs font-semibold">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="size-5 animate-spin text-[var(--pri)]" />
                      <span>Loading gate scan history...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-[var(--muted)] text-xs font-semibold">
                    {hasActiveFilters ? (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Filter className="size-5 opacity-40" />
                        <span>No scans match your active filters.</span>
                        <Button variant="outline" size="sm" onClick={clearFilters} className="mt-1 h-8 text-xs rounded-xl">
                          Reset Filters
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <History className="size-5 opacity-40" />
                        <span>No scans recorded for this gate yet.</span>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--raised)]/60 transition-colors">
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => handleToggleSelectRow(row.id)}
                        className="size-3.5 rounded border-[var(--border)] accent-[var(--pri)] cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono font-black text-[var(--text)]">{row.regno || "—"}</td>
                    <td className="px-4 py-3 font-bold text-[var(--text)]">
                      <div>{row.participant_name || "Unknown"}</div>
                      {row.company && <div className="text-[10px] text-[var(--muted)] font-normal">{row.company}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {row.role ? (
                        <span className="px-2 py-0.5 rounded-md bg-[var(--surf)] border border-[var(--border)] text-[10px] font-bold text-[var(--text)] uppercase">
                          {row.role}
                        </span>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{row.station_name || "—"}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[var(--muted)]">
                      {row.created_at ? new Date(row.created_at).toLocaleTimeString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {row.rejection_reason && (
                          <span className="text-red-500 font-semibold text-[11px] mr-1 truncate max-w-[200px]" title={row.rejection_reason}>
                            {row.rejection_reason}
                          </span>
                        )}
                        {row.admin_overridden_by && (
                          <span className="text-amber-500 font-semibold text-[11px] mr-1">
                            By {row.admin_overridden_by}
                          </span>
                        )}

                        {/* Action Buttons for Override / Reset */}
                        {row.status === "rejected" && (
                          <Button
                            size="sm"
                            onClick={() => openActionModal(row, "override")}
                            className="h-7 px-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[10px] rounded-lg shadow-sm gap-1"
                            title="Authorize Admin Override for this gate limit"
                          >
                            <ShieldAlert className="size-3" /> Override Gate
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openActionModal(row, "reset")}
                          className="h-7 px-2.5 border-[var(--border)] bg-[var(--surf)] hover:bg-[var(--raised)] text-[var(--text)] font-extrabold text-[10px] rounded-lg gap-1"
                          title="Reset / clear check-in gate record"
                        >
                          <RotateCcw className="size-3 text-amber-500" /> Reset Gate
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Standard Pagination */}
        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surf)] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-black uppercase text-[var(--muted)]">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs font-bold text-[var(--text)] cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-[11px] text-[var(--muted)] font-bold">
              Showing {filteredRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{" "}
              {Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length} scans
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 px-3 rounded-lg text-xs font-bold gap-1"
            >
              <ChevronLeft className="size-3.5" /> Prev
            </Button>
            <span className="text-xs font-black px-2 text-[var(--text)]">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage >= totalPages || loading}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-3 rounded-lg text-xs font-bold gap-1"
            >
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Admin Authorization Modal for Override & Gate Reset */}
      {authModalOpen && targetRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "size-10 rounded-xl flex items-center justify-center font-black shrink-0",
                  actionType === "override" ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-500"
                )}>
                  <Lock className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">
                    {actionType === "override" ? "Admin Gate Override" : "Reset Check-In Gate"}
                  </h3>
                  <p className="text-xs text-[var(--muted)]">Admin credentials required to authorize gate action</p>
                </div>
              </div>
              <button
                onClick={() => setAuthModalOpen(false)}
                className="size-8 rounded-lg text-[var(--muted)] hover:text-[var(--text)] grid place-items-center"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Target Information Card */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[var(--muted)] font-bold">Delegate:</span>
                <span className="font-black text-[var(--text)]">{targetRow.participant_name} ({targetRow.regno})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)] font-bold">Gate / Station:</span>
                <span className="font-bold text-[var(--text)]">{targetRow.station_name || "Assigned Gate"}</span>
              </div>
              {targetRow.rejection_reason && (
                <div className="flex justify-between text-red-500 font-semibold">
                  <span>Rejection:</span>
                  <span className="truncate max-w-[220px]">{targetRow.rejection_reason}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleAuthorizeAction} className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-[var(--muted)]">Admin Username</label>
                  <Input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="e.g. admin"
                    required
                    className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-[var(--muted)]">Admin Password</label>
                  <Input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter admin password..."
                    required
                    className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)]"
                  />
                </div>

                {actionType === "override" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase text-[var(--muted)]">Override Reason / Note</label>
                    <Input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="e.g. Authorized by Chief Organizer"
                      className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)]"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAuthModalOpen(false)}
                  className="h-10 px-4 text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isAuthorizing || !adminPassword}
                  className={cn(
                    "h-10 px-5 text-white font-extrabold text-xs shadow-md gap-1.5",
                    actionType === "override" ? "bg-amber-500 hover:bg-amber-600" : "bg-red-600 hover:bg-red-700"
                  )}
                >
                  {isAuthorizing ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" /> Verifying...
                    </>
                  ) : actionType === "override" ? (
                    <>
                      <ShieldCheck className="size-3.5" /> Authorize Override
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-3.5" /> Confirm Reset Gate
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isSuccess = status === "success";
  const isOverride = status === "admin_overridden";
  const tone = isSuccess
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
    : isOverride
    ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
    : "border-red-500/30 bg-red-500/10 text-red-500";

  const label = isSuccess ? "Passed" : isOverride ? "Overridden" : status === "rejected" ? "Rejected" : status || "Unknown";

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider", tone)}>
      {isSuccess && <CheckCircle2 className="size-2.5 stroke-[3]" />}
      {isOverride && <ShieldCheck className="size-2.5 stroke-[3]" />}
      {!isSuccess && !isOverride && <AlertTriangle className="size-2.5 stroke-[3]" />}
      {label}
    </span>
  );
}
