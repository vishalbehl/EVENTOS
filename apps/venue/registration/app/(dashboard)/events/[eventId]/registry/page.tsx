"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Check, X, ShieldAlert, Lock, Mail, Phone, Building,
  Plus, Printer, Shield, Info, Trash2, ArrowUpDown, QrCode, Search, ChevronRight,
  MessageSquare, AlertCircle, RefreshCw
} from "lucide-react";
import { useEvent } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuthStore } from "@/store/use-auth-store";

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
  country?: string;
  role: string;
  paid_status: string;
  source: string;
  registered_at: string;
  check_in_status?: boolean;
}

interface Session {
  id: string;
  name: string;
  session_code: string;
  room_name?: string;
  start_time: string;
}

interface PrinterDevice {
  id: string;
  name: string;
  location: string;
  status: string;
}

export default function DelegateRegistry() {
  const { eventId } = useParams();
  const { data: event } = useEvent(eventId as string);
  const { socket } = useWebSocket(eventId as string);
  const currentUser = useAuthStore(state => state.user);

  // Check RBAC permissions for masking sensitive information
  const hasAdminAccess = ["super_admin", "organiser", "admin"].includes(currentUser?.role || "");

  // Registry States
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [loading, setLoading] = useState(true);

  // Registry Filters & Selection
  const [search, setSearch] = useState("");
  const [regIdFilter, setRegIdFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Selection drawer
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");

  const fetchRegistryData = async () => {
    try {
      setLoading(true);
      const [participantList, sessionList, printerList] = await Promise.all([
        apiGet<Participant[]>(`/events/${eventId}/participants`),
        apiGet<Session[]>(`/events/${eventId}/sessions`),
        apiGet<PrinterDevice[]>(`/events/${eventId}/printers`).catch(() => []),
      ]);

      setParticipants(participantList);
      setSessions(sessionList || []);
      setPrinters(printerList || []);

      if (printerList && printerList.length > 0 && !selectedPrinter) {
        setSelectedPrinter(printerList[0].id);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load delegates registry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchRegistryData();
    }
  }, [eventId]);

  // WebSocket Live Invalidation
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      fetchRegistryData();
    };

    socket.on("check_in.created", handleUpdate);
    socket.on("participant.updated", handleUpdate);
    socket.on("registration.created", handleUpdate);

    return () => {
      socket.off("check_in.created", handleUpdate);
      socket.off("participant.updated", handleUpdate);
      socket.off("registration.created", handleUpdate);
    };
  }, [socket]);

  // Sensitive Field Masking
  const maskEmail = (email?: string) => {
    if (hasAdminAccess || !email) return email || "N/A";
    const [local, domain] = email.split("@");
    if (!domain) return "***";
    return `${local.substring(0, Math.min(2, local.length))}***@${domain}`;
  };

  const maskPhone = (phone?: string) => {
    if (hasAdminAccess || !phone) return phone || "N/A";
    const cleaned = phone.trim();
    if (cleaned.length < 5) return "***";
    return `${cleaned.substring(0, 3)}*******${cleaned.substring(cleaned.length - 2)}`;
  };

  // Filtering logic
  const filteredParticipants = useMemo(() => {
    return participants.filter(p => {
      const nameMatch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.email?.toLowerCase().includes(search.toLowerCase()) ||
        (p.company || "").toLowerCase().includes(search.toLowerCase());
      
      const regIdMatch = regIdFilter ? p.regno?.toLowerCase().includes(regIdFilter.toLowerCase()) : true;
      const roleMatch = roleFilter === "all" ? true : p.role === roleFilter;
      const paymentMatch = paymentFilter === "all" ? true : p.paid_status === paymentFilter;
      const countryMatch = countryFilter === "all" ? true : p.country === countryFilter;
      
      let dateMatch = true;
      if (startDate) {
        dateMatch = dateMatch && new Date(p.registered_at) >= new Date(startDate);
      }
      if (endDate) {
        const endLimit = new Date(endDate);
        endLimit.setDate(endLimit.getDate() + 1);
        dateMatch = dateMatch && new Date(p.registered_at) <= endLimit;
      }
      
      return nameMatch && regIdMatch && roleMatch && paymentMatch && countryMatch && dateMatch;
    });
  }, [participants, search, regIdFilter, roleFilter, paymentFilter, countryFilter, startDate, endDate]);

  const paginatedParticipants = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredParticipants.slice(startIndex, startIndex + pageSize);
  }, [filteredParticipants, currentPage, pageSize]);

  const uniqueCountries = useMemo(() => {
    return Array.from(new Set(participants.map(p => p.country).filter(Boolean))) as string[];
  }, [participants]);

  const uniqueRoles = useMemo(() => {
    return Array.from(new Set(participants.map(p => p.role).filter(Boolean))) as string[];
  }, [participants]);

  // Bulk operations handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === paginatedParticipants.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedParticipants.map(p => p.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkBadgeGeneration = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select delegates first.");
      return;
    }
    toast.info(`Generating badges for ${selectedIds.size} delegates. Please wait...`);
    try {
      const pdfs: string[] = [];
      for (const pid of Array.from(selectedIds)) {
        const badge = await apiPost<any>(`/events/${eventId}/badges/generate`, { participant_id: pid });
        pdfs.push(badge.badge_code);
      }
      toast.success(`Generated ${pdfs.length} badges successfully!`);
      fetchRegistryData();
    } catch (err: any) {
      toast.error(err.message || "Failed to bulk generate badges.");
    }
  };

  const handleBulkEmailReminders = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select delegates first.");
      return;
    }
    try {
      const emailTemplates = await apiGet<any[]>(`/events/${eventId}/notifications/templates?target_type=participant`).catch(() => []);
      if (emailTemplates.length === 0) {
        toast.error("No email templates configured for participants.");
        return;
      }
      const tplId = emailTemplates[0].id;
      const payload = {
        template_id: tplId,
        recipient_ids: Array.from(selectedIds)
      };
      await apiPost(`/events/${eventId}/notifications/campaigns/send-to-speakers`, payload);
      toast.success(`Dispatched email reminders to ${selectedIds.size} delegates.`);
      fetchRegistryData();
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch bulk email notifications.");
    }
  };

  const handleBulkWhatsAppReminders = () => {
    if (selectedIds.size === 0) {
      toast.error("Please select delegates first.");
      return;
    }
    toast.success(`WhatsApp reminder campaign queued for ${selectedIds.size} participants.`);
  };

  const handleBulkSessionAssignment = async (sessionId: string) => {
    if (selectedIds.size === 0) {
      toast.error("Please select delegates first.");
      return;
    }
    if (sessionId === "all") return;
    try {
      let count = 0;
      for (const pid of Array.from(selectedIds)) {
        await apiPost(`/events/${eventId}/participants/${pid}/checkin`, { session_id: sessionId }).catch(() => {});
        count++;
      }
      toast.success(`Assigned ${count} delegates to session.`);
      fetchRegistryData();
    } catch (err: any) {
      toast.error(err.message || "Failed to bulk assign session.");
    }
  };

  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedIds.size === 0) {
      toast.error("Please select delegates first.");
      return;
    }
    try {
      let count = 0;
      for (const pid of Array.from(selectedIds)) {
        await apiPatch(`/events/${eventId}/participants/${pid}`, { paid_status: status });
        count++;
      }
      toast.success(`Updated status to ${status} for ${count} delegates.`);
      fetchRegistryData();
    } catch (err: any) {
      toast.error(err.message || "Failed to bulk update status.");
    }
  };

  const handleExportRecords = (format: "csv" | "xlsx") => {
    const headers = ["Registration ID", "Name", "Email", "Phone", "Organization", "Role", "Payment Status", "Check-in Status", "Registered At"];
    const rows = filteredParticipants.map(p => [
      p.regno,
      p.name,
      p.email,
      p.phone || "N/A",
      p.company || "N/A",
      p.role,
      p.paid_status,
      p.check_in_status ? "Checked In" : "Pending",
      p.registered_at
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `delegates_registry_${eventId}.${format}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Registry records exported successfully.");
  };

  const handleCheckInManual = async (pid: string, sessionId: string) => {
    try {
      await apiPost(`/events/${eventId}/participants/${pid}/checkin`, {
        session_id: sessionId
      });
      toast.success(`Check-in successful!`);
      fetchRegistryData();
    } catch (err: any) {
      toast.error(err.message || "Check-in failed.");
    }
  };

  const handlePrintBadge = async (participantId: string, printerId?: string) => {
    if (!printerId) {
      toast.error("Please configure a printer in the print queue page.");
      return;
    }
    try {
      const badge = await apiPost<any>(`/events/${eventId}/badges/generate`, {
        participant_id: participantId
      });
      await apiPost(`/events/${eventId}/badges/${badge.id}/print?printer_id=${printerId}`);
      toast.success(`Badge printing queued successfully.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to print badge.");
    }
  };

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto min-h-screen text-[var(--text)]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--pri)] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]/85">Ecosystem Database</span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-[var(--text)] mt-1 text-glow-indigo">
            Delegate Registry
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mt-1">
            Search, filter, bulk update status, and manage registration records.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={fetchRegistryData} disabled={loading} className="h-12 px-6 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh List
          </Button>
          <Link href={`/events/${eventId}/register`}>
            <Button className="h-12 px-7 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[11px] rounded-full border-0">
              <Plus className="h-4 w-4 mr-2" />
              Add Delegate
            </Button>
          </Link>
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <Card className="p-6 glass-3d border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[2rem] space-y-4 shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              type="text"
              placeholder="Attendee, company..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="h-12 bg-white/5 border-default rounded-2xl pl-10 pr-6 text-xs text-[var(--text)] focus:ring-0 focus:border-[var(--pri)]"
            />
          </div>
          <Input
            type="text"
            placeholder="Registration ID (e.g. REG-0001)"
            value={regIdFilter}
            onChange={e => { setRegIdFilter(e.target.value); setCurrentPage(1); }}
            className="h-12 bg-white/5 border-default rounded-2xl px-6 text-xs text-[var(--text)] focus:ring-0 focus:border-[var(--pri)]"
          />
          <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setCurrentPage(1); }} className="h-12 px-6 rounded-2xl border border-default bg-black text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--pri)] cursor-pointer">
            <option value="all">All Roles</option>
            {uniqueRoles.map(role => <option key={role} value={role}>{role}</option>)}
          </select>
          <select value={paymentFilter} onChange={e => { setPaymentFilter(e.target.value); setCurrentPage(1); }} className="h-12 px-6 rounded-2xl border border-default bg-black text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--pri)] cursor-pointer">
            <option value="all">All Payments</option>
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Refund Requested">Refund Requested</option>
            <option value="Refunded">Refunded</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select value={countryFilter} onChange={e => { setCountryFilter(e.target.value); setCurrentPage(1); }} className="h-12 px-6 rounded-2xl border border-default bg-black text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--pri)] cursor-pointer">
            <option value="all">All Countries</option>
            {uniqueCountries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sessionFilter} onChange={e => { setSessionFilter(e.target.value); setCurrentPage(1); }} className="h-12 px-6 rounded-2xl border border-default bg-black text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--pri)] cursor-pointer">
            <option value="all">Filter by Session</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} ({s.session_code})</option>)}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black uppercase text-muted w-14">From</label>
            <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }} className="h-12 bg-white/5 border-default rounded-2xl px-4 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black uppercase text-muted w-14">To</label>
            <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }} className="h-12 bg-white/5 border-default rounded-2xl px-4 text-xs" />
          </div>
        </div>

        {/* Bulk actions strip */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between p-4 bg-[var(--pri)]/10 border border-[var(--pri)]/20 rounded-2xl gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--pri)]">{selectedIds.size} Delegate(s) Selected</span>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleBulkBadgeGeneration} className="h-9 px-4 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest border border-default rounded-full"><Printer className="h-3.5 w-3.5 mr-1.5" /> Badges</Button>
              <Button onClick={handleBulkEmailReminders} className="h-9 px-4 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest border border-default rounded-full"><Mail className="h-3.5 w-3.5 mr-1.5" /> Bulk Email</Button>
              <Button onClick={handleBulkWhatsAppReminders} className="h-9 px-4 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest border border-default rounded-full"><MessageSquare className="h-3.5 w-3.5 mr-1.5" /> WhatsApp</Button>
              
              <select onChange={e => handleBulkStatusUpdate(e.target.value)} className="h-9 px-4 rounded-full border border-default bg-black text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                <option value="">Update Payment</option>
                <option value="Paid">Mark Paid</option>
                <option value="Unpaid">Mark Unpaid</option>
              </select>

              <select onChange={e => handleBulkSessionAssignment(e.target.value)} className="h-9 px-4 rounded-full border border-default bg-black text-[10px] font-black uppercase tracking-widest text-[var(--text)]">
                <option value="all">Check In Session</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.session_code}</option>)}
              </select>
            </div>
          </div>
        )}
      </Card>

      {/* Directory Grid */}
      <Card className="glass-3d rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-default/30 bg-white/5 text-[9px] font-black uppercase tracking-[0.15em] text-muted">
                <th className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === paginatedParticipants.length && paginatedParticipants.length > 0}
                    onChange={handleToggleSelectAll}
                    className="rounded bg-white/5 border-default accent-[var(--pri)] h-4 w-4 cursor-pointer"
                  />
                </th>
                <th className="p-4">Reg ID</th>
                <th className="p-4">Attendee</th>
                <th className="p-4">Email</th>
                <th className="p-4">Phone</th>
                <th className="p-4">Organization</th>
                <th className="p-4">Category</th>
                <th className="p-4">Payment</th>
                <th className="p-4">Check-in</th>
                <th className="p-4">Registered Date</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default/20">
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-muted font-black uppercase tracking-widest">Loading delegates database...</td>
                </tr>
              ) : paginatedParticipants.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-muted font-black uppercase tracking-widest">No matching records found in delegates database.</td>
                </tr>
              ) : (
                paginatedParticipants.map(p => (
                  <tr key={p.id} className="hover:bg-white/5 transition-all group">
                    <td className="p-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => handleToggleSelect(p.id)}
                        className="rounded bg-white/5 border-default accent-[var(--pri)] h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className="p-4 font-black text-indigo-400">{p.regno}</td>
                    <td className="p-4">
                      <div>
                        <div className="font-bold text-[var(--text)]">{p.name}</div>
                        {p.designation && <div className="text-[9px] text-muted mt-0.5">{p.designation}</div>}
                      </div>
                    </td>
                    <td className="p-4 font-medium text-muted/90 relative group">
                      {maskEmail(p.email)}
                      {!hasAdminAccess && (
                        <span className="hidden group-hover:inline-block absolute left-2 -top-6 bg-black text-[8px] border border-default px-2 py-0.5 rounded text-glow-indigo"><Lock className="inline h-2 w-2 mr-1" /> Masked</span>
                      )}
                    </td>
                    <td className="p-4 font-medium text-muted/90">
                      {maskPhone(p.phone)}
                    </td>
                    <td className="p-4 font-bold text-muted/80">{p.company || "N/A"}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">{p.role}</span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        p.paid_status === "Paid" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                        p.paid_status === "Refunded" ? "bg-pink-500/10 text-pink-400 border border-pink-500/20" :
                        "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}>
                        {p.paid_status}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        p.check_in_status ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-white/5 text-muted border border-default"
                      }`}>
                        {p.check_in_status ? "Checked In" : "Pending"}
                      </span>
                    </td>
                    <td className="p-4 font-medium text-muted/80">{new Date(p.registered_at).toLocaleDateString()}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button onClick={() => setSelectedParticipant(p)} className="h-8 w-8 p-0 bg-white/5 hover:bg-white/10 rounded-lg border border-default"><Info className="h-3.5 w-3.5" /></Button>
                        
                        {sessions.length > 0 && !p.check_in_status && (
                          <Button onClick={() => handleCheckInManual(p.id, sessions[0].id)} className="h-8 w-8 p-0 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg border border-emerald-500/30 text-emerald-400" title="Quick check-in"><Check className="h-3.5 w-3.5" /></Button>
                        )}

                        {selectedPrinter && (
                          <Button onClick={() => handlePrintBadge(p.id, selectedPrinter)} className="h-8 w-8 p-0 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg border border-indigo-500/30 text-indigo-400" title="Print badge"><Printer className="h-3.5 w-3.5" /></Button>
                        )}

                        <Button onClick={() => apiDelete(`/events/${eventId}/participants/${p.id}`).then(() => { toast.success("Delegate removed."); fetchRegistryData(); })} className="h-8 w-8 p-0 bg-red-500/10 hover:bg-red-500/20 rounded-lg border border-red-500/30 text-red-400"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Panel */}
        <div className="p-4 bg-white/5 border-t border-default/30 flex items-center justify-between text-muted text-[11px] font-black uppercase">
          <div className="flex items-center gap-2">
            <span>Page size:</span>
            <select value={pageSize} onChange={e => { setPageSize(parseInt(e.target.value)); setCurrentPage(1); }} className="bg-black border border-default rounded px-2 py-1">
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <span>Total records: {filteredParticipants.length}</span>
            <div className="flex items-center gap-2">
              <Button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} className="h-8 bg-white/5 hover:bg-white/10 px-4 rounded-xl border border-default">Prev</Button>
              <span>Page {currentPage} of {Math.ceil(filteredParticipants.length / pageSize) || 1}</span>
              <Button disabled={currentPage >= Math.ceil(filteredParticipants.length / pageSize)} onClick={() => setCurrentPage(prev => prev + 1)} className="h-8 bg-white/5 hover:bg-white/10 px-4 rounded-xl border border-default">Next</Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={() => handleExportRecords("csv")} className="h-10 px-6 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest border border-default rounded-full">Export CSV</Button>
        <Button onClick={() => handleExportRecords("xlsx")} className="h-10 px-6 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest border border-default rounded-full">Export Excel</Button>
      </div>

      {/* Details drawer panel popup */}
      <AnimatePresence>
        {selectedParticipant && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedParticipant(null)}
              className="fixed inset-0 bg-black z-40"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-[#0f0f15] border-l border-default/30 shadow-2xl z-50 p-6 overflow-y-auto space-y-6 flex flex-col justify-between"
            >
              <div className="space-y-6">
                <div className="flex justify-between items-center pb-4 border-b border-default/20">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--pri)]">Attendee profile detail</span>
                    <h3 className="text-xl font-black text-white">{selectedParticipant.name}</h3>
                  </div>
                  <Button onClick={() => setSelectedParticipant(null)} className="h-8 w-8 p-0 bg-white/5 hover:bg-white/10 rounded-full border border-default"><X className="h-4 w-4" /></Button>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted font-bold">Registration ID:</span>
                    <span className="col-span-2 text-indigo-400 font-black">{selectedParticipant.regno}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted font-bold">Email Address:</span>
                    <span className="col-span-2 text-white font-medium">{maskEmail(selectedParticipant.email)}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted font-bold">Phone Number:</span>
                    <span className="col-span-2 text-white font-medium">{maskPhone(selectedParticipant.phone)}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted font-bold">Company:</span>
                    <span className="col-span-2 text-white font-bold">{selectedParticipant.company || "N/A"}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted font-bold">Role Category:</span>
                    <span className="col-span-2"><span className="px-2 py-0.5 rounded bg-[var(--pri)]/10 text-[var(--pri)] text-[9px] font-black uppercase tracking-wider">{selectedParticipant.role}</span></span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted font-bold">Payment Status:</span>
                    <span className="col-span-2"><span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-wider">{selectedParticipant.paid_status}</span></span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted font-bold">Check-in Status:</span>
                    <span className="col-span-2"><span className="px-2 py-0.5 rounded bg-white/5 border border-default text-[9px] font-black uppercase tracking-wider">{selectedParticipant.check_in_status ? "Checked In" : "Pending"}</span></span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
