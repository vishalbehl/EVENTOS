"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import * as LucideIcons from "lucide-react";
import {
  CheckCircle, CheckSquare, Printer, RefreshCw, Search, Square, Trash2, XCircle,
  Eye, X, Mail, Phone, Building, Briefcase, DollarSign, Calendar, Globe, Copy, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { QRCodeSVG } from "qrcode.react";
import ReactDOMServer from "react-dom/server";

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
  photo?: string;
  avatar?: string;
  profile_picture?: string;
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

interface Role {
  id: string;
  name: string;
  role_code: string;
  is_active: boolean;
}

export default function ParticipantsDirectory() {
  const { eventId } = useParams();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [badgeDesign, setBadgeDesign] = useState<any>({});
  const [eventDetails, setEventDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedParticipantForDrawer, setSelectedParticipantForDrawer] = useState<Participant | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company: "",
    designation: "",
    role: "",
  });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [paidFilter, setPaidFilter] = useState("all");

  const roleByName = useMemo(() => new Map(roles.map(role => [role.name, role])), [roles]);
  const roleByNameLower = useMemo(() => new Map(roles.map(role => [role.name.toLowerCase(), role])), [roles]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const queryParams = [];
      if (search) queryParams.push(`search=${encodeURIComponent(search)}`);
      if (roleFilter !== "all") queryParams.push(`role=${encodeURIComponent(roleFilter)}`);
      if (paidFilter !== "all") queryParams.push(`paid_status=${encodeURIComponent(paidFilter)}`);

      const url = `/events/${eventId}/participants${queryParams.length ? `?${queryParams.join("&")}` : ""}`;
      const [list, templatesRes, rolesRes, eventRes] = await Promise.all([
        apiGet<Participant[]>(url),
        apiGet<any[]>(`/events/${eventId}/print-templates`),
        apiGet<Role[]>(`/events/${eventId}/registration/roles`),
        apiGet<any>(`/events/${eventId}`),
      ]);

      setParticipants(list);
      setRoles(rolesRes || []);
      setEventDetails(eventRes);
      setBadgeDesign(eventRes?.registration_settings?.badge_design || {});
      setTemplates(templatesRes.map(t => ({
        id: t.id,
        templateName: t.template_name || t.templateName || "Unnamed Template",
        templateData: t.template_data || t.templateData || {}
      })));
      setSelectedIds(prev => new Set(Array.from(prev).filter(id => list.some(p => p.id === id))));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load delegates registry.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = async () => {
    setSearch("");
    setRoleFilter("all");
    setPaidFilter("all");
    try {
      setLoading(true);
      const url = `/events/${eventId}/participants`;
      const [list, templatesRes, rolesRes, eventRes] = await Promise.all([
        apiGet<Participant[]>(url),
        apiGet<any[]>(`/events/${eventId}/print-templates`),
        apiGet<Role[]>(`/events/${eventId}/registration/roles`),
        apiGet<any>(`/events/${eventId}`),
      ]);
      setParticipants(list);
      setRoles(rolesRes || []);
      setEventDetails(eventRes);
      setBadgeDesign(eventRes?.registration_settings?.badge_design || {});
      setTemplates(templatesRes.map(t => ({
        id: t.id,
        templateName: t.template_name || t.templateName || "Unnamed Template",
        templateData: t.template_data || t.templateData || {}
      })));
      setSelectedIds(prev => new Set(Array.from(prev).filter(id => list.some(p => p.id === id))));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load delegates registry.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDrawer = (p: Participant) => {
    setSelectedParticipantForDrawer(p);
    setIsEditing(false);
    setEditForm({
      first_name: p.first_name || p.name?.split(" ")[0] || "",
      last_name: p.last_name || (p.name?.includes(" ") ? p.name.split(" ").slice(1).join(" ") : "") || "",
      email: p.email || "",
      phone: p.phone || "",
      company: p.company || "",
      designation: p.designation || "",
      role: p.role || "",
    });
  };

  const handleSaveChanges = async () => {
    if (!selectedParticipantForDrawer) return;
    try {
      const payload = {
        ...editForm,
        name: `${editForm.first_name} ${editForm.last_name}`.trim(),
      };
      const updated = await apiPatch<Participant>(`/events/${eventId}/participants/${selectedParticipantForDrawer.id}`, payload);
      toast.success("Delegate information updated.");
      setIsEditing(false);
      setSelectedParticipantForDrawer(updated);
      fetchData(); // Refresh the table list
    } catch (err: any) {
      toast.error(err.message || "Failed to update delegate details.");
    }
  };

  useEffect(() => {
    if (eventId) fetchData();
  }, [eventId, roleFilter, paidFilter]);

  const resolveTemplateForParticipant = (participant: Participant, designOverride?: any) => {
    const design = designOverride || badgeDesign;
    const pRoleClean = (participant.role || "").trim().toLowerCase();
    
    // Fallback: search through roles array directly if map lookup fails
    let role = roleByName.get(participant.role) || roleByNameLower.get(pRoleClean);
    if (!role) {
      role = roles.find(r => (r.name || "").trim().toLowerCase() === pRoleClean);
    }

    const assignments = design.role_template_assignments || {};
    let roleTemplateId = assignments[participant.role];
    if (role) {
      roleTemplateId = assignments[role.id] || assignments[role.name] || roleTemplateId;
    }
    
    // Robust check for false boolean or "false" string
    const isSameDesign = design.use_same_design_for_all_users;
    const useRoleSpecific = isSameDesign === false || String(isSameDesign).toLowerCase() === "false";

    const templateId = useRoleSpecific
      ? roleTemplateId || design.default_template_id
      : design.default_template_id;

    return templates.find(template => String(template.id).toLowerCase() === String(templateId || "").toLowerCase()) || null;
  };

  const handleTogglePayment = async (participant: Participant) => {
    try {
      const nextStatus = participant.paid_status === "Paid" ? "Unpaid" : "Paid";
      await apiPatch(`/events/${eventId}/participants/${participant.id}`, { paid_status: nextStatus });
      toast.success(`Payment updated to ${nextStatus}.`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update payment status.");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Permanently delete participant "${name}"? Their registration number will become available again.`)) return;
    try {
      await apiDelete(`/events/${eventId}/participants/${id}`);
      toast.success("Delegate registration removed.");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove delegate.");
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected participant registrations? Their registration numbers will become available again.`)) return;
    try {
      await apiPost(`/events/${eventId}/participants/bulk-delete`, Array.from(selectedIds));
      toast.success("Selected participants deleted.");
      setSelectedIds(new Set());
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete selected participants.");
    }
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === participants.length ? new Set() : new Set(participants.map(p => p.id)));
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const renderBadgeToImages = async (participant: Participant, tpl: PrintTemplate) => {
    const template = tpl.templateData;
    const width_mm = template.width_mm || 76;
    const height_mm = template.height_mm || 100;
    const orientation = template.orientation || (width_mm > height_mm ? "landscape" : "portrait");
    
    const pages = template.pages || [];

    // Extract and preload unique Google Web Fonts
    const fontFamilies: string[] = [];
    for (const pageData of pages) {
      for (const field of pageData.fields || []) {
        if (field.fontFamily) {
          fontFamilies.push(field.fontFamily);
        }
      }
    }

    const preloadFonts = async (families: string[]) => {
      if (typeof window === "undefined") return;
      const googleFonts = families.filter(f => !["Arial", "Times New Roman", "Georgia", "Courier New", "Verdana"].includes(f));
      if (googleFonts.length === 0) return;
      const uniqueFonts = Array.from(new Set(googleFonts));
      const linkId = "google-fonts-preload";
      let link = document.getElementById(linkId) as HTMLLinkElement;
      const query = uniqueFonts.map(f => `family=${f.replace(/\s+/g, "+")}:ital,wght@0,400;0,700;1,400;1,700`).join("&");
      const url = `https://fonts.googleapis.com/css2?${query}&display=swap`;
      if (!link) {
        link = document.createElement("link");
        link.id = linkId;
        link.rel = "stylesheet";
        link.href = url;
        document.head.appendChild(link);
      } else {
        link.href = url;
      }
      try {
        for (const family of uniqueFonts) {
          await document.fonts.load(`12px "${family}"`);
          await document.fonts.load(`bold 12px "${family}"`);
          await document.fonts.load(`italic 12px "${family}"`);
        }
        await document.fonts.ready;
      } catch (e) {
        console.error("Error preloading fonts:", e);
      }
    };

    await preloadFonts(fontFamilies);
    const results: { 
      bgImgData: string | null; 
      bgColor: string | null;
      overlayImgData: string; 
      width_mm: number; 
      height_mm: number; 
      orientation: string;
      nativeImages: { src: string, x: number, y: number, w: number, h: number, align: string, rotation?: number }[] 
    }[] = [];

    const printContainer = document.createElement("div");
    document.body.appendChild(printContainer);
    Object.assign(printContainer.style, {
      position: "fixed", top: "0", left: "0", opacity: "0", zIndex: "-1", pointerEvents: "none"
    });

    const formatDate = (dateStr: string) => {
      if (!dateStr) return "";
      try {
        return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      } catch {
        return dateStr;
      }
    };

    const tokenReplace = (text: string) => {
      if (!text) return "";
      let res = text;
      const replacements: Record<string, string> = {
        name: participant.name || "",
        first_name: participant.first_name || participant.name?.split(" ")[0] || "",
        last_name: participant.last_name || (participant.name?.includes(" ") ? participant.name.split(" ").slice(1).join(" ") : "") || "",
        firstname: participant.first_name || participant.name?.split(" ")[0] || "",
        lastname: participant.last_name || (participant.name?.includes(" ") ? participant.name.split(" ").slice(1).join(" ") : "") || "",
        role: participant.role || "",
        regno: participant.regno || "",
        email: participant.email || "",
        phone: participant.phone || "",
        company: participant.company || "",
        designation: participant.designation || "",
        date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        todaydate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        eventstartdate: eventDetails?.start_date ? formatDate(eventDetails.start_date) : "",
        eventenddate: eventDetails?.end_date ? formatDate(eventDetails.end_date) : "",
        eventname: eventDetails?.name || "",
        eventcode: eventDetails?.event_code || "",
        location: eventDetails?.location || "",
        venue: eventDetails?.venue || "",
        paidstatus: participant.paid_status || ""
      };

      for (const [key, val] of Object.entries(replacements)) {
        res = res.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), val);
      }
      return res;
    };

    const vcardData = {
      name: participant.name, company: participant.company, designation: participant.designation, phone: participant.phone, email: participant.email
    };
    const generateVCardString = (data: any) => (
      `BEGIN:VCARD\nVERSION:3.0\nFN:${data.name || ""}\nORG:${data.company || ""}\nTITLE:${data.designation || ""}\nTEL;TYPE=WORK,VOICE:${data.phone || ""}\nEMAIL:${data.email || ""}\nEND:VCARD`
    );

    const mmToPx = (mm: number) => (mm / 25.4) * 96;

    for (const pageData of pages) {
      const pageElement = document.createElement("div");
      printContainer.appendChild(pageElement);
      Object.assign(pageElement.style, {
        width: `${mmToPx(width_mm)}px`,
        height: `${mmToPx(height_mm)}px`,
        position: "relative",
        backgroundColor: "transparent",
      });

      let pageBg = null;
      if (pageData.backgroundImage && pageData.print_backgroundImage !== false) {
        pageBg = pageData.backgroundImage;
      }
      
      let bgColor = null;
      if (pageData.print_backgroundColor !== false) {
        bgColor = pageData.backgroundColor || "#FFFFFF";
      }

      const nativeImages: any[] = [];

      for (const field of pageData.fields || []) {
        const fieldEl = document.createElement("div");
        pageElement.appendChild(fieldEl);
        const safeW = parseFloat(field.w_mm) || parseFloat(field.width_mm) || parseFloat(field.w) || parseFloat(field.width) || 20;
        const safeH = parseFloat(field.h_mm) || parseFloat(field.height_mm) || parseFloat(field.h) || parseFloat(field.height) || 10;
        
        const px = mmToPx(parseFloat(field.x_mm) || parseFloat(field.x) || 0);
        const py = mmToPx(parseFloat(field.y_mm) || parseFloat(field.y) || 0);
        const pw = mmToPx(safeW);
        const ph = mmToPx(safeH);

        const borderStyle = field.borderStyle || "none";
        const borderWidth = borderStyle !== "none" ? `${mmToPx(parseFloat(field.borderWidth_mm) || 0.5)}px` : undefined;
        const borderRadius = field.type === "photo" && field.frame === "circle"
          ? "50%"
          : (field.cornerRadius_mm ? `${mmToPx(parseFloat(field.cornerRadius_mm))}px` : undefined);

        Object.assign(fieldEl.style, {
          position: "absolute",
          left: `${px}px`,
          top: `${py}px`,
          width: `${pw}px`,
          height: `${ph}px`,
          transform: `rotate(${field.rotation || 0}deg)`,
          transformOrigin: "center",
          overflow: "visible",
        });

        const innerEl = document.createElement("div");
        const isText = field.type !== "qr" && field.type !== "contact_qr" && field.type !== "image" && field.type !== "photo" && field.type !== "icon" && field.type !== "shape";
        Object.assign(innerEl.style, {
          position: "absolute",
          top: "0",
          left: "0",
          width: `${pw}px`,
          height: `${ph}px`,
          boxSizing: "border-box",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderStyle: borderStyle !== "none" ? borderStyle : undefined,
          borderWidth: borderStyle !== "none" ? borderWidth : undefined,
          borderColor: borderStyle !== "none" ? (field.borderColor || "#000000") : undefined,
          borderRadius: borderRadius || "0px",
        });
        fieldEl.appendChild(innerEl);

        if (field.type === "qr") {
          const qrSize = Math.round(Math.min(pw, ph));
          innerEl.innerHTML = ReactDOMServer.renderToString(
            <QRCodeSVG value={tokenReplace(field.qrValue || "{{regno}}")} fgColor={field.color || "#000000"} bgColor={field.bgColor || "#FFFFFF"} level="M" size={qrSize} />
          );
        } else if (field.type === "contact_qr") {
          const qrSize = Math.round(Math.min(pw, ph));
          innerEl.innerHTML = ReactDOMServer.renderToString(
            <QRCodeSVG value={generateVCardString(vcardData)} fgColor={field.color || "#000000"} bgColor={field.bgColor || "#FFFFFF"} level="M" size={qrSize} />
          );
        } else if (field.type === "image" && field.src) {
          nativeImages.push({
            src: field.src,
            x: parseFloat(field.x_mm) || parseFloat(field.x) || 0,
            y: parseFloat(field.y_mm) || parseFloat(field.y) || 0,
            w: safeW,
            h: safeH,
            align: field.align || "center",
            rotation: field.rotation || 0
          });
          const imgPlaceholder = document.createElement("div");
          imgPlaceholder.style.width = "100%";
          imgPlaceholder.style.height = "100%";
          imgPlaceholder.style.background = "transparent";
          innerEl.appendChild(imgPlaceholder);
        } else if (field.type === "photo") {
          const photoUrl = (participant as any).photo || (participant as any).avatar || (participant as any).profile_picture;
          if (photoUrl) {
            const imgDiv = document.createElement("div");
            imgDiv.style.width = "100%";
            imgDiv.style.height = "100%";
            imgDiv.style.backgroundImage = `url(${photoUrl})`;
            imgDiv.style.backgroundSize = "cover";
            imgDiv.style.backgroundRepeat = "no-repeat";
            imgDiv.style.borderRadius = field.frame === "circle" ? "50%" : "0";
            imgDiv.style.backgroundPosition = field.align === "left" ? "left center" : field.align === "right" ? "right center" : "center center";
            innerEl.appendChild(imgDiv);
          }
        } else if (field.type === "icon") {
          const IconComp = (LucideIcons as any)[field.iconName || "Star"];
          if (IconComp) {
            innerEl.innerHTML = ReactDOMServer.renderToString(
              <IconComp size="100%" color={field.color || "#6366F1"} />
            );
          }
        } else if (field.type === "shape") {
          let shapeHtml = "";
          const strokeW = mmToPx(parseFloat(field.borderWidth_mm) || 0);
          const strokeColor = field.borderColor || "none";
          const strokeDash = field.borderStyle === "dashed" ? "8,4" : field.borderStyle === "dotted" ? "2,4" : "";
          const strokeAttr = strokeW > 0 ? { stroke: strokeColor, strokeWidth: strokeW, ...(strokeDash ? { strokeDasharray: strokeDash } : {}), vectorEffect: "non-scaling-stroke" } : {};

          if (field.shapeType === "circle") {
            shapeHtml = ReactDOMServer.renderToString(<div style={{
              backgroundColor: field.color || "#6366F1",
              borderRadius: "50%",
              width: "100%",
              height: "100%",
              ...(field.borderStyle && field.borderStyle !== "none" ? { border: `${strokeW}px ${field.borderStyle} ${strokeColor}` } : {})
            }} />);
          } else if (field.shapeType === "triangle") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                <polygon points="50,0 0,100 100,100" fill={field.color || "#6366F1"} {...strokeAttr} />
              </svg>
            );
          } else if (field.shapeType === "star") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                <polygon points="50,0 63,38 100,38 70,62 82,100 50,75 18,100 30,62 0,38 37,38" fill={field.color || "#6366F1"} {...strokeAttr} />
              </svg>
            );
          } else if (field.shapeType === "hexagon") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                <polygon points="50,0 100,25 100,75 50,100 0,75 0,25" fill={field.color || "#6366F1"} {...strokeAttr} />
              </svg>
            );
          } else if (field.shapeType === "line") {
            shapeHtml = ReactDOMServer.renderToString(<div style={{ backgroundColor: field.color || "#6366F1", width: "100%", height: "100%" }} />);
          } else if (field.shapeType === "diamond") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                <polygon points="50,0 100,50 50,100 0,50" fill={field.color || "#6366F1"} {...strokeAttr} />
              </svg>
            );
          } else if (field.shapeType === "pentagon") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                <polygon points="50,0 100,38 81,100 19,100 0,38" fill={field.color || "#6366F1"} {...strokeAttr} />
              </svg>
            );
          } else if (field.shapeType === "octagon") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                <polygon points="30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30" fill={field.color || "#6366F1"} {...strokeAttr} />
              </svg>
            );
          } else {
            shapeHtml = ReactDOMServer.renderToString(<div style={{ backgroundColor: field.color || "#6366F1", width: "100%", height: "100%" }} />);
          }
          innerEl.innerHTML = shapeHtml;
        } else {
          // Text field – match the designer canvas layout exactly
          const rawText = field.placeholder || field.text || field.value || "";
          let processedText = tokenReplace(rawText);
          if (field.textCase === "uppercase") processedText = processedText.toUpperCase();
          else if (field.textCase === "lowercase") processedText = processedText.toLowerCase();
          else if (field.textCase === "title") processedText = processedText.replace(/\b\w/g, char => char.toUpperCase());
          else if (field.textCase === "sentence") processedText = processedText.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());

          const justifyContent = field.align === "center" ? "center" : field.align === "right" ? "flex-end" : "flex-start";
          const innerSpan = document.createElement("div");
          Object.assign(innerSpan.style, {
            display: "flex",
            alignItems: "center",
            justifyContent,
            width: "100%",
            height: "100%",
            fontFamily: `'${field.fontFamily || "Arial"}', sans-serif`,
            fontSize: `${field.fontSize || 10}pt`,
            lineHeight: "1.2",
            fontWeight: field.bold ? "700" : "400",
            fontStyle: field.italic ? "italic" : "normal",
            textDecoration: field.underline ? "underline" : "none",
            color: field.color || "#000000",
            whiteSpace: "nowrap",
            overflow: "hidden",
            padding: "0 4px",
            wordBreak: "keep-all",
            boxSizing: "border-box",
          });
          innerSpan.innerText = processedText;
          innerEl.appendChild(innerSpan);
        }
      }

      if (typeof window !== "undefined") {
        try {
          await document.fonts.ready;
          await new Promise(r => setTimeout(r, 100)); // Small yield to ensure rendering
        } catch (e) {}
      }

      const canvas = await html2canvas(pageElement, {
        scale: 3,
        backgroundColor: null,
        logging: false,
        useCORS: true,
      });
      results.push({
        bgImgData: pageBg,
        bgColor,
        overlayImgData: canvas.toDataURL("image/png"),
        width_mm,
        height_mm,
        orientation,
        nativeImages
      });
    }

    document.body.removeChild(printContainer);
    return results;
  };

  const printParticipants = async (list: Participant[]) => {
    if (list.length === 0) {
      toast.error("Select at least one participant to print.");
      return;
    }

    let printBadgeDesign = badgeDesign;
    try {
      const [freshEvent, freshTemplates] = await Promise.all([
        apiGet<any>(`/events/${eventId}`),
        apiGet<any[]>(`/events/${eventId}/print-templates`)
      ]);
      printBadgeDesign = freshEvent?.registration_settings?.badge_design || {};
      setBadgeDesign(printBadgeDesign);
      setEventDetails(freshEvent);
      
      const newTemplates = freshTemplates.map(t => ({
        id: t.id,
        templateName: t.template_name || t.templateName || "Unnamed Template",
        templateData: t.template_data || t.templateData || {}
      }));
      setTemplates(newTemplates);
    } catch {
      // Continue with the latest loaded settings if the refresh fails.
    }

    const fallbackList: Participant[] = [];
    const printList = list.map(p => {
      let tpl = resolveTemplateForParticipant(p, printBadgeDesign);
      if (!tpl && templates.length > 0) {
        tpl = templates[0];
        fallbackList.push(p);
      }
      return { participant: p, template: tpl };
    });

    const actuallyMissing = printList.filter(item => !item.template);
    if (actuallyMissing.length) {
      toast.error("No badge templates are designed for this event yet.");
      return;
    }

    if (fallbackList.length > 0) {
      toast.warning(`Using default template for ${fallbackList.length} participant(s) with unassigned roles.`);
    }

    setPrinting(true);
    toast.info(`Generating ${list.length} badge${list.length === 1 ? "" : "s"}...`);
    try {
      let pdf: jsPDF | null = null;
      for (const item of printList) {
        const participant = item.participant;
        const tpl = item.template!;
        const pages = await renderBadgeToImages(participant, tpl);
        for (const page of pages) {
          if (!pdf) {
            pdf = new jsPDF({ 
              orientation: page.orientation as any, 
              unit: "mm", 
              format: [page.width_mm, page.height_mm],
              compress: true 
            });
          } else {
            pdf.addPage([page.width_mm, page.height_mm], page.orientation as any);
          }
          
          if (page.bgColor) {
            pdf.setFillColor(page.bgColor);
            pdf.rect(0, 0, page.width_mm, page.height_mm, "F");
          }

          if (page.bgImgData) {
            let format = "JPEG";
            if (page.bgImgData.startsWith("data:image/png")) format = "PNG";
            else if (page.bgImgData.startsWith("data:image/webp")) format = "WEBP";
            pdf.addImage(page.bgImgData, format, 0, 0, page.width_mm, page.height_mm);
          }
          
          for (const nImg of page.nativeImages) {
            await new Promise<void>((resolve) => {
              const img = new window.Image();
              img.crossOrigin = "Anonymous";
              img.onload = () => {
                const imgRatio = img.naturalWidth / img.naturalHeight;
                const targetRatio = nImg.w / nImg.h;
                let finalW = nImg.w;
                let finalH = nImg.h;
                let finalX = nImg.x;
                let finalY = nImg.y;

                if (imgRatio > targetRatio) {
                  finalH = nImg.w / imgRatio;
                  finalY = nImg.y + (nImg.h - finalH) / 2;
                } else {
                  finalW = nImg.h * imgRatio;
                  if (nImg.align === "left") finalX = nImg.x;
                  else if (nImg.align === "right") finalX = nImg.x + (nImg.w - finalW);
                  else finalX = nImg.x + (nImg.w - finalW) / 2;
                }
                
                let format = "JPEG";
                if (nImg.src.startsWith("data:image/png")) format = "PNG";
                else if (nImg.src.startsWith("data:image/webp")) format = "WEBP";
                
                let srcToDraw = nImg.src;
                if (nImg.rotation) {
                  const PX_PER_MM = 11.811;
                  const cw = Math.round(finalW * PX_PER_MM);
                  const ch = Math.round(finalH * PX_PER_MM);
                  const tmpCanvas = document.createElement("canvas");
                  tmpCanvas.width = cw;
                  tmpCanvas.height = ch;
                  const ctx = tmpCanvas.getContext("2d")!;
                  ctx.translate(cw / 2, ch / 2);
                  ctx.rotate((nImg.rotation * Math.PI) / 180);
                  ctx.translate(-cw / 2, -ch / 2);
                  ctx.drawImage(img, 0, 0, cw, ch);
                  srcToDraw = tmpCanvas.toDataURL("image/png");
                  format = "PNG";
                }
                
                pdf!.addImage(srcToDraw, format, finalX, finalY, finalW, finalH);
                resolve();
              };
              img.onerror = () => resolve();
              img.src = nImg.src;
            });
          }
          
          pdf.addImage(page.overlayImgData, "PNG", 0, 0, page.width_mm, page.height_mm);
        }
      }
      if (pdf) window.open(URL.createObjectURL(pdf.output("blob")), "_blank");
      toast.success("Badge PDF opened.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate badge PDF.");
    } finally {
      setPrinting(false);
    }
  };

  const selectedParticipants = participants.filter(p => selectedIds.has(p.id));

  return (
    <div className="flex-1 flex flex-col space-y-6 min-h-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]/85">Management Suite</span>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mt-1 text-glow-indigo">Delegates registry</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mt-1">
            Select participants, control payment, and print badges by role template.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <Button onClick={fetchData} disabled={loading} className="h-12 px-8 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default hover-lift-3d">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Sync registry
          </Button>
          <Link href={`/events/${eventId}/registration/register`}>
            <Button className="h-12 px-8 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[11px] rounded-full hover-lift-3d flex items-center gap-1.5 shadow-[0_10px_20px_color-mix(in_srgb,var(--pri)_20%,transparent)]">
              <LucideIcons.UserPlus className="h-4 w-4" />
              Register Participant
            </Button>
          </Link>
        </div>
      </div>

      <Card className="p-5 glass-3d border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-[2rem] grid grid-cols-1 md:grid-cols-5 gap-4 items-center shadow-lg">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            type="text"
            placeholder="Search by name, email, company, regno..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && fetchData()}
            className="h-12 bg-white/5 border-default rounded-full pl-10 pr-6 font-bold text-xs text-[var(--text)] focus:border-[var(--pri)] focus:ring-0 transition-all placeholder:text-muted/65"
          />
        </div>

        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="h-12 px-6 rounded-full border border-default bg-white/5 text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer">
          <option value="all" className="bg-[var(--base)]">All Roles</option>
          {roles.map(role => <option key={role.id} value={role.name} className="bg-[var(--base)]">{role.name}</option>)}
        </select>

        <select value={paidFilter} onChange={e => setPaidFilter(e.target.value)} className="h-12 px-6 rounded-full border border-default bg-white/5 text-[11px] font-black uppercase tracking-widest text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer">
          <option value="all" className="bg-[var(--base)]">All Payments</option>
          <option value="Paid" className="bg-[var(--base)]">Paid</option>
          <option value="Unpaid" className="bg-[var(--base)]">Unpaid</option>
        </select>

        <Button onClick={handleResetFilters} className="h-12 px-6 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default hover-lift-3d flex items-center justify-center gap-1.5">
          <LucideIcons.RotateCcw className="h-4 w-4" />
          Reset Filters
        </Button>
      </Card>

      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[var(--pri)]/20 bg-[var(--pri)]/8 px-5 py-4">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-[var(--text)]">{selectedIds.size} selected</span>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => printParticipants(selectedParticipants)} disabled={printing} className="h-10 px-5 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[10px] rounded-full border border-[var(--pri)]/30 flex items-center justify-center gap-1.5 hover-lift-3d">
              <Printer className="h-4 w-4 mr-2" />
              Print Badge ({selectedIds.size})
            </Button>
            <Button onClick={handleDeleteSelected} className="h-10 px-5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black uppercase tracking-widest text-[10px] rounded-full border border-red-500/20">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      )}

      <Card className="flex-1 glass-3d border-default rounded-[2.5rem] overflow-hidden bg-[color-mix(in_srgb,var(--text)_5%,transparent)] shadow-xl flex flex-col min-h-0">
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead className="sticky top-0 z-10 bg-[color-mix(in_srgb,var(--base)_95%,#000)] shadow-[0_1px_0_0_rgba(255,255,255,0.05)]">
              <tr className="border-b border-default text-[9px] font-black uppercase tracking-[0.2em] text-muted select-none">
                <th className="py-5 px-6">
                  <button onClick={toggleSelectAll} className="text-muted hover:text-[var(--pri)] transition-colors" title="Select all participants">
                    {participants.length > 0 && selectedIds.size === participants.length ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="py-5 px-6">Reg No</th>
                <th className="py-5 px-6">Attendee Profile</th>
                <th className="py-5 px-6">Role Type</th>
                <th className="py-5 px-6">Payment</th>
                <th className="py-5 px-6">Source</th>
                <th className="py-5 px-6 text-right min-w-72">Actions</th>
              </tr>
            </thead>
            <tbody>
              {participants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs font-black uppercase tracking-widest text-muted">
                    No delegates found matching current search parameters.
                  </td>
                </tr>
              ) : participants.map(p => (
                <tr key={p.id} onClick={() => handleOpenDrawer(p)} className="border-b border-default/50 hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] transition-all text-[var(--text)] last:border-b-0 group cursor-pointer">
                  <td className="py-5 px-6" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleSelected(p.id)} className="text-muted hover:text-[var(--pri)] transition-colors">
                      {selectedIds.has(p.id) ? <CheckSquare className="h-4 w-4 text-[var(--pri)]" /> : <Square className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="py-5 px-6 font-black text-[var(--pri)] tracking-wider">{p.regno}</td>
                  <td className="py-5 px-6 font-bold">
                    <div className="flex flex-col">
                      <span className="text-xs font-black tracking-tight text-[var(--text)] group-hover:text-[var(--pri)] transition-colors underline-offset-2 group-hover:underline">{p.name}</span>
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted mt-0.5">{p.email}</span>
                      {p.company && <span className="text-[9px] font-black uppercase tracking-wider text-[var(--pri)] mt-0.5">{p.company}</span>}
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] px-3 py-1.5 rounded-full border bg-[var(--pri)]/10 text-[var(--pri)] border-[var(--pri)]/20">{p.role}</span>
                  </td>
                  <td className="py-5 px-6" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleTogglePayment(p)} className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] px-3 py-1.5 rounded-full border transition-all ${p.paid_status === "Paid" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"}`}>
                      {p.paid_status === "Paid" ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {p.paid_status}
                    </button>
                  </td>
                  <td className="py-5 px-6 text-[9px] font-black uppercase tracking-[0.15em] text-muted">{p.source}</td>
                  <td className="py-5 px-6" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <Button onClick={() => handleOpenDrawer(p)} className="h-9 w-9 p-0 bg-white/5 hover:bg-white/10 text-muted hover:text-[var(--text)] rounded-full border border-default flex items-center justify-center hover-lift-3d shrink-0" title="View details">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button onClick={() => printParticipants([p])} disabled={printing} className="h-9 min-w-[128px] px-4 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[9px] rounded-full border border-[var(--pri)]/30 flex items-center justify-center gap-1.5 hover-lift-3d shrink-0 whitespace-nowrap" title="Print badge">
                        <Printer className={`h-3.5 w-3.5 mr-1.5 ${printing ? "animate-bounce" : ""}`} />
                        Print Badge
                      </Button>
                      <Button onClick={() => handleDelete(p.id, p.name)} className="h-9 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black uppercase tracking-widest text-[9px] rounded-full border border-red-500/20 flex items-center justify-center hover-lift-3d shrink-0" title="Delete participant">
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Participant Details Drawer */}
      <AnimatePresence>
        {selectedParticipantForDrawer && (
          <>
            {/* Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedParticipantForDrawer(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />

            {/* Drawer Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-full sm:max-w-md bg-[color-mix(in_srgb,var(--base)_92%,black)] border-l border-default p-6 shadow-2xl z-[101] flex flex-col text-[var(--text)] animate-fade-in"
            >
              {/* Close & Header (Sticky top of drawer) */}
              <div className="flex items-center justify-between pb-4 border-b border-default/50 mb-6 shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]">Delegate Details</span>
                  {!isEditing && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--pri)] hover:text-white bg-[var(--pri)]/10 hover:bg-[var(--pri)]/30 rounded-full transition-colors flex items-center gap-1 hover-lift-3d"
                      title="Edit Delegate details"
                    >
                      <LucideIcons.Pencil className="h-2.5 w-2.5" />
                      Edit
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setSelectedParticipantForDrawer(null)}
                  className="h-8 w-8 rounded-full border border-default bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted hover:text-[var(--text)] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-6 custom-scrollbar">
                {isEditing ? (
                  /* Edit Mode Fields */
                  <div className="space-y-4 py-2">
                    {/* First Name */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-muted px-1">First Name</label>
                      <Input
                        type="text"
                        value={editForm.first_name}
                        onChange={e => setEditForm(prev => ({ ...prev, first_name: e.target.value }))}
                        className="h-11 bg-white/5 border-default rounded-xl font-bold text-xs text-[var(--text)] focus:border-[var(--pri)]"
                        placeholder="First name"
                      />
                    </div>

                    {/* Last Name */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-muted px-1">Last Name</label>
                      <Input
                        type="text"
                        value={editForm.last_name}
                        onChange={e => setEditForm(prev => ({ ...prev, last_name: e.target.value }))}
                        className="h-11 bg-white/5 border-default rounded-xl font-bold text-xs text-[var(--text)] focus:border-[var(--pri)]"
                        placeholder="Last name"
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-muted px-1">Email Address</label>
                      <Input
                        type="email"
                        value={editForm.email}
                        onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                        className="h-11 bg-white/5 border-default rounded-xl font-bold text-xs text-[var(--text)] focus:border-[var(--pri)]"
                      />
                    </div>

                    {/* Phone */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-muted px-1">Phone Number</label>
                      <Input
                        type="text"
                        value={editForm.phone}
                        onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                        className="h-11 bg-white/5 border-default rounded-xl font-bold text-xs text-[var(--text)] focus:border-[var(--pri)]"
                      />
                    </div>

                    {/* Company */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-muted px-1">Company / Organization</label>
                      <Input
                        type="text"
                        value={editForm.company}
                        onChange={e => setEditForm(prev => ({ ...prev, company: e.target.value }))}
                        className="h-11 bg-white/5 border-default rounded-xl font-bold text-xs text-[var(--text)] focus:border-[var(--pri)]"
                      />
                    </div>

                    {/* Designation */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-muted px-1">Designation</label>
                      <Input
                        type="text"
                        value={editForm.designation}
                        onChange={e => setEditForm(prev => ({ ...prev, designation: e.target.value }))}
                        className="h-11 bg-white/5 border-default rounded-xl font-bold text-xs text-[var(--text)] focus:border-[var(--pri)]"
                      />
                    </div>

                    {/* Role */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-muted px-1">Role Type</label>
                      <select
                        value={editForm.role}
                        onChange={e => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl border border-default bg-white/5 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-[var(--pri)] cursor-pointer"
                      >
                        {roles.map(r => (
                          <option key={r.id} value={r.name} className="bg-[var(--base)]">
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  /* Read Mode Fields */
                  <>
                    {/* Avatar Display */}
                    <div className="flex flex-col items-center text-center pb-6 border-b border-default/50">
                      <div className="h-24 w-24 rounded-full border-2 border-[var(--pri)]/50 bg-[var(--pri)]/10 flex items-center justify-center shadow-lg relative overflow-hidden mb-4">
                        {(() => {
                          const avatarUrl = selectedParticipantForDrawer.photo || selectedParticipantForDrawer.avatar || selectedParticipantForDrawer.profile_picture;
                          if (avatarUrl) {
                            return (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={avatarUrl}
                                alt={selectedParticipantForDrawer.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                            );
                          }
                          const initials = selectedParticipantForDrawer.name
                            .split(" ")
                            .map(n => n[0])
                            .join("")
                            .substring(0, 2)
                            .toUpperCase();
                          return <span className="text-2xl font-black text-[var(--pri)]">{initials}</span>;
                        })()}
                      </div>
                      <h2 className="text-xl font-black tracking-tight text-[var(--text)]">{selectedParticipantForDrawer.name}</h2>
                      <span className="text-[9px] font-black uppercase tracking-[0.18em] px-3 py-1.5 rounded-full border bg-[var(--pri)]/10 text-[var(--pri)] border-[var(--pri)]/20 mt-2">
                        {selectedParticipantForDrawer.role}
                      </span>
                    </div>

                    {/* Information Fields */}
                    <div className="space-y-4">
                      {/* Reg No */}
                      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/3 border border-default">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center text-[var(--pri)]">
                            <Briefcase className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-wider text-muted">Reg No</span>
                            <span className="text-xs font-bold text-[var(--text)]">{selectedParticipantForDrawer.regno}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedParticipantForDrawer.regno);
                            toast.success("Registration number copied!");
                          }}
                          className="p-1.5 text-muted hover:text-[var(--text)] hover:bg-white/5 rounded-lg transition-colors"
                          title="Copy Reg No"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Email */}
                      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/3 border border-default">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center text-[var(--pri)]">
                            <Mail className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-wider text-muted">Email</span>
                            <span className="text-xs font-bold text-[var(--text)] truncate max-w-[200px]">{selectedParticipantForDrawer.email}</span>
                          </div>
                        </div>
                        <a
                          href={`mailto:${selectedParticipantForDrawer.email}`}
                          className="p-1.5 text-muted hover:text-[var(--text)] hover:bg-white/5 rounded-lg transition-colors"
                          title="Send Email"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </a>
                      </div>

                      {/* Phone */}
                      {selectedParticipantForDrawer.phone && (
                        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/3 border border-default">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center text-[var(--pri)]">
                              <Phone className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-black uppercase tracking-wider text-muted">Phone</span>
                              <span className="text-xs font-bold text-[var(--text)]">{selectedParticipantForDrawer.phone}</span>
                            </div>
                          </div>
                          <a
                            href={`tel:${selectedParticipantForDrawer.phone}`}
                            className="p-1.5 text-muted hover:text-[var(--text)] hover:bg-white/5 rounded-lg transition-colors"
                            title="Call Phone"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      )}

                      {/* Company */}
                      {selectedParticipantForDrawer.company && (
                        <div className="flex items-center p-3.5 rounded-2xl bg-white/3 border border-default gap-3">
                          <div className="h-8 w-8 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center text-[var(--pri)]">
                            <Building className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-wider text-muted">Company</span>
                            <span className="text-xs font-bold text-[var(--text)]">{selectedParticipantForDrawer.company}</span>
                          </div>
                        </div>
                      )}

                      {/* Designation */}
                      {selectedParticipantForDrawer.designation && (
                        <div className="flex items-center p-3.5 rounded-2xl bg-white/3 border border-default gap-3">
                          <div className="h-8 w-8 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center text-[var(--pri)]">
                            <User className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-wider text-muted">Designation</span>
                            <span className="text-xs font-bold text-[var(--text)]">{selectedParticipantForDrawer.designation}</span>
                          </div>
                        </div>
                      )}

                      {/* Payment Status */}
                      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/3 border border-default">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center text-[var(--pri)]">
                            <DollarSign className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-wider text-muted">Payment Status</span>
                            <span className={`text-xs font-bold ${selectedParticipantForDrawer.paid_status === "Paid" ? "text-emerald-400" : "text-red-400"}`}>
                              {selectedParticipantForDrawer.paid_status}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            const updated = { ...selectedParticipantForDrawer, paid_status: selectedParticipantForDrawer.paid_status === "Paid" ? "Unpaid" : "Paid" };
                            await handleTogglePayment(selectedParticipantForDrawer);
                            setSelectedParticipantForDrawer(updated);
                          }}
                          className={`text-[9px] font-black uppercase tracking-[0.12em] px-3 py-1.5 rounded-full border transition-all ${
                            selectedParticipantForDrawer.paid_status === "Paid"
                              ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                          }`}
                        >
                          Mark {selectedParticipantForDrawer.paid_status === "Paid" ? "Unpaid" : "Paid"}
                        </button>
                      </div>

                      {/* Source */}
                      <div className="flex items-center p-3.5 rounded-2xl bg-white/3 border border-default gap-3">
                        <div className="h-8 w-8 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center text-[var(--pri)]">
                          <Globe className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black uppercase tracking-wider text-muted">Registration Source</span>
                          <span className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">{selectedParticipantForDrawer.source}</span>
                        </div>
                      </div>

                      {/* Registered At */}
                      {selectedParticipantForDrawer.registered_at && (
                        <div className="flex items-center p-3.5 rounded-2xl bg-white/3 border border-default gap-3">
                          <div className="h-8 w-8 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center text-[var(--pri)]">
                            <Calendar className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-wider text-muted">Registered At</span>
                            <span className="text-xs font-bold text-[var(--text)]">
                              {new Date(selectedParticipantForDrawer.registered_at).toLocaleString("en-IN", {
                                dateStyle: "medium",
                                timeStyle: "short"
                              })}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Sticky Drawer Footer Actions */}
              <div className="mt-6 pt-4 border-t border-default/50 shrink-0 space-y-3">
                {isEditing ? (
                  <>
                    <Button
                      onClick={handleSaveChanges}
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] rounded-full border-0 flex items-center justify-center gap-1.5 hover-lift-3d"
                    >
                      Save Changes
                    </Button>
                    <Button
                      onClick={() => setIsEditing(false)}
                      className="w-full h-12 bg-white/5 hover:bg-white/10 text-muted hover:text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-full border border-default flex items-center justify-center gap-1.5 hover-lift-3d"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => printParticipants([selectedParticipantForDrawer])}
                      disabled={printing}
                      className="w-full h-12 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[10px] rounded-full border border-[var(--pri)]/30 flex items-center justify-center gap-1.5 hover-lift-3d"
                    >
                      <Printer className={`h-4 w-4 mr-2 ${printing ? "animate-bounce" : ""}`} />
                      Print Badge
                    </Button>
                    <Button
                      onClick={async () => {
                        const participant = selectedParticipantForDrawer;
                        setSelectedParticipantForDrawer(null);
                        await handleDelete(participant.id, participant.name);
                      }}
                      className="w-full h-12 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black uppercase tracking-widest text-[10px] rounded-full border border-red-500/20 flex items-center justify-center gap-1.5 hover-lift-3d"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Delegate
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
