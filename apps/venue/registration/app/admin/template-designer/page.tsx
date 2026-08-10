"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Save, Trash2, Plus, Printer, Undo2, Redo2, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Type, QrCode, Calendar, Clock, MapPin,
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Image as ImageIcon,
  Palette, Mail, Phone, Badge as BadgeIcon, Copy, FileText, Sparkles, RefreshCw,
  Search, Grid, Shapes, Upload, Database, Eye, X, Check, ArrowDown, ArrowUp, LayoutGrid, User, ShieldCheck, Award, MonitorPlay, Sliders, ChevronDown
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Rnd } from "react-rnd";
import { QRCodeSVG } from "qrcode.react";
import ReactDOMServer from "react-dom/server";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { compileTemplateToPdf } from "@/lib/pdf-compiler";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const uuidv4 = () => {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const DPI = 96;
const mmToPx = (mm: number) => (mm / 25.4) * DPI;
const pxToMm = (px: number) => (px * 25.4) / DPI;

const FONT_FAMILIES = [
  "Inter", "Poppins", "Montserrat", "Roboto", "Open Sans", "Lato", "Rubik", "Nunito", "Oswald", "Merriweather"
];

const PRESET_BADGE_SIZES = [
  { name: "Executive Badge", width: 76, height: 100 },
  { name: "CR80 (Standard Card)", width: 86, height: 54 },
  { name: "A6 Size", width: 105, height: 148 },
  { name: "A5 Size", width: 148, height: 210 },
  { name: "Square Badge", width: 100, height: 100 }
];

export default function AdminVenueTemplateDesignerPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [currentTemplateId, setCurrentTemplateId] = useState<string>("new");
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("components");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [canvasZoom, setCanvasZoom] = useState<number>(1.0);
  const [viewMode, setViewMode] = useState<"list" | "editor">("list");

  // Default Template Data
  const [template, setTemplate] = useState<any>({
    template_name: "Venue Delegate Badge Template",
    template_type: "badge",
    width_mm: 76,
    height_mm: 100,
    orientation: "portrait",
    pages: [{
      page_number: 1,
      backgroundColor: "#FFFFFF",
      backgroundImage: "",
      corner_radius_mm: 8,
      border_color: "#E2E8F0",
      border_width_px: 1,
      border_style: "solid",
      fields: [
        {
          id: "field-name",
          type: "text",
          placeholder: "{{name}}",
          x_mm: 5,
          y_mm: 20,
          width_mm: 66,
          height_mm: 12,
          color: "#0F172A",
          fontFamily: "Inter",
          fontSize: 16,
          bold: true,
          align: "center"
        },
        {
          id: "field-role",
          type: "text",
          placeholder: "{{role}}",
          x_mm: 5,
          y_mm: 36,
          width_mm: 66,
          height_mm: 8,
          color: "#2563EB",
          fontFamily: "Inter",
          fontSize: 12,
          bold: true,
          align: "center"
        },
        {
          id: "field-company",
          type: "text",
          placeholder: "{{company}}",
          x_mm: 5,
          y_mm: 46,
          width_mm: 66,
          height_mm: 8,
          color: "#64748B",
          fontFamily: "Inter",
          fontSize: 10,
          align: "center"
        },
        {
          id: "field-qr",
          type: "qr",
          placeholder: "QR Code",
          x_mm: 23,
          y_mm: 58,
          width_mm: 30,
          height_mm: 30,
          color: "#000000",
          bgColor: "#FFFFFF",
          qrValue: "{{regno}}"
        }
      ]
    }]
  });

  // Preview Data
  const previewData = {
    name: "Rohit Sharma",
    first_name: "Rohit",
    last_name: "Sharma",
    role: "DELEGATE",
    regno: "REG-9872",
    company: "Apex Innovations",
    designation: "Lead Engineer",
    email: "rohit.sharma@apex.com",
    phone: "+91 98765 43210",
    paid_status: "Paid"
  };

  // Fetch Templates
  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res: any = await apiGet("/venue/registration/templates");
      const list = Array.isArray(res) ? res : res.items || [];
      setTemplates(list);
    } catch (e) {
      console.warn("Failed to fetch templates:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSelectTemplate = (t: any) => {
    setCurrentTemplateId(t.id);
    const data = t.template_data || t.templateData || t;
    if (data.pages) {
      setTemplate(data);
    }
    setViewMode("editor");
  };

  const handleCreateNew = () => {
    setCurrentTemplateId("new");
    setTemplate({
      template_name: `New Badge Template #${templates.length + 1}`,
      template_type: "badge",
      width_mm: 76,
      height_mm: 100,
      orientation: "portrait",
      pages: [{
        page_number: 1,
        backgroundColor: "#FFFFFF",
        backgroundImage: "",
        corner_radius_mm: 8,
        fields: [
          {
            id: `field-${uuidv4().substring(0, 6)}`,
            type: "text",
            placeholder: "{{name}}",
            x_mm: 5,
            y_mm: 20,
            width_mm: 66,
            height_mm: 12,
            color: "#0F172A",
            fontFamily: "Inter",
            fontSize: 16,
            bold: true,
            align: "center"
          }
        ]
      }]
    });
    setViewMode("editor");
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const payload = {
        template_name: template.template_name,
        template_type: template.template_type || "badge",
        template_data: template
      };

      if (currentTemplateId === "new") {
        await apiPost("/venue/registration/templates", payload);
        toast.success("Template created successfully!");
      } else {
        await apiPost(`/venue/registration/templates`, { ...payload, id: currentTemplateId });
        toast.success("Template saved successfully!");
      }
      fetchTemplates();
      setViewMode("list");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to save template.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddField = (type: string, extra: any = {}) => {
    const activePage = template.pages[0];
    const newField = {
      id: `field-${uuidv4().substring(0, 6)}`,
      type,
      x_mm: 10,
      y_mm: 10,
      width_mm: type === "qr" || type === "contact_qr" ? 25 : 50,
      height_mm: type === "qr" || type === "contact_qr" ? 25 : 10,
      color: "#0F172A",
      fontFamily: "Inter",
      fontSize: 12,
      placeholder: type === "text" ? "{{name}}" : "Placeholder",
      align: "center",
      ...extra
    };

    setTemplate({
      ...template,
      pages: [{
        ...activePage,
        fields: [...activePage.fields, newField]
      }]
    });
    setSelectedFieldId(newField.id);
  };

  const handleTestPrint = async () => {
    try {
      toast.info("Generating preview PDF spool...");
      const pdf = await compileTemplateToPdf([previewData], template, { name: "EventX OS" });
      const blobUrl = URL.createObjectURL(pdf.output("blob"));
      window.open(blobUrl, "_blank");
      toast.success("Printable PDF opened in new tab!");
    } catch (e: any) {
      toast.error("Test print failed.");
    }
  };

  const activePage = template.pages[0];
  const selectedField = activePage?.fields.find((f: any) => f.id === selectedFieldId);

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Top Bar Header */}
      <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-[var(--text)] tracking-tight flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-[var(--acc)]" />
            Admin Badge & Certificate Template Studio
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Design custom badge layouts, drag-and-drop dynamic variables, and set active venue print templates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {viewMode === "editor" ? (
            <>
              <Button variant="outline" onClick={() => setViewMode("list")} className="h-10 text-xs font-bold">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back to Templates List
              </Button>

              <Button onClick={handleTestPrint} variant="outline" className="h-10 text-xs font-bold gap-2">
                <Printer className="w-4 h-4 text-[var(--acc)]" /> Test Print PDF
              </Button>

              <Button onClick={handleSave} disabled={loading} className="h-10 bg-[var(--pri)] text-[var(--primary-contrast)] font-bold gap-2">
                <Save className="w-4 h-4" /> Save Template
              </Button>
            </>
          ) : (
            <Button onClick={handleCreateNew} className="h-10 bg-[var(--pri)] text-[var(--primary-contrast)] font-bold gap-2">
              <Plus className="w-4 h-4" /> Create New Template
            </Button>
          )}
        </div>
      </div>

      {/* VIEW MODE 1: Saved Templates List Grid */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {loading ? (
            <div className="py-20 text-center text-[var(--muted)] bg-[var(--card)] rounded-2xl border border-[var(--border)]">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[var(--pri)] mb-3" />
              <p className="text-sm font-bold">Loading saved badge & certificate templates...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="bg-[var(--card)] p-12 text-center rounded-2xl border border-[var(--border)] space-y-4">
              <LayoutGrid className="w-12 h-12 text-[var(--muted)] mx-auto opacity-50" />
              <h3 className="text-lg font-bold text-[var(--text)]">No Templates Designed Yet</h3>
              <p className="text-xs text-[var(--muted)]">Create your first custom thermal badge or certificate template.</p>
              <Button onClick={handleCreateNew} className="bg-[var(--pri)] text-[var(--primary-contrast)] font-bold">
                Create First Template
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm hover:border-[var(--pri)]/50 transition-all flex flex-col justify-between space-y-4 group"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-[var(--raised)] border border-[var(--border)] text-[var(--acc)]">
                        {t.template_type || "Badge"}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--muted)]">
                        {t.template_data?.width_mm || 76}x{t.template_data?.height_mm || 100} mm
                      </span>
                    </div>

                    <h3 className="text-base font-black text-[var(--text)] tracking-tight line-clamp-1">
                      {t.template_name || t.templateName || "Unnamed Template"}
                    </h3>
                  </div>

                  {/* Thumbnail Card Simulation */}
                  <div className="h-44 bg-[var(--surf)] rounded-xl border border-[var(--border)] p-4 flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="w-[120px] h-[160px] bg-white border border-slate-300 rounded-md p-2 flex flex-col items-center justify-between shadow-sm scale-90">
                      <div className="text-[8px] font-bold text-slate-900 text-center">Rohit Sharma</div>
                      <div className="text-[6px] font-bold text-blue-600">DELEGATE</div>
                      <QrCode className="w-8 h-8 text-slate-900" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                    <Button variant="outline" size="sm" onClick={() => handleSelectTemplate(t)} className="h-8 text-xs font-bold flex-1">
                      Edit Canvas
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: Interactive Drag-and-Drop Editor */}
      {viewMode === "editor" && (
        <div className="grid grid-cols-12 gap-6 items-start">
          {/* Left Toolbox */}
          <div className="col-span-3 bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 space-y-4 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--muted)]">Add Elements</h3>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => handleAddField("text", { placeholder: "{{name}}" })} className="h-10 text-xs font-bold justify-start">
                <Type className="w-4 h-4 mr-2 text-blue-500" /> Text Token
              </Button>

              <Button variant="outline" size="sm" onClick={() => handleAddField("qr", { qrValue: "{{regno}}" })} className="h-10 text-xs font-bold justify-start">
                <QrCode className="w-4 h-4 mr-2 text-indigo-500" /> QR Code
              </Button>

              <Button variant="outline" size="sm" onClick={() => handleAddField("contact_qr")} className="h-10 text-xs font-bold justify-start">
                <Phone className="w-4 h-4 mr-2 text-purple-500" /> vCard QR
              </Button>

              <Button variant="outline" size="sm" onClick={() => handleAddField("shape", { shapeType: "rectangle", color: "#2563EB" })} className="h-10 text-xs font-bold justify-start">
                <Shapes className="w-4 h-4 mr-2 text-amber-500" /> Shape
              </Button>
            </div>

            <div className="pt-4 border-t border-[var(--border)] space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Preset Size</label>
              <select
                value={`${template.width_mm}x${template.height_mm}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split("x").map(Number);
                  setTemplate({ ...template, width_mm: w, height_mm: h });
                }}
                className="w-full h-9 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--surf)]"
              >
                {PRESET_BADGE_SIZES.map((s) => (
                  <option key={s.name} value={`${s.width}x${s.height}`}>
                    {s.name} ({s.width}x{s.height}mm)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Center Interactive Canvas */}
          <div className="col-span-6 bg-[var(--card)] rounded-2xl border border-[var(--border)] p-8 shadow-sm flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
            <div
              style={{
                width: `${mmToPx(template.width_mm)}px`,
                height: `${mmToPx(template.height_mm)}px`,
                backgroundColor: activePage?.backgroundColor || "#FFFFFF",
                borderRadius: `${activePage?.corner_radius_mm || 0}mm`,
              }}
              className="relative border-2 border-slate-400 shadow-2xl overflow-hidden bg-white"
            >
              {activePage?.fields.map((f: any) => {
                const isSelected = selectedFieldId === f.id;
                return (
                  <Rnd
                    key={f.id}
                    position={{ x: mmToPx(f.x_mm), y: mmToPx(f.y_mm) }}
                    size={{ width: mmToPx(f.width_mm), height: mmToPx(f.height_mm) }}
                    onDragStop={(e, d) => {
                      const updated = activePage.fields.map((item: any) =>
                        item.id === f.id ? { ...item, x_mm: pxToMm(d.x), y_mm: pxToMm(d.y) } : item
                      );
                      setTemplate({ ...template, pages: [{ ...activePage, fields: updated }] });
                    }}
                    onResizeStop={(e, dir, ref, delta, pos) => {
                      const updated = activePage.fields.map((item: any) =>
                        item.id === f.id
                          ? {
                              ...item,
                              width_mm: pxToMm(parseInt(ref.style.width)),
                              height_mm: pxToMm(parseInt(ref.style.height)),
                              x_mm: pxToMm(pos.x),
                              y_mm: pxToMm(pos.y),
                            }
                          : item
                      );
                      setTemplate({ ...template, pages: [{ ...activePage, fields: updated }] });
                    }}
                    onClick={(e: any) => {
                      e.stopPropagation();
                      setSelectedFieldId(f.id);
                    }}
                    bounds="parent"
                    className={`cursor-move ${isSelected ? "ring-2 ring-blue-600 ring-offset-2" : ""}`}
                  >
                    <div className="w-full h-full flex items-center justify-center relative select-none">
                      {f.type === "text" && (
                        <span
                          style={{
                            fontSize: `${f.fontSize || 12}pt`,
                            color: f.color || "#000000",
                            fontWeight: f.bold ? "bold" : "normal",
                            fontFamily: f.fontFamily || "Inter",
                          }}
                        >
                          {f.placeholder}
                        </span>
                      )}
                      {f.type === "qr" && <QrCode className="w-full h-full text-slate-900" />}
                      {f.type === "contact_qr" && <QrCode className="w-full h-full text-blue-600" />}
                      {f.type === "shape" && (
                        <div style={{ backgroundColor: f.color || "#2563EB" }} className="w-full h-full rounded" />
                      )}
                    </div>
                  </Rnd>
                );
              })}
            </div>
          </div>

          {/* Right Inspector Panel */}
          <div className="col-span-3 bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 space-y-4 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--muted)]">Inspector Settings</h3>

            {selectedField ? (
              <div className="space-y-4">
                <div className="text-xs font-mono font-bold text-[var(--acc)]">ID: {selectedField.id}</div>

                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--muted)]">Text / Token</label>
                  <Input
                    value={selectedField.placeholder || ""}
                    onChange={(e) => {
                      const updated = activePage.fields.map((item: any) =>
                        item.id === selectedField.id ? { ...item, placeholder: e.target.value } : item
                      );
                      setTemplate({ ...template, pages: [{ ...activePage, fields: updated }] });
                    }}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--muted)]">Font Size (pt)</label>
                  <Input
                    type="number"
                    value={selectedField.fontSize || 12}
                    onChange={(e) => {
                      const updated = activePage.fields.map((item: any) =>
                        item.id === selectedField.id ? { ...item, fontSize: parseInt(e.target.value) || 12 } : item
                      );
                      setTemplate({ ...template, pages: [{ ...activePage, fields: updated }] });
                    }}
                    className="h-9 text-xs"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const updated = activePage.fields.filter((item: any) => item.id !== selectedField.id);
                    setTemplate({ ...template, pages: [{ ...activePage, fields: updated }] });
                    setSelectedFieldId(null);
                  }}
                  className="w-full text-red-500 hover:bg-red-500/10 text-xs font-bold"
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Delete Field
                </Button>
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)] font-medium">Select an element on canvas to modify properties.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
