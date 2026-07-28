"use client";

import React, { useState, useEffect, useRef, useReducer, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CapabilityAction, useOperationAccess } from "@/lib/capabilities";

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
  { name: "CR80 (Standard Card)", width: 86, height: 54 },
  { name: "Executive Badge", width: 100, height: 76 },
  { name: "A6 Size", width: 105, height: 148 },
  { name: "A5 Size", width: 148, height: 210 },
  { name: "Square Badge", width: 100, height: 100 }
];

export default function PremiumBadgeDesigner() {
  const { eventId } = useParams();
  const router = useRouter();
  const customDesignAccess = useOperationAccess("badges.custom_design.manage");
  const qrDesignAccess = useOperationAccess("badges.qr.manage");

  // ----- State Definition -----
  const [templates, setTemplates] = useState<any[]>([]);
  const [currentTemplateId, setCurrentTemplateId] = useState<string>("new");
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("components");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [canvasZoom, setCanvasZoom] = useState<number>(1.0);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [inspectorTab, setInspectorTab] = useState<"design" | "settings">("design");

  // Template State
  const [template, setTemplate] = useState<any>({
    template_name: "TechConf 2025 - Delegate Badge",
    template_type: "badge",
    width_mm: 86,
    height_mm: 54,
    orientation: "portrait",
    pages: [{
      page_number: 1,
      backgroundColor: "#FFFFFF",
      backgroundImage: "",
      corner_radius_mm: 8,
      border_color: "#E5E7EB",
      border_width_px: 1,
      border_style: "solid",
      shadow_enabled: true,
      shadow_color: "#000000",
      shadow_alpha: 0.15,
      shadow_x: 0,
      shadow_y: 2,
      shadow_blur: 6,
      fields: [
        {
          id: "field-logo",
          type: "image",
          placeholder: "Logo",
          x_mm: 8,
          y_mm: 6,
          width_mm: 18,
          height_mm: 8,
          src: "https://placehold.co/100x50/8B5CF6/FFFFFF?text=TechConf",
          rotation: 0,
          locked: false
        },
        {
          id: "field-name",
          type: "text",
          placeholder: "Rohit Sharma",
          x_mm: 8,
          y_mm: 20,
          width_mm: 70,
          height_mm: 10,
          color: "#18181B",
          fontFamily: "Poppins",
          fontSize: 16,
          bold: true,
          italic: false,
          underline: false,
          align: "center",
          rotation: 0,
          locked: false
        },
        {
          id: "field-role",
          type: "text",
          placeholder: "DELEGATE",
          x_mm: 18,
          y_mm: 32,
          width_mm: 50,
          height_mm: 6,
          color: "#FFFFFF",
          bgColor: "#8B5CF6",
          fontFamily: "Inter",
          fontSize: 10,
          bold: true,
          align: "center",
          rotation: 0,
          locked: false
        },
        {
          id: "field-qr",
          type: "qr",
          placeholder: "QR Code",
          x_mm: 33,
          y_mm: 40,
          width_mm: 20,
          height_mm: 20,
          color: "#000000",
          bgColor: "#FFFFFF",
          qrValue: "{{regno}}",
          rotation: 0,
          locked: false
        }
      ]
    }]
  });

  // Preview / Live values
  const [previewData] = useState<Record<string, string>>({
    name: "Rohit Sharma",
    Name: "Rohit Sharma",
    first_name: "Rohit",
    last_name: "Sharma",
    role: "DELEGATE",
    regno: "X7D8F2",
    company: "NextGen Solutions",
    designation: "Product Manager",
    email: "rohit.sharma@nextgen.com",
    phone: "+91 98765 43210",
    photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80",
    event_name: "TechConf 2025",
    event_date: "20 - 22 May, 2025",
    venue: "Bangalore, India"
  });

  // Undo/Redo Stacks
  const [history, setHistory] = useState<any[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // ----- Load/Save Database templates -----
  const fetchTemplates = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await apiGet<any[]>(`/events/${eventId}/print-templates`);
      const badgeTemplates = res.filter(t => t.template_type === "badge");
      setTemplates(badgeTemplates);
      if (badgeTemplates.length > 0 && currentTemplateId === "new") {
        // Load first template by default if desired
      }
    } catch (e) {
      console.warn("Could not fetch print templates", e);
    }
  }, [eventId, currentTemplateId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // History Recording
  const pushState = useCallback((nextState: any) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(nextState)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const updateTemplate = (updater: (prev: any) => any) => {
    setTemplate((prev: any) => {
      const next = updater(prev);
      pushState(next);
      return next;
    });
  };

  const undo = () => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      setTemplate(JSON.parse(JSON.stringify(history[nextIdx])));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setTemplate(JSON.parse(JSON.stringify(history[nextIdx])));
    }
  };

  // Initialize History
  useEffect(() => {
    if (history.length === 0) {
      setHistory([JSON.parse(JSON.stringify(template))]);
      setHistoryIndex(0);
    }
  }, [template, history]);

  // Dynamic Google Font Loader
  useEffect(() => {
    const fonts = new Set<string>();
    template.pages.forEach((p: any) => {
      p.fields.forEach((f: any) => {
        if (f.fontFamily) fonts.add(f.fontFamily);
      });
    });
    if (fonts.size === 0) return;
    const fontNames = Array.from(fonts).filter(f => !["Arial", "Times New Roman", "Georgia", "Courier New", "Verdana"].includes(f));
    if (fontNames.length === 0) return;
    const query = fontNames.map(f => `family=${f.replace(/\s+/g, "+")}:ital,wght@0,400;0,700;1,400;1,700`).join("&");
    const linkId = "designer-dynamic-fonts";
    let link = document.getElementById(linkId) as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  }, [template]);

  // ----- Template Actions -----
  const handleSave = async () => {
    if (!template.template_name || template.template_name.trim() === "") {
      toast.error("Template name is required.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        template_name: template.template_name,
        template_type: "badge",
        template_data: template
      };
      if (currentTemplateId === "new") {
        const res = await apiPost<any>(`/events/${eventId}/print-templates`, payload, { headers: { "Idempotency-Key": crypto.randomUUID() } });
        toast.success("Badge template created successfully!");
        setCurrentTemplateId(res.id);
      } else {
        await apiPatch<any>(`/events/${eventId}/print-templates/${currentTemplateId}`, payload, {
          headers: { "Idempotency-Key": crypto.randomUUID() },
        });
        toast.success("Badge template updated successfully!");
      }
      await fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || "Failed to save template.");
    } finally {
      setLoading(false);
    }
  };

  const sanitizeTemplate = (temp: any) => {
    if (!temp || !temp.pages) return temp;
    const cleanTemp = JSON.parse(JSON.stringify(temp));
    const seenIds = new Set<string>();
    
    cleanTemp.pages.forEach((page: any) => {
      if (!page.fields) return;
      page.fields.forEach((field: any) => {
        if (!field.id || seenIds.has(field.id)) {
          field.id = `field-${uuidv4().substring(0, 8)}`;
        }
        seenIds.add(field.id);
      });
    });
    return cleanTemp;
  };

  const handleLoadTemplate = (t: any) => {
    setCurrentTemplateId(t.id);
    const cleanData = sanitizeTemplate(t.template_data || t);
    setTemplate(cleanData);
    setSelectedFieldId(null);
    toast.success(`Loaded template: ${t.template_name}`);
  };

  // ----- Drag/Drop Field Mutators -----
  const addField = (type: string, placeholder: string, customProps: any = {}) => {
    const access = type === "qr" ? qrDesignAccess : ["image", "shape"].includes(type) ? customDesignAccess : null;
    if (access && !access.enabled) {
      toast.error(`This design element is unavailable: ${(access.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}.`);
      return;
    }
    const page = template.pages[activePageIndex];
    const newField = {
      id: `field-${uuidv4().substring(0, 8)}`,
      type,
      placeholder,
      x_mm: Math.round(template.width_mm / 4),
      y_mm: Math.round(template.height_mm / 3),
      width_mm: type === "qr" || type === "photo" ? 20 : 50,
      height_mm: type === "qr" || type === "photo" ? 20 : 8,
      rotation: 0,
      locked: false,
      ...customProps
    };

    updateTemplate((prev) => {
      const next = { ...prev };
      next.pages[activePageIndex].fields.push(newField);
      return next;
    });
    setSelectedFieldId(newField.id);
  };

  const deleteField = (fieldId: string) => {
    updateTemplate((prev) => {
      const next = { ...prev };
      next.pages[activePageIndex].fields = next.pages[activePageIndex].fields.filter((f: any) => f.id !== fieldId);
      return next;
    });
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  };

  const duplicateField = (fieldId: string) => {
    const currentFields = template.pages[activePageIndex].fields;
    const target = currentFields.find((f: any) => f.id === fieldId);
    if (!target) return;

    const dup = {
      ...JSON.parse(JSON.stringify(target)),
      id: `field-${uuidv4().substring(0, 8)}`,
      x_mm: Math.min(template.width_mm - 10, target.x_mm + 4),
      y_mm: Math.min(template.height_mm - 10, target.y_mm + 4)
    };

    updateTemplate((prev) => {
      const next = { ...prev };
      next.pages[activePageIndex].fields.push(dup);
      return next;
    });
    setSelectedFieldId(dup.id);
  };

  const updateFieldProperty = (fieldId: string, property: string, value: any) => {
    setTemplate((prev: any) => {
      const next = { ...prev };
      const fields = next.pages[activePageIndex].fields;
      const idx = fields.findIndex((f: any) => f.id === fieldId);
      if (idx !== -1) {
        fields[idx] = { ...fields[idx], [property]: value };
      }
      return next;
    });
  };

  const saveFieldPropertyToHistory = () => {
    pushState(template);
  };

  // Layer Ordering
  const moveLayer = (fieldId: string, direction: "up" | "down" | "top" | "bottom") => {
    updateTemplate((prev) => {
      const next = { ...prev };
      const fields = [...next.pages[activePageIndex].fields];
      const idx = fields.findIndex((f: any) => f.id === fieldId);
      if (idx === -1) return prev;

      const [target] = fields.splice(idx, 1);
      if (direction === "up") {
        fields.splice(Math.min(fields.length, idx + 1), 0, target);
      } else if (direction === "down") {
        fields.splice(Math.max(0, idx - 1), 0, target);
      } else if (direction === "top") {
        fields.push(target);
      } else if (direction === "bottom") {
        fields.unshift(target);
      }
      next.pages[activePageIndex].fields = fields;
      return next;
    });
  };

  // ----- Standalone Preview PDF Compiler -----
  const generatePreviewPdf = async (downloadDirect: boolean = false) => {
    setLoading(true);
    toast.info("Preparing visual document preview...");
    try {
      const width_mm = template.width_mm;
      const height_mm = template.height_mm;
      const orientation = template.orientation || "portrait";
      const activePage = template.pages[activePageIndex];

      // Wait for fonts
      if (typeof window !== "undefined") {
        try {
          await document.fonts.ready;
        } catch (e) {
          console.warn("Font preloader check skipped", e);
        }
      }

      // Build isolation sandbox container
      const sandbox = document.createElement("div");
      Object.assign(sandbox.style, {
        position: "absolute",
        top: "-9999px",
        left: "-9999px",
        width: `${mmToPx(width_mm)}px`,
        height: `${mmToPx(height_mm)}px`,
        overflow: "hidden",
        backgroundColor: activePage.backgroundColor || "#FFFFFF"
      });
      document.body.appendChild(sandbox);

      // Render Background Image if present
      if (activePage.backgroundImage) {
        const bgImg = document.createElement("img");
        bgImg.src = activePage.backgroundImage;
        Object.assign(bgImg.style, {
          position: "absolute",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: "0"
        });
        sandbox.appendChild(bgImg);
      }

      // Canvas element layer container
      const fieldsContainer = document.createElement("div");
      Object.assign(fieldsContainer.style, {
        position: "absolute",
        top: "0",
        left: "0",
        right: "0",
        bottom: "0",
        width: "100%",
        height: "100%",
        zIndex: "1"
      });
      sandbox.appendChild(fieldsContainer);

      // Render each element onto the sandbox
      const imageLoadPromises: Promise<any>[] = [];
      const nativeImages: any[] = [];

      for (const f of activePage.fields) {
        const px = mmToPx(f.x_mm);
        const py = mmToPx(f.y_mm);
        const pw = mmToPx(f.width_mm);
        const ph = mmToPx(f.height_mm);

        const fieldEl = document.createElement("div");
        Object.assign(fieldEl.style, {
          position: "absolute",
          left: `${px}px`,
          top: `${py}px`,
          width: `${pw}px`,
          height: `${ph}px`,
          transform: `rotate(${f.rotation || 0}deg)`,
          transformOrigin: "center",
          overflow: "visible"
        });

        const borderCss = f.bgColor ? `background-color: ${f.bgColor};` : "";
        const innerEl = document.createElement("div");
        Object.assign(innerEl.style, {
          position: "absolute",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          overflow: "hidden"
        });

        if (f.type === "text") {
          const justify = f.align === "center" ? "center" : f.align === "right" ? "flex-end" : "flex-start";
          Object.assign(innerEl.style, {
            justifyContent: justify,
            fontFamily: `'${f.fontFamily || "Inter"}', sans-serif`,
            fontSize: `${f.fontSize || 10}pt`,
            color: f.color || "#000000",
            fontWeight: f.bold ? "700" : "400",
            fontStyle: f.italic ? "italic" : "normal",
            textDecoration: f.underline ? "underline" : "none",
            whiteSpace: "nowrap",
            padding: "0 4px",
            boxSizing: "border-box"
          });
          if (f.bgColor) innerEl.style.backgroundColor = f.bgColor;

          const textValue = previewData[f.placeholder] || previewData[f.placeholder.toLowerCase()] || f.placeholder;
          innerEl.innerHTML = `<span style="line-height:1.2;">${textValue}</span>`;
          fieldEl.appendChild(innerEl);

        } else if (f.type === "qr") {
          innerEl.style.justifyContent = "center";
          if (f.bgColor) innerEl.style.backgroundColor = f.bgColor;
          
          const qrSvgString = ReactDOMServer.renderToString(
            <QRCodeSVG
              value={previewData.regno}
              fgColor={f.color || "#000000"}
              bgColor={f.bgColor || "#FFFFFF"}
              size={Math.min(pw, ph)}
              level="M"
            />
          );
          innerEl.innerHTML = qrSvgString;
          fieldEl.appendChild(innerEl);

        } else if (f.type === "image" || f.type === "photo") {
          // Native Image Rendering bypasses canvas resolution issues
          const srcUrl = f.type === "photo" ? previewData.photo : (f.src || "https://placehold.co/200x200");
          nativeImages.push({
            src: srcUrl,
            x: f.x_mm,
            y: f.y_mm,
            w: f.width_mm,
            h: f.height_mm,
            rotation: f.rotation || 0
          });

          // Empty transparent slot inside html2canvas
          const placeholder = document.createElement("div");
          placeholder.style.width = "100%";
          placeholder.style.height = "100%";
          placeholder.style.background = "transparent";
          innerEl.appendChild(placeholder);
          fieldEl.appendChild(innerEl);
        } else if (f.type === "shape") {
          innerEl.style.backgroundColor = f.color || "#8B5CF6";
          if (f.shapeType === "circle") {
            innerEl.style.borderRadius = "50%";
          }
          fieldEl.appendChild(innerEl);
        }

        fieldsContainer.appendChild(fieldEl);
      }

      // Capture overlay canvas
      const canvas = await html2canvas(sandbox, {
        scale: 3,
        useCORS: true,
        backgroundColor: null,
        scrollX: 0,
        scrollY: 0
      });

      // Cleanup DOM sandbox
      document.body.removeChild(sandbox);

      // Create high-res PDF
      const pdf = new jsPDF({
        orientation: orientation === "portrait" ? "portrait" : "landscape",
        unit: "mm",
        format: [width_mm, height_mm]
      });

      // 1. Draw base raster canvas containing shapes, backgrounds, and text
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, width_mm, height_mm);

      // 2. Draw high-res direct images over the top
      for (const imgData of nativeImages) {
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = imgData.src;
          await new Promise((r, j) => {
            img.onload = r;
            img.onerror = j;
            if (img.complete) r(null);
          });

          // Render image onto a temp canvas to handle clip bounds or rounding if needed
          const tCanvas = document.createElement("canvas");
          tCanvas.width = img.naturalWidth;
          tCanvas.height = img.naturalHeight;
          const ctx = tCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            pdf.addImage(
              tCanvas.toDataURL("image/png"),
              "PNG",
              imgData.x,
              imgData.y,
              imgData.w,
              imgData.h
            );
          }
        } catch (e) {
          console.warn("Could not render native image overlay:", imgData.src, e);
        }
      }

      if (downloadDirect) {
        pdf.save(`${template.template_name.replace(/\s+/g, "_")}.pdf`);
        toast.success("Document downloaded successfully!");
      } else {
        const blobUrl = URL.createObjectURL(pdf.output("blob"));
        window.open(blobUrl, "_blank");
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Could not compile document preview.");
    } finally {
      setLoading(false);
    }
  };

  const activePageIndex = 0;
  const activePage = template.pages[activePageIndex];
  const selectedField = activePage.fields.find((f: any) => f.id === selectedFieldId) || null;

  // Filter elements on left panel search
  const filteredBasicComponents = [
    { label: "Text Block", type: "text", placeholder: "Double click to edit", icon: Type },
    { label: "Image Box", type: "image", placeholder: "Image", icon: ImageIcon, customProps: { src: "https://placehold.co/200x200" } },
    { label: "Rectangle", type: "shape", placeholder: "Rectangle", icon: Shapes, customProps: { shapeType: "rectangle", color: "#8B5CF6" } },
    { label: "Circle", type: "shape", placeholder: "Circle", icon: Shapes, customProps: { shapeType: "circle", color: "#8B5CF6" } }
  ].filter(c => c.label.toLowerCase().includes(searchQuery.toLowerCase()));

  const filteredDataFields = [
    { label: "Full Name", type: "text", placeholder: "Name", icon: User },
    { label: "Job Title", type: "text", placeholder: "Designation", icon: BriefcaseIcon },
    { label: "Company", type: "text", placeholder: "Company", icon: BuildingIcon },
    { label: "Email Address", type: "text", placeholder: "Email", icon: Mail },
    { label: "Phone Number", type: "text", placeholder: "Phone", icon: Phone },
    { label: "Ticket Code", type: "text", placeholder: "RegNo", icon: BadgeIcon },
    { label: "Attendee Photo", type: "photo", placeholder: "Photo", icon: User },
    { label: "QR Code", type: "qr", placeholder: "QR Code", icon: QrCode }
  ].filter(c => c.label.toLowerCase().includes(searchQuery.toLowerCase()));

  const filteredEventElements = [
    { label: "Event Name", type: "text", placeholder: "EventName", icon: Calendar },
    { label: "Event Date", type: "text", placeholder: "EventStartDate", icon: Clock },
    { label: "Venue Location", type: "text", placeholder: "Venue", icon: MapPin }
  ].filter(c => c.label.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-[14px] relative shadow-2xl">
      {/* Top Header */}
      <div className="flex-shrink-0 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between px-6 py-3 h-14 z-20">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-purple-500 animate-pulse" />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={template.template_name}
              onChange={(e) => updateTemplate(prev => ({ ...prev, template_name: e.target.value }))}
              className="bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-purple-500 focus:outline-none text-sm font-black uppercase tracking-wider text-zinc-100 px-1 py-0.5"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* History Controls */}
          <div className="flex gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-850">
            <Button
              onClick={undo}
              disabled={historyIndex <= 0}
              variant="ghost"
              className="h-7 w-7 p-0 hover:bg-zinc-800 text-zinc-400 disabled:opacity-30 rounded-md"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              variant="ghost"
              className="h-7 w-7 p-0 hover:bg-zinc-800 text-zinc-400 disabled:opacity-30 rounded-md"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          <Button
            onClick={() => generatePreviewPdf(false)}
            variant="outline"
            className="h-8 gap-2 border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider rounded-lg"
          >
            <Eye className="h-4 w-4" /> Preview
          </Button>

          <CapabilityAction operation="badges.templates.manage">
            <Button
              onClick={handleSave}
              disabled={loading}
              className="h-8 gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold uppercase tracking-wider rounded-lg border border-zinc-700"
            >
              <Save className="h-4 w-4" /> Save
            </Button>
          </CapabilityAction>

          <CapabilityAction operation="badges.export">
            <Button
              onClick={() => generatePreviewPdf(true)}
              className="h-8 gap-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-widest rounded-lg shadow-lg shadow-purple-600/10"
            >
              <Printer className="h-4 w-4" /> Export PDF
            </Button>
          </CapabilityAction>
        </div>
      </div>

      {/* Workspace Area */}
      <div className="flex-grow flex w-full overflow-hidden">
        
        {/* Left Toolbar Tabs */}
        <div className="w-16 flex-shrink-0 bg-zinc-900 border-r border-zinc-850 flex flex-col items-center py-4 gap-4">
          {[
            { id: "components", icon: Grid, label: "Components" },
            { id: "templates", icon: LayoutGrid, label: "Templates" },
            { id: "layers", icon: Database, label: "Layers" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`p-2.5 rounded-xl transition-all relative group ${
                activeTab === tab.id
                  ? "bg-purple-600/10 border border-purple-500/30 text-purple-400"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-850"
              }`}
            >
              <tab.icon className="h-5 w-5" />
              <span className="absolute left-16 bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-30 shadow-xl uppercase font-bold tracking-wider">
                {tab.label}
              </span>
            </button>
          ))}
        </div>

        {/* Side Panel Expanded Drawer */}
        <div className="w-64 flex-shrink-0 bg-zinc-900/40 border-r border-zinc-850 flex flex-col p-4 overflow-y-auto">
          {activeTab === "components" && (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 mb-2">Elements</h3>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-650" />
                  <Input
                    type="text"
                    placeholder="Search components..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 bg-zinc-950 border-zinc-850 text-xs text-zinc-300 focus:border-purple-500 h-8 rounded-lg"
                  />
                </div>
              </div>

              {/* Basic elements grid */}
              {filteredBasicComponents.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2">Basic</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {filteredBasicComponents.map(item => (
                      <button
                        key={item.label}
                        onClick={() => addField(item.type, item.placeholder, (item as any).customProps)}
                        disabled={["image", "shape"].includes(item.type) && (customDesignAccess.loading || !customDesignAccess.enabled)}
                        className="p-3 bg-zinc-950 hover:bg-zinc-850 border border-zinc-850 hover:border-zinc-700 rounded-xl flex flex-col items-center justify-center text-center gap-1.5 transition-all"
                      >
                        <item.icon className="h-4 w-4 text-purple-400" />
                        <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-wide">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Data Fields */}
              {filteredDataFields.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2">Data Fields</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {filteredDataFields.map(item => (
                      <button
                        key={item.label}
                        onClick={() => addField(item.type, item.placeholder, (item as any).customProps)}
                        disabled={item.type === "qr" && (qrDesignAccess.loading || !qrDesignAccess.enabled)}
                        className="p-3 bg-zinc-950 hover:bg-zinc-850 border border-zinc-850 hover:border-zinc-700 rounded-xl flex flex-col items-center justify-center text-center gap-1.5 transition-all"
                      >
                        <item.icon className="h-4 w-4 text-purple-400" />
                        <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-wide">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Event Fields */}
              {filteredEventElements.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2">Event Elements</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {filteredEventElements.map(item => (
                      <button
                        key={item.label}
                        onClick={() => addField(item.type, item.placeholder, (item as any).customProps)}
                        className="p-3 bg-zinc-950 hover:bg-zinc-850 border border-zinc-850 hover:border-zinc-700 rounded-xl flex flex-col items-center justify-center text-center gap-1.5 transition-all"
                      >
                        <item.icon className="h-4 w-4 text-purple-400" />
                        <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-wide">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "templates" && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 mb-2">Templates</h3>
              {templates.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-zinc-800 rounded-xl">
                  <span className="text-[10px] text-zinc-650 font-bold uppercase tracking-wider">No existing templates</span>
                </div>
              ) : (
                templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleLoadTemplate(t)}
                    className={`p-3 text-left bg-zinc-950 hover:bg-zinc-850 border rounded-xl flex flex-col gap-1 transition-all ${
                      currentTemplateId === t.id ? "border-purple-500/50" : "border-zinc-850"
                    }`}
                  >
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-wider truncate w-full">{t.template_name}</span>
                    <span className="text-[8px] font-semibold text-zinc-600 uppercase tracking-widest">Type: {t.template_type}</span>
                  </button>
                ))
              )}

              <Button
                onClick={() => {
                  setCurrentTemplateId("new");
                  setTemplate({
                    template_name: "New Badge Template",
                    template_type: "badge",
                    width_mm: 86,
                    height_mm: 54,
                    orientation: "portrait",
                    pages: [{
                      page_number: 1,
                      backgroundColor: "#FFFFFF",
                      corner_radius_mm: 8,
                      border_color: "#E5E7EB",
                      border_width_px: 1,
                      border_style: "solid",
                      fields: []
                    }]
                  });
                  setSelectedFieldId(null);
                  toast.success("Created empty template slate");
                }}
                className="mt-4 bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-zinc-200 uppercase text-[10px] font-black tracking-widest w-full py-2.5 rounded-xl"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> New Slate
              </Button>
            </div>
          )}

          {activeTab === "layers" && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 mb-2">Layers</h3>
              {activePage.fields.length === 0 ? (
                <div className="text-center py-6 text-zinc-600 text-xs">No elements on canvas</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {[...activePage.fields].reverse().map((f: any) => (
                    <div
                      key={f.id}
                      onClick={() => setSelectedFieldId(f.id)}
                      className={`p-2.5 bg-zinc-950 border rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                        selectedFieldId === f.id ? "border-purple-500" : "border-zinc-850 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-zinc-900 text-purple-400 rounded-md border border-zinc-800">
                          {f.type}
                        </span>
                        <span className="text-[10px] font-bold text-zinc-400 truncate max-w-[100px]">{f.placeholder}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); moveLayer(f.id, "up"); }}
                          className="p-1 hover:bg-zinc-850 rounded text-zinc-500 hover:text-zinc-350"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveLayer(f.id, "down"); }}
                          className="p-1 hover:bg-zinc-850 rounded text-zinc-500 hover:text-zinc-350"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteField(f.id); }}
                          className="p-1 hover:bg-zinc-850 rounded text-red-500 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center Canvas Studio Workdesk */}
        <div className="flex-grow bg-zinc-950 overflow-auto flex flex-col items-center py-10 relative">
          
          {/* Zoom controls floating toolbar */}
          <div className="absolute right-6 top-6 bg-zinc-900/90 border border-zinc-800/80 px-2 py-1.5 rounded-xl flex items-center gap-2 z-10 backdrop-blur-md shadow-xl">
            <Button
              onClick={() => setCanvasZoom(z => Math.max(0.5, z - 0.1))}
              variant="ghost"
              className="h-7 w-7 p-0 text-zinc-450 hover:text-zinc-350 hover:bg-zinc-800 rounded-lg"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest w-12 text-center">
              {Math.round(canvasZoom * 100)}%
            </span>
            <Button
              onClick={() => setCanvasZoom(z => Math.min(2.5, z + 0.1))}
              variant="ghost"
              className="h-7 w-7 p-0 text-zinc-450 hover:text-zinc-350 hover:bg-zinc-800 rounded-lg"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* LANYARD MOCKUP WRAPPER */}
          <div
            className="flex flex-col items-center transition-all duration-300"
            style={{ transform: `scale(${canvasZoom})`, transformOrigin: "top center" }}
          >
            {/* Lanyard Strap */}
            <div className="w-10 h-28 bg-gradient-to-b from-purple-700/60 to-purple-600 border border-purple-500/20 relative rounded-t-lg shadow-inner z-0 flex justify-center">
              {/* Branding text on strap */}
              <div className="absolute top-8 transform rotate-90 text-[8px] font-black uppercase text-purple-200 tracking-[0.25em] whitespace-nowrap">
                TechConf
              </div>
            </div>

            {/* Lanyard Clip Attachment */}
            <div className="w-8 h-8 -mt-2 bg-zinc-800 border border-zinc-700 rounded-full z-10 flex items-center justify-center shadow-lg relative">
              <div className="w-4 h-6 bg-zinc-650 border border-zinc-550 rounded-b-md z-20 flex items-end pb-0.5 justify-center shadow-inner">
                {/* Loop hook metal */}
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-800 border border-zinc-750"></div>
              </div>
            </div>

            {/* Badge Holder Sleeve Shell */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 p-5 rounded-[22px] backdrop-blur-md shadow-2xl relative -mt-1 flex flex-col items-center">
              
              {/* Strap clip horizontal slot hole */}
              <div className="w-14 h-3.5 bg-zinc-950 border border-zinc-800/60 rounded-full mb-4 shadow-inner flex items-center justify-center">
                <div className="w-3 h-3 bg-zinc-900/40 border border-zinc-800/20 rounded-full"></div>
              </div>

              {/* The Actual Badge Canvas Container */}
              <div
                className="relative shadow-inner overflow-hidden select-none"
                style={{
                  width: `${mmToPx(template.width_mm)}px`,
                  height: `${mmToPx(template.height_mm)}px`,
                  backgroundColor: activePage.backgroundColor || "#FFFFFF",
                  borderRadius: `${activePage.corner_radius_mm || 0}px`,
                  border: activePage.border_width_px
                    ? `${activePage.border_width_px}px ${activePage.border_style || "solid"} ${activePage.border_color || "#E5E7EB"}`
                    : "none",
                  boxShadow: activePage.shadow_enabled
                    ? `${activePage.shadow_x || 0}px ${activePage.shadow_y || 2}px ${activePage.shadow_blur || 6}px rgba(0,0,0,${activePage.shadow_alpha || 0.15})`
                    : "none"
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setSelectedFieldId(null);
                }}
              >
                {/* Background Image if uploaded */}
                {activePage.backgroundImage && (
                  <img
                    src={activePage.backgroundImage}
                    alt="Badge background"
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
                  />
                )}

                {/* Render page elements */}
                <div className="absolute inset-0 z-10 w-full h-full">
                  {activePage.fields.map((f: any) => {
                    const isSelected = selectedFieldId === f.id;
                    const px = mmToPx(f.x_mm);
                    const py = mmToPx(f.y_mm);
                    const pw = mmToPx(f.width_mm);
                    const ph = mmToPx(f.height_mm);

                    const borderCss = f.bgColor ? `background-color: ${f.bgColor};` : "";
                    const align = f.align || "left";
                    const justify = f.align === "center" ? "center" : f.align === "right" ? "flex-end" : "flex-start";

                    return (
                      <Rnd
                        key={f.id}
                        size={{ width: pw, height: ph }}
                        position={{ x: px, y: py }}
                        disableDragging={f.locked}
                        enableResizing={!f.locked}
                        onDragStop={(e, d) => {
                          updateFieldProperty(f.id, "x_mm", Math.round(pxToMm(d.x)));
                          updateFieldProperty(f.id, "y_mm", Math.round(pxToMm(d.y)));
                          saveFieldPropertyToHistory();
                        }}
                        onResizeStop={(e, direction, ref, delta, position) => {
                          updateFieldProperty(f.id, "width_mm", Math.round(pxToMm(ref.offsetWidth)));
                          updateFieldProperty(f.id, "height_mm", Math.round(pxToMm(ref.offsetHeight)));
                          updateFieldProperty(f.id, "x_mm", Math.round(pxToMm(position.x)));
                          updateFieldProperty(f.id, "y_mm", Math.round(pxToMm(position.y)));
                          saveFieldPropertyToHistory();
                        }}
                        bounds="parent"
                        scale={canvasZoom}
                        className={`group cursor-move ${isSelected ? "z-30" : "z-20"}`}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setSelectedFieldId(f.id);
                        }}
                      >
                        {/* Interactive selection outline */}
                        {isSelected && (
                          <div className="absolute -inset-[2px] border-2 border-purple-500 z-50 pointer-events-none rounded">
                            {/* Drag sizing handles */}
                            <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-purple-500 rounded-full"></div>
                            <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-purple-500 rounded-full"></div>
                            <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-purple-500 rounded-full"></div>
                            <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-purple-500 rounded-full"></div>
                          </div>
                        )}

                        {/* Floating quick helper tools toolbar */}
                        {isSelected && !f.locked && (
                          <div className="absolute -top-9 left-1/2 transform -translate-x-1/2 bg-zinc-900 border border-zinc-800 px-1.5 py-1 rounded-lg flex items-center gap-1.5 shadow-2xl z-50 pointer-events-auto">
                            <button
                              onClick={(e) => { e.stopPropagation(); duplicateField(f.id); }}
                              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                              title="Duplicate"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteField(f.id); }}
                              className="p-1 hover:bg-zinc-800 rounded text-red-500 hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        {/* Field internal contents */}
                        <div
                          className="w-full h-full relative overflow-hidden"
                          style={{
                            transform: `rotate(${f.rotation || 0}deg)`,
                            transformOrigin: "center"
                          }}
                        >
                          {f.type === "text" && (
                            <div
                              className="w-full h-full flex items-center px-1 box-border"
                              style={{
                                justifyContent: justify,
                                fontFamily: `'${f.fontFamily || "Inter"}', sans-serif`,
                                fontSize: `${f.fontSize || 10}pt`,
                                color: f.color || "#000000",
                                fontWeight: f.bold ? "700" : "400",
                                fontStyle: f.italic ? "italic" : "normal",
                                textDecoration: f.underline ? "underline" : "none",
                                backgroundColor: f.bgColor || "transparent",
                                whiteSpace: "nowrap"
                              }}
                            >
                              <span style={{ lineHeight: 1.2 }}>
                                {previewData[f.placeholder] || previewData[f.placeholder.toLowerCase()] || f.placeholder}
                              </span>
                            </div>
                          )}

                          {f.type === "qr" && (
                            <div
                              className="w-full h-full flex items-center justify-center"
                              style={{ backgroundColor: f.bgColor || "#FFFFFF" }}
                            >
                              <QRCodeSVG
                                value={previewData.regno}
                                fgColor={f.color || "#000000"}
                                bgColor={f.bgColor || "#FFFFFF"}
                                size={Math.min(pw, ph) - 4}
                                level="M"
                              />
                            </div>
                          )}

                          {f.type === "image" && (
                            <div
                              className="w-full h-full bg-cover bg-center bg-no-repeat"
                              style={{ backgroundImage: `url(${f.src || "https://placehold.co/200x200"})` }}
                            />
                          )}

                          {f.type === "photo" && (
                            <div
                              className="w-full h-full bg-cover bg-center bg-no-repeat rounded-full border-2 border-purple-500/25"
                              style={{ backgroundImage: `url(${previewData.photo})` }}
                            />
                          )}

                          {f.type === "shape" && (
                            <div
                              className="w-full h-full"
                              style={{
                                backgroundColor: f.color || "#8B5CF6",
                                borderRadius: f.shapeType === "circle" ? "50%" : "0px"
                              }}
                            />
                          )}
                        </div>
                      </Rnd>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Inspector panel */}
        <div className="w-80 flex-shrink-0 bg-zinc-900 border-l border-zinc-850 flex flex-col overflow-y-auto">
          
          {/* Design/Settings Tab buttons */}
          <div className="flex border-b border-zinc-850">
            <button
              onClick={() => setInspectorTab("design")}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-widest text-center border-b-2 transition-all ${
                inspectorTab === "design" ? "border-purple-500 text-purple-400 bg-purple-500/[0.02]" : "border-transparent text-zinc-555 hover:text-zinc-350"
              }`}
            >
              Design
            </button>
            <button
              onClick={() => setInspectorTab("settings")}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-widest text-center border-b-2 transition-all ${
                inspectorTab === "settings" ? "border-purple-500 text-purple-400 bg-purple-500/[0.02]" : "border-transparent text-zinc-555 hover:text-zinc-350"
              }`}
            >
              Settings
            </button>
          </div>

          <div className="p-5 flex flex-col gap-6">
            {inspectorTab === "design" && (
              <>
                {/* Element specific styles block */}
                {selectedField ? (
                  <div className="flex flex-col gap-5">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
                      <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">Element Styling</span>
                      <button
                        onClick={() => setSelectedFieldId(null)}
                        className="p-1 hover:bg-zinc-850 rounded text-zinc-500 hover:text-zinc-300"
                      >
                        <X className="h-4.5 w-4.5" />
                      </button>
                    </div>

                    {/* Position dimensions */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Width (mm)</label>
                        <Input
                          type="number"
                          value={selectedField.width_mm}
                          onChange={(e) => updateFieldProperty(selectedField.id, "width_mm", parseFloat(e.target.value) || 0)}
                          className="bg-zinc-950 border-zinc-850 text-xs text-zinc-300 h-8 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Height (mm)</label>
                        <Input
                          type="number"
                          value={selectedField.height_mm}
                          onChange={(e) => updateFieldProperty(selectedField.id, "height_mm", parseFloat(e.target.value) || 0)}
                          className="bg-zinc-950 border-zinc-850 text-xs text-zinc-300 h-8 rounded-lg"
                        />
                      </div>
                    </div>

                    {/* Text specific inspector settings */}
                    {selectedField.type === "text" && (
                      <div className="flex flex-col gap-4">
                        {/* Font selection */}
                        <div>
                          <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Font Family</label>
                          <select
                            value={selectedField.fontFamily}
                            onChange={(e) => updateFieldProperty(selectedField.id, "fontFamily", e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-300 focus:border-purple-500 rounded-lg p-2 h-8"
                          >
                            {FONT_FAMILIES.map(font => (
                              <option key={font} value={font}>{font}</option>
                            ))}
                          </select>
                        </div>

                        {/* Font size */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Font Size (pt)</label>
                            <span className="text-[10px] font-bold text-zinc-400">{selectedField.fontSize}pt</span>
                          </div>
                          <input
                            type="range"
                            min="6"
                            max="72"
                            value={selectedField.fontSize}
                            onChange={(e) => updateFieldProperty(selectedField.id, "fontSize", parseInt(e.target.value))}
                            className="w-full accent-purple-500"
                          />
                        </div>

                        {/* Text Styling & alignment bar */}
                        <div className="flex gap-2">
                          <Button
                            onClick={() => updateFieldProperty(selectedField.id, "bold", !selectedField.bold)}
                            className={`flex-1 h-8 p-0 rounded-lg border border-zinc-800 ${
                              selectedField.bold ? "bg-purple-600 text-white" : "bg-zinc-950 hover:bg-zinc-850 text-zinc-400"
                            }`}
                          >
                            <Bold className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            onClick={() => updateFieldProperty(selectedField.id, "italic", !selectedField.italic)}
                            className={`flex-1 h-8 p-0 rounded-lg border border-zinc-800 ${
                              selectedField.italic ? "bg-purple-600 text-white" : "bg-zinc-950 hover:bg-zinc-850 text-zinc-400"
                            }`}
                          >
                            <Italic className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            onClick={() => updateFieldProperty(selectedField.id, "underline", !selectedField.underline)}
                            className={`flex-1 h-8 p-0 rounded-lg border border-zinc-800 ${
                              selectedField.underline ? "bg-purple-600 text-white" : "bg-zinc-950 hover:bg-zinc-850 text-zinc-400"
                            }`}
                          >
                            <Underline className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Alignment toggle */}
                        <div className="flex gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-850">
                          {["left", "center", "right"].map(alignVal => (
                            <button
                              key={alignVal}
                              onClick={() => updateFieldProperty(selectedField.id, "align", alignVal)}
                              className={`flex-1 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                                selectedField.align === alignVal ? "bg-zinc-800 text-purple-400" : "text-zinc-500 hover:text-zinc-300"
                              }`}
                            >
                              {alignVal}
                            </button>
                          ))}
                        </div>

                        {/* Colors */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Text Color</label>
                            <div className="flex gap-1.5 items-center">
                              <input
                                type="color"
                                value={selectedField.color || "#000000"}
                                onChange={(e) => updateFieldProperty(selectedField.id, "color", e.target.value)}
                                className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
                              />
                              <span className="text-[10px] font-bold text-zinc-400 uppercase">{selectedField.color || "#000000"}</span>
                            </div>
                          </div>

                          <div>
                            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Background</label>
                            <div className="flex gap-1.5 items-center">
                              <input
                                type="color"
                                value={selectedField.bgColor || "#FFFFFF"}
                                onChange={(e) => updateFieldProperty(selectedField.id, "bgColor", e.target.value)}
                                className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
                              />
                              <span className="text-[10px] font-bold text-zinc-400 uppercase">{selectedField.bgColor || "None"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* QR Code details */}
                    {selectedField.type === "qr" && (
                      <div className="flex flex-col gap-4">
                        <div>
                          <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">QR Code Color</label>
                          <div className="flex gap-1.5 items-center">
                            <input
                              type="color"
                              value={selectedField.color || "#000000"}
                              onChange={(e) => updateFieldProperty(selectedField.id, "color", e.target.value)}
                              className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">{selectedField.color || "#000000"}</span>
                          </div>
                        </div>

                        <div>
                          <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Background Color</label>
                          <div className="flex gap-1.5 items-center">
                            <input
                              type="color"
                              value={selectedField.bgColor || "#FFFFFF"}
                              onChange={(e) => updateFieldProperty(selectedField.id, "bgColor", e.target.value)}
                              className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">{selectedField.bgColor || "#FFFFFF"}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Image details */}
                    {selectedField.type === "image" && (
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Image Source (URL)</label>
                        <Input
                          type="text"
                          value={selectedField.src || ""}
                          onChange={(e) => updateFieldProperty(selectedField.id, "src", e.target.value)}
                          className="bg-zinc-950 border-zinc-850 text-xs text-zinc-300 h-8 rounded-lg mt-1"
                        />
                      </div>
                    )}

                    {/* Shape specific layout */}
                    {selectedField.type === "shape" && (
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Shape Fill Color</label>
                        <div className="flex gap-1.5 items-center mt-1">
                          <input
                            type="color"
                            value={selectedField.color || "#8B5CF6"}
                            onChange={(e) => updateFieldProperty(selectedField.id, "color", e.target.value)}
                            className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
                          />
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">{selectedField.color || "#8B5CF6"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Global Template Canvas Option Settings */
                  <div className="flex flex-col gap-6">
                    {/* Size and dimension presets */}
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3 block">Canvas Presets</span>
                      <select
                        onChange={(e) => {
                          const preset = PRESET_BADGE_SIZES[parseInt(e.target.value)];
                          if (preset) {
                            updateTemplate(prev => ({
                              ...prev,
                              width_mm: preset.width,
                              height_mm: preset.height
                            }));
                          }
                        }}
                        className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-300 focus:border-purple-500 rounded-lg p-2 h-8"
                      >
                        <option>Choose presets...</option>
                        {PRESET_BADGE_SIZES.map((preset, idx) => (
                          <option key={preset.name} value={idx}>{preset.name} ({preset.width}x{preset.height}mm)</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Canvas Width (mm)</label>
                        <Input
                          type="number"
                          value={template.width_mm}
                          onChange={(e) => updateTemplate(prev => ({ ...prev, width_mm: parseFloat(e.target.value) || 0 }))}
                          className="bg-zinc-950 border-zinc-850 text-xs text-zinc-300 h-8 rounded-lg mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Canvas Height (mm)</label>
                        <Input
                          type="number"
                          value={template.height_mm}
                          onChange={(e) => updateTemplate(prev => ({ ...prev, height_mm: parseFloat(e.target.value) || 0 }))}
                          className="bg-zinc-950 border-zinc-850 text-xs text-zinc-300 h-8 rounded-lg mt-1"
                        />
                      </div>
                    </div>

                    {/* Canvas Background Design options */}
                    <div className="flex flex-col gap-4 pt-4 border-t border-zinc-850">
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Background Artwork</span>

                      {/* Color Fill picker */}
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Fill Color</label>
                        <div className="flex gap-1.5 items-center mt-1">
                          <input
                            type="color"
                            value={activePage.backgroundColor || "#FFFFFF"}
                            onChange={(e) => updateTemplate(prev => {
                              const next = { ...prev };
                              next.pages[activePageIndex].backgroundColor = e.target.value;
                              return next;
                            })}
                            className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
                          />
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">{activePage.backgroundColor || "#FFFFFF"}</span>
                        </div>
                      </div>

                      {/* Artwork URL upload */}
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Artwork Image URL</label>
                        <Input
                          type="text"
                          placeholder="https://..."
                          value={activePage.backgroundImage || ""}
                          onChange={(e) => updateTemplate(prev => {
                            const next = { ...prev };
                            next.pages[activePageIndex].backgroundImage = e.target.value;
                            return next;
                          })}
                          className="bg-zinc-950 border-zinc-850 text-xs text-zinc-300 h-8 rounded-lg mt-1"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {inspectorTab === "settings" && (
              <div className="flex flex-col gap-4 text-center py-6">
                <Sliders className="h-8 w-8 text-purple-400 mx-auto mb-2" />
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-350">Platform Settings</h4>
                <p className="text-[10px] text-zinc-500 leading-relaxed px-2">
                  Configure advanced card printing density options, visual bleed margins, and hardware alignment presets.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- Simple Icons fallback helper (for DATA FIELDS components) -----
function BriefcaseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </svg>
  );
}

function BuildingIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M8 10h.01" />
      <path d="M16 10h.01" />
      <path d="M8 14h.01" />
      <path d="M16 14h.01" />
    </svg>
  );
}
