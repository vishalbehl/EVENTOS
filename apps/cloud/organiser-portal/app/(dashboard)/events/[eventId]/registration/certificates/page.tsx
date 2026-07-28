"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { 
  FileText, CheckCircle, Search, Award, Printer, Download, Sparkles, RefreshCw
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useEvent } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api-client";
import { compileTemplateToPdf } from "@/lib/pdf-compiler";
import { useOperationAccess } from "@/lib/capabilities";

interface Participant {
  id: string;
  regno: string;
  name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  company?: string;
  role: string;
  paid_status: string;
  source: string;
  registered_at: string;
}

interface PrintTemplate {
  id: string;
  templateName: string;
  templateData: any;
}

export default function CertificatePrinter() {
  const { eventId } = useParams();
  const { data: event } = useEvent(eventId as string);
  const generationAccess = useOperationAccess("certificates.generate");
  const exportAccess = useOperationAccess("exports.create");
  
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  
  // Selection states
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  
  // Custom certificate text overlays if needed
  const [certTitle, setCertTitle] = useState("Certificate of Appreciation");
  const [certBody, setCertBody] = useState("For active participation and contribution in the event.");

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch participants list
      let url = `/events/${eventId}/participants`;
      const queryParams = [];
      if (searchQuery) queryParams.push(`search=${encodeURIComponent(searchQuery)}`);
      if (roleFilter !== "all") queryParams.push(`role=${encodeURIComponent(roleFilter)}`);
      
      if (queryParams.length > 0) {
        url += `?${queryParams.join("&")}`;
      }
      
      const list = await apiGet<Participant[]>(url);
      setParticipants(list);

      // Fetch templates
      const templatesRes = await apiGet<any[]>(`/events/${eventId}/print-templates?template_type=certificate`);
      const formattedTemplates = templatesRes.map(t => ({
        id: t.id,
        templateName: t.template_name || t.templateName || "Unnamed Template",
        templateData: t.template_data || t.templateData || {}
      }));
      setTemplates(formattedTemplates);
      
      if (formattedTemplates.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(formattedTemplates[0].id);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load certificate compiler tools.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = async () => {
    setSearchQuery("");
    setRoleFilter("all");
    try {
      setLoading(true);
      const url = `/events/${eventId}/participants`;
      const [list, templatesRes] = await Promise.all([
        apiGet<Participant[]>(url),
        apiGet<any[]>(`/events/${eventId}/print-templates?template_type=certificate`),
      ]);
      setParticipants(list);
      const formattedTemplates = templatesRes.map(t => ({
        id: t.id,
        templateName: t.template_name || t.templateName || "Unnamed Template",
        templateData: t.template_data || t.templateData || {}
      }));
      setTemplates(formattedTemplates);
      if (formattedTemplates.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(formattedTemplates[0].id);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load certificate compiler tools.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
  }, [eventId, roleFilter]);

  const toggleSelectAll = () => {
    if (selectedParticipantIds.size === participants.length) {
      setSelectedParticipantIds(new Set());
    } else {
      setSelectedParticipantIds(new Set(participants.map(p => p.id)));
    }
  };

  const toggleSelectParticipant = (id: string) => {
    const next = new Set(selectedParticipantIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedParticipantIds(next);
  };

  // Compile certificates as a single multi-page PDF document
  const handleBulkPrint = async (participantIds: Set<string> = selectedParticipantIds) => {
    if (!generationAccess.enabled || !exportAccess.enabled) {
      toast.error("Certificate generation is not available for this event or your role.");
      return;
    }
    if (participantIds.size === 0) {
      toast.error("Please select at least one delegate.");
      return;
    }
    const tpl = templates.find(t => t.id === selectedTemplateId);
    if (!tpl) {
      toast.error("Please design and select a layout template first.");
      return;
    }

    setPrinting(true);
    toast.info(`Compiling ${participantIds.size} certificates...`);

    try {
      await apiPost(
        `/events/${eventId}/print-templates/certificate-generation-authorizations?participant_count=${participantIds.size}`,
        undefined,
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      const selectedList = participants.filter(p => participantIds.has(p.id));
      const pdf = await compileTemplateToPdf(
        selectedList,
        tpl.templateData,
        event || null,
        certTitle,
        certBody
      );

      const blob = pdf.output("blob");
      window.open(URL.createObjectURL(blob), "_blank");
      toast.success("Certificates compiled and exported to printer spool.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to compile certificates.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-6 min-h-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-[var(--pri)] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]/80">Credentials Desk</span>
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mt-1 text-glow-indigo">Certificate printer</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mt-1">
            Configure certificate texts, select participants, and generate high-resolution print certificates in batch.
          </p>
        </div>

        <Button 
          onClick={fetchData} 
          disabled={loading} 
          className="h-12 px-8 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default hover-lift-3d self-start md:self-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Sync lists
        </Button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        {/* Certificate text configuration */}
        <div className="flex flex-col min-h-0 h-full">
          <Card className="flex flex-col h-full p-8 glass-3d border-default rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] group hover-lift-3d relative overflow-hidden">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-6 shrink-0">Certificate Metadata</h3>
            
            <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar min-h-0">
              <div className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">Select Print Template</span>
                <select 
                  value={selectedTemplateId} 
                  onChange={e => setSelectedTemplateId(e.target.value)} 
                  className="w-full h-14 px-6 rounded-2xl border border-default bg-white/5 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id} className="bg-[var(--base)]">{t.templateName}</option>
                  ))}
                  {templates.length === 0 && <option value="" className="bg-[var(--base)]">No Layouts Designed Yet</option>}
                </select>
              </div>

              <div className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">Certificate Title</span>
                <Input 
                  type="text" 
                  value={certTitle} 
                  onChange={e => setCertTitle(e.target.value)} 
                  className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold text-xs text-[var(--text)] focus:border-[var(--pri)] focus:ring-0 transition-all placeholder:text-muted/65" 
                  placeholder="e.g. Certificate of Attendance"
                />
                <span className="text-[9px] text-muted font-bold block uppercase tracking-wider mt-1">Uses token variable: `{"{{title}}"}`</span>
              </div>

              <div className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">Certifying Body Text</span>
                <textarea 
                  value={certBody} 
                  onChange={e => setCertBody(e.target.value)} 
                  rows={4}
                  className="w-full p-5 rounded-2xl border border-default bg-white/5 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all placeholder:text-muted/65"
                  placeholder="e.g. For active participation and contribution in the event."
                />
                <span className="text-[9px] text-muted font-bold block uppercase tracking-wider mt-1">Uses token variable: `{"{{body}}"}`</span>
              </div>
            </div>

            <div className="pt-6 shrink-0">
              <Button 
                onClick={() => void handleBulkPrint()} 
                disabled={printing || selectedParticipantIds.size === 0 || !generationAccess.enabled || !exportAccess.enabled} 
                className="w-full h-12 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[11px] rounded-full border-0 hover-lift-3d transition-all duration-300 shadow-[0_10px_20px_color-mix(in_srgb,var(--pri)_35%,transparent)] disabled:opacity-40"
              >
                <Printer className="h-4 w-4 mr-2" />
                {printing ? "Generating PDFs..." : `Print Selected (${selectedParticipantIds.size})`}
              </Button>
            </div>
          </Card>
        </div>

        {/* Selected Participants list */}
        <div className="lg:col-span-2 flex flex-col min-h-0 h-full space-y-6">
          <Card className="p-5 glass-3d border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[2rem] grid grid-cols-1 sm:grid-cols-3 gap-4 items-center shadow-lg shrink-0">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <Input 
                type="text" 
                placeholder="Search candidates..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                onKeyDown={(e) => e.key === "Enter" && fetchData()}
                className="h-12 bg-white/5 border-default rounded-full pl-10 pr-6 font-bold text-xs text-[var(--text)] focus:border-[var(--pri)] focus:ring-0 transition-all placeholder:text-muted/65"
              />
            </div>
            <select 
              value={roleFilter} 
              onChange={e => setRoleFilter(e.target.value)} 
              className="h-12 px-6 rounded-full border border-default bg-white/5 text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer"
            >
              <option value="all" className="bg-[var(--base)]">All Roles</option>
              <option value="Delegate" className="bg-[var(--base)]">Delegate</option>
              <option value="VIP" className="bg-[var(--base)]">VIP</option>
              <option value="Speaker" className="bg-[var(--base)]">Speaker</option>
              <option value="Organizer" className="bg-[var(--base)]">Organizer</option>
              <option value="Faculty" className="bg-[var(--base)]">Faculty</option>
            </select>
            <Button onClick={handleResetFilters} className="h-12 px-6 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default hover-lift-3d flex items-center justify-center gap-1.5">
              <LucideIcons.RotateCcw className="h-4 w-4" />
              Reset Filters
            </Button>
          </Card>

          <Card className="flex-1 glass-3d border-default rounded-[2.5rem] overflow-hidden bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-xl flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-[color-mix(in_srgb,var(--base)_95%,#000)] shadow-[0_1px_0_0_rgba(255,255,255,0.05)]">
                  <tr className="text-[9px] font-black uppercase tracking-[0.2em] text-muted select-none">
                    <th className="py-5 px-8 w-12">
                      <input 
                        type="checkbox" 
                        checked={participants.length > 0 && selectedParticipantIds.size === participants.length} 
                        onChange={toggleSelectAll} 
                        className="rounded accent-[var(--pri)]"
                      />
                    </th>
                    <th className="py-5 px-8">Name & Email</th>
                    <th className="py-5 px-8">Role</th>
                    <th className="py-5 px-8 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-16 text-center text-xs font-black uppercase tracking-widest text-muted">
                        No candidates found.
                      </td>
                    </tr>
                  ) : (
                    participants.map(p => (
                      <tr key={p.id} className="border-b border-default/50 hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] transition-all text-[var(--text)] last:border-b-0 group">
                        <td className="py-5 px-8">
                          <input 
                            type="checkbox" 
                            checked={selectedParticipantIds.has(p.id)} 
                            onChange={() => toggleSelectParticipant(p.id)} 
                            className="rounded accent-[var(--pri)]"
                          />
                        </td>
                        <td className="py-5 px-8">
                          <div className="flex flex-col">
                            <span className="text-xs font-black tracking-tight text-[var(--text)]">{p.name}</span>
                            <span className="text-[9px] font-black uppercase tracking-wider text-muted mt-0.5">{p.email}</span>
                          </div>
                        </td>
                        <td className="py-5 px-8">
                          <span className="text-[9px] font-black uppercase tracking-[0.15em] px-3 py-1.5 rounded-full border border-[var(--pri)]/20 bg-[var(--pri)]/10 text-[var(--pri)]">
                            {p.role}
                          </span>
                        </td>
                        <td className="py-5 px-8 text-right">
                          <Button 
                            onClick={() => {
                              const onlyParticipant = new Set([p.id]);
                              setSelectedParticipantIds(onlyParticipant);
                              void handleBulkPrint(onlyParticipant);
                            }}
                            disabled={printing || !generationAccess.enabled || !exportAccess.enabled}
                            className="h-9 px-4 bg-[var(--pri)]/20 hover:bg-[var(--pri)]/35 text-white font-black uppercase tracking-widest text-[9px] rounded-full border border-[var(--pri)]/30 hover-lift-3d"
                          >
                            Generate
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
