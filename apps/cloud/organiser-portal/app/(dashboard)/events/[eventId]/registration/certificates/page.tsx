"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  FileText,
  CheckCircle,
  Search,
  Award,
  Printer,
  Download,
  Sparkles,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useEvent } from "@/hooks/useEvents";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api-client";
import { compileTemplateToPdf } from "@/lib/pdf-compiler";
import { useOperationAccess } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

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
  const params = useParams();
  const eventIdStr = (params?.eventId as string) || "";
  const { data: event } = useEvent(eventIdStr);
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

  const [certTitle, setCertTitle] = useState("Certificate of Appreciation");
  const [certBody, setCertBody] = useState(
    "For active participation and contribution in the event."
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      let url = `/events/${eventIdStr}/participants`;
      const queryParams = [];
      if (searchQuery) queryParams.push(`search=${encodeURIComponent(searchQuery)}`);
      if (roleFilter !== "all") queryParams.push(`role=${encodeURIComponent(roleFilter)}`);

      if (queryParams.length > 0) {
        url += `?${queryParams.join("&")}`;
      }

      const list = await apiGet<Participant[]>(url);
      setParticipants(list);

      const templatesRes = await apiGet<any[]>(
        `/events/${eventIdStr}/print-templates?template_type=certificate`
      );
      const formattedTemplates = templatesRes.map((t) => ({
        id: t.id,
        templateName: t.template_name || t.templateName || "Unnamed Template",
        templateData: t.template_data || t.templateData || {},
      }));
      setTemplates(formattedTemplates);

      if (formattedTemplates.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(formattedTemplates[0].id);
      }
    } catch {
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
      const url = `/events/${eventIdStr}/participants`;
      const [list, templatesRes] = await Promise.all([
        apiGet<Participant[]>(url),
        apiGet<any[]>(`/events/${eventIdStr}/print-templates?template_type=certificate`),
      ]);
      setParticipants(list);
      const formattedTemplates = templatesRes.map((t) => ({
        id: t.id,
        templateName: t.template_name || t.templateName || "Unnamed Template",
        templateData: t.template_data || t.templateData || {},
      }));
      setTemplates(formattedTemplates);
      if (formattedTemplates.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(formattedTemplates[0].id);
      }
    } catch {
      toast.error("Failed to load certificate compiler tools.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventIdStr) {
      fetchData();
    }
  }, [eventIdStr, roleFilter]);

  const toggleSelectAll = () => {
    if (selectedParticipantIds.size === participants.length) {
      setSelectedParticipantIds(new Set());
    } else {
      setSelectedParticipantIds(new Set(participants.map((p) => p.id)));
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

  const handleBulkPrint = async (participantIds: Set<string> = selectedParticipantIds) => {
    if (!generationAccess.enabled || !exportAccess.enabled) {
      toast.error("Certificate generation is not available for this event or your role.");
      return;
    }
    if (participantIds.size === 0) {
      toast.error("Please select at least one delegate.");
      return;
    }
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) {
      toast.error("Please design and select a layout template first.");
      return;
    }

    setPrinting(true);
    toast.info(`Compiling ${participantIds.size} certificates...`);

    try {
      await apiPost(
        `/events/${eventIdStr}/print-templates/certificate-generation-authorizations?participant_count=${participantIds.size}`,
        undefined,
        { headers: { "Idempotency-Key": crypto.randomUUID() } }
      );
      const selectedList = participants.filter((p) => participantIds.has(p.id));
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
      toast.error(err.message || "Failed to compile certificates.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="w-full space-y-6 p-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Award className="size-4 text-[var(--pri)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">
              Credentials Desk
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Certificate Batch Printer
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Configure certificate copy, select recipients, and compile high-resolution PDF certificates in bulk.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] shadow-sm transition-colors cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin text-[var(--pri)]")} />
          Sync Lists
        </button>
      </div>

      {/* ── Main 2-Column Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column: Certificate Metadata Configuration */}
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Certificate Metadata
            </h3>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">
                Print Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.templateName}
                  </option>
                ))}
                {templates.length === 0 && <option value="">No Layouts Designed Yet</option>}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">
                Certificate Title
              </label>
              <input
                type="text"
                value={certTitle}
                onChange={(e) => setCertTitle(e.target.value)}
                placeholder="e.g. Certificate of Attendance"
                className="h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] font-semibold focus:border-[var(--pri)] focus:outline-none"
              />
              <span className="text-[10px] text-[var(--text-tertiary)] block">
                Token variable: &#123;&#123;title&#125;&#125;
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">
                Certifying Body Text
              </label>
              <textarea
                value={certBody}
                onChange={(e) => setCertBody(e.target.value)}
                rows={4}
                placeholder="For active participation..."
                className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none resize-none"
              />
              <span className="text-[10px] text-[var(--text-tertiary)] block">
                Token variable: &#123;&#123;body&#125;&#125;
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleBulkPrint()}
            disabled={
              printing ||
              selectedParticipantIds.size === 0 ||
              !generationAccess.enabled ||
              !exportAccess.enabled
            }
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer"
          >
            <Printer className="size-3.5" />
            {printing ? "Generating PDFs..." : `Print Selected (${selectedParticipantIds.size})`}
          </button>
        </div>

        {/* Right Column: Delegate Candidates Table */}
        <div className="lg:col-span-2 space-y-3">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Search candidates by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchData()}
                className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none shadow-sm"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none shadow-sm cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="Delegate">Delegate</option>
              <option value="VIP">VIP</option>
              <option value="Speaker">Speaker</option>
              <option value="Organizer">Organizer</option>
              <option value="Faculty">Faculty</option>
            </select>

            <button
              type="button"
              onClick={handleResetFilters}
              className="flex h-9 items-center gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors shadow-sm cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
          </div>

          {/* Table Container */}
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          participants.length > 0 &&
                          selectedParticipantIds.size === participants.length
                        }
                        onChange={toggleSelectAll}
                        className="rounded accent-[var(--pri)] cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-3">Name &amp; Email</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {participants.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-xs text-[var(--text-secondary)]">
                        No candidates found matching active filters.
                      </td>
                    </tr>
                  ) : (
                    participants.map((p) => (
                      <tr key={p.id} className="hover:bg-[var(--bg-surface-hover)]">
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedParticipantIds.has(p.id)}
                            onChange={() => toggleSelectParticipant(p.id)}
                            className="rounded accent-[var(--pri)] cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-[var(--text-primary)]">{p.name}</p>
                          <p className="text-[11px] text-[var(--text-secondary)]">{p.email}</p>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center rounded border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--text-secondary)]">
                            {p.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              const onlyParticipant = new Set([p.id]);
                              setSelectedParticipantIds(onlyParticipant);
                              void handleBulkPrint(onlyParticipant);
                            }}
                            disabled={
                              printing || !generationAccess.enabled || !exportAccess.enabled
                            }
                            className="inline-flex items-center h-7 px-2.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[10px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                          >
                            Generate
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
