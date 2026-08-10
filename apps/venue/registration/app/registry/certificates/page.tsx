"use client";

import { useEffect, useState } from "react";
import { Award, Download, RefreshCw, CheckCircle2, Search, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import jsPDF from "jspdf";
import { toast } from "sonner";

export default function CertificatesPage() {
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedP, setSelectedP] = useState<any>(null);
  const [roleFilter, setRoleFilter] = useState("All");
  const [certType, setCertType] = useState("Certificate of Attendance");

  const loadData = async () => {
    try {
      setLoading(true);
      let url = `/venue/registration/participants?limit=5000`;
      if (roleFilter !== "All") url += `&role=${encodeURIComponent(roleFilter)}`;
      const res: any = await apiClient.get(url);
      setParticipants(res.items || []);
      if (res.items && res.items.length > 0) setSelectedP(res.items[0]);
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to load delegates for certificates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [roleFilter]);

  const handleGeneratePDF = (p: any) => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // Outer border
      doc.setLineWidth(3);
      doc.setDrawColor(37, 99, 235); // Blue
      doc.rect(10, 10, 277, 190);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.setTextColor(37, 99, 235);
      doc.text(certType.toUpperCase(), 148.5, 45, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(14);
      doc.setTextColor(100, 116, 139);
      doc.text("This is proudly presented to", 148.5, 65, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(32);
      doc.setTextColor(15, 23, 42);
      doc.text(p.name, 148.5, 95, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(14);
      doc.setTextColor(71, 85, 105);
      doc.text(`for active participation as ${(p.role || "Delegate").toUpperCase()} at`, 148.5, 115, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(37, 99, 235);
      doc.text("ANNUAL CONFERENCE 2026", 148.5, 130, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184);
      doc.text(`Reg No: ${p.regno} • Organization: ${p.company || "N/A"} • Issued on Site`, 148.5, 175, { align: "center" });

      doc.save(`certificate_${p.regno}.pdf`);
      toast.success(`Certificate PDF generated for ${p.name}!`);
    } catch (err: any) {
      toast.error("Failed to generate certificate PDF.");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] gap-4 w-full">
      {/* Header Banner */}
      <div className="bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)] shadow-sm flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-black text-[var(--text)] tracking-tight flex items-center gap-2">
            <Award className="w-5 h-5 text-[var(--pri)]" /> Certificate Generation Studio
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Generate, preview, and download official delegate certificates of attendance directly from venue DB
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={certType}
            onChange={(e) => setCertType(e.target.value)}
            className="h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] bg-[var(--surf)]"
          >
            <option value="Certificate of Attendance">Certificate of Attendance</option>
            <option value="Certificate of Appreciation">Certificate of Appreciation (Speakers)</option>
            <option value="Certificate of Merit">Certificate of Merit (Presenters)</option>
          </select>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] bg-[var(--surf)]"
          >
            <option value="All">All Categories</option>
            <option value="Delegate">Delegate</option>
            <option value="Speaker">Speaker</option>
            <option value="VIP">VIP</option>
          </select>

          <Button variant="outline" onClick={loadData} disabled={loading} className="h-10 text-xs font-bold">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Main Split Container */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left List */}
        <div className="w-[360px] bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm flex flex-col shrink-0">
          <div className="p-3 border-b border-[var(--border)] bg-[var(--surf)] font-black text-xs text-[var(--muted)] uppercase tracking-wider">
            Delegates ({participants.length})
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)] custom-scrollbar">
            {participants.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedP(p)}
                className={`p-3.5 cursor-pointer transition-colors flex items-center justify-between ${
                  selectedP?.id === p.id
                    ? "bg-[var(--pri)]/10 border-l-4 border-[var(--pri)]"
                    : "hover:bg-[var(--surf)]/50"
                }`}
              >
                <div>
                  <h4 className="font-semibold text-sm text-[var(--text)]">{p.name}</h4>
                  <p className="text-xs font-mono font-bold text-[var(--acc)]">
                    {p.regno} • {p.role}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGeneratePDF(p);
                  }}
                  className="h-8 bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Right Live Certificate Preview */}
        {selectedP ? (
          <div className="flex-1 bg-[var(--surf)] rounded-2xl border border-[var(--border)] p-8 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="w-[660px] h-[440px] bg-white rounded-2xl shadow-2xl border-[12px] border-blue-600 p-10 flex flex-col justify-between text-center relative text-slate-900">
              <div className="space-y-2">
                <Award className="w-12 h-12 text-blue-600 mx-auto" />
                <h2 className="text-2xl font-black text-blue-600 uppercase tracking-widest">{certType}</h2>
                <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">This certificate is proudly presented to</p>
              </div>

              <div className="my-auto space-y-2">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">{selectedP.name}</h1>
                <p className="text-sm font-semibold text-slate-600">
                  for participation as <span className="font-bold text-blue-600">{selectedP.role}</span>
                </p>
                <p className="text-xs text-slate-400 font-medium">at Annual Conference 2026</p>
              </div>

              <div className="flex justify-between items-end border-t border-slate-200 pt-4 text-xs text-slate-500">
                <div>
                  <p className="font-mono font-bold text-slate-800">{selectedP.regno}</p>
                  <p className="text-[10px]">VERIFIED REGISTRATION</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Organizing Committee</p>
                  <p className="text-[10px]">AUTHORIZED SIGNATURE</p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => handleGeneratePDF(selectedP)}
              className="mt-6 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 font-bold gap-2 h-11 px-8 text-sm shadow-lg"
            >
              <Download className="w-5 h-5" /> Download Certificate PDF
            </Button>
          </div>
        ) : (
          <div className="flex-1 bg-[var(--card)] rounded-2xl border border-[var(--border)] flex items-center justify-center text-[var(--muted)] font-semibold text-xs">
            Select a participant from the left list to preview certificate
          </div>
        )}
      </div>
    </div>
  );
}
