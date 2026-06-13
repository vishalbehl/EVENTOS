"use client";

import React from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import ReactDOMServer from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import * as LucideIcons from "lucide-react";

export interface PrintParticipant {
  id?: string;
  name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  company?: string;
  designation?: string;
  role: string;
  regno: string;
  paid_status: string;
  source?: string;
  registered_at?: string;
  photo?: string;
  avatar?: string;
  profile_picture?: string;
  [key: string]: any;
}

export interface EventDetails {
  name: string;
  start_date?: string;
  end_date?: string;
  event_code?: string;
  short_code?: string;
  location?: string;
  venue?: string;
  [key: string]: any;
}

// Preload Google Fonts dynamically
export const preloadGoogleFonts = async (families: string[]) => {
  if (typeof window === "undefined") return;
  const googleFonts = families.filter(
    (f) => !["Arial", "Times New Roman", "Georgia", "Courier New", "Verdana"].includes(f)
  );
  if (googleFonts.length === 0) return;
  const uniqueFonts = Array.from(new Set(googleFonts));
  const linkId = "google-fonts-preload";
  let link = document.getElementById(linkId) as HTMLLinkElement;
  const query = uniqueFonts
    .map((f) => `family=${f.replace(/\s+/g, "+")}:ital,wght@0,400;0,700;1,400;1,700`)
    .join("&");
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
    console.error("Error preloading google fonts:", e);
  }
};

// Token Replacement Helper
export const replaceTemplateTokens = (
  text: string,
  participant: PrintParticipant,
  event: EventDetails | null,
  certTitle?: string,
  certBody?: string
): string => {
  if (!text) return "";
  let res = text;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const replacements: Record<string, string> = {
    name: participant.name || "",
    first_name: participant.first_name || participant.name?.split(" ")[0] || "",
    last_name:
      participant.last_name ||
      (participant.name?.includes(" ")
        ? participant.name.split(" ").slice(1).join(" ")
        : "") ||
      "",
    firstname: participant.first_name || participant.name?.split(" ")[0] || "",
    lastname:
      participant.last_name ||
      (participant.name?.includes(" ")
        ? participant.name.split(" ").slice(1).join(" ")
        : "") ||
      "",
    role: participant.role || "",
    regno: participant.regno || "",
    email: participant.email || "",
    phone: participant.phone || "",
    company: participant.company || "",
    designation: participant.designation || "",
    title: certTitle || "",
    body: certBody || "",
    date: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    todaydate: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    eventstartdate: event?.start_date ? formatDate(event.start_date) : "",
    eventenddate: event?.end_date ? formatDate(event.end_date) : "",
    eventname: event?.name || "",
    eventcode: event?.event_code || event?.short_code || "",
    location: event?.location || "",
    venue: event?.venue || event?.venue_name || "",
    paidstatus: participant.paid_status || "",
  };

  for (const [key, val] of Object.entries(replacements)) {
    res = res.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), val);
  }
  return res;
};

// Generate vCard String Helper
export const generateVCardString = (participant: PrintParticipant): string => {
  const name = participant.name || "";
  const company = participant.company || "";
  const designation = participant.designation || "";
  const phone = participant.phone || "";
  const email = participant.email || "";
  return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nORG:${company}\nTITLE:${designation}\nTEL;TYPE=WORK,VOICE:${phone}\nEMAIL:${email}\nEND:VCARD`;
};

// Core compiler to generate jsPDF instance
export const compileTemplateToPdf = async (
  participants: PrintParticipant[],
  templateData: any,
  eventDetails: EventDetails | null,
  certTitle?: string,
  certBody?: string
): Promise<jsPDF> => {
  const width_mm = templateData.width_mm || 76;
  const height_mm = templateData.height_mm || 100;
  const orientation =
    templateData.orientation || (width_mm > height_mm ? "landscape" : "portrait");
  const pages = templateData.pages || [];

  if (pages.length === 0) {
    throw new Error("Template does not contain any pages.");
  }

  // Preload all Google Fonts used in the templates
  const fontFamilies: string[] = [];
  for (const pageData of pages) {
    for (const field of pageData.fields || []) {
      if (field.fontFamily) {
        fontFamilies.push(field.fontFamily);
      }
    }
  }
  await preloadGoogleFonts(fontFamilies);

  const pdf = new jsPDF({
    orientation: orientation as any,
    unit: "mm",
    format: [width_mm, height_mm],
    compress: true,
  });

  const mmToPx = (mm: number) => (mm / 25.4) * 96;

  // Build temporary print spooler container
  const printContainer = document.createElement("div");
  document.body.appendChild(printContainer);
  Object.assign(printContainer.style, {
    position: "fixed",
    top: "0",
    left: "0",
    opacity: "0",
    zIndex: "-9999",
    pointerEvents: "none",
  });

  for (let idx = 0; idx < participants.length; idx++) {
    const participant = participants[idx];

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const pageData = pages[pageIdx];

      // Add page if this is not the absolute first canvas
      if (idx > 0 || pageIdx > 0) {
        pdf.addPage([width_mm, height_mm], orientation as any);
      }

      // Draw background color
      let bgColor = null;
      if (pageData.print_backgroundColor !== false) {
        bgColor = pageData.backgroundColor || "#FFFFFF";
        pdf.setFillColor(bgColor);
        pdf.rect(0, 0, width_mm, height_mm, "F");
      }

      // Draw background image
      if (pageData.backgroundImage && pageData.print_backgroundImage !== false) {
        let format = "JPEG";
        if (pageData.backgroundImage.startsWith("data:image/png")) format = "PNG";
        else if (pageData.backgroundImage.startsWith("data:image/webp")) format = "WEBP";
        pdf.addImage(pageData.backgroundImage, format, 0, 0, width_mm, height_mm);
      }

      // Build DOM layout for the html2canvas overlay
      const pageElement = document.createElement("div");
      printContainer.appendChild(pageElement);
      Object.assign(pageElement.style, {
        width: `${mmToPx(width_mm)}px`,
        height: `${mmToPx(height_mm)}px`,
        position: "relative",
        backgroundColor: "transparent",
      });

      const nativeImages: Array<{
        src: string;
        x: number;
        y: number;
        w: number;
        h: number;
        align: string;
        rotation?: number;
      }> = [];

      // Render template fields to hidden DOM element
      for (const field of pageData.fields || []) {
        if (field.enabled === false) continue;

        const fieldEl = document.createElement("div");
        pageElement.appendChild(fieldEl);
        const safeW =
          parseFloat(field.w_mm) ||
          parseFloat(field.width_mm) ||
          parseFloat(field.w) ||
          parseFloat(field.width) ||
          20;
        const safeH =
          parseFloat(field.h_mm) ||
          parseFloat(field.height_mm) ||
          parseFloat(field.h) ||
          parseFloat(field.height) ||
          10;

        const px = mmToPx(parseFloat(field.x_mm) || parseFloat(field.x) || 0);
        const py = mmToPx(parseFloat(field.y_mm) || parseFloat(field.y) || 0);
        const pw = mmToPx(safeW);
        const ph = mmToPx(safeH);

        const borderStyle = field.borderStyle || "none";
        const borderWidth =
          borderStyle !== "none"
            ? `${mmToPx(parseFloat(field.borderWidth_mm) || 0.5)}px`
            : undefined;
        const borderRadius =
          field.type === "photo" && field.frame === "circle"
            ? "50%"
            : field.cornerRadius_mm
            ? `${mmToPx(parseFloat(field.cornerRadius_mm))}px`
            : undefined;

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
          borderColor: borderStyle !== "none" ? field.borderColor || "#000000" : undefined,
          borderRadius: borderRadius || "0px",
        });
        fieldEl.appendChild(innerEl);

        if (field.type === "qr") {
          const qrSize = Math.round(Math.min(pw, ph));
          innerEl.innerHTML = ReactDOMServer.renderToString(
            <QRCodeSVG
              value={replaceTemplateTokens(field.qrValue || "{{regno}}", participant, eventDetails, certTitle, certBody)}
              fgColor={field.color || "#000000"}
              bgColor={field.bgColor || "#FFFFFF"}
              level="M"
              size={qrSize}
            />
          );
        } else if (field.type === "contact_qr") {
          const qrSize = Math.round(Math.min(pw, ph));
          innerEl.innerHTML = ReactDOMServer.renderToString(
            <QRCodeSVG
              value={generateVCardString(participant)}
              fgColor={field.color || "#000000"}
              bgColor={field.bgColor || "#FFFFFF"}
              level="M"
              size={qrSize}
            />
          );
        } else if (field.type === "image" && field.src) {
          // Direct native rendering bypasses html2canvas scaling issues
          nativeImages.push({
            src: field.src,
            x: parseFloat(field.x_mm) || parseFloat(field.x) || 0,
            y: parseFloat(field.y_mm) || parseFloat(field.y) || 0,
            w: safeW,
            h: safeH,
            align: field.align || "center",
            rotation: field.rotation || 0,
          });
          const imgPlaceholder = document.createElement("div");
          imgPlaceholder.style.width = "100%";
          imgPlaceholder.style.height = "100%";
          imgPlaceholder.style.background = "transparent";
          innerEl.appendChild(imgPlaceholder);
        } else if (field.type === "photo") {
          const photoUrl =
            participant.photo ||
            participant.avatar ||
            participant.profile_picture ||
            "https://placehold.co/300x300/EFEFEF/AAAAAA&text=Photo";
          if (photoUrl) {
            const imgDiv = document.createElement("div");
            imgDiv.style.width = "100%";
            imgDiv.style.height = "100%";
            imgDiv.style.backgroundImage = `url(${photoUrl})`;
            imgDiv.style.backgroundSize = "cover";
            imgDiv.style.backgroundRepeat = "no-repeat";
            imgDiv.style.borderRadius = field.frame === "circle" ? "50%" : "0";
            imgDiv.style.backgroundPosition =
              field.align === "left"
                ? "left center"
                : field.align === "right"
                ? "right center"
                : "center center";
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
          const strokeDash =
            field.borderStyle === "dashed" ? "8,4" : field.borderStyle === "dotted" ? "2,4" : "";
          const strokeAttr =
            strokeW > 0
              ? {
                  stroke: strokeColor,
                  strokeWidth: strokeW,
                  ...(strokeDash ? { strokeDasharray: strokeDash } : {}),
                  vectorEffect: "non-scaling-stroke",
                }
              : {};

          if (field.shapeType === "circle") {
            shapeHtml = ReactDOMServer.renderToString(
              <div
                style={{
                  backgroundColor: field.color || "#6366F1",
                  borderRadius: "50%",
                  width: "100%",
                  height: "100%",
                  ...(field.borderStyle && field.borderStyle !== "none"
                    ? { border: `${strokeW}px ${field.borderStyle} ${strokeColor}` }
                    : {}),
                }}
              />
            );
          } else if (field.shapeType === "triangle") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg
                viewBox="0 0 100 100"
                style={{ width: "100%", height: "100%" }}
                preserveAspectRatio="none"
              >
                <polygon points="50,0 0,100 100,100" fill={field.color || "#6366F1"} {...strokeAttr} />
              </svg>
            );
          } else if (field.shapeType === "star") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg
                viewBox="0 0 100 100"
                style={{ width: "100%", height: "100%" }}
                preserveAspectRatio="none"
              >
                <polygon
                  points="50,0 63,38 100,38 70,62 82,100 50,75 18,100 30,62 0,38 37,38"
                  fill={field.color || "#6366F1"}
                  {...strokeAttr}
                />
              </svg>
            );
          } else if (field.shapeType === "hexagon") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg
                viewBox="0 0 100 100"
                style={{ width: "100%", height: "100%" }}
                preserveAspectRatio="none"
              >
                <polygon points="50,0 100,25 100,75 50,100 0,75 0,25" fill={field.color || "#6366F1"} {...strokeAttr} />
              </svg>
            );
          } else if (field.shapeType === "line") {
            shapeHtml = ReactDOMServer.renderToString(
              <div style={{ backgroundColor: field.color || "#6366F1", width: "100%", height: "100%" }} />
            );
          } else if (field.shapeType === "diamond") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg
                viewBox="0 0 100 100"
                style={{ width: "100%", height: "100%" }}
                preserveAspectRatio="none"
              >
                <polygon points="50,0 100,50 50,100 0,50" fill={field.color || "#6366F1"} {...strokeAttr} />
              </svg>
            );
          } else if (field.shapeType === "pentagon") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg
                viewBox="0 0 100 100"
                style={{ width: "100%", height: "100%" }}
                preserveAspectRatio="none"
              >
                <polygon points="50,0 100,38 81,100 19,100 0,38" fill={field.color || "#6366F1"} {...strokeAttr} />
              </svg>
            );
          } else if (field.shapeType === "octagon") {
            shapeHtml = ReactDOMServer.renderToString(
              <svg
                viewBox="0 0 100 100"
                style={{ width: "100%", height: "100%" }}
                preserveAspectRatio="none"
              >
                <polygon
                  points="30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30"
                  fill={field.color || "#6366F1"}
                  {...strokeAttr}
                />
              </svg>
            );
          } else {
            shapeHtml = ReactDOMServer.renderToString(
              <div style={{ backgroundColor: field.color || "#6366F1", width: "100%", height: "100%" }} />
            );
          }
          innerEl.innerHTML = shapeHtml;
        } else {
          // Text fields
          const rawText = field.placeholder || field.text || field.value || "";
          let processedText = replaceTemplateTokens(
            rawText,
            participant,
            eventDetails,
            certTitle,
            certBody
          );
          if (field.textCase === "uppercase") processedText = processedText.toUpperCase();
          else if (field.textCase === "lowercase") processedText = processedText.toLowerCase();
          else if (field.textCase === "title")
            processedText = processedText.replace(/\b\w/g, (char) => char.toUpperCase());
          else if (field.textCase === "sentence")
            processedText = processedText.replace(
              /(^\s*|[.!?]\s+)([a-z])/g,
              (m, p1, p2) => p1 + p2.toUpperCase()
            );

          const justifyContent =
            field.align === "center"
              ? "center"
              : field.align === "right"
              ? "flex-end"
              : "flex-start";

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

      // Small wait to ensure font styling applies before rendering canvas
      if (typeof window !== "undefined") {
        try {
          await document.fonts.ready;
          await new Promise((r) => setTimeout(r, 100));
        } catch (e) {}
      }

      // Render the Hidden Page container into Canvas
      const canvas = await html2canvas(pageElement, {
        scale: 3,
        backgroundColor: null,
        logging: false,
        useCORS: true,
      });

      const overlayImgData = canvas.toDataURL("image/png");

      // Draw direct native images (images bypassed from html2canvas to maintain high-res)
      for (const nImg of nativeImages) {
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

            pdf.addImage(srcToDraw, format, finalX, finalY, finalW, finalH);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = nImg.src;
        });
      }

      // Layer the overlay canvas image on top of pdf
      pdf.addImage(overlayImgData, "PNG", 0, 0, width_mm, height_mm);

      // Clean up DOM node
      printContainer.removeChild(pageElement);
    }
  }

  // Remove global spooler container
  document.body.removeChild(printContainer);

  return pdf;
};
