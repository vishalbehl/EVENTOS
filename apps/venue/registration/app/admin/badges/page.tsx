"use client";

import { useState, useEffect } from "react";
import { Printer, Plus, X, Trash2, FileJson, Copy } from "lucide-react";

export default function AdminBadgesPage() {
  const [badges, setBadges] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const [templateName, setTemplateName] = useState("");
  const [templateType, setTemplateType] = useState("custom");
  const [templateData, setTemplateData] = useState("{}");

  const fetchBadges = async () => {
    try {
      const res = await fetch("/api/v1/venue/admin/badges");
      if (res.ok) setBadges(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchBadges();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Validate JSON
      const parsedData = JSON.parse(templateData);
      
      const res = await fetch("/api/v1/venue/admin/badges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_name: templateName, template_type: templateType, template_data: parsedData })
      });
      if (res.ok) {
        setIsAddModalOpen(false);
        setTemplateName("");
        setTemplateType("custom");
        setTemplateData("{}");
        fetchBadges();
      } else {
        alert("Failed to create template");
      }
    } catch (e) {
      console.error(e);
      alert("Invalid JSON data for template");
    }
  };

  const handleDelete = async (badgeId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      const res = await fetch(`/api/v1/venue/admin/badges/${badgeId}`, { method: "DELETE" });
      if (res.ok) {
        fetchBadges();
      } else {
        alert("Failed to delete template");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 w-full pb-10">
      <div className="flex justify-between items-center bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
            <Printer className="w-6 h-6 text-[var(--pri)]" />
            Badge Templates
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1">Manage print layouts and configuration formats for local printers.</p>
        </div>
        <button onClick={() => setIsAddModalOpen(true)} className="bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-md">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {badges.map((b, i) => (
          <div key={b.id} className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-start">
              <div>
                <h3 className="font-bold text-[var(--text)]">{b.template_name}</h3>
                <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-lg bg-[var(--surf)] text-[var(--muted)] border border-[var(--border)]">
                  {b.template_type}
                </span>
              </div>
              <button onClick={() => handleDelete(b.id)} className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-[var(--surf)] p-4 text-xs font-mono text-[var(--muted)] overflow-x-auto max-h-48">
              <pre>{JSON.stringify(b.template_data, null, 2)}</pre>
            </div>
            <div className="p-3 border-t border-[var(--border)] bg-[var(--card)] flex justify-end">
              <button className="text-[var(--pri)] hover:underline text-xs font-semibold flex items-center gap-1">
                <Copy className="w-3 h-3" /> Duplicate
              </button>
            </div>
          </div>
        ))}
        {badges.length === 0 && (
          <div className="col-span-2 py-12 text-center border-2 border-dashed border-[var(--border)] rounded-2xl bg-[var(--card)]">
            <Printer className="w-8 h-8 text-[var(--muted)] mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--text)]">No Templates Found</h3>
            <p className="text-xs text-[var(--muted)] mt-1">Create a new badge template to get started.</p>
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-5 border-b border-[var(--border)]">
              <h3 className="font-bold text-[var(--text)] flex items-center gap-2">
                <FileJson className="w-5 h-5 text-[var(--pri)]" /> Add Template
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-[var(--muted)] hover:text-[var(--text)]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text)] mb-1">Template Name</label>
                  <input required value={templateName} onChange={e => setTemplateName(e.target.value)} type="text" className="w-full border border-[var(--border)] bg-[var(--surf)] text-[var(--text)] rounded-xl px-3 py-2 text-sm focus:border-[var(--pri)] outline-none" placeholder="e.g. Standard Attendee Badge" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text)] mb-1">Type</label>
                  <select value={templateType} onChange={e => setTemplateType(e.target.value)} className="w-full border border-[var(--border)] bg-[var(--surf)] text-[var(--text)] rounded-xl px-3 py-2 text-sm focus:border-[var(--pri)] outline-none">
                    <option value="custom">Custom JSON</option>
                    <option value="zpl">Zebra ZPL</option>
                    <option value="html">HTML Print</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text)] mb-1">Configuration Data (JSON)</label>
                <textarea 
                  required 
                  value={templateData} 
                  onChange={e => setTemplateData(e.target.value)} 
                  rows={10} 
                  className="w-full border border-[var(--border)] bg-[var(--surf)] text-[var(--text)] rounded-xl px-3 py-2 text-sm font-mono focus:border-[var(--pri)] outline-none" 
                  placeholder='{"width": "4in", "height": "3in"}' 
                />
              </div>
              <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--raised)] rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm font-semibold bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 rounded-xl transition-all">Save Template</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
