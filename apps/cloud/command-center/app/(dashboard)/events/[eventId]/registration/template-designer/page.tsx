"use client";

import React, { useEffect, useState, useReducer, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import {
  Save, Trash2, Plus, Printer, Undo2, Redo2, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Type, QrCode, Calendar,
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Image as ImageIcon,
  Palette, Mail, Phone, Badge as BadgeIcon, Copy, FileText, Sparkles, RefreshCw,
  Search, Grid, Shapes, Upload, Database, Eye, X, Check, ArrowDown, ArrowUp, LayoutGrid, User, Crop
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

const uuidv4 = () => {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// ===== Constants =====
const FONT_FAMILIES = [
  "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Nunito", "Rubik", "Inter", "Ubuntu",
  "Merriweather", "Noto Sans", "Oswald", "PT Sans", "Raleway", "Work Sans", "Karla", "Mulish", "Quicksand",
  "Arial", "Times New Roman", "Georgia", "Courier New", "Verdana"
];

const PAGE_SIZES: Record<string, { width_mm: number; height_mm: number }> = {
  badge: { width_mm: 76, height_mm: 100 },
  a6: { width_mm: 105, height_mm: 148 },
  a5: { width_mm: 148, height_mm: 210 },
  a4: { width_mm: 210, height_mm: 297 },
  letter: { width_mm: 215.9, height_mm: 279.4 },
};

const DEFAULT_VARIABLES = [
  "Name", "FirstName", "LastName", "Email", "Phone", "Company", "Designation", "Country", "Role", "RegNo",
  "EventName", "EventCode", "Location", "Venue", "PaidStatus"
];

const AVAILABLE_ICONS = [
  "Star", "Heart", "Check", "Mail", "Phone", "Calendar", "MapPin", "Award", "User", "Briefcase", "Globe", "Info",
  "Shield", "Flag", "Lock", "Smile", "FileText", "Activity", "BookOpen", "Bell", "Sparkles", "Gift", "Coffee", "Camera"
];

const DPI = 96;
const mmToPx = (mm: number) => (mm / 25.4) * DPI;
const pxToMm = (px: number) => (px * 25.4) / DPI;
const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
const HANDLE_OFFSET_MM = 0;

const getRotatedBounds = (w: number, h: number, rotationDeg: number) => {
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const cosAbs = Math.abs(Math.cos(rotationRad));
  const sinAbs = Math.abs(Math.sin(rotationRad));
  const rotW = w * cosAbs + h * sinAbs;
  const rotH = w * sinAbs + h * cosAbs;
  return { rotW, rotH };
};

const isSizeAndCenterValid = (
  w: number,
  h: number,
  cx: number,
  cy: number,
  rotationDeg: number,
  marginL: number,
  marginR: number,
  marginT: number,
  marginB: number,
  pageW: number,
  pageH: number
) => {
  const rad = (rotationDeg * Math.PI) / 180;
  const cosAbs = Math.abs(Math.cos(rad));
  const sinAbs = Math.abs(Math.sin(rad));
  const rotW = w * cosAbs + h * sinAbs;
  const rotH = w * sinAbs + h * cosAbs;

  const minX = Math.max(0, marginL);
  const maxX = Math.max(minX, pageW - Math.max(0, marginR));
  const minY = Math.max(0, marginT);
  const maxY = Math.max(minY, pageH - Math.max(0, marginB));

  if (rotW > (maxX - minX) + 0.01 || rotH > (maxY - minY) + 0.01) {
    return false;
  }

  const minCX = minX + rotW / 2;
  const maxCX = maxX - rotW / 2;
  const minCY = minY + rotH / 2;
  const maxCY = maxY - rotH / 2;

  if (cx < minCX - 0.01 || cx > maxCX + 0.01) return false;
  if (cy < minCY - 0.01 || cy > maxCY + 0.01) return false;

  return true;
};

const clampPositionToMargins = (
  x: number,
  y: number,
  w: number,
  h: number,
  rotationDeg: number,
  page: { margin_left_mm?: number; margin_right_mm?: number; margin_top_mm?: number; margin_bottom_mm?: number } | null,
  template: { width_mm: number; height_mm: number }
) => {
  const { rotW, rotH } = getRotatedBounds(w, h, rotationDeg);
  const ml = page?.margin_left_mm ?? 0;
  const mr = page?.margin_right_mm ?? 0;
  const mt = page?.margin_top_mm ?? 0;
  const mb = page?.margin_bottom_mm ?? 0;

  const minX = Math.max(0, ml);
  const maxX = Math.max(minX, template.width_mm - Math.max(0, mr));
  const minY = Math.max(0, mt);
  const maxY = Math.max(minY, template.height_mm - Math.max(0, mb));

  let minCX = minX + rotW / 2;
  let maxCX = maxX - rotW / 2;
  if (minCX > maxCX) {
    const mid = (minX + maxX) / 2;
    minCX = mid;
    maxCX = mid;
  }

  let minCY = minY + rotH / 2;
  let maxCY = maxY - rotH / 2;
  if (minCY > maxCY) {
    const mid = (minY + maxY) / 2;
    minCY = mid;
    maxCY = mid;
  }

  const currentCX = x + w / 2;
  const currentCY = y + h / 2;

  const clampedCX = clamp(currentCX, minCX, maxCX);
  const clampedCY = clamp(currentCY, minCY, maxCY);

  return {
    x: parseFloat((clampedCX - w / 2).toFixed(2)),
    y: parseFloat((clampedCY - h / 2).toFixed(2))
  };
};


// ===== Helper: Casing & vCard generator =====
const applyCasing = (text: string, casing: string) => {
  if (!text) return "";
  switch (casing) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "sentence":
      return text.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
    case "title":
      return text.replace(/\b\w/g, char => char.toUpperCase());
    default:
      return text;
  }
};

const tokenReplace = (text: string, data: Record<string, string>, textCase: string = "none") => {
  if (!text) return "";
  let result = text;
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
    result = result.replace(regex, data[key] || "");
  });
  return applyCasing(result, textCase);
};

const generateVCardString = (data: any) => (
  `BEGIN:VCARD\nVERSION:3.0\nFN:${data.name || ""}\nORG:${data.company || ""}\nTITLE:${data.designation || ""}\nTEL;TYPE=WORK,VOICE:${data.phone || ""}\nEMAIL:${data.email || ""}\nEND:VCARD`
);

// ===== State Management & Defaults =====
const getDefaultPage = () => ({
  id: uuidv4(),
  backgroundImage: null,
  backgroundColor: "#FFFFFF",
  print_backgroundColor: true,
  print_backgroundImage: true,
  margin_top_mm: 5, margin_right_mm: 5, margin_bottom_mm: 5, margin_left_mm: 5,
  fields: [] as any[],
});

const DEFAULT_TEMPLATE = {
  template_name: "New Unsaved Template",
  template_type: "custom" as string,
  page_size: "badge",
  width_mm: 76, height_mm: 100, orientation: "portrait",
  pages: [getDefaultPage()],
  relative_to_page: true,
};

// ===== Reducer =====
const reducer = (state: any, action: any): any => {
  const { activePageIndex } = state.meta;
  switch (action.type) {
    case "LOAD_TEMPLATE":
      return { ...action.payload };
    case "SET_PROPERTY":
      return { ...state, template: { ...state.template, [action.payload.prop]: action.payload.value } };
    case "SET_PAGE_PROPERTY": {
      const { pageIndex, prop, value } = action.payload;
      const newPages = state.template.pages.map((p: any, i: number) => i === pageIndex ? { ...p, [prop]: value } : p);
      return { ...state, template: { ...state.template, pages: newPages } };
    }
    case "SET_FIELD_PROPERTY": {
      const { fieldId, prop, value } = action.payload;
      const newPages = state.template.pages.map((p: any, i: number) =>
        i === activePageIndex ? { ...p, fields: p.fields.map((f: any) => f.id === fieldId ? { ...f, [prop]: value } : f) } : p
      );
      return { ...state, template: { ...state.template, pages: newPages } };
    }
    case "ADD_FIELD": {
      const newPages = state.template.pages.map((p: any, i: number) =>
        i === activePageIndex ? { ...p, fields: [...p.fields, action.payload.field] } : p
      );
      return { ...state, template: { ...state.template, pages: newPages }, meta: { ...state.meta, selectedFieldId: action.payload.field.id } };
    }
    case "DELETE_FIELD": {
      const { fieldId } = action.payload;
      const newPages = state.template.pages.map((page: any, index: number) => {
        if (index !== activePageIndex) return page;
        return { ...page, fields: page.fields.filter((field: any) => field.id !== fieldId) };
      });
      return { ...state, template: { ...state.template, pages: newPages }, meta: { ...state.meta, selectedFieldId: null } };
    }
    case "ADD_PAGE":
      return { ...state, template: { ...state.template, pages: [...state.template.pages, action.payload.page] } };
    case "CLONE_PAGE": {
      const pageToClone = state.template.pages[action.payload.pageIndex];
      const clonedPage = {
        ...pageToClone,
        id: uuidv4(),
        fields: pageToClone.fields.map((f: any) => ({ ...f, id: uuidv4() }))
      };
      const newPages = [...state.template.pages];
      newPages.splice(action.payload.pageIndex + 1, 0, clonedPage);
      return { ...state, template: { ...state.template, pages: newPages }, meta: { ...state.meta, activePageIndex: action.payload.pageIndex + 1 } };
    }
    case "DELETE_PAGE": {
      if (state.template.pages.length <= 1) return state;
      const newPages = state.template.pages.filter((_: any, i: number) => i !== action.payload.pageIndex);
      const nextActive = Math.max(0, Math.min(newPages.length - 1, state.meta.activePageIndex));
      return { ...state, template: { ...state.template, pages: newPages }, meta: { ...state.meta, activePageIndex: nextActive } };
    }
    case "MOVE_FIELD_FORWARD": {
      const { fieldId } = action.payload;
      const page = state.template.pages[activePageIndex];
      const idx = page.fields.findIndex((f: any) => f.id === fieldId);
      if (idx === -1 || idx === page.fields.length - 1) return state;
      const newFields = [...page.fields];
      [newFields[idx], newFields[idx + 1]] = [newFields[idx + 1], newFields[idx]];
      const newPages = state.template.pages.map((p: any, i: number) => i === activePageIndex ? { ...p, fields: newFields } : p);
      return { ...state, template: { ...state.template, pages: newPages } };
    }
    case "MOVE_FIELD_BACKWARD": {
      const { fieldId } = action.payload;
      const page = state.template.pages[activePageIndex];
      const idx = page.fields.findIndex((f: any) => f.id === fieldId);
      if (idx === -1 || idx === 0) return state;
      const newFields = [...page.fields];
      [newFields[idx], newFields[idx - 1]] = [newFields[idx - 1], newFields[idx]];
      const newPages = state.template.pages.map((p: any, i: number) => i === activePageIndex ? { ...p, fields: newFields } : p);
      return { ...state, template: { ...state.template, pages: newPages } };
    }
    case "BRING_FIELD_TO_FRONT": {
      const { fieldId } = action.payload;
      const page = state.template.pages[activePageIndex];
      const idx = page.fields.findIndex((f: any) => f.id === fieldId);
      if (idx === -1) return state;
      const newFields = [...page.fields];
      const [moved] = newFields.splice(idx, 1);
      newFields.push(moved);
      const newPages = state.template.pages.map((p: any, i: number) => i === activePageIndex ? { ...p, fields: newFields } : p);
      return { ...state, template: { ...state.template, pages: newPages } };
    }
    case "SEND_FIELD_TO_BACK": {
      const { fieldId } = action.payload;
      const page = state.template.pages[activePageIndex];
      const idx = page.fields.findIndex((f: any) => f.id === fieldId);
      if (idx === -1) return state;
      const newFields = [...page.fields];
      const [moved] = newFields.splice(idx, 1);
      newFields.unshift(moved);
      const newPages = state.template.pages.map((p: any, i: number) => i === activePageIndex ? { ...p, fields: newFields } : p);
      return { ...state, template: { ...state.template, pages: newPages } };
    }
    case "SET_META":
      return { ...state, meta: { ...state.meta, ...action.payload } };
    default:
      return state;
  }
};

// ===== Custom History Hook =====
const useHistoryReducer = (initialState: any) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [history, setHistory] = useState<{ undo: any[]; redo: any[] }>({ undo: [], redo: [] });

  const wrappedDispatch = (action: any) => {
    if (!action.skipHistory) {
      setHistory(h => ({ undo: [...h.undo, JSON.parse(JSON.stringify(state))], redo: [] }));
    }
    dispatch(action);
  };


  const undo = () => {
    if (history.undo.length === 0) return;
    const previousState = history.undo[history.undo.length - 1];
    setHistory(h => ({ undo: h.undo.slice(0, h.undo.length - 1), redo: [...h.redo, state] }));
    dispatch({ type: "LOAD_TEMPLATE", payload: previousState });
  };

  const redo = () => {
    if (history.redo.length === 0) return;
    const nextState = history.redo[history.redo.length - 1];
    setHistory(h => ({ undo: [...h.undo, state], redo: h.redo.slice(0, h.redo.length - 1) }));
    dispatch({ type: "LOAD_TEMPLATE", payload: nextState });
  };

  const loadState = (newState: any) => {
    dispatch({ type: "LOAD_TEMPLATE", payload: newState });
    setHistory({ undo: [], redo: [] });
  };

  return { state, dispatch: wrappedDispatch, loadState, undo, redo, canUndo: history.undo.length > 0, canRedo: history.redo.length > 0 };
};

export default function PrintDesigner() {
  const { eventId } = useParams();
  const [loading, setLoading] = useState(false);
  const [templatesList, setTemplatesList] = useState<any[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<string | null>("templates");
  const toggleSidebarTab = (tab: string) => {
    setActiveSidebarTab(prev => prev === tab ? null : tab);
  };
  const [availableVariables, setAvailableVariables] = useState<string[]>(DEFAULT_VARIABLES);
  const [variableSearch, setVariableSearch] = useState("");
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fieldId: string } | null>(null);

  // Image Crop & Filter Editor States
  const [imageToEdit, setImageToEdit] = useState<string | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [cropPercent, setCropPercent] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const cropperDragRef = useRef<{
    type: "move" | "resize";
    handle?: "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";
    startX: number;
    startY: number;
    startCropX: number;
    startCropY: number;
    startCropW: number;
    startCropH: number;
  } | null>(null);
  const [cropAspect, setCropAspect] = useState<"1:1" | "4:3" | "16:9" | "free">("1:1");
  const [cropShape, setCropShape] = useState<"rect" | "circle">("rect");
  const [filterBrightness, setFilterBrightness] = useState<number>(100);
  const [filterContrast, setFilterContrast] = useState<number>(100);

  // ── Keyboard & Mouse Control State ──
  const [clipboard, setClipboard] = useState<any>(null);
  const [canvasZoom, setCanvasZoom] = useState<number>(1.0);
  const [activeGuides, setActiveGuides] = useState<{ xLines: number[]; yLines: number[] }>({ xLines: [], yLines: [] });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panDragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const resizeDragRef = useRef<{
    handle: string;
    startX: number; startY: number;
    startW: number; startH: number;
    startFieldX: number; startFieldY: number;
    anchorX: number; anchorY: number;
    rotationDeg: number; rotationRad: number;
    cosVal: number; sinVal: number;
    aspectRatio: number;
    shiftLock: boolean;
    zoomScale: number;          // zoom * canvasZoom at time of mousedown
    marginL: number; marginR: number; marginT: number; marginB: number;
    pageW: number; pageH: number;
  } | null>(null);

  const pageContainerRef = useRef<HTMLDivElement>(null);
  const rotateDragRef = useRef<{
    fieldId: string;
    centerX: number;
    centerY: number;
    initialAngle: number;
    shiftLock: boolean;
    fieldW: number;
    fieldH: number;
    startX: number;
    startY: number;
    marginL: number;
    marginR: number;
    marginT: number;
    marginB: number;
    pageW: number;
    pageH: number;
    currentRotation?: number;
    currentX?: number;
    currentY?: number;
  } | null>(null);

  const resizeMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const resizeUpRef = useRef<(() => void) | null>(null);
  const rotateMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const rotateUpRef = useRef<(() => void) | null>(null);

  const stableResizeMove = useCallback((e: MouseEvent) => {
    resizeMoveRef.current?.(e);
  }, []);
  const stableResizeUp = useCallback(() => {
    resizeUpRef.current?.();
  }, []);
  const stableRotateMove = useCallback((e: MouseEvent) => {
    rotateMoveRef.current?.(e);
  }, []);
  const stableRotateUp = useCallback(() => {
    rotateUpRef.current?.();
  }, []);

  const getResizeCursor = (handleId: string, rotation: number) => {
    let baseAngle = 0;
    if (handleId === "tr" || handleId === "bl") baseAngle = 45;
    else if (handleId === "t" || handleId === "b") baseAngle = 90;
    else if (handleId === "tl" || handleId === "br") baseAngle = 135;

    const angle = (baseAngle + rotation + 360) % 180;
    if (angle >= 22.5 && angle < 67.5) return "nesw-resize";
    if (angle >= 67.5 && angle < 112.5) return "ns-resize";
    if (angle >= 112.5 && angle < 157.5) return "nwse-resize";
    return "ew-resize";
  };

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mainContainer = document.querySelector("main");
    let originalMainOverflow = "";
    if (mainContainer) {
      originalMainOverflow = mainContainer.style.overflow;
      mainContainer.style.overflow = "hidden";
    }

    const cardElement = containerRef.current?.parentElement;
    let originalCardMinHeight = "";
    let originalCardHeight = "";
    let originalCardPadding = "";
    let originalCardOverflow = "";
    let originalCardBorder = "";
    let originalCardBg = "";
    let originalCardShadow = "";

    if (cardElement) {
      originalCardMinHeight = cardElement.style.minHeight;
      originalCardHeight = cardElement.style.height;
      originalCardPadding = cardElement.style.padding;
      originalCardOverflow = cardElement.style.overflow;
      originalCardBorder = cardElement.style.border;
      originalCardBg = cardElement.style.background;
      originalCardShadow = cardElement.style.boxShadow;

      cardElement.style.minHeight = "0";
      cardElement.style.height = "calc(100vh - 180px)";
      cardElement.style.padding = "0";
      cardElement.style.overflow = "hidden";
      cardElement.style.border = "none";
      cardElement.style.background = "transparent";
      cardElement.style.boxShadow = "none";
    }

    return () => {
      if (mainContainer) {
        mainContainer.style.overflow = originalMainOverflow;
      }
      if (cardElement) {
        cardElement.style.minHeight = originalCardMinHeight;
        cardElement.style.height = originalCardHeight;
        cardElement.style.padding = originalCardPadding;
        cardElement.style.overflow = originalCardOverflow;
        cardElement.style.border = originalCardBorder;
        cardElement.style.background = originalCardBg;
        cardElement.style.boxShadow = originalCardShadow;
      }
    };
  }, []);

  const initialState = {
    template: JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)),
    meta: { activePageIndex: 0, selectedFieldId: null, zoom: 1.0, design_mode: true, currentTemplateId: "new" }
  };

  const { state, dispatch, loadState, undo, redo, canUndo, canRedo } = useHistoryReducer(initialState);
  const { template, meta } = state;
  const { activePageIndex, selectedFieldId, zoom, design_mode, currentTemplateId } = meta;

  const [previewData, setPreviewData] = useState<Record<string, string>>({
    name: "John Doe",
    Name: "John Doe",
    first_name: "John",
    last_name: "Doe",
    FirstName: "John",
    LastName: "Doe",
    firstname: "John",
    lastname: "Doe",
    regno: "DEL-0001",
    role: "Delegate",
    email: "john.doe@example.com",
    phone: "+1-555-123-4567",
    company: "ACME Inc.",
    designation: "Chief Innovator",
    country: "India",
    photo: "https://placehold.co/300x300/EFEFEF/AAAAAA&text=Sample",
    TodayDate: "May 20, 2026",
    EventStartDate: "May 25, 2026",
    EventEndDate: "May 28, 2026"
  });

  const activePage = template.pages[activePageIndex];
  const selectedField = activePage?.fields.find((f: any) => f.id === selectedFieldId) || null;

  // Dynamic load fonts based on fields used
  useEffect(() => {
    const allFonts = new Set<string>();
    template.pages.forEach((p: any) => p.fields.forEach((f: any) => {
      if (f.fontFamily) allFonts.add(f.fontFamily);
    }));
    if (allFonts.size === 0) return;
    const googleFonts = Array.from(allFonts).filter(f => !["Arial", "Times New Roman", "Georgia", "Courier New", "Verdana"].includes(f));
    if (googleFonts.length === 0) return;
    const query = googleFonts.map(f => `family=${f.replace(/\s+/g, "+")}:ital,wght@0,400;0,700;1,400;1,700`).join("&");
    const fontUrl = `https://fonts.googleapis.com/css2?${query}&display=swap`;
    let link = document.getElementById("dynamic-google-fonts") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.id = "dynamic-google-fonts";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = fontUrl;
  }, [template]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<any[]>(`/events/${eventId}/print-templates`);
      setTemplatesList(res || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch templates");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const fetchFormFields = useCallback(async () => {
    try {
      const res = await apiGet<any>(`/events/${eventId}/registration/form-config?t=${Date.now()}`);
      if (res && res.fields) {
        const customFields = res.fields
          .filter((f: any) => !f.is_default && f.is_active)
          .map((f: any) => f.label || f.name);
        const combined = Array.from(new Set([...DEFAULT_VARIABLES, ...customFields]));
        setAvailableVariables(combined);
      }
    } catch (err) {
      console.error("Failed to load registration fields:", err);
    }
  }, [eventId]);

  useEffect(() => {
    if (eventId) {
      fetchTemplates();
      fetchFormFields();
    }
  }, [eventId, fetchTemplates, fetchFormFields]);

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Undo / Redo — allowed even in inputs for safety
      if (ctrl && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (ctrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }

      // Zoom controls
      if (ctrl && (e.key === "=" || e.key === "+")) { e.preventDefault(); setCanvasZoom(z => Math.min(3.0, parseFloat((z + 0.1).toFixed(1)))); return; }
      if (ctrl && e.key === "-") { e.preventDefault(); setCanvasZoom(z => Math.max(0.25, parseFloat((z - 0.1).toFixed(1)))); return; }
      if (ctrl && e.key === "0") { e.preventDefault(); setCanvasZoom(1.0); setPanOffset({ x: 0, y: 0 }); return; }

      if (isTyping()) return;

      // Dismiss context menu on Escape
      if (e.key === "Escape") {
        setContextMenu(null);
        setMeta({ selectedFieldId: null });
        return;
      }

      // Field operations — skip if field is locked
      const selectedField = activePage?.fields.find((f: any) => f.id === selectedFieldId);
      const isLocked = selectedField?.locked === true;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedFieldId) {
        if (isLocked) { toast.warning("Unlock the element before deleting."); return; }
        e.preventDefault();
        dispatch({ type: "DELETE_FIELD", payload: { fieldId: selectedFieldId } });
        return;
      }
      if (ctrl && e.key === "c" && selectedFieldId) {
        e.preventDefault();
        if (selectedField) setClipboard(JSON.parse(JSON.stringify(selectedField)));
        toast.success("Copied");
        return;
      }
      if (ctrl && e.key === "x" && selectedFieldId) {
        if (isLocked) { toast.warning("Unlock the element before cutting."); return; }
        e.preventDefault();
        if (selectedField) {
          setClipboard(JSON.parse(JSON.stringify(selectedField)));
          dispatch({ type: "DELETE_FIELD", payload: { fieldId: selectedFieldId } });
          toast.success("Cut");
        }
        return;
      }
      if (ctrl && e.key === "v" && clipboard) {
        e.preventDefault();
        let x_mm = clipboard.x_mm + 5;
        let y_mm = clipboard.y_mm + 5;
        if (activePage) {
          const clamped = clampPositionToMargins(x_mm, y_mm, clipboard.width_mm, clipboard.height_mm, clipboard.rotation || 0, activePage, template);
          x_mm = clamped.x;
          y_mm = clamped.y;
        }
        const pasted = { ...JSON.parse(JSON.stringify(clipboard)), id: uuidv4(), x_mm, y_mm, locked: false };
        dispatch({ type: "ADD_FIELD", payload: { field: pasted } });
        toast.success("Pasted");
        return;
      }
      if (ctrl && e.key === "d" && selectedFieldId) {
        e.preventDefault();
        if (selectedField) {
          let x_mm = selectedField.x_mm + 5;
          let y_mm = selectedField.y_mm + 5;
          if (activePage) {
            const clamped = clampPositionToMargins(x_mm, y_mm, selectedField.width_mm, selectedField.height_mm, selectedField.rotation || 0, activePage, template);
            x_mm = clamped.x;
            y_mm = clamped.y;
          }
          const duped = { ...JSON.parse(JSON.stringify(selectedField)), id: uuidv4(), x_mm, y_mm, locked: false };
          dispatch({ type: "ADD_FIELD", payload: { field: duped } });
          toast.success("Duplicated");
        }
        return;
      }

      // Arrow key nudge — blocked if locked
      if (selectedFieldId && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        if (isLocked) return;
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 1;
        if (!selectedField) return;
        let { x_mm, y_mm } = selectedField;
        if (e.key === "ArrowUp") y_mm -= delta;
        if (e.key === "ArrowDown") y_mm += delta;
        if (e.key === "ArrowLeft") x_mm -= delta;
        if (e.key === "ArrowRight") x_mm += delta;
        if (activePage) {
          const clamped = clampPositionToMargins(x_mm, y_mm, selectedField.width_mm, selectedField.height_mm, selectedField.rotation || 0, activePage, template);
          x_mm = clamped.x;
          y_mm = clamped.y;
        }
        dispatch({ type: "SET_FIELD_PROPERTY", payload: { fieldId: selectedFieldId, prop: "x_mm", value: x_mm } });
        dispatch({ type: "SET_FIELD_PROPERTY", payload: { fieldId: selectedFieldId, prop: "y_mm", value: y_mm } });
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFieldId, clipboard, activePage, undo, redo, dispatch]);

  // ── Canvas Zoom via Ctrl+Wheel ──
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setCanvasZoom(z => Math.min(3.0, Math.max(0.25, parseFloat((z + delta).toFixed(2)))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Space + Drag Panning ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.code === "Space" && !(document.activeElement instanceof HTMLInputElement) && !(document.activeElement instanceof HTMLTextAreaElement)) { e.preventDefault(); setIsPanning(true); } };
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === "Space") { setIsPanning(false); panDragRef.current = null; } };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (isPanning && e.button === 0) {
      panDragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panOffset.x, startPanY: panOffset.y };
      e.preventDefault();
    }
  };
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (panDragRef.current) {
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      setPanOffset({ x: panDragRef.current.startPanX + dx, y: panDragRef.current.startPanY + dy });
    }
  };
  const handleCanvasMouseUp = () => {
    panDragRef.current = null;
    resizeDragRef.current = null;
  };

  const startResize = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selectedField || !activePage) return;

    const rotationDeg = selectedField.rotation || 0;
    const rotationRad = (rotationDeg * Math.PI) / 180;
    const cosVal = Math.cos(rotationRad);
    const sinVal = Math.sin(rotationRad);

    const w = selectedField.width_mm;
    const h = selectedField.height_mm;
    const xc = selectedField.x_mm + w / 2;
    const yc = selectedField.y_mm + h / 2;

    let anchorLocalX = 0;
    let anchorLocalY = 0;
    if (handle.includes("r")) anchorLocalX = -w / 2;
    else if (handle.includes("l")) anchorLocalX = w / 2;

    if (handle.includes("b")) anchorLocalY = -h / 2;
    else if (handle.includes("t")) anchorLocalY = h / 2;

    if (handle === "r" || handle === "l") anchorLocalY = 0;
    if (handle === "t" || handle === "b") anchorLocalX = 0;

    const anchorX = xc + (anchorLocalX * cosVal - anchorLocalY * sinVal);
    const anchorY = yc + (anchorLocalX * sinVal + anchorLocalY * cosVal);

    resizeDragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startW: w,
      startH: h,
      startFieldX: selectedField.x_mm,
      startFieldY: selectedField.y_mm,
      anchorX,
      anchorY,
      rotationDeg,
      rotationRad,
      cosVal,
      sinVal,
      aspectRatio: w / h,
      shiftLock: e.shiftKey,
      zoomScale: zoom * canvasZoom,
      marginL: activePage.margin_left_mm || 0,
      marginR: activePage.margin_right_mm || 0,
      marginT: activePage.margin_top_mm || 0,
      marginB: activePage.margin_bottom_mm || 0,
      pageW: template.width_mm,
      pageH: template.height_mm,
    };
    window.addEventListener("mousemove", stableResizeMove);
    window.addEventListener("mouseup", stableResizeUp);
  };

  const globalResizeMove = (e: MouseEvent) => {
    if (!resizeDragRef.current || !selectedFieldId) return;
    const rd = resizeDragRef.current;

    const mmPerPx = 25.4 / (96 * rd.zoomScale);
    const rawDx = (e.clientX - rd.startX) * mmPerPx;
    const rawDy = (e.clientY - rd.startY) * mmPerPx;

    const localDx = rawDx * rd.cosVal + rawDy * rd.sinVal;
    const localDy = -rawDx * rd.sinVal + rawDy * rd.cosVal;

    const h = rd.handle;
    let newW = rd.startW;
    let newH = rd.startH;

    if (h.includes("r")) newW = rd.startW + localDx;
    else if (h.includes("l")) newW = rd.startW - localDx;

    if (h.includes("b")) newH = rd.startH + localDy;
    else if (h.includes("t")) newH = rd.startH - localDy;

    newW = Math.max(5, newW);
    newH = Math.max(3, newH);

    if ((rd.shiftLock || e.shiftKey) && (h === "br" || h === "tr" || h === "bl" || h === "tl")) {
      const sx = newW / rd.startW;
      const sy = newH / rd.startH;
      const s = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
      newW = Math.max(5, rd.startW * s);
      newH = newW / rd.aspectRatio;
    }

    if (newW < 5) {
      newW = 5;
      newH = newW / rd.aspectRatio;
    }
    if (newH < 3) {
      newH = 3;
      newW = newH * rd.aspectRatio;
    }

    let finalX = rd.startFieldX;
    let finalY = rd.startFieldY;

    const minX = Math.max(0, rd.marginL);
    const maxX = Math.max(minX, rd.pageW - Math.max(0, rd.marginR));
    const minY = Math.max(0, rd.marginT);
    const maxY = Math.max(minY, rd.pageH - Math.max(0, rd.marginB));

    const startCX = rd.startFieldX + rd.startW / 2;
    const startCY = rd.startFieldY + rd.startH / 2;

    const startValid = isSizeAndCenterValid(
      rd.startW, rd.startH, startCX, startCY,
      rd.rotationDeg, rd.marginL, rd.marginR, rd.marginT, rd.marginB, rd.pageW, rd.pageH
    );

    if (startValid) {
      let low = 0;
      let high = 1;
      let bestW = rd.startW;
      let bestH = rd.startH;
      let bestCX = startCX;
      let bestCY = startCY;

      for (let i = 0; i < 12; i++) {
        const mid = (low + high) / 2;
        const w_t = rd.startW + mid * (newW - rd.startW);
        const h_t = rd.startH + mid * (newH - rd.startH);

        let anchorLocalX = 0;
        let anchorLocalY = 0;
        if (h.includes("r")) anchorLocalX = -w_t / 2;
        else if (h.includes("l")) anchorLocalX = w_t / 2;

        if (h.includes("b")) anchorLocalY = -h_t / 2;
        else if (h.includes("t")) anchorLocalY = h_t / 2;

        if (h === "r" || h === "l") anchorLocalY = 0;
        if (h === "t" || h === "b") anchorLocalX = 0;

        const cx_t = rd.anchorX - (anchorLocalX * rd.cosVal - anchorLocalY * rd.sinVal);
        const cy_t = rd.anchorY - (anchorLocalX * rd.sinVal + anchorLocalY * rd.cosVal);

        if (isSizeAndCenterValid(w_t, h_t, cx_t, cy_t, rd.rotationDeg, rd.marginL, rd.marginR, rd.marginT, rd.marginB, rd.pageW, rd.pageH)) {
          bestW = w_t;
          bestH = h_t;
          bestCX = cx_t;
          bestCY = cy_t;
          low = mid;
        } else {
          high = mid;
        }
      }
      newW = bestW;
      newH = bestH;
      finalX = bestCX - newW / 2;
      finalY = bestCY - newH / 2;
    } else {
      let anchorLocalX = 0;
      let anchorLocalY = 0;
      if (h.includes("r")) anchorLocalX = -newW / 2;
      else if (h.includes("l")) anchorLocalX = newW / 2;

      if (h.includes("b")) anchorLocalY = -newH / 2;
      else if (h.includes("t")) anchorLocalY = newH / 2;

      if (h === "r" || h === "l") anchorLocalY = 0;
      if (h === "t" || h === "b") anchorLocalX = 0;

      const proposedCX = rd.anchorX - (anchorLocalX * rd.cosVal - anchorLocalY * rd.sinVal);
      const proposedCY = rd.anchorY - (anchorLocalX * rd.sinVal + anchorLocalY * rd.cosVal);

      const cosAbs = Math.abs(rd.cosVal);
      const sinAbs = Math.abs(rd.sinVal);
      const rotW = newW * cosAbs + newH * sinAbs;
      const rotH = newW * sinAbs + newH * cosAbs;

      let minCenterLimitX = minX + rotW / 2;
      let maxCenterLimitX = maxX - rotW / 2;
      if (minCenterLimitX > maxCenterLimitX) {
        const mid = (minX + maxX) / 2;
        minCenterLimitX = mid;
        maxCenterLimitX = mid;
      }

      let minCenterLimitY = minY + rotH / 2;
      let maxCenterLimitY = maxY - rotH / 2;
      if (minCenterLimitY > maxCenterLimitY) {
        const mid = (minY + maxY) / 2;
        minCenterLimitY = mid;
        maxCenterLimitY = mid;
      }

      const clampedCenterX = clamp(proposedCX, minCenterLimitX, maxCenterLimitX);
      const clampedCenterY = clamp(proposedCY, minCenterLimitY, maxCenterLimitY);

      finalX = clampedCenterX - newW / 2;
      finalY = clampedCenterY - newH / 2;
    }

    dispatch({ type: "SET_FIELD_PROPERTY", payload: { fieldId: selectedFieldId, prop: "width_mm", value: parseFloat(newW.toFixed(2)) }, skipHistory: true });
    dispatch({ type: "SET_FIELD_PROPERTY", payload: { fieldId: selectedFieldId, prop: "height_mm", value: parseFloat(newH.toFixed(2)) }, skipHistory: true });
    dispatch({ type: "SET_FIELD_PROPERTY", payload: { fieldId: selectedFieldId, prop: "x_mm", value: parseFloat(finalX.toFixed(2)) }, skipHistory: true });
    dispatch({ type: "SET_FIELD_PROPERTY", payload: { fieldId: selectedFieldId, prop: "y_mm", value: parseFloat(finalY.toFixed(2)) }, skipHistory: true });
  };

  const globalResizeUp = () => {
    if (resizeDragRef.current && selectedFieldId && activePage) {
      const field = activePage.fields.find((f: any) => f.id === selectedFieldId);
      if (field) {
        // Dispatch width_mm without skipHistory to commit the final resized state to history
        dispatch({ type: "SET_FIELD_PROPERTY", payload: { fieldId: selectedFieldId, prop: "width_mm", value: field.width_mm } });
      }
    }
    resizeDragRef.current = null;
    window.removeEventListener("mousemove", stableResizeMove);
    window.removeEventListener("mouseup", stableResizeUp);
  };

  const startRotate = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const field = activePage?.fields.find((f: any) => f.id === fieldId);
    if (!field) return;

    const el = document.getElementById(`field-rotated-wrapper-${fieldId}`);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const initialMouseAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const startRotation = field.rotation || 0;

    rotateDragRef.current = {
      fieldId,
      centerX,
      centerY,
      initialAngle: initialMouseAngle - startRotation,
      shiftLock: e.shiftKey,
      fieldW: field.width_mm,
      fieldH: field.height_mm,
      startX: field.x_mm,
      startY: field.y_mm,
      marginL: activePage.margin_left_mm || 0,
      marginR: activePage.margin_right_mm || 0,
      marginT: activePage.margin_top_mm || 0,
      marginB: activePage.margin_bottom_mm || 0,
      pageW: template.width_mm,
      pageH: template.height_mm,
    };

    window.addEventListener("mousemove", stableRotateMove);
    window.addEventListener("mouseup", stableRotateUp);
  };

  const globalRotateMove = (e: MouseEvent) => {
    if (!rotateDragRef.current) return;
    const rd = rotateDragRef.current;
    const fid = rd.fieldId; // Use stored fieldId — avoids stale closure on selectedFieldId
    if (!fid) return;
    const dx = e.clientX - rd.centerX;
    const dy = e.clientY - rd.centerY;
    const currentMouseAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

    // Do NOT snap to 45° unless Shift is held. Free continuous rotation at any angle.
    let newRotation = currentMouseAngle - rd.initialAngle;
    // Normalise to [0, 360)
    newRotation = ((newRotation % 360) + 360) % 360;

    // Snap to nearest 15° increments only when Shift held
    if (rd.shiftLock || e.shiftKey) {
      newRotation = Math.round(newRotation / 15) * 15;
    }
    // Store with 1-decimal precision (not integer) for smooth feel
    const finalRotation = Math.round(newRotation * 10) / 10;

    // Keep the center fixed. Clamp within margin boundaries.
    const rotationRad = (newRotation * Math.PI) / 180;
    const cosAbs = Math.abs(Math.cos(rotationRad));
    const sinAbs = Math.abs(Math.sin(rotationRad));
    const rotW = rd.fieldW * cosAbs + rd.fieldH * sinAbs;
    const rotH = rd.fieldW * sinAbs + rd.fieldH * cosAbs;

    const minCX = rd.marginL + rotW / 2;
    const maxCX = rd.pageW - rd.marginR - rotW / 2;
    const minCY = rd.marginT + rotH / 2;
    const maxCY = rd.pageH - rd.marginB - rotH / 2;

    const currentCenterX = rd.startX + rd.fieldW / 2;
    const currentCenterY = rd.startY + rd.fieldH / 2;

    const clampedCenterX = clamp(currentCenterX, Math.min(minCX, maxCX), Math.max(minCX, maxCX));
    const clampedCenterY = clamp(currentCenterY, Math.min(minCY, maxCY), Math.max(minCY, maxCY));

    const newX = clampedCenterX - rd.fieldW / 2;
    const newY = clampedCenterY - rd.fieldH / 2;

    // Track for commit on mouseup
    rd.currentRotation = finalRotation;
    rd.currentX = parseFloat(newX.toFixed(2));
    rd.currentY = parseFloat(newY.toFixed(2));

    setFieldProperty(fid, "rotation", finalRotation, true);
    setFieldProperty(fid, "x_mm", parseFloat(newX.toFixed(2)), true);
    setFieldProperty(fid, "y_mm", parseFloat(newY.toFixed(2)), true);
  };

  const globalRotateUp = () => {
    const rd = rotateDragRef.current;
    if (rd?.fieldId) {
      // Commit final rotation to history (skipHistory=false)
      if (rd.currentRotation !== undefined) {
        setFieldProperty(rd.fieldId, "rotation", rd.currentRotation);
        setFieldProperty(rd.fieldId, "x_mm", rd.currentX ?? rd.startX);
        setFieldProperty(rd.fieldId, "y_mm", rd.currentY ?? rd.startY);
      }
    }
    rotateDragRef.current = null;
    window.removeEventListener("mousemove", stableRotateMove);
    window.removeEventListener("mouseup", stableRotateUp);
  };

  // Assign handlers to refs on every render to ensure they always use the latest state values
  resizeMoveRef.current = globalResizeMove;
  resizeUpRef.current = globalResizeUp;
  rotateMoveRef.current = globalRotateMove;
  rotateUpRef.current = globalRotateUp;


  const setMeta = (payload: any) => dispatch({ type: "SET_META", payload });
  const setTemplateProperty = (prop: string, value: any) => dispatch({ type: "SET_PROPERTY", payload: { prop, value } });
  const setPageProperty = (prop: string, value: any, pageIdx = activePageIndex) => dispatch({ type: "SET_PAGE_PROPERTY", payload: { pageIndex: pageIdx, prop, value } });

  const setFieldProperty = (fieldId: string, prop: string, value: any, skipHistory = false) => {
    const numeric = ["fontSize", "x_mm", "y_mm", "width_mm", "height_mm", "rotation"];
    const finalValue = numeric.includes(prop) ? (parseFloat(value) || 0) : value;
    dispatch({ type: "SET_FIELD_PROPERTY", payload: { fieldId, prop, value: finalValue }, skipHistory });
  };

  const handleElementDrag = (field: any, d: any, isStop = false) => {
    if (field.locked) return;

    const scale = zoom * canvasZoom;
    const snapThreshold = 5 / scale; // 5 screen pixels in canvas space
    const w = mmToPx(field.width_mm);
    const h = mmToPx(field.height_mm);

    // 1. Gather all alignment targets in unscaled pixels
    const verticalTargets = [
      0,
      mmToPx(template.width_mm) / 2,
      mmToPx(template.width_mm),
      mmToPx(activePage.margin_left_mm ?? 0),
      mmToPx(template.width_mm - (activePage.margin_right_mm ?? 0))
    ];

    const horizontalTargets = [
      0,
      mmToPx(template.height_mm) / 2,
      mmToPx(template.height_mm),
      mmToPx(activePage.margin_top_mm ?? 0),
      mmToPx(template.height_mm - (activePage.margin_bottom_mm ?? 0))
    ];

    // Add other fields' edges and centers
    activePage.fields.forEach((f: any) => {
      if (f.id !== field.id && f.enabled !== false) {
        const fx = mmToPx(f.x_mm);
        const fw = mmToPx(f.width_mm);
        const fy = mmToPx(f.y_mm);
        const fh = mmToPx(f.height_mm);

        verticalTargets.push(fx, fx + fw / 2, fx + fw);
        horizontalTargets.push(fy, fy + fh / 2, fy + fh);
      }
    });

    const uniqueVerticalTargets = Array.from(new Set(verticalTargets));
    const uniqueHorizontalTargets = Array.from(new Set(horizontalTargets));

    // 2. Perform snapping on X
    let snappedX = d.x;
    let xLines: number[] = [];
    let minDiffX = snapThreshold;
    let bestSnapX = d.x;

    for (const tx of uniqueVerticalTargets) {
      // Check Left edge
      const diffL = Math.abs(d.x - tx);
      if (diffL < minDiffX) {
        minDiffX = diffL;
        bestSnapX = tx;
      }
      // Check Center
      const diffC = Math.abs(d.x + w / 2 - tx);
      if (diffC < minDiffX) {
        minDiffX = diffC;
        bestSnapX = tx - w / 2;
      }
      // Check Right edge
      const diffR = Math.abs(d.x + w - tx);
      if (diffR < minDiffX) {
        minDiffX = diffR;
        bestSnapX = tx - w;
      }
    }

    if (minDiffX < snapThreshold) {
      snappedX = bestSnapX;
      for (const tx of uniqueVerticalTargets) {
        if (
          Math.abs(snappedX - tx) < 0.1 ||
          Math.abs(snappedX + w / 2 - tx) < 0.1 ||
          Math.abs(snappedX + w - tx) < 0.1
        ) {
          if (!xLines.includes(tx)) xLines.push(tx);
        }
      }
    }

    // 3. Perform snapping on Y
    let snappedY = d.y;
    let yLines: number[] = [];
    let minDiffY = snapThreshold;
    let bestSnapY = d.y;

    for (const ty of uniqueHorizontalTargets) {
      // Check Top edge
      const diffT = Math.abs(d.y - ty);
      if (diffT < minDiffY) {
        minDiffY = diffT;
        bestSnapY = ty;
      }
      // Check Center
      const diffC = Math.abs(d.y + h / 2 - ty);
      if (diffC < minDiffY) {
        minDiffY = diffC;
        bestSnapY = ty - h / 2;
      }
      // Check Bottom edge
      const diffB = Math.abs(d.y + h - ty);
      if (diffB < minDiffY) {
        minDiffY = diffB;
        bestSnapY = ty - h;
      }
    }

    if (minDiffY < snapThreshold) {
      snappedY = bestSnapY;
      for (const ty of uniqueHorizontalTargets) {
        if (
          Math.abs(snappedY - ty) < 0.1 ||
          Math.abs(snappedY + h / 2 - ty) < 0.1 ||
          Math.abs(snappedY + h - ty) < 0.1
        ) {
          if (!yLines.includes(ty)) yLines.push(ty);
        }
      }
    }

    // 4. Convert to mm and clamp position to margins
    const currentX_mm = pxToMm(snappedX);
    const currentY_mm = pxToMm(snappedY);
    const clamped = clampPositionToMargins(
      currentX_mm,
      currentY_mm,
      field.width_mm,
      field.height_mm,
      field.rotation || 0,
      activePage,
      template
    );

    // 5. Update state and guides
    if (isStop) {
      setActiveGuides({ xLines: [], yLines: [] });
      setFieldProperty(field.id, "x_mm", clamped.x);
      setFieldProperty(field.id, "y_mm", clamped.y);
    } else {
      setActiveGuides({ xLines, yLines });
      setFieldProperty(field.id, "x_mm", clamped.x, true);
      setFieldProperty(field.id, "y_mm", clamped.y, true);
    }
  };


  const getInitialCoords = () => {
    const startX = activePage ? activePage.margin_left_mm : 10;
    const startY = activePage ? activePage.margin_top_mm : 10;
    return { x_mm: startX, y_mm: startY };
  };

  const addField = (type: string) => {
    const coords = getInitialCoords();
    const common = { id: uuidv4(), enabled: true, x_mm: coords.x_mm, y_mm: coords.y_mm };
    let field: any;
    switch (type) {
      case "photo":
        field = { ...common, type: "photo", placeholder: "{{photo}}", width_mm: 25, height_mm: 25, frame: "square" }; break;
      case "contact_qr":
        field = { ...common, type: "contact_qr", placeholder: "vCard", width_mm: 20, height_mm: 20, bgColor: "#FFFFFF" }; break;
      case "qr":
        field = { ...common, type: "qr", placeholder: "{{regno}}", width_mm: 18, height_mm: 18, color: "#000000", bgColor: "#FFFFFF" }; break;
      case "custom_qr":
        field = { ...common, type: "qr", placeholder: "https://your-link.com", width_mm: 18, height_mm: 18, color: "#000000", bgColor: "#FFFFFF" }; break;
      case "date":
        field = { ...common, type: "text", placeholder: "{{date}}", width_mm: 40, height_mm: 10, fontFamily: "Roboto", fontSize: 10, color: "#000000", bold: false, italic: false, underline: false, align: "left", textCase: "none" }; break;
      case "name":
      case "role":
      case "regno":
      case "email":
      case "phone":
        field = { ...common, type: "text", placeholder: `{{${type}}}`, width_mm: 50, height_mm: 10, fontFamily: "Roboto", fontSize: 12, color: "#000000", bold: false, italic: false, underline: false, align: "left", textCase: "none" }; break;
      default:
        field = { ...common, type: "text", placeholder: `{{${type}}}`, width_mm: 40, height_mm: 10, fontFamily: "Roboto", fontSize: 10, color: "#000000", bold: false, italic: false, underline: false, align: "left", textCase: "none" };
    }
    if (activePage) {
      const clamped = clampPositionToMargins(field.x_mm, field.y_mm, field.width_mm, field.height_mm, 0, activePage, template);
      field.x_mm = clamped.x;
      field.y_mm = clamped.y;
    }
    dispatch({ type: "ADD_FIELD", payload: { field } });
  };

  const addTextPreset = (size: "heading" | "subheading" | "body") => {
    const coords = getInitialCoords();
    const common = { id: uuidv4(), enabled: true, x_mm: coords.x_mm, y_mm: coords.y_mm, bold: false, italic: false, underline: false, align: "left", textCase: "none" };
    let field;
    if (size === "heading") {
      field = { ...common, type: "text", placeholder: "Heading Text", width_mm: 60, height_mm: 12, fontFamily: "Poppins", fontSize: 24, bold: true, color: "#000000" };
    } else if (size === "subheading") {
      field = { ...common, type: "text", placeholder: "Subheading Text", width_mm: 50, height_mm: 9, fontFamily: "Poppins", fontSize: 16, bold: true, color: "#333333" };
    } else {
      field = { ...common, type: "text", placeholder: "Body Text content...", width_mm: 40, height_mm: 6, fontFamily: "Roboto", fontSize: 10, color: "#555555" };
    }
    if (activePage) {
      const clamped = clampPositionToMargins(field.x_mm, field.y_mm, field.width_mm, field.height_mm, 0, activePage, template);
      field.x_mm = clamped.x;
      field.y_mm = clamped.y;
    }
    dispatch({ type: "ADD_FIELD", payload: { field } });
  };

  const addVariableField = (varName: string) => {
    const coords = getInitialCoords();
    const common = { id: uuidv4(), enabled: true, x_mm: coords.x_mm, y_mm: coords.y_mm };
    const field = {
      ...common,
      type: "text",
      placeholder: `{{${varName}}}`,
      width_mm: 50,
      height_mm: 10,
      fontFamily: "Roboto",
      fontSize: 12,
      color: "#000000",
      bold: false,
      italic: false,
      underline: false,
      align: "left",
      textCase: "none"
    };
    if (activePage) {
      const clamped = clampPositionToMargins(field.x_mm, field.y_mm, field.width_mm, field.height_mm, 0, activePage, template);
      field.x_mm = clamped.x;
      field.y_mm = clamped.y;
    }
    dispatch({ type: "ADD_FIELD", payload: { field } });
    toast.success(`Added variable: {{${varName}}}`);
  };

  const addShapeField = (shapeType: string) => {
    const coords = getInitialCoords();
    const common = { id: uuidv4(), enabled: true, x_mm: coords.x_mm, y_mm: coords.y_mm };
    const field = {
      ...common,
      type: "shape",
      shapeType,
      width_mm: shapeType === "line" ? 40 : 30,
      height_mm: shapeType === "line" ? 2 : 20,
      color: "#6366F1"
    };
    if (activePage) {
      const clamped = clampPositionToMargins(field.x_mm, field.y_mm, field.width_mm, field.height_mm, 0, activePage, template);
      field.x_mm = clamped.x;
      field.y_mm = clamped.y;
    }
    dispatch({ type: "ADD_FIELD", payload: { field } });
  };

  const addIconField = (iconName: string) => {
    const coords = getInitialCoords();
    const common = { id: uuidv4(), enabled: true, x_mm: coords.x_mm, y_mm: coords.y_mm };
    const field = {
      ...common,
      type: "icon",
      iconName,
      width_mm: 15,
      height_mm: 15,
      color: "#6366F1"
    };
    if (activePage) {
      const clamped = clampPositionToMargins(field.x_mm, field.y_mm, field.width_mm, field.height_mm, 0, activePage, template);
      field.x_mm = clamped.x;
      field.y_mm = clamped.y;
    }
    dispatch({ type: "ADD_FIELD", payload: { field } });
  };

  const addImageField = (src: string) => {
    const coords = getInitialCoords();
    const common = { id: uuidv4(), enabled: true, x_mm: coords.x_mm, y_mm: coords.y_mm };
    const field = {
      ...common,
      type: "image",
      src: src,
      width_mm: 30,
      height_mm: 30,
    };
    if (activePage) {
      const clamped = clampPositionToMargins(field.x_mm, field.y_mm, field.width_mm, field.height_mm, 0, activePage, template);
      field.x_mm = clamped.x;
      field.y_mm = clamped.y;
    }
    dispatch({ type: "ADD_FIELD", payload: { field } });
  };

  const deleteField = () => {
    if (selectedFieldId) {
      dispatch({ type: "DELETE_FIELD", payload: { fieldId: selectedFieldId } });
    }
  };

  const loadTemplate = (tpl: any) => {
    const loaded = tpl.template_data || tpl.templateData || {};
    const patch = {
      ...DEFAULT_TEMPLATE,
      ...loaded,
      template_name: tpl.template_name || tpl.templateName || DEFAULT_TEMPLATE.template_name,
      template_type: tpl.template_type || tpl.templateType || loaded.template_type || DEFAULT_TEMPLATE.template_type
    };

    // Auto-migrate to page-relative absolute coordinates if not marked
    if (!patch.relative_to_page) {
      patch.pages = (patch.pages?.length)
        ? patch.pages.map((p: any) => {
          const marginL = parseFloat(p.margin_left_mm) || 0;
          const marginT = parseFloat(p.margin_top_mm) || 0;
          return {
            ...getDefaultPage(),
            ...p,
            fields: (p.fields || []).map((f: any) => ({
              ...f,
              x_mm: f.x_mm + marginL,
              y_mm: f.y_mm + marginT
            }))
          };
        })
        : [getDefaultPage()];
      patch.relative_to_page = true;
    } else {
      patch.pages = (patch.pages?.length)
        ? patch.pages.map((p: any) => ({ ...getDefaultPage(), ...p, fields: p.fields || [] }))
        : [getDefaultPage()];
    }

    loadState({
      template: patch,
      meta: { ...initialState.meta, currentTemplateId: tpl.id }
    });
  };

  const handleNewTemplate = () => {
    const freshTemplate = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
    freshTemplate.relative_to_page = true;
    loadState({
      template: freshTemplate,
      meta: { ...initialState.meta, currentTemplateId: "new" }
    });
  };

  const handleSaveTemplate = async () => {
    if (!template.template_name || template.template_name.trim() === "") {
      toast.error("Template Name is required.");
      return;
    }
    if (!template.pages[0] || template.pages[0].fields.length === 0) {
      toast.error("Template must have at least one field.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        template_name: template.template_name,
        template_type: template.template_type || "custom",
        template_data: template,
      };

      const isNew = currentTemplateId === "new";
      let res;
      if (isNew) {
        res = await apiPost<any>(`/events/${eventId}/print-templates`, payload);
      } else {
        res = await apiPatch<any>(`/events/${eventId}/print-templates/${currentTemplateId}`, payload);
      }
      toast.success("Template saved successfully!");
      await fetchTemplates();
      if (res && res.id) {
        setMeta({ currentTemplateId: res.id });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save template.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsNew = async () => {
    if (!template.template_name || template.template_name.trim() === "") {
      toast.error("Template Name is required.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        template_name: `${template.template_name} (Copy)`,
        template_type: template.template_type || "custom",
        template_data: { ...template, template_name: `${template.template_name} (Copy)`, relative_to_page: true },
      };
      const res = await apiPost<any>(`/events/${eventId}/print-templates`, payload);
      toast.success("Template saved as new copy!");
      await fetchTemplates();
      if (res && res.id) {
        loadTemplate(res);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save as new template.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async () => {
    setConfirmDeleteOpen(false);
    if (currentTemplateId === "new") return;
    setLoading(true);
    try {
      await apiDelete(`/events/${eventId}/print-templates/${currentTemplateId}`);
      toast.success("Template deleted successfully.");
      await fetchTemplates();
      handleNewTemplate();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete template.");
    } finally {
      setLoading(false);
    }
  };

  const handleDimensionChange = (prop: string, value: any) => {
    setTemplateProperty(prop, value);
    setTemplateProperty("page_size", "custom");
  };

  const applySizeFromKey = (sizeKey: string) => {
    const base = PAGE_SIZES[sizeKey];
    if (!base) return;
    const isLandscape = template.orientation === "landscape";
    dispatch({ type: "SET_PROPERTY", payload: { prop: "width_mm", value: isLandscape ? base.height_mm : base.width_mm } });
    dispatch({ type: "SET_PROPERTY", payload: { prop: "height_mm", value: isLandscape ? base.width_mm : base.height_mm } });
    dispatch({ type: "SET_PROPERTY", payload: { prop: "page_size", value: sizeKey } });
  };

  const handleOrientationChange = (newOrientation: string) => {
    if (newOrientation === template.orientation) return;
    const { width_mm, height_mm } = template;
    dispatch({ type: "SET_PROPERTY", payload: { prop: "width_mm", value: height_mm } });
    dispatch({ type: "SET_PROPERTY", payload: { prop: "height_mm", value: width_mm } });
    dispatch({ type: "SET_PROPERTY", payload: { prop: "orientation", value: newOrientation } });
  };

  const handleBackgroundUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPageProperty("backgroundImage", reader.result);
    reader.readAsDataURL(file);
  };

  const handleImageElementUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setImageToEdit(reader.result);
        setEditingFieldId(null);
        setImageEditorOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const getAspectNum = (ratio: "1:1" | "4:3" | "16:9" | "free") => {
    if (ratio === "1:1") return 1.0;
    if (ratio === "4:3") return 4 / 3;
    if (ratio === "16:9") return 16 / 9;
    return null;
  };

  const applyAspectToCrop = (ratioStr: "1:1" | "4:3" | "16:9" | "free", currentImgWidth = imgSize.width, currentImgHeight = imgSize.height) => {
    if (ratioStr === "free") {
      setCropPercent({ x: 0, y: 0, w: 1, h: 1 });
      return;
    }
    const R = ratioStr === "1:1" ? 1.0 : ratioStr === "4:3" ? 4 / 3 : 16 / 9;
    const imgWidth = currentImgWidth || 300;
    const imgHeight = currentImgHeight || 300;
    const imgRatio = imgWidth / imgHeight;

    let w = 1.0;
    let h = 1.0;

    if (imgRatio > R) {
      h = 1.0;
      w = R / imgRatio;
    } else {
      w = 1.0;
      h = imgRatio / R;
    }

    const x = (1.0 - w) / 2;
    const y = (1.0 - h) / 2;
    setCropPercent({ x, y, w, h });
  };

  const handleSelectAspect = (ratio: "1:1" | "4:3" | "16:9" | "free") => {
    setCropAspect(ratio);
    if (ratio !== "1:1") setCropShape("rect");
    applyAspectToCrop(ratio);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const measuredWidth = img.clientWidth;
    const measuredHeight = img.clientHeight;
    setImgSize({ width: measuredWidth, height: measuredHeight });
    applyAspectToCrop(cropAspect, measuredWidth, measuredHeight);
  };

  const handleMouseDownMove = (e: React.MouseEvent) => {
    e.stopPropagation();
    cropperDragRef.current = {
      type: "move",
      startX: e.clientX,
      startY: e.clientY,
      startCropX: cropPercent.x,
      startCropY: cropPercent.y,
      startCropW: cropPercent.w,
      startCropH: cropPercent.h
    };
  };

  const handleMouseDownResize = (e: React.MouseEvent, handle: "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r") => {
    e.stopPropagation();
    cropperDragRef.current = {
      type: "resize",
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCropX: cropPercent.x,
      startCropY: cropPercent.y,
      startCropW: cropPercent.w,
      startCropH: cropPercent.h
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cropperDragRef.current || imgSize.width === 0 || imgSize.height === 0) return;

    const drag = cropperDragRef.current;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const ndx = dx / imgSize.width;
    const ndy = dy / imgSize.height;

    if (drag.type === "move") {
      let newX = drag.startCropX + ndx;
      let newY = drag.startCropY + ndy;
      newX = Math.max(0, Math.min(1 - drag.startCropW, newX));
      newY = Math.max(0, Math.min(1 - drag.startCropH, newY));
      setCropPercent(prev => ({ ...prev, x: newX, y: newY }));
    } else if (drag.type === "resize") {
      const handle = drag.handle;
      const sX = drag.startCropX;
      const sY = drag.startCropY;
      const sW = drag.startCropW;
      const sH = drag.startCropH;

      const R = getAspectNum(cropAspect);

      if (R !== null) {
        // Locked Aspect Ratio corners
        if (handle === "br") {
          let newW = sW + ndx;
          newW = Math.min(1 - sX, Math.max(0.05, newW));
          let newH = (newW * imgSize.width) / (imgSize.height * R);
          if (sY + newH > 1.0) {
            newH = 1.0 - sY;
            newW = (newH * imgSize.height * R) / imgSize.width;
          }
          setCropPercent({ x: sX, y: sY, w: newW, h: newH });
        } else if (handle === "tr") {
          let newW = sW + ndx;
          newW = Math.min(1 - sX, Math.max(0.05, newW));
          let newH = (newW * imgSize.width) / (imgSize.height * R);
          if (sY + sH - newH < 0) {
            newH = sY + sH;
            newW = (newH * imgSize.height * R) / imgSize.width;
          }
          const newY = sY + sH - newH;
          setCropPercent({ x: sX, y: newY, w: newW, h: newH });
        } else if (handle === "bl") {
          let newW = sW - ndx;
          newW = Math.min(sX + sW, Math.max(0.05, newW));
          let newH = (newW * imgSize.width) / (imgSize.height * R);
          if (sY + newH > 1.0) {
            newH = 1.0 - sY;
            newW = (newH * imgSize.height * R) / imgSize.width;
          }
          const newX = sX + sW - newW;
          setCropPercent({ x: newX, y: sY, w: newW, h: newH });
        } else if (handle === "tl") {
          let newW = sW - ndx;
          newW = Math.min(sX + sW, Math.max(0.05, newW));
          let newH = (newW * imgSize.width) / (imgSize.height * R);
          if (sY + sH - newH < 0) {
            newH = sY + sH;
            newW = (newH * imgSize.height * R) / imgSize.width;
          }
          const newX = sX + sW - newW;
          const newY = sY + sH - newH;
          setCropPercent({ x: newX, y: newY, w: newW, h: newH });
        }
      } else {
        // Freeform resizing
        let newX = sX;
        let newY = sY;
        let newW = sW;
        let newH = sH;

        if (handle === "tl") {
          newX = Math.max(0, Math.min(sX + sW - 0.05, sX + ndx));
          newW = sX + sW - newX;
          newY = Math.max(0, Math.min(sY + sH - 0.05, sY + ndy));
          newH = sY + sH - newY;
        } else if (handle === "tr") {
          newW = Math.max(0.05, Math.min(1 - sX, sW + ndx));
          newY = Math.max(0, Math.min(sY + sH - 0.05, sY + ndy));
          newH = sY + sH - newY;
        } else if (handle === "bl") {
          newX = Math.max(0, Math.min(sX + sW - 0.05, sX + ndx));
          newW = sX + sW - newX;
          newH = Math.max(0.05, Math.min(1 - sY, sH + ndy));
        } else if (handle === "br") {
          newW = Math.max(0.05, Math.min(1 - sX, sW + ndx));
          newH = Math.max(0.05, Math.min(1 - sY, sH + ndy));
        } else if (handle === "t") {
          newY = Math.max(0, Math.min(sY + sH - 0.05, sY + ndy));
          newH = sY + sH - newY;
        } else if (handle === "b") {
          newH = Math.max(0.05, Math.min(1 - sY, sH + ndy));
        } else if (handle === "l") {
          newX = Math.max(0, Math.min(sX + sW - 0.05, sX + ndx));
          newW = sX + sW - newX;
        } else if (handle === "r") {
          newW = Math.max(0.05, Math.min(1 - sX, sW + ndx));
        }
        setCropPercent({ x: newX, y: newY, w: newW, h: newH });
      }
    }
  };

  const handleMouseUp = () => {
    cropperDragRef.current = null;
  };

  const handleCropSubmit = () => {
    if (!imageToEdit) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const sx = cropPercent.x * img.width;
      const sy = cropPercent.y * img.height;
      const sw = cropPercent.w * img.width;
      const sh = cropPercent.h * img.height;

      canvas.width = sw;
      canvas.height = sh;

      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillRect(0, 0, sw, sh);

      if (cropShape === "circle" && cropAspect === "1:1") {
        ctx.beginPath();
        ctx.arc(sw / 2, sh / 2, sw / 2, 0, Math.PI * 2);
        ctx.clip();
      }

      ctx.filter = `brightness(${filterBrightness}%) contrast(${filterContrast}%)`;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const croppedUrl = canvas.toDataURL("image/png");
      if (editingFieldId) {
        setFieldProperty(editingFieldId, "src", croppedUrl);
        toast.success("Image updated successfully!");
      } else {
        addImageField(croppedUrl);
        toast.success("Image edited and added successfully!");
      }
      setImageEditorOpen(false);
      setImageToEdit(null);
      setEditingFieldId(null);

      setCropPercent({ x: 0, y: 0, w: 1, h: 1 });
      setFilterBrightness(100);
      setFilterContrast(100);
    };
    img.src = imageToEdit;
  };

  const preloadPageAssets = async (page: any) => {
    const promises = [];
    
    // Extract unique font families in this page
    const fontFamilies = new Set<string>();
    page.fields?.forEach((f: any) => {
      if (f.enabled !== false && f.fontFamily) {
        fontFamilies.add(f.fontFamily);
      }
    });

    if (typeof window !== "undefined") {
      const googleFonts = Array.from(fontFamilies).filter(f => !["Arial", "Times New Roman", "Georgia", "Courier New", "Verdana"].includes(f));
      if (googleFonts.length > 0) {
        const linkId = "google-fonts-preload";
        let link = document.getElementById(linkId) as HTMLLinkElement;
        const query = googleFonts.map(f => `family=${f.replace(/\s+/g, "+")}:ital,wght@0,400;0,700;1,400;1,700`).join("&");
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

        // Force load all fonts and weights via CSS Font Loading API
        for (const family of googleFonts) {
          promises.push(document.fonts.load(`12px "${family}"`));
          promises.push(document.fonts.load(`bold 12px "${family}"`));
          promises.push(document.fonts.load(`italic 12px "${family}"`));
        }
      }
      promises.push(document.fonts.ready);
    }

    if (page.backgroundImage && page.print_backgroundImage) {
      const bgImagePromise = new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = resolve;
        img.onerror = reject;
        img.src = page.backgroundImage;
      });
      promises.push(bgImagePromise);
    }
    await Promise.all(promises);
    // Yield to make sure styles are processed
    await new Promise(r => setTimeout(r, 100));
  };

  const handlePrint = async () => {
    setLoading(true);
    toast.info("Generating PDF preview...");
    try {
      const { width_mm, height_mm } = template;
      const pdf = new jsPDF({
        orientation: width_mm > height_mm ? "landscape" : "portrait",
        unit: "mm",
        format: [width_mm, height_mm],
        compress: true
      });

      for (let i = 0; i < template.pages.length; i++) {
        const pageData = template.pages[i];
        if (i > 0) pdf.addPage([width_mm, height_mm], template.orientation);

        if (pageData.print_backgroundImage && pageData.backgroundImage) {
          const imageType = pageData.backgroundImage.startsWith("data:image/png") ? "PNG" : "JPEG";
          pdf.addImage(pageData.backgroundImage, imageType, 0, 0, width_mm, height_mm);
        } else if (pageData.print_backgroundColor) {
          pdf.setFillColor(pageData.backgroundColor);
          pdf.rect(0, 0, width_mm, height_mm, "F");
        }

        const printContainer = document.createElement("div");
        document.body.appendChild(printContainer);
        Object.assign(printContainer.style, {
          position: "fixed", top: "0", left: "0", opacity: "0", zIndex: "-1", pointerEvents: "none"
        });

        const pageElement = document.createElement("div");
        printContainer.innerHTML = "";
        printContainer.appendChild(pageElement);
        Object.assign(pageElement.style, {
          width: `${mmToPx(width_mm)}px`,
          height: `${mmToPx(height_mm)}px`,
          position: "relative",
          backgroundColor: "transparent",
        });

        // Helper: compute border CSS for a field
        const fieldBorderCss = (f: any) => {
          const bw = mmToPx(parseFloat(f.borderWidth_mm) || 0);
          const bs = f.borderStyle || "none";
          const bc = f.borderColor || "transparent";
          const br = mmToPx(parseFloat(f.cornerRadius_mm) || 0);
          return `border:${bw}px ${bs} ${bc}; border-radius:${br}px; box-sizing:border-box;`;
        };

        const fieldsHtml = pageData.fields
          .filter((f: any) => f.enabled !== false)
          .map((f: any) => {
            const px = mmToPx(f.x_mm);
            const py = mmToPx(f.y_mm);
            const pw = mmToPx(f.width_mm);
            const ph = mmToPx(f.height_mm);
            const borderCss = fieldBorderCss(f);
            const outerStyle = `position:absolute; left:${px}px; top:${py}px; width:${pw}px; height:${ph}px; transform:rotate(${f.rotation || 0}deg); transform-origin:center; overflow:visible;`;
            const innerStyle = `position:absolute; top:0; left:0; width:${pw}px; height:${ph}px; ${borderCss} overflow:hidden; display:flex; align-items:center; justify-content:center;`;

            if (f.type === "photo") {
              // Render transparent placeholder; image drawn directly to PDF below
              const borderRadius = f.frame === "circle" ? "50%" : `${mmToPx(parseFloat(f.cornerRadius_mm) || 0)}px`;
              return `<div style="${outerStyle}"><div style="${innerStyle} border-radius:${borderRadius}; background:transparent;" data-pdf-image-id="${f.id}"></div></div>`;
            }
            if (f.type === "image") {
              // Render transparent placeholder; image drawn directly to PDF below
              return `<div style="${outerStyle}"><div style="${innerStyle} background:transparent;" data-pdf-image-id="${f.id}"></div></div>`;
            }
            if (f.type === "icon") {
              const IconComp = (LucideIcons as any)[f.iconName || "Star"];
              const svgString = ReactDOMServer.renderToStaticMarkup(
                <IconComp size="100%" color={f.color || "#000000"} />
              );
              const justify = f.align === "left" ? "flex-start" : f.align === "right" ? "flex-end" : "center";
              return `<div style="${outerStyle}"><div style="${innerStyle} justify-content:${justify};"><div style="height:100%; aspect-ratio:1/1; display:flex; align-items:center; justify-content:center;">${svgString}</div></div></div>`;
            }
            if (f.type === "shape") {
              const strokeW = mmToPx(parseFloat(f.borderWidth_mm) || 0);
              const strokeColor = f.borderColor || "none";
              const strokeDash = f.borderStyle === "dashed" ? "8,4" : f.borderStyle === "dotted" ? "2,4" : "";
              const strokeAttr = strokeW > 0 ? `stroke="${strokeColor}" stroke-width="${strokeW}" ${strokeDash ? `stroke-dasharray="${strokeDash}"` : ""} vector-effect="non-scaling-stroke"` : "";
              if (f.shapeType === "circle") {
                return `<div style="${outerStyle}"><div style="${innerStyle} background-color:${f.color || "#6366F1"}; border-radius:50%; border:${strokeW}px ${f.borderStyle || "solid"} ${strokeColor};"></div></div>`;
              }
              if (f.shapeType === "triangle") {
                const svgString = `<svg viewBox="0 0 100 100" style="width:100%; height:100%;" preserveAspectRatio="none"><polygon points="50,0 0,100 100,100" fill="${f.color || "#6366F1"}" ${strokeAttr} /></svg>`;
                return `<div style="${outerStyle}"><div style="${innerStyle}">${svgString}</div></div>`;
              }
              if (f.shapeType === "star") {
                const svgString = `<svg viewBox="0 0 100 100" style="width:100%; height:100%;" preserveAspectRatio="none"><polygon points="50,0 63,38 100,38 70,62 82,100 50,75 18,100 30,62 0,38 37,38" fill="${f.color || "#6366F1"}" ${strokeAttr} /></svg>`;
                return `<div style="${outerStyle}"><div style="${innerStyle}">${svgString}</div></div>`;
              }
              if (f.shapeType === "hexagon") {
                const svgString = `<svg viewBox="0 0 100 100" style="width:100%; height:100%;" preserveAspectRatio="none"><polygon points="50,0 100,25 100,75 50,100 0,75 0,25" fill="${f.color || "#6366F1"}" ${strokeAttr} /></svg>`;
                return `<div style="${outerStyle}"><div style="${innerStyle}">${svgString}</div></div>`;
              }
              if (f.shapeType === "line") {
                return `<div style="${outerStyle}"><div style="${innerStyle} background-color:${f.color || "#6366F1"};"></div></div>`;
              }
              if (f.shapeType === "diamond") {
                const svgString = `<svg viewBox="0 0 100 100" style="width:100%; height:100%;" preserveAspectRatio="none"><polygon points="50,0 100,50 50,100 0,50" fill="${f.color || "#6366F1"}" ${strokeAttr} /></svg>`;
                return `<div style="${outerStyle}"><div style="${innerStyle}">${svgString}</div></div>`;
              }
              if (f.shapeType === "pentagon") {
                const svgString = `<svg viewBox="0 0 100 100" style="width:100%; height:100%;" preserveAspectRatio="none"><polygon points="50,0 100,38 81,100 19,100 0,38" fill="${f.color || "#6366F1"}" ${strokeAttr} /></svg>`;
                return `<div style="${outerStyle}"><div style="${innerStyle}">${svgString}</div></div>`;
              }
              if (f.shapeType === "octagon") {
                const svgString = `<svg viewBox="0 0 100 100" style="width:100%; height:100%;" preserveAspectRatio="none"><polygon points="30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30" fill="${f.color || "#6366F1"}" ${strokeAttr} /></svg>`;
                return `<div style="${outerStyle}"><div style="${innerStyle}">${svgString}</div></div>`;
              }
              // Default rectangle with corner radius
              return `<div style="${outerStyle}"><div style="${innerStyle} background-color:${f.color || "#6366F1"};"></div></div>`;
            }
            if (f.type === "contact_qr") {
              const qrVal = generateVCardString(previewData);
              const qrSVG = ReactDOMServer.renderToStaticMarkup(
                <QRCodeSVG value={qrVal} fgColor={f.color || "#000000"} bgColor={f.bgColor || "#FFFFFF"} level="M" width="100%" height="100%" />
              );
              const justify = f.align === "left" ? "flex-start" : f.align === "right" ? "flex-end" : "center";
              return `<div style="${outerStyle}"><div style="${innerStyle} justify-content:${justify};"><div style="height:100%; aspect-ratio:1/1;">${qrSVG}</div></div></div>`;
            }
            if (f.type === "qr") {
              const qrVal = tokenReplace(f.placeholder, previewData);
              const qrSVG = ReactDOMServer.renderToStaticMarkup(
                <QRCodeSVG value={qrVal} fgColor={f.color || "#000000"} bgColor={f.bgColor || "#FFFFFF"} level="M" width="100%" height="100%" />
              );
              const justify = f.align === "left" ? "flex-start" : f.align === "right" ? "flex-end" : "center";
              return `<div style="${outerStyle}"><div style="${innerStyle} justify-content:${justify};"><div style="height:100%; aspect-ratio:1/1;">${qrSVG}</div></div></div>`;
            }
            const justify = f.align === "center" ? "center" : f.align === "right" ? "flex-end" : "flex-start";
            const styles = `font-family:'${f.fontFamily}', sans-serif; font-size:${f.fontSize}pt; line-height:1.2; color:${f.color}; font-weight:${f.bold ? 700 : 400}; font-style:${f.italic ? "italic" : "normal"}; text-decoration:${f.underline ? "underline" : "none"}; white-space:nowrap; overflow:hidden; padding:0 4px; display:flex; align-items:center; justify-content:${justify}; word-break:keep-all; width:100%; height:100%; box-sizing:border-box;`;
            return `<div style="${outerStyle}"><div style="${innerStyle}"><div style="${styles}">${tokenReplace(f.placeholder, previewData, f.textCase)}</div></div></div>`;
          })
          .join("");

        pageElement.innerHTML = `<div style="position:absolute; top:0; left:0; right:0; bottom:0; width:100%; height:100%;">${fieldsHtml}</div>`;

        await new Promise(resolve => requestAnimationFrame(resolve));
        await preloadPageAssets(pageData);

        const canvas = await html2canvas(pageElement, {
          scale: 3,
          useCORS: true,
          backgroundColor: null
        });

        const imgData = canvas.toDataURL("image/png");
        pdf.addImage(imgData, "PNG", 0, 0, width_mm, height_mm);

        // ── Draw image & photo fields directly at native resolution ──
        const imageFields = pageData.fields.filter(
          (f: any) => f.enabled !== false && (f.type === "photo" || f.type === "image")
        );
        for (const f of imageFields) {
          const srcUrl = f.type === "photo" ? previewData.photo : f.src;
          if (!srcUrl) continue;
          try {
            // Load image to determine native dimensions
            const naturalSize = await new Promise<{ w: number; h: number }>((res, rej) => {
              const im = new Image();
              im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
              im.onerror = rej;
              im.src = srcUrl;
            });

            // Field bounding box in mm
            const fx = f.x_mm, fy = f.y_mm, fw = f.width_mm, fh = f.height_mm;
            const isCircle = f.type === "photo" && f.frame === "circle";

            // Calculate destination rect (contain for image, cover for photo)
            const isCover = f.type === "photo";
            const imgAr = naturalSize.w / naturalSize.h;
            const boxAr = fw / fh;
            let dw: number, dh: number, dx: number, dy: number;

            if (isCover) {
              // cover: fill box, crop overflow
              if (imgAr > boxAr) { dh = fh; dw = fh * imgAr; }
              else { dw = fw; dh = fw / imgAr; }
            } else {
              // contain: fit inside box, letterbox
              if (imgAr > boxAr) { dw = fw; dh = fw / imgAr; }
              else { dh = fh; dw = fh * imgAr; }
            }

            // Alignment offset
            const align = f.align || (isCover ? "center" : "center");
            if (align === "left") { dx = fx; }
            else if (align === "right") { dx = fx + fw - dw; }
            else { dx = fx + (fw - dw) / 2; }
            dy = fy + (fh - dh) / 2;

            // ── Composite image into an off-screen canvas at 300dpi ──
            // Canvas boundaries act as the clip — no jsPDF rect/border needed
            const PX_PER_MM = 11.811; // 300 dpi ≈ 11.811 px/mm
            const cw = Math.round(fw * PX_PER_MM);
            const ch = Math.round(fh * PX_PER_MM);
            const tmpCanvas = document.createElement("canvas");
            tmpCanvas.width = cw;
            tmpCanvas.height = ch;
            const ctx2 = tmpCanvas.getContext("2d")!;

            if (isCircle) {
              ctx2.beginPath();
              ctx2.arc(cw / 2, ch / 2, Math.min(cw, ch) / 2, 0, Math.PI * 2);
              ctx2.clip();
            }

            const rotation = f.rotation || 0;
            if (rotation !== 0) {
              ctx2.translate(cw / 2, ch / 2);
              ctx2.rotate((rotation * Math.PI) / 180);
              ctx2.translate(-cw / 2, -ch / 2);
            }

            const im = new Image();
            im.src = srcUrl;
            await new Promise(r => { im.onload = r; if (im.complete) r(null); });

            // Convert mm offsets into canvas pixels
            const sdx = Math.round((dx - fx) * PX_PER_MM);
            const sdy = Math.round((dy - fy) * PX_PER_MM);
            const sdw = Math.round(dw * PX_PER_MM);
            const sdh = Math.round(dh * PX_PER_MM);
            ctx2.drawImage(im, sdx, sdy, sdw, sdh);

            pdf.addImage(tmpCanvas.toDataURL("image/png"), "PNG", fx, fy, fw, fh);
          } catch (e) {
            console.warn("Could not draw image field directly:", f.id, e);
          }
        }

        document.body.removeChild(printContainer);
      }

      const blob = pdf.output("blob");
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      console.error("PDF Generation Error:", err);
      toast.error("Failed to generate PDF preview.");
    } finally {
      setLoading(false);
    }
  };

  const filteredVariables = availableVariables.filter(v =>
    v.toLowerCase().includes(variableSearch.toLowerCase())
  );

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full overflow-hidden bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-[14px] relative shadow-2xl">
      {/* Top Header Navigation */}
      <div className="flex-shrink-0 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between px-8 py-3 h-14 z-20">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-[var(--pri)] animate-pulse" />
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.25em] text-zinc-100">Print Studio</h1>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Canvas visual layout editor</p>
          </div>
        </div>

        <div className="flex items-center gap-4">

          {/* Undo/Redo */}
          <div className="flex gap-1.5">
            <Button onClick={undo} disabled={!canUndo} className="h-7 w-7 p-0 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800 rounded-lg">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button onClick={redo} disabled={!canRedo} className="h-7 w-7 p-0 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800 rounded-lg">
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="h-5 w-px bg-zinc-800" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden shrink-0">
            <button
              onClick={() => setCanvasZoom(z => Math.max(0.25, parseFloat((z - 0.1).toFixed(1))))}
              className="h-7 w-7 flex items-center justify-center hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border-r border-zinc-800"
              title="Zoom Out (Ctrl+-)"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setCanvasZoom(1.0); setPanOffset({ x: 0, y: 0 }); }}
              className="h-7 px-2 text-[10px] font-black text-zinc-300 hover:bg-zinc-800 border-r border-zinc-800 min-w-[46px] text-center"
              title="Reset Zoom (Ctrl+0)"
            >
              {Math.round(canvasZoom * 100)}%
            </button>
            <button
              onClick={() => setCanvasZoom(z => Math.min(3.0, parseFloat((z + 0.1).toFixed(1))))}
              className="h-7 w-7 flex items-center justify-center hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
              title="Zoom In (Ctrl++)"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="h-5 w-px bg-zinc-800" />

          <Button onClick={handlePrint} disabled={loading} className="h-8 px-4 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-white font-black uppercase tracking-widest text-[9px] rounded-full border-0 shadow-lg shadow-[var(--pri)]/20 hover-lift-3d transition-all">
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            {loading ? "Generating..." : "Print Preview"}
          </Button>
        </div>
      </div>

      {/* Main Studio Area */}
      <div className="flex-grow flex overflow-hidden min-h-0 relative">

        {/* 1. Canva Left Tab selectors */}
        <div className="w-[72px] bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-6 gap-6 flex-shrink-0 select-none">
          {[
            { id: "templates", label: "Templates", icon: LayoutGrid },
            { id: "text", label: "Text", icon: Type },
            { id: "elements", label: "Elements", icon: Shapes },
            { id: "uploads", label: "Background", icon: ImageIcon },
            { id: "variables", label: "Variables", icon: Database },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => toggleSidebarTab(tab.id)}
              className={`flex flex-col items-center gap-1.5 w-full py-1 text-[9px] font-black uppercase tracking-wider transition-colors ${activeSidebarTab === tab.id
                ? "text-[var(--pri)] border-l-2 border-[var(--pri)]"
                : "text-zinc-500 hover:text-zinc-200"
                }`}
            >
              <tab.icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* 2. Canva Left Flyout Panel */}
        {activeSidebarTab !== null && (
          <div className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col flex-shrink-0 h-full overflow-hidden z-10 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800 flex-shrink-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{activeSidebarTab} Options</span>
              <button
                onClick={() => setActiveSidebarTab(null)}
                className="h-6 w-6 rounded-full bg-zinc-850 hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">

              {/* Flyout: Templates */}
              {activeSidebarTab === "templates" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Design Template</label>
                    <select
                      value={currentTemplateId}
                      onChange={e => {
                        const selected = templatesList.find(t => t.id === e.target.value);
                        if (selected) loadTemplate(selected);
                        else if (e.target.value === "new") handleNewTemplate();
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-zinc-800 bg-zinc-950 text-xs font-bold text-zinc-200 focus:outline-none focus:border-[var(--pri)] cursor-pointer"
                    >
                      <option value="new">Create New Template</option>
                      {templatesList.map(t => (
                        <option key={t.id} value={t.id}>{t.template_name || t.templateName}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">File Operations</label>
                    <div className="grid grid-cols-1 gap-2">
                      <Input
                        type="text"
                        placeholder="Template Name"
                        value={template.template_name}
                        onChange={e => setTemplateProperty("template_name", e.target.value)}
                        className="h-9 bg-zinc-950 border-zinc-800 rounded-xl px-3 font-bold text-xs text-zinc-200 focus:border-[var(--pri)]"
                      />
                      <select
                        value={template.template_type || "custom"}
                        onChange={e => setTemplateProperty("template_type", e.target.value)}
                        className="w-full h-9 px-3 rounded-xl border border-zinc-800 bg-zinc-950 text-xs font-bold text-zinc-200 focus:outline-none focus:border-[var(--pri)] cursor-pointer"
                      >
                        <option value="badge">🎫 Badge</option>
                        <option value="card">💳 ID Card</option>
                        <option value="certificate">🏅 Certificate</option>
                        <option value="custom">⚙️ Custom</option>
                      </select>
                      <Button onClick={handleSaveTemplate} className="w-full h-9 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-white justify-start px-4 text-xs font-black uppercase tracking-wider rounded-xl shadow-lg border-0">
                        <Save className="h-3.5 w-3.5 mr-2" /> Save Design
                      </Button>
                      <Button onClick={handleSaveAsNew} disabled={currentTemplateId === "new"} className="w-full h-9 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 justify-start px-4 text-xs font-black uppercase tracking-wider rounded-xl disabled:opacity-40">
                        <Copy className="h-3.5 w-3.5 mr-2 text-zinc-500" /> Save As Copy
                      </Button>
                      <Button onClick={() => setConfirmDeleteOpen(true)} disabled={currentTemplateId === "new"} className="w-full h-9 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 justify-start px-4 text-xs font-black uppercase tracking-wider rounded-xl disabled:opacity-40">
                        <Trash2 className="h-3.5 w-3.5 mr-2 text-rose-500" /> Delete Template
                      </Button>
                      <Button onClick={handleNewTemplate} className="w-full h-9 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 justify-start px-4 text-xs font-black uppercase tracking-wider rounded-xl">
                        <FileText className="h-3.5 w-3.5 mr-2 text-zinc-400" /> New Empty File
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Flyout: Text */}
              {activeSidebarTab === "text" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Text Presets</label>
                    <div className="space-y-2.5">
                      <button
                        onClick={() => addTextPreset("heading")}
                        className="w-full py-4 px-5 bg-zinc-950 border border-zinc-800 hover:border-[var(--pri)]/50 hover:bg-zinc-900 rounded-2xl text-left block transition-all"
                      >
                        <span className="font-extrabold text-lg text-zinc-100 block tracking-tight">Add a Heading</span>
                        <span className="text-[8px] text-zinc-500 font-semibold uppercase">Poppins Bold, 24pt</span>
                      </button>

                      <button
                        onClick={() => addTextPreset("subheading")}
                        className="w-full py-3 px-5 bg-zinc-950 border border-zinc-800 hover:border-[var(--pri)]/50 hover:bg-zinc-900 rounded-2xl text-left block transition-all"
                      >
                        <span className="font-bold text-sm text-zinc-200 block">Add a Subheading</span>
                        <span className="text-[8px] text-zinc-500 font-semibold uppercase">Poppins Bold, 16pt</span>
                      </button>

                      <button
                        onClick={() => addTextPreset("body")}
                        className="w-full py-2.5 px-5 bg-zinc-950 border border-zinc-800 hover:border-[var(--pri)]/50 hover:bg-zinc-900 rounded-2xl text-left block transition-all"
                      >
                        <span className="font-normal text-xs text-zinc-400 block">Add body text...</span>
                        <span className="text-[8px] text-zinc-500 font-semibold uppercase">Roboto, 10pt</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Core Fields Quick Insert</label>
                    <div className="grid grid-cols-2 gap-2">
                      {["name", "role", "regno", "email", "phone", "date"].map(core => (
                        <button
                          key={core}
                          onClick={() => addField(core)}
                          className="h-9 px-3 bg-zinc-950 border border-zinc-850 hover:border-zinc-700 text-zinc-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                          {core}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Quick Date Fields</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => addField("TodayDate")}
                        className="h-9 px-2 bg-zinc-950 border border-zinc-850 hover:border-[var(--pri)]/50 text-zinc-300 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
                      >
                        Today's Date
                      </button>
                      <button
                        onClick={() => addField("EventStartDate")}
                        className="h-9 px-2 bg-zinc-950 border border-zinc-850 hover:border-[var(--pri)]/50 text-zinc-300 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
                      >
                        Event Start
                      </button>
                      <button
                        onClick={() => addField("EventEndDate")}
                        className="h-9 px-2 bg-zinc-950 border border-zinc-850 hover:border-[var(--pri)]/50 text-zinc-300 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
                      >
                        Event End
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Flyout: Elements */}
              {activeSidebarTab === "elements" && (
                <div className="space-y-5">

                  {/* Upload Logo */}
                  <div className="space-y-2.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Upload Image / Logo</label>
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 hover:border-[var(--pri)]/40 bg-zinc-950 hover:bg-zinc-950/60 rounded-2xl p-5 text-center cursor-pointer transition-all group">
                      <div className="h-10 w-10 bg-[var(--pri)]/10 group-hover:bg-[var(--pri)]/20 border border-[var(--pri)]/20 rounded-xl flex items-center justify-center mb-2">
                        <Upload className="h-5 w-5 text-[var(--pri)]" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Upload Image / Logo</span>
                      <span className="text-[8px] text-zinc-600 font-semibold mt-1">PNG, JPG, SVG — adds to canvas</span>
                      <input type="file" accept="image/*" hidden onChange={e => handleImageElementUpload(e.target.files?.[0] || null)} />
                    </label>
                  </div>

                  {/* Dynamic Badge Fields */}
                  <div className="space-y-2.5 pt-2 border-t border-zinc-800">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">QR Codes & Profile Photo</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => addField("photo")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <div className="h-10 w-10 bg-[var(--pri)]/10 group-hover:bg-[var(--pri)]/20 border border-[var(--pri)]/20 rounded-lg flex items-center justify-center">
                          <User className="h-5 w-5 text-[var(--pri)]" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Attendee Photo</span>
                      </button>

                      <button
                        onClick={() => addField("qr")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <div className="h-10 w-10 bg-[var(--pri)]/10 group-hover:bg-[var(--pri)]/20 border border-[var(--pri)]/20 rounded-lg flex items-center justify-center">
                          <QrCode className="h-5 w-5 text-[var(--pri)]" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">RegNo QR Code</span>
                      </button>

                      <button
                        onClick={() => addField("contact_qr")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <div className="h-10 w-10 bg-[var(--pri)]/10 group-hover:bg-[var(--pri)]/20 border border-[var(--pri)]/20 rounded-lg flex items-center justify-center">
                          <QrCode className="h-5 w-5 text-[var(--pri)] animate-pulse" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">vCard QR Code</span>
                      </button>

                      <button
                        onClick={() => addField("custom_qr")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <div className="h-10 w-10 bg-[var(--pri)]/10 group-hover:bg-[var(--pri)]/20 border border-[var(--pri)]/20 rounded-lg flex items-center justify-center">
                          <QrCode className="h-5 w-5 text-[var(--pri)]" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Custom Link QR</span>
                      </button>
                    </div>
                  </div>

                  {/* Shapes */}
                  <div className="space-y-2.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Shapes</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => addShapeField("rect")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <div className="h-10 w-14 bg-[var(--pri)]/20 group-hover:bg-[var(--pri)]/35 border border-[var(--pri)]/30 rounded" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Rectangle</span>
                      </button>

                      <button
                        onClick={() => addShapeField("circle")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <div className="h-10 w-10 bg-[var(--pri)]/20 group-hover:bg-[var(--pri)]/35 border border-[var(--pri)]/30 rounded-full animate-none" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Circle</span>
                      </button>

                      <button
                        onClick={() => addShapeField("triangle")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <svg viewBox="0 0 100 100" className="h-10 w-10 text-[var(--pri)]/30 group-hover:text-[var(--pri)]/50 fill-current stroke-[var(--pri)]/30 stroke-2">
                          <polygon points="50,15 90,85 10,85" />
                        </svg>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Triangle</span>
                      </button>

                      <button
                        onClick={() => addShapeField("star")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <svg viewBox="0 0 100 100" className="h-10 w-10 text-[var(--pri)]/30 group-hover:text-[var(--pri)]/50 fill-current stroke-[var(--pri)]/30 stroke-2">
                          <polygon points="50,10 63,38 95,38 70,58 80,90 50,70 20,90 30,58 5,38 37,38" />
                        </svg>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Star</span>
                      </button>

                      <button
                        onClick={() => addShapeField("hexagon")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <svg viewBox="0 0 100 100" className="h-10 w-10 text-[var(--pri)]/30 group-hover:text-[var(--pri)]/50 fill-current stroke-[var(--pri)]/30 stroke-2">
                          <polygon points="50,10 90,30 90,70 50,90 10,70 10,30" />
                        </svg>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Hexagon</span>
                      </button>

                      <button
                        onClick={() => addShapeField("line")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <svg viewBox="0 0 100 100" className="h-10 w-10 text-[var(--pri)]/30 group-hover:text-[var(--pri)]/50 stroke-current stroke-2">
                          <line x1="10" y1="50" x2="90" y2="50" strokeWidth="8" strokeLinecap="round" />
                        </svg>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Line</span>
                      </button>

                      <button
                        onClick={() => addShapeField("diamond")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <svg viewBox="0 0 100 100" className="h-10 w-10 text-[var(--pri)]/30 group-hover:text-[var(--pri)]/50 fill-current stroke-[var(--pri)]/30 stroke-2">
                          <polygon points="50,10 90,50 50,90 10,50" />
                        </svg>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Diamond</span>
                      </button>

                      <button
                        onClick={() => addShapeField("pentagon")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <svg viewBox="0 0 100 100" className="h-10 w-10 text-[var(--pri)]/30 group-hover:text-[var(--pri)]/50 fill-current stroke-[var(--pri)]/30 stroke-2">
                          <polygon points="50,10 90,40 75,85 25,85 10,40" />
                        </svg>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Pentagon</span>
                      </button>

                      <button
                        onClick={() => addShapeField("octagon")}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center gap-2 hover:border-[var(--pri)] transition-all group"
                      >
                        <svg viewBox="0 0 100 100" className="h-10 w-10 text-[var(--pri)]/30 group-hover:text-[var(--pri)]/50 fill-current stroke-[var(--pri)]/30 stroke-2">
                          <polygon points="30,10 70,10 90,30 90,70 70,90 30,90 10,70 10,30" />
                        </svg>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Octagon</span>
                      </button>
                    </div>
                  </div>

                  {/* Icons library */}
                  <div className="space-y-2.5 pt-2 border-t border-zinc-800">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Lucide Vector Icons</label>
                    <div className="grid grid-cols-4 gap-2.5">
                      {AVAILABLE_ICONS.map(name => {
                        const IconComp = (LucideIcons as any)[name];
                        return (
                          <button
                            key={name}
                            onClick={() => addIconField(name)}
                            title={name}
                            className="p-3 bg-zinc-950 border border-zinc-850 hover:border-[var(--pri)] text-zinc-400 hover:text-[var(--pri)] rounded-xl flex items-center justify-center transition-all"
                          >
                            <IconComp className="h-4.5 w-4.5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Flyout: Background & Custom Uploads */}
              {activeSidebarTab === "uploads" && (
                <div className="space-y-5">
                  <div className="space-y-2.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Page Background Color</label>
                    <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl">
                      <input
                        type="color"
                        value={activePage?.backgroundColor || "#FFFFFF"}
                        onChange={e => setPageProperty("backgroundColor", e.target.value)}
                        className="h-8 w-10 border border-zinc-700 rounded-lg p-0 bg-transparent cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-zinc-300 block">{activePage?.backgroundColor || "#FFFFFF"}</span>
                        <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">Background hex</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-2 mt-2">
                      {["#FFFFFF", "#F3F4F6", "#1F2937", "#0F172A", "#1E3A8A", "#4F46E5", "#0D9488", "#059669", "#DC2626", "#000000"].map(color => (
                        <button
                          key={color}
                          onClick={() => setPageProperty("backgroundColor", color)}
                          style={{ backgroundColor: color }}
                          className={`h-7 w-7 rounded-lg border border-zinc-700 ${color === activePage?.backgroundColor ? "ring-2 ring-[var(--pri)]" : ""}`}
                        />
                      ))}
                    </div>
                  </div>



                  <div className="space-y-2.5 pt-2 border-t border-zinc-800">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Background Image</label>
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 hover:border-[var(--pri)]/40 bg-zinc-950 hover:bg-zinc-950/60 rounded-2xl p-5 text-center cursor-pointer transition-all">
                      <ImageIcon className="h-6 w-6 text-zinc-500 mb-2" />
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Upload BG Image</span>
                      <input type="file" accept="image/*" hidden onChange={e => handleBackgroundUpload(e.target.files?.[0] || null)} />
                    </label>

                    {activePage?.backgroundImage && (
                      <div className="relative mt-2 border border-zinc-800 rounded-xl overflow-hidden group">
                        <img src={activePage.backgroundImage} className="w-full h-24 object-cover" alt="bg-thumbnail" />
                        <button
                          onClick={() => setPageProperty("backgroundImage", null)}
                          className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-full hover:bg-rose-600 text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 mt-3 bg-zinc-950/40 border border-zinc-850 p-3 rounded-2xl text-[11px] font-semibold text-zinc-400">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={activePage?.print_backgroundImage} onChange={e => setPageProperty("print_backgroundImage", e.target.checked)} />
                        Print Background Image
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={activePage?.print_backgroundColor} onChange={e => setPageProperty("print_backgroundColor", e.target.checked)} />
                        Print Background Color
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Flyout: Variables */}
              {activeSidebarTab === "variables" && (
                <div className="space-y-4">
                  <div className="relative bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                    <Input
                      type="text"
                      placeholder="Search campaign variables..."
                      value={variableSearch}
                      onChange={e => setVariableSearch(e.target.value)}
                      className="pl-9 bg-transparent border-0 h-9 font-bold text-xs focus:ring-0 text-zinc-200 placeholder:text-zinc-600"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Database Placeholders</label>
                    {filteredVariables.length === 0 ? (
                      <p className="text-[10px] text-zinc-500 italic mt-1.5">No matching variables found</p>
                    ) : (
                      <div className="flex flex-col gap-2 max-h-[450px] overflow-y-auto pr-1">
                        {filteredVariables.map(v => (
                          <button
                            key={v}
                            onClick={() => addVariableField(v)}
                            className="w-full py-2.5 px-4 bg-zinc-950 hover:bg-zinc-850 border border-zinc-850 hover:border-zinc-700 rounded-xl text-left transition-colors flex items-center justify-between"
                          >
                            <span className="font-mono text-[11px] font-bold text-zinc-200 tracking-tight">{`{{${v}}}`}</span>
                            <Plus className="h-3.5 w-3.5 text-zinc-500" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* 3. Main Workspace Area */}
        <div className="flex-grow flex flex-col overflow-hidden bg-zinc-950 relative min-h-0">

          {/* Top Contextual Properties Toolbar */}
          <div className="flex-shrink-0 min-h-12 h-auto py-2 border-b border-zinc-850 bg-zinc-900/60 flex items-center px-6 gap-3 select-none">
            {selectedField ? (
              <div className="flex items-center gap-3 w-full flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-950 border border-zinc-800 px-2.5 py-1 rounded-md shrink-0">
                  {selectedField.type}
                </span>

                {/* Lock indicator */}
                {selectedField.locked && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/25 px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                    🔒 Locked
                  </span>
                )}

                <div className="h-4 w-px bg-zinc-800 shrink-0" />

                {/* Layer Control */}
                <div className="flex border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950 shrink-0">
                  <button
                    onClick={() => dispatch({ type: "BRING_FIELD_TO_FRONT", payload: { fieldId: selectedField.id } })}
                    title="Bring to Front"
                    className="h-7 w-7 flex items-center justify-center hover:bg-zinc-800 border-r border-zinc-850 text-[9px] font-black text-zinc-400"
                  >
                    ⬆⬆
                  </button>
                  <button
                    onClick={() => dispatch({ type: "MOVE_FIELD_FORWARD", payload: { fieldId: selectedField.id } })}
                    title="Bring Forward"
                    className="h-7 w-7 flex items-center justify-center hover:bg-zinc-800 border-r border-zinc-850"
                  >
                    <ArrowUp className="h-3.5 w-3.5 text-zinc-400" />
                  </button>
                  <button
                    onClick={() => dispatch({ type: "MOVE_FIELD_BACKWARD", payload: { fieldId: selectedField.id } })}
                    title="Send Backward"
                    className="h-7 w-7 flex items-center justify-center hover:bg-zinc-800 border-r border-zinc-850"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-zinc-400" />
                  </button>
                  <button
                    onClick={() => dispatch({ type: "SEND_FIELD_TO_BACK", payload: { fieldId: selectedField.id } })}
                    title="Send to Back"
                    className="h-7 w-7 flex items-center justify-center hover:bg-zinc-800 text-[9px] font-black text-zinc-400"
                  >
                    ⬇⬇
                  </button>
                </div>

                <div className="h-4 w-px bg-zinc-800 shrink-0" />

                {/* Alignment Control (For all fields) */}
                <div className="flex border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950 shrink-0">
                  {(["left", "center", "right"] as const).map(align => {
                    const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
                    return (
                      <button
                        key={align}
                        onClick={() => setFieldProperty(selectedField.id, "align", align)}
                        title={`${align.charAt(0).toUpperCase() + align.slice(1)} Align`}
                        className={`h-7 w-7 flex items-center justify-center border-r border-zinc-850 last:border-0 ${(selectedField.align || (selectedField.type === "text" ? "left" : "center")) === align ? "bg-[var(--pri)] text-white" : "text-zinc-400 hover:bg-zinc-800"
                          }`}
                      >
                        <Icon className="h-3 w-3" />
                      </button>
                    );
                  })}
                </div>

                <div className="h-4 w-px bg-zinc-800 shrink-0" />

                {/* Text Formatting Controls */}
                {selectedField.type === "text" && (
                  <>
                    <select
                      value={selectedField.fontFamily}
                      onChange={e => setFieldProperty(selectedField.id, "fontFamily", e.target.value)}
                      className="h-7 px-2 rounded-lg border border-zinc-800 bg-zinc-950 text-[10px] font-bold text-zinc-200 focus:outline-none cursor-pointer shrink-0"
                    >
                      {FONT_FAMILIES.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        onClick={() => setFieldProperty(selectedField.id, "fontSize", Math.max(1, selectedField.fontSize - 1))}
                        className="h-7 w-7 p-0 bg-zinc-950 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-[10px]"
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        value={selectedField.fontSize}
                        onChange={e => setFieldProperty(selectedField.id, "fontSize", e.target.value)}
                        className="h-7 w-20 px-1 py-0 text-center bg-zinc-950 border-zinc-800 rounded-lg font-bold text-xs text-zinc-200 font-mono"
                        min={1}
                      />
                      <Button
                        onClick={() => setFieldProperty(selectedField.id, "fontSize", selectedField.fontSize + 1)}
                        className="h-7 w-7 p-0 bg-zinc-950 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-[10px]"
                      >
                        +
                      </Button>
                    </div>

                    <input
                      type="color"
                      value={selectedField.color || "#000000"}
                      onChange={e => setFieldProperty(selectedField.id, "color", e.target.value)}
                      className="h-7 w-8 border border-zinc-800 rounded-lg p-0 bg-transparent cursor-pointer shrink-0"
                    />

                    <div className="flex border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950 shrink-0">
                      <button onClick={() => setFieldProperty(selectedField.id, "bold", !selectedField.bold)} className={`h-7 w-7 flex items-center justify-center border-r border-zinc-850 ${selectedField.bold ? "bg-[var(--pri)] text-white" : "text-zinc-400 hover:bg-zinc-800"}`}>
                        <Bold className="h-3 w-3" />
                      </button>
                      <button onClick={() => setFieldProperty(selectedField.id, "italic", !selectedField.italic)} className={`h-7 w-7 flex items-center justify-center border-r border-zinc-850 ${selectedField.italic ? "bg-[var(--pri)] text-white" : "text-zinc-400 hover:bg-zinc-800"}`}>
                        <Italic className="h-3 w-3" />
                      </button>
                      <button onClick={() => setFieldProperty(selectedField.id, "underline", !selectedField.underline)} className={`h-7 w-7 flex items-center justify-center ${selectedField.underline ? "bg-[var(--pri)] text-white" : "text-zinc-400 hover:bg-zinc-800"}`}>
                        <Underline className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Text Casing Selection (Canva style: uppercase, lowercase, sentence case, title case) */}
                    <select
                      value={selectedField.textCase || "none"}
                      onChange={e => setFieldProperty(selectedField.id, "textCase", e.target.value)}
                      className="h-7 px-2 rounded-lg border border-zinc-800 bg-zinc-950 text-[10px] font-bold text-zinc-200 focus:outline-none cursor-pointer shrink-0"
                    >
                      <option value="none">Normal Case</option>
                      <option value="uppercase">UPPERCASE</option>
                      <option value="lowercase">lowercase</option>
                      <option value="sentence">Sentence Case</option>
                      <option value="title">Title Case</option>
                    </select>

                    <Input
                      type="text"
                      value={selectedField.placeholder || ""}
                      onChange={e => setFieldProperty(selectedField.id, "placeholder", e.target.value)}
                      className="h-7 py-0 bg-zinc-950 border-zinc-800 rounded-lg px-2 text-xs text-zinc-200 flex-1 max-w-[200px]"
                      placeholder="Text content..."
                    />
                  </>
                )}

                {/* Shapes settings */}
                {selectedField.type === "shape" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Fill:</span>
                    <input
                      type="color"
                      value={selectedField.color || "#6366F1"}
                      onChange={e => setFieldProperty(selectedField.id, "color", e.target.value)}
                      className="h-7 w-8 border border-zinc-800 rounded-lg p-0 bg-transparent cursor-pointer"
                    />
                  </div>
                )}

                {/* Universal Border & Radius styling - shown for text, shape, image, photo, icon */}
                {["text", "shape", "image", "photo", "icon"].includes(selectedField.type) && (
                  <>
                    <div className="h-4 w-px bg-zinc-800 shrink-0" />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Border:</span>
                      <select
                        value={selectedField.borderStyle || "none"}
                        onChange={e => setFieldProperty(selectedField.id, "borderStyle", e.target.value)}
                        className="h-7 px-1 rounded-lg border border-zinc-800 bg-zinc-950 text-[10px] font-bold text-zinc-200 focus:outline-none cursor-pointer"
                      >
                        <option value="none">None</option>
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                      </select>
                      {(selectedField.borderStyle && selectedField.borderStyle !== "none") && (
                        <>
                          <input
                            type="color"
                            value={selectedField.borderColor || "#000000"}
                            onChange={e => setFieldProperty(selectedField.id, "borderColor", e.target.value)}
                            className="h-7 w-8 border border-zinc-800 rounded-lg p-0 bg-transparent cursor-pointer"
                            title="Border Color"
                          />
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="10"
                            value={selectedField.borderWidth_mm || 0.5}
                            onChange={e => setFieldProperty(selectedField.id, "borderWidth_mm", parseFloat(e.target.value) || 0)}
                            className="h-7 w-12 px-1 text-center bg-zinc-950 border border-zinc-800 rounded-lg text-[10px] font-bold text-zinc-200 focus:outline-none"
                            title="Border Width (mm)"
                          />
                          <span className="text-[9px] text-zinc-500 font-bold">mm</span>
                        </>
                      )}
                    </div>
                    {/* Corner Radius - applicable for non-SVG shapes, text, image, photo */}
                    {!(selectedField.type === "shape" && ["triangle", "star", "hexagon", "diamond", "pentagon", "octagon", "line"].includes(selectedField.shapeType)) && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Radius:</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={selectedField.cornerRadius_mm || 0}
                          onChange={e => setFieldProperty(selectedField.id, "cornerRadius_mm", parseFloat(e.target.value) || 0)}
                          className="h-7 w-12 px-1 text-center bg-zinc-950 border border-zinc-800 rounded-lg text-[10px] font-bold text-zinc-200 focus:outline-none"
                          title="Corner Radius (mm)"
                        />
                        <span className="text-[9px] text-zinc-500 font-bold">mm</span>
                      </div>
                    )}
                  </>
                )}

                {/* Icons settings */}
                {selectedField.type === "icon" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Color:</span>
                    <input
                      type="color"
                      value={selectedField.color || "#6366F1"}
                      onChange={e => setFieldProperty(selectedField.id, "color", e.target.value)}
                      className="h-7 w-8 border border-zinc-800 rounded-lg p-0 bg-transparent cursor-pointer"
                    />
                  </div>
                )}

                {/* Photo settings */}
                {selectedField.type === "photo" && (
                  <select
                    value={selectedField.frame}
                    onChange={e => setFieldProperty(selectedField.id, "frame", e.target.value)}
                    className="h-7 px-2 rounded-lg border border-zinc-800 bg-zinc-950 text-[10px] font-bold text-zinc-200 focus:outline-none cursor-pointer shrink-0"
                  >
                    <option value="square">Square Frame</option>
                    <option value="circle">Circle Frame</option>
                  </select>
                )}

                {/* Image settings */}
                {selectedField.type === "image" && (
                  <Button
                    onClick={() => {
                      setImageToEdit(selectedField.src);
                      setEditingFieldId(selectedField.id);
                      setImageEditorOpen(true);
                    }}
                    className="h-7 px-2.5 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <Crop className="h-3.5 w-3.5" /> Crop & Edit Image
                  </Button>
                )}

                {/* QR Code settings */}
                {(selectedField.type === "qr" || selectedField.type === "contact_qr") && (
                  <>
                    {selectedField.type === "qr" ? (
                      <div className="flex items-center gap-1.5 shrink-0 bg-zinc-950 px-2.5 py-1 border border-zinc-800 rounded-lg">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">QR Content:</span>
                        <Input
                          type="text"
                          value={selectedField.placeholder}
                          onChange={e => setFieldProperty(selectedField.id, "placeholder", e.target.value)}
                          className="h-7 py-0 w-64 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 text-xs text-zinc-200"
                          placeholder="Link or variable (e.g. https://... or {{regno}})"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0 bg-zinc-950 px-2.5 py-1 border border-zinc-800 rounded-lg text-zinc-400 text-[10px] font-bold">
                        <span>vCard QR (Auto-Generated)</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 shrink-0">
                      <span>QR Color:</span>
                      <input type="color" value={selectedField.color || "#000000"} onChange={e => setFieldProperty(selectedField.id, "color", e.target.value)} className="h-7 w-8 border border-zinc-800 rounded-lg p-0 bg-transparent cursor-pointer" />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 shrink-0">
                      <span>BG Color:</span>
                      <input type="color" value={selectedField.bgColor || "#FFFFFF"} onChange={e => setFieldProperty(selectedField.id, "bgColor", e.target.value)} className="h-7 w-8 border border-zinc-800 rounded-lg p-0 bg-transparent cursor-pointer" />
                    </div>
                  </>
                )}

                {/* Positional input fields */}
                <div className="flex items-center gap-1.5 shrink-0 bg-zinc-950 px-2 py-0.5 border border-zinc-850 rounded-lg">
                  <span className="text-[9px] font-bold text-zinc-500">X:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={Math.round(selectedField.x_mm * 10) / 10}
                    onChange={e => setFieldProperty(selectedField.id, "x_mm", e.target.value)}
                    className="w-10 bg-transparent text-[10px] text-zinc-200 font-bold border-0 p-0 text-center focus:ring-0 focus:outline-none"
                  />
                  <span className="text-[9px] font-bold text-zinc-500">Y:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={Math.round(selectedField.y_mm * 10) / 10}
                    onChange={e => setFieldProperty(selectedField.id, "y_mm", e.target.value)}
                    className="w-10 bg-transparent text-[10px] text-zinc-200 font-bold border-0 p-0 text-center focus:ring-0 focus:outline-none"
                  />
                  <span className="text-[9px] font-bold text-zinc-500">W:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={Math.round(selectedField.width_mm * 10) / 10}
                    onChange={e => setFieldProperty(selectedField.id, "width_mm", e.target.value)}
                    className="w-10 bg-transparent text-[10px] text-zinc-200 font-bold border-0 p-0 text-center focus:ring-0 focus:outline-none"
                  />
                  <span className="text-[9px] font-bold text-zinc-500">H:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={Math.round(selectedField.height_mm * 10) / 10}
                    onChange={e => setFieldProperty(selectedField.id, "height_mm", e.target.value)}
                    className="w-10 bg-transparent text-[10px] text-zinc-200 font-bold border-0 p-0 text-center focus:ring-0 focus:outline-none"
                  />
                  <span className="text-[9px] font-bold text-zinc-500 ml-1">Rot:</span>
                  <select
                    value={selectedField.rotation || 0}
                    onChange={e => setFieldProperty(selectedField.id, "rotation", e.target.value)}
                    className="bg-transparent text-[10px] text-zinc-200 font-bold border-0 p-0 focus:ring-0 focus:outline-none cursor-pointer"
                  >
                    <option value={0} className="bg-zinc-900 text-zinc-200">0°</option>
                    <option value={90} className="bg-zinc-900 text-zinc-200">90°</option>
                    <option value={180} className="bg-zinc-900 text-zinc-200">180°</option>
                    <option value={270} className="bg-zinc-900 text-zinc-200">270°</option>
                  </select>
                </div>

                <div className="ml-auto flex items-center gap-2 shrink-0">
                  {/* Lock / Unlock toggle */}
                  <button
                    onClick={() => setFieldProperty(selectedField.id, "locked", !selectedField.locked)}
                    title={selectedField.locked ? "Unlock element" : "Lock element"}
                    className={`h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                      selectedField.locked
                        ? "bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    {selectedField.locked ? "🔒 Unlock" : "🔓 Lock"}
                  </button>
                  <Button
                    onClick={() => {
                      if (selectedField.locked) { toast.warning("Unlock the element before deleting."); return; }
                      deleteField();
                    }}
                    className="h-7 px-2.5 bg-rose-600/10 hover:bg-rose-600/25 border border-rose-500/20 text-rose-400 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              // Default Page controls when nothing is selected
              <div className="flex items-center gap-4 text-zinc-400 text-xs w-full">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Badge Setup</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-zinc-500 text-[10px] font-bold">Margin L/R:</span>
                  <Input
                    type="number"
                    value={activePage?.margin_left_mm}
                    onChange={e => {
                      setPageProperty("margin_left_mm", e.target.value);
                      setPageProperty("margin_right_mm", e.target.value);
                    }}
                    className="h-7 w-12 bg-zinc-950 border-zinc-800 text-xs text-center rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-zinc-500 text-[10px] font-bold">Margin T/B:</span>
                  <Input
                    type="number"
                    value={activePage?.margin_top_mm}
                    onChange={e => {
                      setPageProperty("margin_top_mm", e.target.value);
                      setPageProperty("margin_bottom_mm", e.target.value);
                    }}
                    className="h-7 w-12 bg-zinc-950 border-zinc-800 text-xs text-center rounded-lg"
                  />
                </div>
                <div className="h-4 w-px bg-zinc-800" />
                <span className="text-zinc-500 text-[9px] font-bold uppercase">Click elements inside canvas to modify their properties.</span>
              </div>
            )}
          </div>

          {/* Canvas Viewport Scroll Area */}
          <div
            ref={canvasAreaRef}
            className="flex-grow overflow-auto p-12 flex flex-col items-center justify-start bg-zinc-950/20 relative min-h-0 select-none"
            style={{ cursor: isPanning ? "grab" : "default" }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onClick={() => setContextMenu(null)}
          >
            {activePage && (
              <div
                className="flex flex-col gap-3 flex-shrink-0"
                style={{
                  width: `${mmToPx(template.width_mm) * zoom * canvasZoom}px`,
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                  transformOrigin: "top center"
                }}
              >

                {/* Scaled page container wrapper */}
                <div
                  style={{
                    width: `${mmToPx(template.width_mm) * zoom * canvasZoom}px`,
                    height: `${mmToPx(template.height_mm) * zoom * canvasZoom}px`,
                    position: "relative",
                    flexShrink: 0
                  }}
                >
                  <div
                    ref={pageContainerRef}
                    onClick={() => setMeta({ selectedFieldId: null })}
                    style={{
                      transform: `scale(${zoom * canvasZoom})`,
                      transformOrigin: "top left",
                      width: `${mmToPx(template.width_mm)}px`,
                      height: `${mmToPx(template.height_mm)}px`,
                      backgroundColor: activePage.backgroundColor,
                      backgroundImage: (design_mode && activePage.backgroundImage) ? `url(${activePage.backgroundImage})` : "none",
                      backgroundSize: "100% 100%",
                      backgroundPosition: "center",
                    }}
                    className="absolute top-0 left-0 shadow-2xl rounded border border-zinc-800 flex-shrink-0 transition-transform duration-150 ease-out overflow-visible"
                  >
                    {/* Margins bounds visualization (Dashed lines guide) */}
                    <div
                      className="margin-bounds"
                      style={{
                        position: "absolute",
                        top: `${mmToPx(activePage.margin_top_mm)}px`,
                        bottom: `${mmToPx(activePage.margin_bottom_mm)}px`,
                        left: `${mmToPx(activePage.margin_left_mm)}px`,
                        right: `${mmToPx(activePage.margin_right_mm)}px`,
                        pointerEvents: "none",
                        border: "1px dashed rgba(99, 102, 241, 0.4)",
                        zIndex: 1
                      }}
                    />

                    {/* Smart Snapping Alignment Guides */}
                    {activeGuides.xLines.map((x, idx) => (
                      <div
                        key={`guide-x-${idx}`}
                        style={{
                          position: "absolute",
                          left: `${x}px`,
                          top: 0,
                          bottom: 0,
                          width: "1px",
                          borderLeft: "1px dashed #ec4899",
                          pointerEvents: "none",
                          zIndex: 50
                        }}
                      />
                    ))}
                    {activeGuides.yLines.map((y, idx) => (
                      <div
                        key={`guide-y-${idx}`}
                        style={{
                          position: "absolute",
                          top: `${y}px`,
                          left: 0,
                          right: 0,
                          height: "1px",
                          borderTop: "1px dashed #ec4899",
                          pointerEvents: "none",
                          zIndex: 50
                        }}
                      />
                    ))}

                    {/* Draggable items container relative directly to (0,0) of the page container */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: 0,
                        right: 0,
                        zIndex: 4,
                        width: "100%",
                        height: "100%"
                      }}
                    >
                      {activePage.fields.map((field: any) => (
                        <Rnd
                          key={field.id}
                          scale={zoom * canvasZoom}
                          enableResizing={false}
                          disableDragging={field.locked === true}
                          cancel=".resize-handle, .rotate-handle"
                          position={{ x: mmToPx(field.x_mm), y: mmToPx(field.y_mm) }}
                          size={{ width: mmToPx(field.width_mm), height: mmToPx(field.height_mm) }}
                          onDrag={(e: any, d: any) => handleElementDrag(field, d, false)}
                          onDragStop={(e: any, d: any) => handleElementDrag(field, d, true)}
                          onResizeStop={(e: any, dir: any, ref: any, delta: any, pos: any) => {
                            if (field.locked) return;
                            const minX = 0;
                            const maxX = mmToPx(template.width_mm);
                            const minY = 0;
                            const maxY = mmToPx(template.height_mm);

                            const clampedX = clamp(pos.x, minX, maxX);
                            const clampedY = clamp(pos.y, minY, maxY);

                            const maxW = maxX - clampedX;
                            const maxH = maxY - clampedY;

                            const clampedWidth = clamp(ref.offsetWidth, 0, maxW);
                            const clampedHeight = clamp(ref.offsetHeight, 0, maxH);

                            setFieldProperty(field.id, "width_mm", pxToMm(clampedWidth));
                            setFieldProperty(field.id, "height_mm", pxToMm(clampedHeight));
                            setFieldProperty(field.id, "x_mm", pxToMm(clampedX));
                            setFieldProperty(field.id, "y_mm", pxToMm(clampedY));
                          }}
                          onClick={(e: any) => {
                            e.stopPropagation();
                            setContextMenu(null);
                            setMeta({ selectedFieldId: field.id });
                          }}
                          onContextMenu={(e: any) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMeta({ selectedFieldId: field.id });
                            setContextMenu({ x: e.clientX, y: e.clientY, fieldId: field.id });
                          }}
                          style={{
                            pointerEvents: "all",
                            display: field.enabled === false ? "none" : "flex",
                            cursor: field.locked ? "not-allowed" : "move",
                            border: "none",
                            boxSizing: "border-box",
                            zIndex: 10
                          }}
                        >
                          {/* Outer wrapper: handles rotation transform. overflow:visible so rotation/resize handles are not clipped */}
                          <div
                            style={{
                              transform: `rotate(${field.rotation || 0}deg)`,
                              transformOrigin: "center",
                              width: "100%",
                              height: "100%",
                              position: "relative",
                              overflow: "visible",
                            }}
                          >
                            {/* Inner content div: has overflow:hidden + border + radius. Does NOT contain handles */}
                            <div
                              id={`field-rotated-wrapper-${field.id}`}
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                // Border & radius styling
                                borderStyle: field.borderStyle && field.borderStyle !== "none" ? field.borderStyle : undefined,
                                borderWidth: (field.borderStyle && field.borderStyle !== "none" && field.borderWidth_mm) ? `${mmToPx(parseFloat(field.borderWidth_mm))}px` : undefined,
                                borderColor: (field.borderStyle && field.borderStyle !== "none") ? (field.borderColor || "#000000") : undefined,
                                borderRadius: field.type === "photo" && field.frame === "circle" ? "50%" : (field.cornerRadius_mm ? `${mmToPx(parseFloat(field.cornerRadius_mm))}px` : undefined),
                                boxSizing: "border-box",
                                overflow: "hidden",
                              }}
                            >
                            {/* Photo field */}
                            {field.type === "photo" && (
                              <img
                                src={previewData.photo}
                                alt="avatar"
                                style={{
                                  borderRadius: field.frame === "circle" ? "50%" : "0",
                                  objectPosition: field.align === "left" ? "left center" : field.align === "right" ? "right center" : "center center"
                                }}
                                className="w-full h-full object-cover"
                                draggable={false}
                              />
                            )}

                            {/* Image elements */}
                            {field.type === "image" && (
                              <img
                                src={field.src}
                                alt="custom-uploaded-graphic"
                                style={{
                                  objectPosition: field.align === "left" ? "left center" : field.align === "right" ? "right center" : "center center"
                                }}
                                className="w-full h-full object-contain"
                                draggable={false}
                              />
                            )}

                            {/* Icon element */}
                            {field.type === "icon" && (() => {
                              const IconComp = (LucideIcons as any)[field.iconName || "Star"];
                              return IconComp ? (
                                <div
                                  style={{
                                    justifyContent: field.align === "left" ? "flex-start" : field.align === "right" ? "flex-end" : "center"
                                  }}
                                  className="w-full h-full flex items-center"
                                >
                                  <div style={{ height: "100%", aspectRatio: "1/1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <IconComp size="100%" color={field.color || "#6366F1"} />
                                  </div>
                                </div>
                              ) : null;
                            })()}

                            {/* Shape element */}
                            {field.type === "shape" && (() => {
                              if (field.shapeType === "circle") {
                                return <div style={{ backgroundColor: field.color || "#6366F1", borderRadius: "50%", width: "100%", height: "100%" }} />;
                              }
                              if (field.shapeType === "triangle") {
                                return (
                                  <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                                    <polygon points="50,0 0,100 100,100" fill={field.color || "#6366F1"} />
                                  </svg>
                                );
                              }
                              if (field.shapeType === "star") {
                                return (
                                  <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                                    <polygon points="50,0 63,38 100,38 70,62 82,100 50,75 18,100 30,62 0,38 37,38" fill={field.color || "#6366F1"} />
                                  </svg>
                                );
                              }
                              if (field.shapeType === "hexagon") {
                                return (
                                  <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                                    <polygon points="50,0 100,25 100,75 50,100 0,75 0,25" fill={field.color || "#6366F1"} />
                                  </svg>
                                );
                              }
                              if (field.shapeType === "line") {
                                return <div style={{ backgroundColor: field.color || "#6366F1", width: "100%", height: "100%" }} />;
                              }
                              if (field.shapeType === "diamond") {
                                return (
                                  <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                                    <polygon points="50,0 100,50 50,100 0,50" fill={field.color || "#6366F1"} />
                                  </svg>
                                );
                              }
                              if (field.shapeType === "pentagon") {
                                return (
                                  <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                                    <polygon points="50,0 100,38 81,100 19,100 0,38" fill={field.color || "#6366F1"} />
                                  </svg>
                                );
                              }
                              if (field.shapeType === "octagon") {
                                return (
                                  <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                                    <polygon points="30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30" fill={field.color || "#6366F1"} />
                                  </svg>
                                );
                              }
                              // Default: rectangle
                              return <div style={{ backgroundColor: field.color || "#6366F1", width: "100%", height: "100%" }} />;
                            })()}

                            {/* Contact Card QR */}
                            {field.type === "contact_qr" && (
                              <div
                                style={{
                                  display: "flex",
                                  width: "100%",
                                  height: "100%",
                                  alignItems: "center",
                                  justifyContent: field.align === "left" ? "flex-start" : field.align === "right" ? "flex-end" : "center"
                                }}
                              >
                                <QRCodeSVG value={generateVCardString(previewData)} fgColor={field.color} bgColor={field.bgColor} style={{ height: "100%", aspectRatio: "1/1" }} />
                              </div>
                            )}

                            {/* ID / Value QR */}
                            {field.type === "qr" && (
                              <div
                                style={{
                                  display: "flex",
                                  width: "100%",
                                  height: "100%",
                                  alignItems: "center",
                                  justifyContent: field.align === "left" ? "flex-start" : field.align === "right" ? "flex-end" : "center"
                                }}
                              >
                                <QRCodeSVG value={tokenReplace(field.placeholder || "", previewData)} fgColor={field.color} bgColor={field.bgColor} style={{ height: "100%", aspectRatio: "1/1" }} />
                              </div>
                            )}

                            {/* Text field */}
                            {field.type === "text" && (
                              <div
                                style={{
                                  fontFamily: `'${field.fontFamily}', sans-serif`,
                                  fontSize: `${field.fontSize}pt`,
                                  color: field.color,
                                  fontWeight: field.bold ? 700 : 400,
                                  fontStyle: field.italic ? "italic" : "normal",
                                  textDecoration: field.underline ? "underline" : "none",
                                  justifyContent: field.align === "center" ? "center" : field.align === "right" ? "flex-end" : "flex-start",
                                  lineHeight: 1.2,
                                }}
                                className="w-full h-full overflow-hidden whitespace-nowrap flex items-center px-1"
                              >
                                {tokenReplace(field.placeholder || "", previewData, field.textCase)}
                              </div>
                            )}
                            </div>{/* end inner content div */}

                            {/* Selection overlays: positioned relative to outer (non-clipping) wrapper */}
                            {selectedFieldId === field.id && (() => {
                               const s = zoom * canvasZoom;
                               const borderW = 2 / s;
                               const handleSize = 10 / s;
                               const connLineW = 2 / s;
                               const connLineH = 15 / s;
                               const rotSize = 24 / s;
                               const rotIconSize = 14 / s;
                               const isLocked = field.locked === true;
                               const selectionColor = isLocked ? "#EF4444" : "#6366F1";

                               const HANDLES = [
                                 { id: "tl", style: { left: "0%", top: "0%" } },
                                 { id: "t", style: { left: "50%", top: "0%" } },
                                 { id: "tr", style: { left: "100%", top: "0%" } },
                                 { id: "r", style: { left: "100%", top: "50%" } },
                                 { id: "br", style: { left: "100%", top: "100%" } },
                                 { id: "b", style: { left: "50%", top: "100%" } },
                                 { id: "bl", style: { left: "0%", top: "100%" } },
                                 { id: "l", style: { left: "0%", top: "50%" } },
                               ];

                               return (
                                 <>
                                   {/* Selection Border */}
                                   <div
                                     style={{
                                       position: "absolute",
                                       top: 0,
                                       left: 0,
                                       right: 0,
                                       bottom: 0,
                                       border: `${borderW}px solid ${selectionColor}`,
                                       boxSizing: "border-box",
                                       pointerEvents: "none",
                                       zIndex: 50
                                     }}
                                   />

                                   {/* Connecting Line & Rotation Handle — hidden when locked */}
                                   {!isLocked && (
                                     <>
                                       <div
                                         className="rotate-handle"
                                         style={{
                                           position: "absolute",
                                           left: "50%",
                                           top: "100%",
                                           width: `${connLineW}px`,
                                           height: `${connLineH}px`,
                                           background: selectionColor,
                                           transform: "translateX(-50%)",
                                           boxSizing: "border-box",
                                           pointerEvents: "none",
                                           zIndex: 51
                                         }}
                                       />
                                       <div
                                         className="rotate-handle"
                                         onMouseDown={(e) => startRotate(e, field.id)}
                                         style={{
                                           position: "absolute",
                                           left: "50%",
                                           top: `calc(100% + ${connLineH}px)`,
                                           width: `${rotSize}px`,
                                           height: `${rotSize}px`,
                                           background: "#ffffff",
                                           border: `${borderW}px solid ${selectionColor}`,
                                           borderRadius: "50%",
                                           transform: "translate(-50%, -50%)",
                                           boxSizing: "border-box",
                                           cursor: "grab",
                                           display: "flex",
                                           alignItems: "center",
                                           justifyContent: "center",
                                           boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
                                           pointerEvents: "all",
                                           zIndex: 52
                                         }}
                                       >
                                         <RefreshCw style={{ width: `${rotIconSize}px`, height: `${rotIconSize}px` }} color={selectionColor} />
                                       </div>

                                       {/* 8 Resize Handles */}
                                       {HANDLES.map(h => (
                                         <div
                                           key={h.id}
                                           className="resize-handle"
                                           onMouseDown={e => startResize(e, h.id)}
                                           style={{
                                             position: "absolute",
                                             width: `${handleSize}px`,
                                             height: `${handleSize}px`,
                                             background: "#ffffff",
                                             border: `${borderW}px solid ${selectionColor}`,
                                             borderRadius: `${2 / s}px`,
                                             boxSizing: "border-box",
                                             zIndex: 100,
                                             pointerEvents: "all",
                                             cursor: getResizeCursor(h.id, field.rotation || 0),
                                             transform: "translate(-50%, -50%)",
                                             ...h.style
                                           }}
                                         />
                                       ))}
                                     </>
                                   )}
                                   </>
                                 );
                              })()}
                            </div>{/* end outer rotation wrapper */}
                        </Rnd>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Context Menu ── */}
          {contextMenu && typeof document !== "undefined" && (() => {
            const ctxField = activePage?.fields.find((f: any) => f.id === contextMenu.fieldId);
            if (!ctxField) return null;
            const isLocked = ctxField.locked === true;
            const isText = ctxField.type === "text";
            // Smart positioning: flip up if near bottom of viewport, flip left if near right edge
            const MENU_W = 200;
            const MENU_H_ESTIMATE = isText ? 420 : 320;
            const vw = typeof window !== "undefined" ? window.innerWidth : 9999;
            const vh = typeof window !== "undefined" ? window.innerHeight : 9999;
            const posX = contextMenu.x + MENU_W > vw ? contextMenu.x - MENU_W : contextMenu.x;
            const posY = contextMenu.y + MENU_H_ESTIMATE > vh ? Math.max(8, contextMenu.y - MENU_H_ESTIMATE) : contextMenu.y;
            return createPortal(
              <div
                style={{
                  position: "fixed",
                  top: posY,
                  left: posX,
                  zIndex: 9999,
                  minWidth: MENU_W,
                }}
                onClick={e => e.stopPropagation()}
                onContextMenu={e => e.preventDefault()}
                className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1.5 text-xs animate-in fade-in duration-100"
              >
                {/* Layer */}
                <div className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-600">Layer</div>
                {([
                  { label: "Bring to Front", action: () => { dispatch({ type: "BRING_FIELD_TO_FRONT", payload: { fieldId: ctxField.id } }); setContextMenu(null); } },
                  { label: "Move Forward", action: () => { dispatch({ type: "MOVE_FIELD_FORWARD", payload: { fieldId: ctxField.id } }); setContextMenu(null); } },
                  { label: "Move Backward", action: () => { dispatch({ type: "MOVE_FIELD_BACKWARD", payload: { fieldId: ctxField.id } }); setContextMenu(null); } },
                  { label: "Send to Back", action: () => { dispatch({ type: "SEND_FIELD_TO_BACK", payload: { fieldId: ctxField.id } }); setContextMenu(null); } },
                ] as { label: string; action: () => void }[]).map(item => (
                  <button key={item.label} onClick={item.action} className="w-full text-left px-4 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">{item.label}</button>
                ))}
                <div className="h-px bg-zinc-800 mx-3 my-1" />
                {/* Edit actions */}
                <div className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-600">Edit</div>
                <button onClick={() => { setClipboard(JSON.parse(JSON.stringify(ctxField))); toast.success("Copied"); setContextMenu(null); }} className="w-full text-left px-4 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">Copy</button>
                <button
                  onClick={() => {
                    if (clipboard) {
                      let x_mm = clipboard.x_mm + 5;
                      let y_mm = clipboard.y_mm + 5;
                      if (activePage) {
                        const clamped = clampPositionToMargins(x_mm, y_mm, clipboard.width_mm, clipboard.height_mm, clipboard.rotation || 0, activePage, template);
                        x_mm = clamped.x;
                        y_mm = clamped.y;
                      }
                      const p = { ...JSON.parse(JSON.stringify(clipboard)), id: uuidv4(), x_mm, y_mm, locked: false };
                      dispatch({ type: "ADD_FIELD", payload: { field: p } });
                      toast.success("Pasted");
                    }
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-40"
                  disabled={!clipboard}
                >
                  Paste
                </button>
                <button
                  onClick={() => {
                    let x_mm = ctxField.x_mm + 5;
                    let y_mm = ctxField.y_mm + 5;
                    if (activePage) {
                      const clamped = clampPositionToMargins(x_mm, y_mm, ctxField.width_mm, ctxField.height_mm, ctxField.rotation || 0, activePage, template);
                      x_mm = clamped.x;
                      y_mm = clamped.y;
                    }
                    const d = { ...JSON.parse(JSON.stringify(ctxField)), id: uuidv4(), x_mm, y_mm, locked: false };
                    dispatch({ type: "ADD_FIELD", payload: { field: d } });
                    toast.success("Duplicated");
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                >
                  Duplicate
                </button>
                <div className="h-px bg-zinc-800 mx-3 my-1" />
                {/* Rotate */}
                <div className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-600">Rotate</div>
                <button
                  onClick={() => {
                    const newRotation = ((ctxField.rotation || 0) + 90) % 360;
                    setFieldProperty(ctxField.id, "rotation", newRotation, true);
                    if (activePage) {
                      const clamped = clampPositionToMargins(ctxField.x_mm, ctxField.y_mm, ctxField.width_mm, ctxField.height_mm, newRotation, activePage, template);
                      setFieldProperty(ctxField.id, "x_mm", clamped.x, true);
                      setFieldProperty(ctxField.id, "y_mm", clamped.y, true);
                    }
                    setFieldProperty(ctxField.id, "rotation", newRotation);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                >
                  Rotate 90°
                </button>
                <button onClick={() => { setFieldProperty(ctxField.id, "rotation", 0); setContextMenu(null); }} className="w-full text-left px-4 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">Reset Rotation</button>
                {/* Text formatting — only for text fields */}
                {isText && (
                  <>
                    <div className="h-px bg-zinc-800 mx-3 my-1" />
                    <div className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-600">Format</div>
                    <button onClick={() => { setFieldProperty(ctxField.id, "bold", !ctxField.bold); setContextMenu(null); }} className={`w-full text-left px-4 py-1.5 hover:bg-zinc-800 transition-colors ${ctxField.bold ? "text-[#6366F1]" : "text-zinc-300 hover:text-white"}`}>Bold {ctxField.bold ? "✓" : ""}</button>
                    <button onClick={() => { setFieldProperty(ctxField.id, "italic", !ctxField.italic); setContextMenu(null); }} className={`w-full text-left px-4 py-1.5 hover:bg-zinc-800 transition-colors ${ctxField.italic ? "text-[#6366F1]" : "text-zinc-300 hover:text-white"}`}>Italic {ctxField.italic ? "✓" : ""}</button>
                    <button onClick={() => { setFieldProperty(ctxField.id, "underline", !ctxField.underline); setContextMenu(null); }} className={`w-full text-left px-4 py-1.5 hover:bg-zinc-800 transition-colors ${ctxField.underline ? "text-[#6366F1]" : "text-zinc-300 hover:text-white"}`}>Underline {ctxField.underline ? "✓" : ""}</button>
                  </>
                )}
                <div className="h-px bg-zinc-800 mx-3 my-1" />
                {/* Lock / Delete */}
                <button onClick={() => { setFieldProperty(ctxField.id, "locked", !isLocked); setContextMenu(null); }} className={`w-full text-left px-4 py-1.5 hover:bg-zinc-800 transition-colors ${isLocked ? "text-red-400" : "text-zinc-300 hover:text-white"}`}>{isLocked ? "🔒 Unlock" : "🔓 Lock"}</button>
                <button onClick={() => { if (isLocked) { toast.warning("Unlock the element first."); return; } dispatch({ type: "DELETE_FIELD", payload: { fieldId: ctxField.id } }); setContextMenu(null); }} className="w-full text-left px-4 py-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors">Delete</button>
              </div>,
              document.body
            );
          })()}
        </div>

        {/* 4. Canva Page Navigator / Filmstrip Sidebar on the Right */}
        <div className="w-48 bg-zinc-900 border-l border-zinc-800 flex flex-col flex-shrink-0 min-h-0 overflow-hidden select-none z-10">
          <div className="flex-shrink-0 p-4 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Pages List</span>
            <Button
              onClick={() => dispatch({ type: "ADD_PAGE", payload: { page: getDefaultPage() } })}
              className="h-6 w-6 p-0 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-white rounded-full"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          {/* Filmstrip Scroll view */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            {template.pages.map((page: any, pageIdx: number) => {
              const thumbScale = 140 / mmToPx(template.width_mm);
              const thumbHeight = mmToPx(template.height_mm) * thumbScale;

              return (
                <div key={page.id} className="space-y-1.5 flex flex-col items-center">
                  <div className="flex items-center justify-between w-full text-[9px] text-zinc-500 font-black uppercase tracking-widest px-1">
                    <span>Page {pageIdx + 1}</span>
                  </div>

                  <button
                    onClick={() => setMeta({ activePageIndex: pageIdx })}
                    style={{ height: `${thumbHeight}px`, width: "140px" }}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all shrink-0 bg-white shadow-lg ${activePageIndex === pageIdx ? "border-[var(--pri)] ring-2 ring-[var(--pri)]/10" : "border-zinc-800 hover:border-zinc-700"
                      }`}
                  >
                    <div
                      style={{
                        transform: `scale(${thumbScale})`,
                        transformOrigin: "top left",
                        width: `${mmToPx(template.width_mm)}px`,
                        height: `${mmToPx(template.height_mm)}px`,
                        backgroundColor: page.backgroundColor,
                        backgroundImage: page.backgroundImage ? `url(${page.backgroundImage})` : "none",
                        backgroundSize: "100% 100%",
                        backgroundPosition: "center",
                      }}
                      className="absolute top-0 left-0"
                    >
                      {/* Scaled simplified blocks representation for thumbnails */}
                      {page.fields.map((f: any) => (
                        <div
                          key={f.id}
                          style={{
                            position: "absolute",
                            left: `${mmToPx(f.x_mm)}px`,
                            top: `${mmToPx(f.y_mm)}px`,
                            width: `${mmToPx(f.width_mm)}px`,
                            height: `${mmToPx(f.height_mm)}px`,
                            border: "1px solid rgba(0, 0, 0, 0.25)",
                            backgroundColor: f.type === "photo" || f.type === "image" ? "rgba(0,0,0,0.1)" : "rgba(99, 102, 241, 0.05)",
                            borderRadius: f.frame === "circle" ? "50%" : "0",
                            transform: `rotate(${f.rotation || 0}deg)`,
                            transformOrigin: "center"
                          }}
                        />
                      ))}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Ribbon size / settings footer bar */}
      <div className="flex-shrink-0 bg-zinc-900 border-t border-zinc-800 p-3.5 flex items-center justify-between px-8 text-xs select-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-bold">Size preset:</span>
            <select
              value={template.page_size}
              onChange={e => applySizeFromKey(e.target.value)}
              className="h-7 px-2 rounded-lg border border-zinc-800 bg-zinc-950 text-[10px] font-bold text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="badge">Badge (76x100mm)</option>
              <option value="a6">A6 (105x148mm)</option>
              <option value="a5">A5 (148x210mm)</option>
              <option value="a4">A4 (210x297mm)</option>
              <option value="letter">Letter (216x279mm)</option>
              <option value="custom">Custom Dimensions</option>
            </select>
          </div>

          <div className="flex border border-zinc-850 rounded-lg overflow-hidden bg-zinc-950">
            <button onClick={() => handleOrientationChange("portrait")} className={`h-7 px-3 text-[10px] font-black uppercase tracking-wider border-r border-zinc-850 ${template.orientation === "portrait" ? "bg-[var(--pri)] text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
              Portrait
            </button>
            <button onClick={() => handleOrientationChange("landscape")} className={`h-7 px-3 text-[10px] font-black uppercase tracking-wider ${template.orientation === "landscape" ? "bg-[var(--pri)] text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
              Landscape
            </button>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-zinc-500 font-bold">W:</span>
            <Input type="number" value={template.width_mm} onChange={e => handleDimensionChange("width_mm", e.target.value)} className="h-7 w-20 px-1 py-0 text-center bg-zinc-950 border-zinc-800 text-zinc-300 font-bold font-mono" />
            <span className="text-[10px] text-zinc-600 font-bold">mm</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-zinc-500 font-bold">H:</span>
            <Input type="number" value={template.height_mm} onChange={e => handleDimensionChange("height_mm", e.target.value)} className="h-7 w-20 px-1 py-0 text-center bg-zinc-950 border-zinc-800 text-zinc-300 font-bold font-mono" />
            <span className="text-[10px] text-zinc-600 font-bold">mm</span>
          </div>

          <div className="h-4 w-px bg-zinc-850 mx-2" />

          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mr-1">Page:</span>
            <Button
              onClick={() => dispatch({ type: "CLONE_PAGE", payload: { pageIndex: activePageIndex } })}
              className="h-7 px-3 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
            >
              <Copy className="h-3.5 w-3.5 text-[var(--pri)]" /> Duplicate Page
            </Button>
            <Button
              onClick={() => dispatch({ type: "DELETE_PAGE", payload: { pageIndex: activePageIndex } })}
              disabled={template.pages.length <= 1}
              className="h-7 px-3 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 text-rose-400 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-30 flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-400" /> Delete Page
            </Button>
          </div>
        </div>

        <span className="font-bold text-zinc-500">
          Page {activePageIndex + 1} of {template.pages.length}
        </span>
      </div>

      {/* Delete template confirmation dialog */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[1000] flex items-center justify-center animate-in fade-in duration-150">
          <Card className="p-6 max-w-sm w-full bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100">Delete Design Template?</h3>
            <p className="text-xs text-zinc-400 font-bold mt-2">
              Are you sure you want to permanently delete template "{template.template_name}"? This action is irreversible.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <Button onClick={() => setConfirmDeleteOpen(false)} className="h-9 px-4 bg-zinc-950 hover:bg-zinc-850 text-zinc-400 font-black uppercase tracking-wider text-[10px] rounded-full border border-zinc-800">
                Cancel
              </Button>
              <Button onClick={handleDeleteTemplate} className="h-9 px-4 bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-wider text-[10px] rounded-full border-0">
                Delete
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Image Editor & Cropper Dialog Modal */}
      {imageEditorOpen && imageToEdit && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xl z-[1100] flex items-center justify-center animate-in fade-in duration-200 p-4 select-none">
          <Card className="max-w-3xl w-full bg-zinc-950/80 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[550px]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-855 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-zinc-100 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[var(--pri)] animate-pulse" />
                  Image Studio Editor
                </h3>
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mt-0.5">Crop, frame, and filter your custom logo</span>
              </div>
              <button
                onClick={() => {
                  setImageEditorOpen(false);
                  setImageToEdit(null);
                }}
                className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 min-h-0 flex">
              {/* Left Column: Visual Crop Preview Canvas Area */}
              <div className="flex-1 bg-zinc-900/40 border-r border-zinc-850 p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden">
                <div
                  className="relative select-none max-w-[450px] max-h-[350px] flex items-center justify-center"
                >
                  <img
                    src={imageToEdit}
                    className="max-w-[450px] max-h-[350px] object-contain select-none pointer-events-none rounded-xl"
                    style={{
                      filter: `brightness(${filterBrightness}%) contrast(${filterContrast}%)`,
                    }}
                    onLoad={handleImageLoad}
                    alt="Visual Editor"
                  />

                  {/* Cropper Workspace Overlay */}
                  {imgSize.width > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        width: imgSize.width,
                        height: imgSize.height,
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                      }}
                      className="overflow-hidden select-none cursor-default animate-in fade-in duration-150"
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                    >
                      {/* Dark Overlays for non-selected crop area */}
                      {/* Top Overlay */}
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${cropPercent.y * 100}%`,
                        }}
                        className="bg-black/60"
                      />
                      {/* Bottom Overlay */}
                      <div
                        style={{
                          position: "absolute",
                          top: `${(cropPercent.y + cropPercent.h) * 100}%`,
                          left: 0,
                          width: "100%",
                          height: `${(1 - (cropPercent.y + cropPercent.h)) * 100}%`,
                        }}
                        className="bg-black/60"
                      />
                      {/* Left Overlay */}
                      <div
                        style={{
                          position: "absolute",
                          top: `${cropPercent.y * 100}%`,
                          left: 0,
                          width: `${cropPercent.x * 100}%`,
                          height: `${cropPercent.h * 100}%`,
                        }}
                        className="bg-black/60"
                      />
                      {/* Right Overlay */}
                      <div
                        style={{
                          position: "absolute",
                          top: `${cropPercent.y * 100}%`,
                          left: `${(cropPercent.x + cropPercent.w) * 100}%`,
                          width: `${(1 - (cropPercent.x + cropPercent.w)) * 100}%`,
                          height: `${cropPercent.h * 100}%`,
                        }}
                        className="bg-black/60"
                      />

                      {/* Crop Box Selector Outline */}
                      <div
                        style={{
                          position: "absolute",
                          left: `${cropPercent.x * 100}%`,
                          top: `${cropPercent.y * 100}%`,
                          width: `${cropPercent.w * 100}%`,
                          height: `${cropPercent.h * 100}%`,
                          borderRadius: (cropShape === "circle" && cropAspect === "1:1") ? "50%" : "0px",
                        }}
                        className="border-2 border-[var(--pri)] shadow-[0_0_20px_color-mix(in_srgb,var(--pri)_30%,transparent)] cursor-move"
                        onMouseDown={handleMouseDownMove}
                      >
                        {/* Grid lines helper */}
                        <div className="absolute inset-0 pointer-events-none border border-white/20 flex items-center justify-center">
                          <div className="w-full h-1/3 border-y border-white/20 absolute top-1/3" />
                          <div className="h-full w-1/3 border-x border-white/20 absolute left-1/3" />
                        </div>

                        {/* Resize Handles */}
                        {/* Corners */}
                        <div
                          onMouseDown={(e) => handleMouseDownResize(e, "tl")}
                          className="h-3.5 w-3.5 bg-white border-2 border-[var(--pri)] absolute -top-1.5 -left-1.5 rounded-sm shadow-md cursor-nwse-resize z-10 hover:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleMouseDownResize(e, "tr")}
                          className="h-3.5 w-3.5 bg-white border-2 border-[var(--pri)] absolute -top-1.5 -right-1.5 rounded-sm shadow-md cursor-nesw-resize z-10 hover:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleMouseDownResize(e, "bl")}
                          className="h-3.5 w-3.5 bg-white border-2 border-[var(--pri)] absolute -bottom-1.5 -left-1.5 rounded-sm shadow-md cursor-nesw-resize z-10 hover:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleMouseDownResize(e, "br")}
                          className="h-3.5 w-3.5 bg-white border-2 border-[var(--pri)] absolute -bottom-1.5 -right-1.5 rounded-sm shadow-md cursor-nwse-resize z-10 hover:scale-125 transition-transform"
                        />

                        {/* Edges - only show for freeform cropping */}
                        {cropAspect === "free" && (
                          <>
                            <div
                              onMouseDown={(e) => handleMouseDownResize(e, "t")}
                              className="h-2 w-6 bg-white border border-[var(--pri)] absolute -top-1 left-1/2 -translate-x-1/2 rounded-full shadow-md cursor-ns-resize z-10 hover:scale-110 transition-transform"
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownResize(e, "b")}
                              className="h-2 w-6 bg-white border border-[var(--pri)] absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full shadow-md cursor-ns-resize z-10 hover:scale-110 transition-transform"
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownResize(e, "l")}
                              className="h-6 w-2 bg-white border border-[var(--pri)] absolute top-1/2 -translate-y-1/2 -left-1 rounded-full shadow-md cursor-ew-resize z-10 hover:scale-110 transition-transform"
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownResize(e, "r")}
                              className="h-6 w-2 bg-white border border-[var(--pri)] absolute top-1/2 -translate-y-1/2 -right-1 rounded-full shadow-md cursor-ew-resize z-10 hover:scale-110 transition-transform"
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-[var(--pri)] uppercase tracking-widest bg-[var(--pri)]/10 px-3 py-1 rounded-full border border-[var(--pri)]/20">
                  Drag corners to crop • Drag box to move
                </span>
              </div>

              {/* Right Column: Settings Panel */}
              <div className="w-[320px] p-6 overflow-y-auto space-y-5 flex flex-col justify-start">
                {/* Crop Shapes and Aspect Ratios */}
                <div className="space-y-2.5">
                  <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500 block">Aspect Ratio</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["1:1", "4:3", "16:9", "free"] as const).map(ratio => (
                      <button
                        key={ratio}
                        onClick={() => handleSelectAspect(ratio)}
                        className={`h-8 px-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all ${cropAspect === ratio ? "bg-[var(--pri)] border-[var(--pri)] text-white shadow-lg" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"}`}
                      >
                        {ratio === "free" ? "Freeform" : ratio}
                      </button>
                    ))}
                  </div>
                </div>

                {cropAspect === "1:1" && (
                  <div className="space-y-2.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500 block">Frame Shape</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["rect", "circle"] as const).map(shape => (
                        <button
                          key={shape}
                          onClick={() => setCropShape(shape)}
                          className={`h-8 px-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all ${cropShape === shape ? "bg-[var(--pri)] border-[var(--pri)] text-white shadow-lg" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"}`}
                        >
                          {shape === "rect" ? "Square" : "Circular"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Brightness & Contrast filters */}
                <div className="space-y-4 pt-4 border-t border-zinc-900">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      <span>Brightness</span>
                      <span className="text-[var(--pri)] font-mono">{filterBrightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={filterBrightness}
                      onChange={e => setFilterBrightness(parseInt(e.target.value))}
                      className="w-full accent-indigo-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      <span>Contrast</span>
                      <span className="text-[var(--pri)] font-mono">{filterContrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={filterContrast}
                      onChange={e => setFilterContrast(parseInt(e.target.value))}
                      className="w-full accent-indigo-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-850 flex items-center justify-between shrink-0">
              <Button
                onClick={() => {
                  setFilterBrightness(100);
                  setFilterContrast(100);
                  setCropAspect("1:1");
                  setCropShape("rect");
                  setCropPercent({ x: 0, y: 0, w: 1, h: 1 });
                }}
                className="h-9 px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-bold uppercase tracking-wider text-[10px] rounded-full border border-zinc-800"
              >
                Reset Settings
              </Button>
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setImageEditorOpen(false);
                    setImageToEdit(null);
                  }}
                  className="h-9 px-4 bg-transparent hover:bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider text-[10px] rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCropSubmit}
                  className="h-9 px-5 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-white font-bold uppercase tracking-wider text-[10px] rounded-full shadow-lg shadow-[var(--pri)]/10 border-0"
                >
                  Apply & Insert Image
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
