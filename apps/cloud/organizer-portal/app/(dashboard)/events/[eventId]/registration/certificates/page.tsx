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
import { apiGet } from "@/lib/api-client";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { QRCodeSVG } from "qrcode.react";
import ReactDOMServer from "react-dom/server";

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
      const templatesRes = await apiGet<any[]>(`/events/${eventId}/print-templates`);
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
        apiGet<any[]>(`/events/${eventId}/print-templates`),
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
  const handleBulkPrint = async () => {
    if (selectedParticipantIds.size === 0) {
      toast.error("Please select at least one delegate.");
      return;
    }
    const tpl = templates.find(t => t.id === selectedTemplateId);
    if (!tpl) {
      toast.error("Please design and select a layout template first.");
      return;
    }

    setPrinting(true);
    toast.info(`Compiling ${selectedParticipantIds.size} certificates...`);

    try {
      const template = tpl.templateData;
      const width_mm = template.width_mm || 297; // Landscape A4 default
      const height_mm = template.height_mm || 210;
      const orientation = template.orientation || "landscape";
      const pageData = template.pages?.[0] || { fields: [], backgroundColor: "#FFFFFF" };

      // Extract and preload unique Google Web Fonts
      const fontFamilies: string[] = [];
      for (const field of pageData.fields || []) {
        if (field.fontFamily) {
          fontFamilies.push(field.fontFamily);
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
      
      const pdf = new jsPDF({
        orientation: orientation as any,
        unit: "mm",
        format: [width_mm, height_mm]
      });

      const selectedList = participants.filter(p => selectedParticipantIds.has(p.id));

      for (let idx = 0; idx < selectedList.length; idx++) {
        const participant = selectedList[idx];
        if (idx > 0) pdf.addPage([width_mm, height_mm], orientation);

        // Render Background
        if (pageData.print_backgroundImage && pageData.backgroundImage) {
          const imageType = pageData.backgroundImage.startsWith("data:image/png") ? "PNG" : "JPEG";
          pdf.addImage(pageData.backgroundImage, imageType, 0, 0, width_mm, height_mm);
        } else if (pageData.print_backgroundColor) {
          pdf.setFillColor(pageData.backgroundColor);
          pdf.rect(0, 0, width_mm, height_mm, "F");
        }

        // Render fields using hidden element canvas method
        const printContainer = document.createElement("div");
        document.body.appendChild(printContainer);
        Object.assign(printContainer.style, {
          position: "fixed", top: "0", left: "0", opacity: "0", zIndex: "-1", pointerEvents: "none"
        });

        const mmToPx = (mm: number) => (mm / 25.4) * 96;

        const pageElement = document.createElement("div");
        printContainer.appendChild(pageElement);
        Object.assign(pageElement.style, {
          width: `${mmToPx(width_mm)}px`,
          height: `${mmToPx(height_mm)}px`,
          position: "relative",
          backgroundColor: "transparent",
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
            designation: (participant as any).designation || "",
            title: certTitle || "",
            body: certBody || "",
            date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
            todaydate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
            eventstartdate: event?.start_date ? formatDate(event.start_date) : "",
            eventenddate: event?.end_date ? formatDate(event.end_date) : "",
            eventname: event?.name || "",
            eventcode: (event as any)?.event_code || event?.short_code || "",
            location: event?.location || "",
            venue: (event as any)?.venue || event?.venue_name || "",
            paidstatus: participant.paid_status || ""
          };

          for (const [key, val] of Object.entries(replacements)) {
            res = res.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), val);
          }
          return res;
        };

        const generateVCardString = (data: Participant) => (
          `BEGIN:VCARD\nVERSION:3.0\nFN:${data.name || ""}\nORG:${data.company || ""}\nEMAIL:${data.email || ""}\nEND:VCARD`
        );

        // Map layout fields
        const fieldsHtml = pageData.fields
          .filter((f: any) => f.enabled !== false)
          .map((f: any) => {
            const px = mmToPx(f.x_mm);
            const py = mmToPx(f.y_mm);
            const pw = mmToPx(f.width_mm);
            const ph = mmToPx(f.height_mm);
            const borderStyle = f.borderStyle || "none";
            const borderWidth = borderStyle !== "none" ? `${mmToPx(parseFloat(f.borderWidth_mm) || 0.5)}px` : undefined;
            const borderRadius = f.type === "photo" && f.frame === "circle"
              ? "50%"
              : (f.cornerRadius_mm ? `${mmToPx(parseFloat(f.cornerRadius_mm))}px` : undefined);

            const borderExtra = borderStyle !== "none" ? `border:${borderWidth} ${borderStyle} ${f.borderColor || "#000"};` : "";
            const radiusExtra = borderRadius ? `border-radius:${borderRadius};` : "";

            const outerStyle = `position:absolute; left:${px}px; top:${py}px; width:${pw}px; height:${ph}px; transform:rotate(${f.rotation || 0}deg); transform-origin:center; overflow:visible;`;
            const isText = f.type !== "qr" && f.type !== "contact_qr" && f.type !== "image" && f.type !== "photo" && f.type !== "icon" && f.type !== "shape";
            const innerStyle = `position:absolute; top:0; left:0; width:${pw}px; height:${ph}px; ${borderExtra} ${radiusExtra} overflow:hidden; display:flex; align-items:center; justify-content:center;`;

            if (f.type === "photo") {
              const photoUrl = (participant as any).photo || (participant as any).avatar || (participant as any).profile_picture || "https://placehold.co/300x300/EFEFEF/AAAAAA&text=Photo";
              return `<div style="${outerStyle}"><div style="${innerStyle}"><img src="${photoUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:${f.frame === "circle" ? "50%" : "0"}" /></div></div>`;
            }
            if (f.type === "image") {
              return `<div style="${outerStyle}"><div style="${innerStyle}"><img src="${f.src}" style="width:100%; height:100%; object-fit:contain;" /></div></div>`;
            }
            if (f.type === "contact_qr") {
              const qrVal = generateVCardString(participant);
              const qrSVG = ReactDOMServer.renderToStaticMarkup(
                <QRCodeSVG value={qrVal} fgColor={f.color || "#000000"} bgColor={f.bgColor || "#FFFFFF"} level="M" width="100%" height="100%" />
              );
              return `<div style="${outerStyle}"><div style="${innerStyle}">${qrSVG}</div></div>`;
            }
            if (f.type === "qr") {
              const qrVal = tokenReplace(f.placeholder);
              const qrSVG = ReactDOMServer.renderToStaticMarkup(
                <QRCodeSVG value={qrVal} fgColor={f.color || "#000000"} bgColor={f.bgColor || "#FFFFFF"} level="M" width="100%" height="100%" />
              );
              return `<div style="${outerStyle}"><div style="${innerStyle}">${qrSVG}</div></div>`;
            }
            if (f.type === "icon") {
              const IconComp = (LucideIcons as any)[f.iconName || "Star"];
              if (IconComp) {
                const iconSVG = ReactDOMServer.renderToStaticMarkup(
                  <IconComp size="100%" color={f.color || "#6366F1"} />
                );
                return `<div style="${outerStyle}"><div style="${innerStyle} justify-content:${f.align === "left" ? "flex-start" : f.align === "right" ? "flex-end" : "center"}">${iconSVG}</div></div>`;
              }
              return "";
            }
            if (f.type === "shape") {
              let shapeMarkup = "";
              const strokeW = mmToPx(parseFloat(f.borderWidth_mm) || 0);
              const strokeColor = f.borderColor || "none";
              const strokeDash = f.borderStyle === "dashed" ? "8,4" : f.borderStyle === "dotted" ? "2,4" : "";
              const strokeAttr = strokeW > 0 ? { stroke: strokeColor, strokeWidth: strokeW, ...(strokeDash ? { strokeDasharray: strokeDash } : {}), vectorEffect: "non-scaling-stroke" } : {};

              if (f.shapeType === "circle") {
                shapeMarkup = `<div style="background-color:${f.color || "#6366F1"}; border-radius:50%; width:100%; height:100%;${f.borderStyle && f.borderStyle !== "none" ? ` border:${strokeW}px ${f.borderStyle} ${strokeColor};` : ""}"></div>`;
              } else if (f.shapeType === "triangle") {
                shapeMarkup = ReactDOMServer.renderToStaticMarkup(
                  <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                    <polygon points="50,0 0,100 100,100" fill={f.color || "#6366F1"} {...strokeAttr} />
                  </svg>
                );
              } else if (f.shapeType === "star") {
                shapeMarkup = ReactDOMServer.renderToStaticMarkup(
                  <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                    <polygon points="50,0 63,38 100,38 70,62 82,100 50,75 18,100 30,62 0,38 37,38" fill={f.color || "#6366F1"} {...strokeAttr} />
                  </svg>
                );
              } else if (f.shapeType === "hexagon") {
                shapeMarkup = ReactDOMServer.renderToStaticMarkup(
                  <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                    <polygon points="50,0 100,25 100,75 50,100 0,75 0,25" fill={f.color || "#6366F1"} {...strokeAttr} />
                  </svg>
                );
              } else if (f.shapeType === "line") {
                shapeMarkup = `<div style="background-color:${f.color || "#6366F1"}; width:100%; height:100%;"></div>`;
              } else if (f.shapeType === "diamond") {
                shapeMarkup = ReactDOMServer.renderToStaticMarkup(
                  <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                    <polygon points="50,0 100,50 50,100 0,50" fill={f.color || "#6366F1"} {...strokeAttr} />
                  </svg>
                );
              } else if (f.shapeType === "pentagon") {
                shapeMarkup = ReactDOMServer.renderToStaticMarkup(
                  <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                    <polygon points="50,0 100,38 81,100 19,100 0,38" fill={f.color || "#6366F1"} {...strokeAttr} />
                  </svg>
                );
              } else if (f.shapeType === "octagon") {
                shapeMarkup = ReactDOMServer.renderToStaticMarkup(
                  <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                    <polygon points="30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30" fill={f.color || "#6366F1"} {...strokeAttr} />
                  </svg>
                );
              } else {
                shapeMarkup = `<div style="background-color:${f.color || "#6366F1"}; width:100%; height:100%;"></div>`;
              }
              return `<div style="${outerStyle}"><div style="${innerStyle}">${shapeMarkup}</div></div>`;
            }

            const rawText = f.placeholder || f.text || f.value || "";
            let processedText = tokenReplace(rawText);
            if (f.textCase === "uppercase") processedText = processedText.toUpperCase();
            else if (f.textCase === "lowercase") processedText = processedText.toLowerCase();
            else if (f.textCase === "title") processedText = processedText.replace(/\b\w/g, char => char.toUpperCase());
            else if (f.textCase === "sentence") processedText = processedText.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());

            const justify = f.align === "center" ? "center" : f.align === "right" ? "flex-end" : "flex-start";
            const styles = `font-family:'${f.fontFamily}', sans-serif; font-size:${f.fontSize}pt; line-height:1.2; color:${f.color}; font-weight:${f.bold ? 700 : 400}; font-style:${f.italic ? "italic" : "normal"}; text-decoration:${f.underline ? "underline" : "none"}; white-space:nowrap; overflow:hidden; padding:0 4px; display:flex; align-items:center; justify-content:${justify}; word-break:keep-all; width:100%; height:100%; box-sizing:border-box;`;
            return `<div style="${outerStyle}"><div style="${innerStyle}"><div style="${styles}">${processedText}</div></div></div>`;
          })
          .join("");

        pageElement.innerHTML = `<div style="position:absolute; top:0px; left:0px; width:100%; height:100%;">${fieldsHtml}</div>`;

        await new Promise(resolve => requestAnimationFrame(resolve));
        if (typeof window !== "undefined") {
          try {
            await document.fonts.ready;
            await new Promise(r => setTimeout(r, 100)); // Small yield to ensure rendering
          } catch (e) {}
        }
        const canvas = await html2canvas(pageElement, {
          scale: 3.5,
          useCORS: true,
          backgroundColor: null
        });

        const imgData = canvas.toDataURL("image/png");
        pdf.addImage(imgData, "PNG", 0, 0, width_mm, height_mm);
        document.body.removeChild(printContainer);
      }

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
                onClick={handleBulkPrint} 
                disabled={printing || selectedParticipantIds.size === 0} 
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
                              setSelectedParticipantIds(new Set([p.id]));
                              setTimeout(() => handleBulkPrint(), 50);
                            }}
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
