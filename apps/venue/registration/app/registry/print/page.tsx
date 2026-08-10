"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Printer,
  RefreshCw,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  Mail,
  Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { compileTemplateToPdf } from "@/lib/pdf-compiler";
import { toast } from "sonner";

export default function BadgePrintPage() {
  const [participants, setParticipants] = useState<any[]>([]);
  const [selectedP, setSelectedP] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [printer, setPrinter] = useState("PRN-Zebra-01");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Sorting
  const [sortField, setSortField] = useState<"regno" | "name">("regno");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // PDF preview state
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [compilingPreview, setCompilingPreview] = useState(false);

  // Cached templates
  const [templates, setTemplates] = useState<any[]>([]);

  const loadUnprinted = async () => {
    try {
      setLoading(true);
      const res: any = await apiClient.get(`/venue/registration/participants?limit=5000`);
      const items = res.items || [];
      setParticipants(items);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load participants");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const res: any = await apiClient.get("/venue/registration/templates");
      const list = Array.isArray(res) ? res : [];
      setTemplates(list.filter((t: any) => t.template_type !== "certificate"));
    } catch (_) {}
  };

  useEffect(() => {
    loadUnprinted();
    loadTemplates();
  }, []);

  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    participants.forEach((p) => { if (p.role) set.add(p.role.trim()); });
    return Array.from(set).sort();
  }, [participants]);

  const filteredParticipants = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = participants.filter((p) => {
      const matchesSearch =
        !q ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.regno && p.regno.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.company && p.company.toLowerCase().includes(q));
      const matchesRole = roleFilter === "All" || p.role === roleFilter;
      return matchesSearch && matchesRole;
    });
    return list.sort((a, b) => {
      const valA = ((sortField === "regno" ? a.regno : a.name) || "").toLowerCase();
      const valB = ((sortField === "regno" ? b.regno : b.name) || "").toLowerCase();
      const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [participants, query, roleFilter, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredParticipants.length / pageSize));
  const paginated = filteredParticipants.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSortClick = (field: "regno" | "name") => {
    if (sortField === field) {
      setSortDirection((p) => (p === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const compilePdfPreview = useCallback(async (participant: any) => {
    if (!participant) return;
    try {
      setCompilingPreview(true);
      setPdfPreviewUrl(null);
      const activeTemplate =
        templates.length > 0
          ? templates[0].template_data || templates[0].templateData || templates[0]
          : {
              width_mm: 76,
              height_mm: 100,
              pages: [{
                backgroundColor: "#FFFFFF",
                fields: [
                  { type: "text", placeholder: "{{name}}", x_mm: 5, y_mm: 20, w_mm: 66, h_mm: 12, fontSize: 16, bold: true, color: "#1E293B", align: "center" },
                  { type: "text", placeholder: "{{role}}", x_mm: 5, y_mm: 35, w_mm: 66, h_mm: 8, fontSize: 12, bold: true, color: "#2563EB", align: "center" },
                  { type: "text", placeholder: "{{company}}", x_mm: 5, y_mm: 45, w_mm: 66, h_mm: 8, fontSize: 10, color: "#64748B", align: "center" },
                  { type: "qr", qrValue: "{{regno}}", x_mm: 23, y_mm: 58, w_mm: 30, h_mm: 30 },
                ],
              }],
            };
      const pdf = await compileTemplateToPdf([participant], activeTemplate, { name: "EventX OS" });
      const blobUrl = URL.createObjectURL(pdf.output("blob"));
      setPdfPreviewUrl(blobUrl);
    } catch (e: any) {
      toast.error("Preview compile failed: " + (e.message || "Unknown error"));
    } finally {
      setCompilingPreview(false);
    }
  }, [templates]);

  const handleSelectParticipant = (p: any) => {
    setSelectedP(p);
    compilePdfPreview(p);
  };

  const handlePrint = async () => {
    if (!selectedP) return;
    try {
      setPrinting(true);
      let url = pdfPreviewUrl;
      if (!url) {
        await compilePdfPreview(selectedP);
        url = pdfPreviewUrl;
      }
      await apiClient.post(`/venue/registration/participants/${selectedP.id}/print-badge`, {}).catch(() => {});
      if (url) window.open(url, "_blank");
      toast.success(`Badge PDF opened for ${selectedP.name}!`);
      setParticipants((prev) =>
        prev.map((p) => (p.id === selectedP.id ? { ...p, badge_status: "printed" } : p))
      );
      setSelectedP((prev: any) => prev ? { ...prev, badge_status: "printed" } : null);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate badge PDF.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Header Bar */}
      <div className="shrink-0 bg-[var(--surf)] px-4 py-3 rounded-2xl border border-[var(--border)] shadow-sm flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-[var(--text)] flex items-center gap-2 tracking-tight">
            <Printer className="w-4 h-4 text-[var(--acc)]" /> Badge Printing Station
          </h2>
          <p className="text-[11px] text-[var(--muted)]">Thermal print queue · Badge spooler · A-Z ascending order</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-[var(--muted)] hidden sm:block">Printer:</span>
          <select
            value={printer}
            onChange={(e) => setPrinter(e.target.value)}
            className="h-9 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--surf)] text-[var(--text)]"
          >
            <option value="PRN-Zebra-01">Zebra ZD620 (LAN 192.168.1.102)</option>
            <option value="PRN-Dymo-02">Dymo LabelWriter 450 (USB)</option>
            <option value="PRN-Epson-03">Epson ColorWorks C3500</option>
          </select>
          <Button variant="outline" onClick={loadUnprinted} disabled={loading} className="h-9 px-3">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Main Split — fills remaining height, NO page scroll */}
      <div className="flex-1 min-h-0 flex gap-3">

        {/* Left: Participants Table Panel */}
        <div className="flex flex-col min-h-0 w-[55%] bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
          {/* Table Filter Bar */}
          <div className="shrink-0 p-3 bg-[var(--surf)] border-b border-[var(--border)] flex items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
              className="h-9 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--card)] text-[var(--text)]"
            >
              <option value="All">All Roles ({participants.length})</option>
              {availableRoles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
              <Input
                className="pl-10 h-9 bg-[var(--card)] border-[var(--border)] text-xs font-semibold focus:ring-1 focus:ring-[var(--pri)]"
                placeholder="Search Name, Reg Code, Email..."
                value={query}
                onChange={(e) => { setQuery(e.target.value); setCurrentPage(1); }}
              />
            </div>
          </div>

          {/* Table — only inner body scrolls */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[var(--surf)] border-b border-[var(--border)] z-10 shadow-sm">
                <tr className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                  <th className="p-3 cursor-pointer hover:text-[var(--pri)] select-none" onClick={() => handleSortClick("regno")}>
                    <div className="flex items-center gap-1">
                      Reg Code
                      {sortField === "regno" ? (sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-[var(--pri)]" /> : <ArrowDown className="w-3 h-3 text-[var(--pri)]" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th className="p-3 cursor-pointer hover:text-[var(--pri)] select-none" onClick={() => handleSortClick("name")}>
                    <div className="flex items-center gap-1">
                      Participant Name
                      {sortField === "name" ? (sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-[var(--pri)]" /> : <ArrowDown className="w-3 h-3 text-[var(--pri)]" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Badge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-semibold text-[var(--text)]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-20 text-center text-[var(--muted)]">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[var(--pri)] mb-2" />
                      Loading print queue...
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-[var(--muted)] text-xs font-bold">
                      No participants found matching filters.
                    </td>
                  </tr>
                ) : (
                  paginated.map((p) => {
                    const isSelected = selectedP?.id === p.id;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => handleSelectParticipant(p)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[var(--pri)]/10 border-l-2 border-[var(--pri)]"
                            : "hover:bg-[var(--raised)]"
                        }`}
                      >
                        <td className="p-3 font-mono text-xs font-bold text-[var(--acc)]">{p.regno}</td>
                        <td className="p-3">
                          <div className="font-bold text-[var(--text)] text-sm">{p.name}</div>
                          <div className="text-[11px] text-[var(--muted)] font-mono">{p.email}</div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-[var(--raised)] border border-[var(--border)] text-[10px] font-black uppercase rounded-full text-[var(--text)]">
                            {p.role || "Delegate"}
                          </span>
                        </td>
                        <td className="p-3 text-[var(--muted)] text-xs">{p.company || "N/A"}</td>
                        <td className="p-3">
                          <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full border ${
                            p.badge_status === "printed" || p.badge_status === "reprinted"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          }`}>
                            {p.badge_status || "Pending"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Pagination */}
          <div className="shrink-0 p-3 bg-[var(--surf)] border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--muted)] font-bold">
            <span>{filteredParticipants.length} participants · Page {currentPage} / {totalPages}</span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className="h-7 px-2 text-xs font-bold">
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </Button>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className="h-7 px-2 text-xs font-bold">
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Preview + Info Panel — viewport-locked, fills remaining height */}
        <div className="flex flex-col min-h-0 flex-1 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
          {selectedP ? (
            <>
              {/* Panel Header */}
              <div className="shrink-0 p-4 bg-[var(--surf)] border-b border-[var(--border)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)] flex items-center justify-center font-black shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-[var(--text)] truncate">{selectedP.name}</h3>
                    <p className="text-[11px] font-mono font-bold text-[var(--acc)] truncate">{selectedP.regno}</p>
                  </div>
                </div>
                <Button
                  onClick={handlePrint}
                  disabled={printing || compilingPreview}
                  className="bg-[var(--pri)] text-[var(--primary-contrast)] font-extrabold gap-2 h-9 px-5 shadow-md text-xs shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  {compilingPreview ? "Compiling..." : printing ? "Printing..." : "Print Badge"}
                </Button>
              </div>

              {/* Panel Info Strip */}
              <div className="shrink-0 px-4 py-2.5 bg-[var(--raised)] border-b border-[var(--border)] flex items-center gap-6 text-[11px] font-semibold">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Mail className="w-3 h-3 text-[var(--pri)] shrink-0" />
                  <span className="text-[var(--muted)] font-mono truncate">{selectedP.email}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Building className="w-3 h-3 text-[var(--acc)] shrink-0" />
                  <span className="text-[var(--text)] truncate">{selectedP.company || "N/A"}</span>
                </div>
                <span className={`ml-auto shrink-0 px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full border ${
                  selectedP.badge_status === "printed" || selectedP.badge_status === "reprinted"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                }`}>
                  {selectedP.badge_status || "Pending"}
                </span>
              </div>

              {/* PDF Preview — fills all remaining height */}
              <div className="flex-1 min-h-0 relative">
                {compilingPreview ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--base)] text-[var(--muted)]">
                    <RefreshCw className="w-7 h-7 animate-spin text-[var(--pri)]" />
                    <p className="text-xs font-bold">Compiling real-time PDF from template...</p>
                  </div>
                ) : pdfPreviewUrl ? (
                  <div className="absolute inset-0 flex flex-col">
                    <div className="shrink-0 px-4 py-2 bg-[var(--surf)] border-b border-[var(--border)] flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                        <Printer className="w-3 h-3 text-blue-500" />
                        Badge PDF Preview — Real-Time Template
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => window.open(pdfPreviewUrl, "_blank")}
                          className="text-[10px] font-bold text-blue-500 hover:underline"
                        >
                          Open Full Page ↗
                        </button>
                        <button
                          onClick={() => setPdfPreviewUrl(null)}
                          className="p-1 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--raised)]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <iframe
                      src={pdfPreviewUrl}
                      title="Badge PDF Preview"
                      className="flex-1 w-full bg-white"
                      style={{ border: "none" }}
                    />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--base)] text-[var(--muted)]">
                    <Clock className="w-7 h-7 text-[var(--border)]" />
                    <p className="text-xs font-bold">PDF preview will appear here after participant loads</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--muted)]">
              <Printer className="w-10 h-10 text-[var(--border)]" />
              <p className="text-sm font-bold">Select a participant to preview badge</p>
              <p className="text-xs">Click any row in the table to load their badge PDF</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
