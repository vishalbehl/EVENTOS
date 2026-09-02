import React, { useState, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Eye,
  Settings,
  Save,
  X,
  Type,
  AlignLeft,
  Mail,
  Phone,
  Hash,
  Calendar,
  Clock,
  ChevronDown as ChevronDownIcon,
  CircleDot,
  CheckSquare,
  ListFilter,
  UserCheck,
  Globe,
  ShieldCheck,
  UploadCloud,
  Image as ImageIcon,
  PenTool,
  Star,
  BarChart3,
  FileCheck,
  Heading,
  Minus,
  FileText,
  Monitor,
  Tablet,
  Smartphone,
  RefreshCw,
  Search,
  Sliders,
  Layers,
  ArrowLeft,
  CreditCard,
  CheckCircle2,
  FileSpreadsheet,
  Edit3,
} from "lucide-react";
import { FormField, FormSettings, FormStep, DeviceViewport, FormBuilderMode } from "../types";
import { PALETTE_ITEMS, PaletteItemDefinition, createFieldFromPalette } from "../catalogue";
import { FormRenderer } from "./FormRenderer";

// ── Palette icon renderer ──────────────────────────────────────
function renderPaletteIcon(iconName: string, className = "size-4") {
  switch (iconName) {
    case "Type": return <Type className={className} />;
    case "AlignLeft": return <AlignLeft className={className} />;
    case "Mail": return <Mail className={className} />;
    case "Phone": return <Phone className={className} />;
    case "Hash": return <Hash className={className} />;
    case "Calendar": return <Calendar className={className} />;
    case "Clock": return <Clock className={className} />;
    case "ChevronDown": return <ChevronDownIcon className={className} />;
    case "CircleDot": return <CircleDot className={className} />;
    case "CheckSquare": return <CheckSquare className={className} />;
    case "ListFilter": return <ListFilter className={className} />;
    case "UserCheck": return <UserCheck className={className} />;
    case "Globe": return <Globe className={className} />;
    case "ShieldCheck": return <ShieldCheck className={className} />;
    case "UploadCloud": return <UploadCloud className={className} />;
    case "Image": return <ImageIcon className={className} />;
    case "PenTool": return <PenTool className={className} />;
    case "Star": return <Star className={className} />;
    case "BarChart3": return <BarChart3 className={className} />;
    case "FileCheck": return <FileCheck className={className} />;
    case "Heading": return <Heading className={className} />;
    case "Minus": return <Minus className={className} />;
    case "FileText": return <FileText className={className} />;
    default: return <Type className={className} />;
  }
}

// ── Inspector sections per field type ─────────────────────────
const INSPECTOR_SECTIONS: Record<string, string[]> = {
  section_header: ["label", "help_text", "step_assignment"],
  divider: ["step_assignment"],
  rich_text: ["label", "help_text", "step_assignment"],
  text: ["label", "name", "placeholder", "help_text", "grid_width", "step_assignment"],
  email: ["label", "name", "placeholder", "help_text", "grid_width", "step_assignment"],
  phone: ["label", "name", "placeholder", "help_text", "grid_width", "step_assignment"],
  number: ["label", "name", "placeholder", "help_text", "grid_width", "step_assignment"],
  textarea: ["label", "name", "placeholder", "help_text", "step_assignment"],
  date: ["label", "name", "help_text", "grid_width", "step_assignment"],
  time: ["label", "name", "help_text", "grid_width", "step_assignment"],
  datetime: ["label", "name", "help_text", "grid_width", "step_assignment"],
  select: ["label", "name", "options", "grid_width", "step_assignment"],
  radio: ["label", "name", "options", "step_assignment"],
  checkbox: ["label", "name", "options", "step_assignment"],
  multiselect: ["label", "name", "options", "grid_width", "step_assignment"],
  role: ["label", "name", "options", "grid_width", "step_assignment"],
  title: ["label", "name", "options", "grid_width", "step_assignment"],
  country: ["label", "name", "help_text", "step_assignment"],
  state: ["label", "name", "help_text", "grid_width", "step_assignment"],
  file: ["label", "name", "help_text", "grid_width", "step_assignment"],
  image: ["label", "name", "help_text", "grid_width", "step_assignment"],
  signature: ["label", "name", "help_text", "grid_width", "step_assignment"],
  rating: ["label", "name", "help_text", "grid_width", "step_assignment"],
  nps: ["label", "name", "help_text", "step_assignment"],
  terms: ["label", "help_text", "step_assignment"],
};

function getInspectorSections(field: FormField): string[] {
  const sections = INSPECTOR_SECTIONS[field.type] ?? ["label", "name", "placeholder", "help_text", "grid_width", "step_assignment"];
  return field.is_default ? sections.filter((s) => s !== "name") : sections;
}

// ── Static field preview widget ────────────────────────────────
function FieldPreviewWidget({ field }: { field: FormField }) {
  const inputBase =
    "w-full h-9 px-3 rounded-xl text-xs border border-[var(--border-default,#3f3f46)] bg-[var(--bg-surface,#09090b)] text-[var(--text-tertiary,#71717a)] flex items-center pointer-events-none select-none";

  switch (field.type) {
    case "section_header":
      return null;

    case "divider":
      return <hr className="border-t border-[var(--border-subtle,#27272a)] my-1 pointer-events-none" />;

    case "rich_text":
      return (
        <p className="text-xs text-[var(--text-tertiary,#71717a)] italic pointer-events-none select-none">
          {field.help_text || "Informational text block"}
        </p>
      );

    case "terms":
      return (
        <div className="flex items-center gap-2.5 pointer-events-none select-none">
          <div className="size-4 rounded border-2 border-[var(--border-default,#3f3f46)] shrink-0" />
          <span className="text-xs text-[var(--text-secondary,#a1a1aa)]">I agree to the terms and conditions</span>
        </div>
      );

    case "text":
    case "email":
    case "phone":
    case "number":
      return (
        <div className={inputBase}>
          {field.placeholder || "Short answer text…"}
        </div>
      );

    case "textarea":
      return (
        <div className="w-full h-16 px-3 pt-2.5 rounded-xl text-xs border border-[var(--border-default,#3f3f46)] bg-[var(--bg-surface,#09090b)] text-[var(--text-tertiary,#71717a)] pointer-events-none select-none">
          {field.placeholder || "Long answer text…"}
        </div>
      );

    case "select":
    case "title":
    case "role":
      return (
        <div className={`${inputBase} justify-between`}>
          <span>{field.placeholder || "Choose an option"}</span>
          <ChevronDownIcon className="size-4 shrink-0" />
        </div>
      );

    case "radio": {
      const opts = ((field.options ?? ["Option 1", "Option 2"]) as (string | { label: string })[]).slice(0, 3);
      return (
        <div className="space-y-2 pointer-events-none select-none">
          {opts.map((opt, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="size-4 rounded-full border-2 border-[var(--border-default,#3f3f46)] shrink-0" />
              <span className="text-xs text-[var(--text-secondary,#a1a1aa)]">
                {typeof opt === "string" ? opt : opt.label}
              </span>
            </div>
          ))}
        </div>
      );
    }

    case "checkbox":
    case "multiselect": {
      const opts = ((field.options ?? ["Option 1", "Option 2"]) as (string | { label: string })[]).slice(0, 3);
      return (
        <div className="space-y-2 pointer-events-none select-none">
          {opts.map((opt, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="size-4 rounded border-2 border-[var(--border-default,#3f3f46)] shrink-0" />
              <span className="text-xs text-[var(--text-secondary,#a1a1aa)]">
                {typeof opt === "string" ? opt : opt.label}
              </span>
            </div>
          ))}
        </div>
      );
    }

    case "date":
      return (
        <div className={`${inputBase} justify-between`}>
          <span>MM / DD / YYYY</span>
          <Calendar className="size-4 shrink-0" />
        </div>
      );

    case "time":
      return (
        <div className={`${inputBase} justify-between`}>
          <span>HH : MM</span>
          <Clock className="size-4 shrink-0" />
        </div>
      );

    case "country":
      return (
        <div className="grid grid-cols-2 gap-2 pointer-events-none select-none">
          <div className={`${inputBase} justify-between`}>
            <span>Country</span>
            <ChevronDownIcon className="size-4 shrink-0" />
          </div>
          <div className={inputBase}>State / Region</div>
        </div>
      );

    case "rating":
      return (
        <div className="flex gap-1 pointer-events-none select-none">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} className="size-5 text-[var(--border-default,#3f3f46)]" />
          ))}
        </div>
      );

    case "nps":
      return (
        <div className="grid grid-cols-11 gap-1 pointer-events-none select-none">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
            <div
              key={s}
              className="h-7 flex items-center justify-center rounded-lg border border-[var(--border-subtle,#27272a)] text-[10px] text-[var(--text-tertiary,#71717a)]"
            >
              {s}
            </div>
          ))}
        </div>
      );

    case "file":
    case "image":
      return (
        <div className="p-3 border-2 border-dashed border-[var(--border-default,#3f3f46)] rounded-xl text-center pointer-events-none select-none">
          <UploadCloud className="size-5 text-[var(--text-tertiary,#71717a)] mx-auto mb-1" />
          <p className="text-[11px] text-[var(--text-tertiary,#71717a)]">Click or drag to upload</p>
        </div>
      );

    case "signature":
      return (
        <div className="h-16 rounded-xl border border-dashed border-[var(--border-default,#3f3f46)] flex items-center justify-center gap-1.5 pointer-events-none select-none">
          <PenTool className="size-4 text-[var(--text-tertiary,#71717a)]" />
          <span className="text-xs text-[var(--text-tertiary,#71717a)]">Sign here</span>
        </div>
      );

    default:
      return null;
  }
}

// ── Sortable Field Card (Google-Forms style) ───────────────────
interface SortableFieldCardProps {
  field: FormField;
  index: number;
  isSelected: boolean;
  onSelect: (field: FormField) => void;
  onDelete: (id: string) => void;
  onDuplicate: (field: FormField) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onUpdateField: (id: string, updates: Partial<FormField>) => void;
  isFirst: boolean;
  isLast: boolean;
}

function SortableFieldCard({
  field,
  index,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onUpdateField,
  isFirst,
  isLast,
}: SortableFieldCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const isCore = Boolean(
    field.is_default && (field.id === "first_name" || field.id === "last_name" || field.id === "email")
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-2xl border transition-all duration-150 ${
        isDragging
          ? "opacity-40 scale-[0.98] border-[var(--pri,#4f46e5)] shadow-2xl bg-[var(--bg-surface-2,#18181b)]"
          : isSelected
          ? "border-[var(--pri,#4f46e5)] shadow-lg bg-[var(--bg-surface-2,#18181b)]"
          : field.is_active
          ? "border-[var(--border-subtle,#27272a)] bg-[var(--bg-surface-2,#18181b)] hover:border-[var(--border-default,#3f3f46)] hover:shadow-md"
          : "border-[var(--border-subtle,#27272a)]/50 bg-[var(--bg-surface-2,#18181b)]/60 opacity-60"
      }`}
    >
      {/* Selected left accent bar */}
      {isSelected && !isDragging && (
        <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-[var(--pri,#4f46e5)]" />
      )}

      {/* Top bar: drag handle + badges */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-[var(--border-subtle,#27272a)]/50">
        <button
          type="button"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded cursor-grab active:cursor-grabbing text-[var(--text-tertiary,#71717a)] hover:text-[var(--text-primary,#ffffff)] hover:bg-[var(--bg-surface-3,#27272a)] transition shrink-0"
        >
          <GripVertical className="size-4" />
        </button>

        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--bg-surface-3,#27272a)] text-[var(--text-secondary,#a1a1aa)] border border-[var(--border-subtle,#27272a)]">
          Q{index + 1}
        </span>

        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--pri,#4f46e5)]/10 text-[var(--pri,#4f46e5)] border border-[var(--pri,#4f46e5)]/20">
          {field.type.replace(/_/g, " ")}
        </span>

        {field.is_default && (
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Core
          </span>
        )}
      </div>

      {/* Card body — click anywhere to select this field */}
      <div
        className="px-5 py-4 cursor-pointer space-y-3"
        onClick={() => onSelect(field)}
      >
        {/* Editable question label */}
        {field.type !== "divider" && (
          <div className="flex items-start gap-1.5">
            <input
              type="text"
              value={field.label}
              onChange={(e) => onUpdateField(field.id, { label: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="Question…"
              className="flex-1 text-sm font-semibold bg-transparent border-b border-transparent hover:border-[var(--border-default,#3f3f46)] focus:border-[var(--pri,#4f46e5)] focus:outline-none text-[var(--text-primary,#ffffff)] py-0.5 px-0.5 transition min-w-0"
            />
            {field.is_required && (
              <span className="text-rose-400 font-bold text-base leading-none mt-0.5 shrink-0">*</span>
            )}
          </div>
        )}

        {/* Field widget preview */}
        <FieldPreviewWidget field={field} />

        {/* Help text */}
        {field.help_text && (
          <p className="text-[11px] text-[var(--text-tertiary,#71717a)] italic leading-snug">
            {field.help_text}
          </p>
        )}
      </div>

      {/* Bottom action toolbar */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-[var(--border-subtle,#27272a)] bg-[var(--bg-surface-3,#27272a)]/30 rounded-b-2xl">
        {/* Duplicate */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDuplicate(field); }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)] hover:bg-[var(--bg-surface-3,#27272a)] transition cursor-pointer"
        >
          <Copy className="size-3.5" />
          <span>Duplicate</span>
        </button>

        <div className="flex-1" />

        {/* Move up / down combined control */}
        <div className="flex items-center border border-[var(--border-subtle,#27272a)] rounded-lg overflow-hidden">
          <button
            type="button"
            disabled={isFirst}
            onClick={(e) => { e.stopPropagation(); onMoveUp(index); }}
            className="px-1.5 py-1 text-[var(--text-tertiary,#71717a)] hover:text-[var(--text-primary,#ffffff)] hover:bg-[var(--bg-surface-3,#27272a)] disabled:opacity-20 disabled:cursor-not-allowed transition cursor-pointer"
            title="Move up"
          >
            <ChevronUp className="size-3" />
          </button>
          <div className="w-px h-3 bg-[var(--border-subtle,#27272a)]" />
          <button
            type="button"
            disabled={isLast}
            onClick={(e) => { e.stopPropagation(); onMoveDown(index); }}
            className="px-1.5 py-1 text-[var(--text-tertiary,#71717a)] hover:text-[var(--text-primary,#ffffff)] hover:bg-[var(--bg-surface-3,#27272a)] disabled:opacity-20 disabled:cursor-not-allowed transition cursor-pointer"
            title="Move down"
          >
            <ChevronDown className="size-3" />
          </button>
        </div>

        {/* Required toggle */}
        <button
          type="button"
          disabled={isCore}
          onClick={(e) => { e.stopPropagation(); onUpdateField(field.id, { is_required: !field.is_required }); }}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
            field.is_required
              ? "bg-[var(--pri,#4f46e5)]/20 border-[var(--pri,#4f46e5)]/50 text-[var(--pri,#4f46e5)]"
              : "bg-[var(--bg-surface-3,#27272a)] border-[var(--border-default,#3f3f46)] text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)]"
          } ${isCore ? "opacity-50 cursor-not-allowed" : ""}`}
          title={field.is_required ? "Field is required" : "Field is optional"}
        >
          {field.is_required ? "Required" : "Optional"}
        </button>

        {/* Visible toggle */}
        <button
          type="button"
          disabled={isCore}
          onClick={(e) => { e.stopPropagation(); onUpdateField(field.id, { is_active: !field.is_active }); }}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
            field.is_active
              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
              : "bg-[var(--bg-surface-3,#27272a)] border-[var(--border-default,#3f3f46)] text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)]"
          } ${isCore ? "opacity-50 cursor-not-allowed" : ""}`}
          title={field.is_active ? "Field is visible" : "Field is hidden"}
        >
          {field.is_active ? "Visible" : "Hidden"}
        </button>

        {/* Delete (only for non-default fields) */}
        {!field.is_default && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(field.id); }}
            className="p-1.5 rounded-lg text-[var(--text-tertiary,#71717a)] hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            title="Delete field"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}

        {/* Inspector toggle */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(field); }}
          className={`p-1.5 rounded-lg transition cursor-pointer ${
            isSelected
              ? "bg-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] shadow-xs font-bold"
              : "text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)] hover:bg-[var(--bg-surface-3,#27272a)]"
          }`}
          title="Configure field settings"
        >
          <Settings className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── DragOverlay ghost card ─────────────────────────────────────
function DragGhostCard({ field, index }: { field: FormField; index: number }) {
  return (
    <div className="rounded-2xl border-2 border-[var(--pri,#4f46e5)] bg-[var(--bg-surface-2,#18181b)] shadow-2xl p-4 opacity-95 rotate-1">
      <div className="flex items-center gap-2">
        <GripVertical className="size-4 text-[var(--pri,#4f46e5)]" />
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--bg-surface-3,#27272a)] text-[var(--text-secondary,#a1a1aa)]">
          Q{index + 1}
        </span>
        <span className="text-xs font-semibold text-[var(--text-primary,#ffffff)] truncate">
          {field.label || "Untitled field"}
        </span>
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[var(--pri,#4f46e5)]/20 text-[var(--pri,#4f46e5)] ml-auto shrink-0">
          {field.type.replace(/_/g, " ")}
        </span>
      </div>
    </div>
  );
}

// ── Main Studio Component ──────────────────────────────────────
export interface FormBuilderStudioProps {
  initialFields?: FormField[];
  initialSettings?: FormSettings;
  templateName?: string;
  categoryName?: string;
  isLive?: boolean;
  mode?: FormBuilderMode;
  onSave?: (data: { fields: FormField[]; settings: FormSettings; is_live: boolean }) => Promise<void> | void;
  onBack?: () => void;
  onBrowseTemplates?: () => void;
}

export function FormBuilderStudio({
  initialFields = [],
  initialSettings = {},
  templateName = "Untitled Form",
  categoryName = "Registration Form",
  isLive: initialIsLive = true,
  mode = "organiser-portal",
  onSave,
  onBack,
  onBrowseTemplates,
}: FormBuilderStudioProps) {
  const isRegistrationForm = categoryName.toLowerCase().includes("registration");

  // Multi-step state
  const [steps, setSteps] = useState<FormStep[]>(() => {
    if (initialSettings.steps && initialSettings.steps.length > 0) {
      return initialSettings.steps;
    }
    return [{ id: "step_1", title: "Questions & Details" }];
  });

  const [activeStepIndex, setActiveStepIndex] = useState(0);

  // Form feature options toggles (Terms & Preview default ON; Payment default ON for Registration)
  const [enableTerms, setEnableTerms] = useState<boolean>(
    initialSettings.enable_terms !== undefined ? initialSettings.enable_terms : true
  );
  const [enablePreview, setEnablePreview] = useState<boolean>(
    initialSettings.enable_preview !== undefined ? initialSettings.enable_preview : true
  );
  const [enablePayment, setEnablePayment] = useState<boolean>(
    initialSettings.enable_payment !== undefined ? initialSettings.enable_payment : isRegistrationForm
  );

  const [fields, setFields] = useState<FormField[]>(() =>
    initialFields.map((f, idx) => ({
      ...f,
      sort_order: f.sort_order ?? idx,
      step_index: f.step_index ?? 0,
    }))
  );

  const [settings, setSettings] = useState<FormSettings>({
    ...initialSettings,
    enable_terms: enableTerms,
    enable_preview: enablePreview,
    enable_payment: enablePayment,
    steps,
  });

  const [isLive, setIsLive] = useState(initialIsLive);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [paletteCategory, setPaletteCategory] = useState<string>("all");
  const [paletteSearch, setPaletteSearch] = useState("");
  const [deviceViewport, setDeviceViewport] = useState<DeviceViewport>("desktop");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Active step's fields for canvas sortable context
  const currentStepFields = useMemo(() => {
    return fields.filter((f) => (f.step_index ?? 0) === activeStepIndex);
  }, [fields, activeStepIndex]);

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedFieldId) ?? null,
    [fields, selectedFieldId]
  );

  const activeDragField = useMemo(
    () => (activeDragId ? fields.find((f) => f.id === activeDragId) ?? null : null),
    [activeDragId, fields]
  );

  const activeDragIndex = useMemo(
    () => (activeDragId ? currentStepFields.findIndex((f) => f.id === activeDragId) : -1),
    [activeDragId, currentStepFields]
  );

  const inspectorSections = useMemo(
    () => (selectedField ? getInspectorSections(selectedField) : []),
    [selectedField]
  );

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (over && active.id !== over.id) {
      const oldIndexInStep = currentStepFields.findIndex((item) => item.id === active.id);
      const newIndexInStep = currentStepFields.findIndex((item) => item.id === over.id);
      const reorderedStepFields = arrayMove(currentStepFields, oldIndexInStep, newIndexInStep);

      // Reconstruct full fields array preserving other step fields
      setFields((prev) => {
        const otherStepFields = prev.filter((f) => (f.step_index ?? 0) !== activeStepIndex);
        const combined = [...otherStepFields, ...reorderedStepFields];
        return combined.map((item, idx) => ({ ...item, sort_order: idx }));
      });
    }
  };

  const handleMoveUp = (indexInStep: number) => {
    if (indexInStep === 0) return;
    const reorderedStepFields = arrayMove(currentStepFields, indexInStep, indexInStep - 1);
    setFields((prev) => {
      const otherStepFields = prev.filter((f) => (f.step_index ?? 0) !== activeStepIndex);
      return [...otherStepFields, ...reorderedStepFields].map((item, idx) => ({ ...item, sort_order: idx }));
    });
  };

  const handleMoveDown = (indexInStep: number) => {
    if (indexInStep >= currentStepFields.length - 1) return;
    const reorderedStepFields = arrayMove(currentStepFields, indexInStep, indexInStep + 1);
    setFields((prev) => {
      const otherStepFields = prev.filter((f) => (f.step_index ?? 0) !== activeStepIndex);
      return [...otherStepFields, ...reorderedStepFields].map((item, idx) => ({ ...item, sort_order: idx }));
    });
  };

  const handleAddFieldFromPalette = (paletteItem: PaletteItemDefinition) => {
    const newField = createFieldFromPalette(paletteItem, fields.length);
    newField.step_index = activeStepIndex;
    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);
  };

  const handleUpdateField = (id: string, updates: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleDeleteField = (id: string) => {
    setFields((prev) =>
      prev.filter((f) => f.id !== id).map((item, idx) => ({ ...item, sort_order: idx }))
    );
    if (selectedFieldId === id) setSelectedFieldId(null);
  };

  const handleDuplicateField = (field: FormField) => {
    const suffix = Math.random().toString(36).substring(2, 7);
    const newField: FormField = {
      ...field,
      id: `${field.type}_${suffix}`,
      name: `${field.name}_copy`,
      label: `${field.label} (Copy)`,
      is_default: false,
      sort_order: fields.length,
      step_index: activeStepIndex,
    };
    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);
  };

  // ── Step manipulation handlers ─────────────────────────────
  const handleAddStep = () => {
    const newStepNum = steps.length + 1;
    const newStep: FormStep = {
      id: `step_${Date.now()}`,
      title: `Step ${newStepNum}: Additional Info`,
    };
    const nextSteps = [...steps, newStep];
    setSteps(nextSteps);
    setActiveStepIndex(nextSteps.length - 1);
  };

  const handleRenameStep = (stepIdx: number, newTitle: string) => {
    setSteps((prev) =>
      prev.map((s, idx) => (idx === stepIdx ? { ...s, title: newTitle } : s))
    );
  };

  const handleDeleteStep = (stepIdx: number) => {
    if (steps.length <= 1) return;
    const nextSteps = steps.filter((_, idx) => idx !== stepIdx);
    // Move any fields from this step to Step 1 (index 0)
    setFields((prev) =>
      prev.map((f) => {
        const curIdx = f.step_index ?? 0;
        if (curIdx === stepIdx) return { ...f, step_index: 0 };
        if (curIdx > stepIdx) return { ...f, step_index: curIdx - 1 };
        return f;
      })
    );
    setSteps(nextSteps);
    setActiveStepIndex(Math.max(0, stepIdx - 1));
  };

  const handleSave = async () => {
    if (onSave) {
      setSaving(true);
      try {
        const mergedSettings: FormSettings = {
          ...settings,
          enable_terms: enableTerms,
          enable_preview: enablePreview,
          enable_payment: enablePayment,
          steps,
        };
        await onSave({ fields, settings: mergedSettings, is_live: isLive });
      } finally {
        setSaving(false);
      }
    }
  };

  const filteredPaletteItems = useMemo(
    () =>
      PALETTE_ITEMS.filter((item) => {
        const matchesCategory = paletteCategory === "all" || item.category === paletteCategory;
        const matchesSearch =
          paletteSearch.trim() === "" ||
          item.label.toLowerCase().includes(paletteSearch.toLowerCase()) ||
          item.description.toLowerCase().includes(paletteSearch.toLowerCase());
        return matchesCategory && matchesSearch;
      }),
    [paletteCategory, paletteSearch]
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-surface,#09090b)] text-[var(--text-primary,#ffffff)] overflow-hidden">
      {/* ── Top Header Toolbar ─────────────────────────────────── */}
      <header className="h-14 border-b border-[var(--border-subtle,#27272a)] px-4 flex items-center justify-between shrink-0 bg-[var(--bg-surface-2,#18181b)]">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded-lg border border-[var(--border-subtle,#27272a)] hover:bg-[var(--bg-surface-3,#1b1b1d)] text-[var(--text-secondary,#a1a1aa)] transition cursor-pointer"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[var(--text-primary,#ffffff)] truncate">{templateName}</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--pri,#4f46e5)]/10 text-[var(--pri,#4f46e5)] border border-[var(--pri,#4f46e5)]/20">
                {categoryName}
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-tertiary,#71717a)]">
              {fields.length} questions • {steps.length} page step{steps.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Center Viewport Switcher */}
        <div className="hidden md:flex items-center bg-[var(--bg-surface-3,#1b1b1d)] border border-[var(--border-subtle,#27272a)] rounded-xl p-0.5">
          {(
            [
              { id: "desktop", icon: <Monitor className="size-3.5" />, title: "Desktop" },
              { id: "tablet", icon: <Tablet className="size-3.5" />, title: "Tablet (768px)" },
              { id: "mobile", icon: <Smartphone className="size-3.5" />, title: "Mobile (375px)" },
            ] as const
          ).map((vp) => (
            <button
              key={vp.id}
              type="button"
              onClick={() => setDeviceViewport(vp.id)}
              title={vp.title}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                deviceViewport === vp.id
                  ? "bg-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] shadow-xs font-bold"
                  : "text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)]"
              }`}
            >
              {vp.icon}
            </button>
          ))}
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Live / Draft toggle */}
          <button
            type="button"
            onClick={() => setIsLive(!isLive)}
            className={`h-8 px-3 rounded-full text-xs font-semibold transition-all flex items-center gap-2 border cursor-pointer ${
              isLive
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
            }`}
          >
            <span className={`size-2 rounded-full ${isLive ? "bg-emerald-500 animate-ping" : "bg-amber-500"}`} />
            {isLive ? "Form Live" : "Draft Mode"}
          </button>

          {onBrowseTemplates && (
            <button
              type="button"
              onClick={onBrowseTemplates}
              className="h-8 px-3 text-xs font-semibold rounded-xl border border-[var(--border-subtle,#27272a)] hover:bg-[var(--bg-surface-3,#1b1b1d)] text-[var(--text-primary,#ffffff)] flex items-center gap-1.5 cursor-pointer transition"
            >
              <Layers className="size-3.5 text-[var(--pri,#4f46e5)]" />
              <span>Templates</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setPreviewOpen(!previewOpen)}
            className={`h-8 px-3 text-xs font-semibold rounded-xl border transition flex items-center gap-1.5 cursor-pointer ${
              previewOpen
                ? "bg-[var(--pri,#4f46e5)]/20 border-[var(--pri,#4f46e5)] text-[var(--pri,#4f46e5)]"
                : "border-[var(--border-subtle,#27272a)] hover:bg-[var(--bg-surface-3,#1b1b1d)] text-[var(--text-primary,#ffffff)]"
            }`}
          >
            <Eye className="size-3.5 text-[var(--pri,#4f46e5)]" />
            <span>{previewOpen ? "Back to Editor" : "Preview"}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-8 px-4 text-xs font-bold rounded-xl bg-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] hover:opacity-90 shadow-md flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
          >
            {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            <span>{saving ? "Saving…" : "Save Layout"}</span>
          </button>
        </div>
      </header>

      {/* ── Feature Toggles Bar (Terms & Conditions, Preview, Payment) ── */}
      <div className="h-10 border-b border-[var(--border-subtle,#27272a)] px-4 bg-[var(--bg-surface-3,#1b1b1d)]/50 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary,#71717a)]">
            Form Features:
          </span>

          {/* Terms & Conditions toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={enableTerms}
              onChange={(e) => setEnableTerms(e.target.checked)}
              className="accent-[var(--pri,#4f46e5)] rounded"
            />
            <span className="text-[11px] font-semibold text-[var(--text-secondary,#a1a1aa)]">
              Terms & Conditions
            </span>
          </label>

          {/* Preview Step toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={enablePreview}
              onChange={(e) => setEnablePreview(e.target.checked)}
              className="accent-[var(--pri,#4f46e5)] rounded"
            />
            <span className="text-[11px] font-semibold text-[var(--text-secondary,#a1a1aa)]">
              Summary Preview
            </span>
          </label>

          {/* Payment Gate toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={enablePayment}
              onChange={(e) => setEnablePayment(e.target.checked)}
              className="accent-[var(--pri,#4f46e5)] rounded"
            />
            <span className="text-[11px] font-semibold text-[var(--text-secondary,#a1a1aa)] flex items-center gap-1">
              <CreditCard className="size-3 text-emerald-400" />
              Payment Checkout
            </span>
          </label>
        </div>

        <div className="text-[10px] text-[var(--text-tertiary,#71717a)] font-mono">
          {enableTerms && "✓ T&C"} {enablePreview && "• ✓ Preview"} {enablePayment && "• ✓ Payment"}
        </div>
      </div>

      {/* ── Studio Body ────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left Palette ──────────────────────────────────────── */}
        {!previewOpen && (
          <aside className="w-72 border-r border-[var(--border-subtle,#27272a)] bg-[var(--bg-surface-2,#18181b)] flex flex-col shrink-0">
            <div className="p-3 border-b border-[var(--border-subtle,#27272a)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                  Add Components
                </span>
                <span className="text-[10px] text-[var(--text-tertiary,#71717a)] font-mono">
                  {filteredPaletteItems.length} items
                </span>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="size-3.5 absolute left-2.5 top-2.5 text-[var(--text-tertiary,#71717a)]" />
                <input
                  type="text"
                  placeholder="Search field types…"
                  value={paletteSearch}
                  onChange={(e) => setPaletteSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-2 text-xs rounded-xl bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-[var(--text-primary,#ffffff)] placeholder:text-[var(--text-tertiary,#71717a)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                />
              </div>

              {/* Category pills */}
              <div className="flex flex-wrap gap-1">
                {[
                  { id: "all", label: "All" },
                  { id: "basic", label: "Inputs" },
                  { id: "choice", label: "Choice" },
                  { id: "identity", label: "Profile" },
                  { id: "media", label: "Media" },
                  { id: "layout", label: "Layout" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setPaletteCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      paletteCategory === cat.id
                        ? "bg-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] shadow-xs"
                        : "bg-[var(--bg-surface-3,#1b1b1d)] border border-[var(--border-subtle,#27272a)] text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)] hover:border-[var(--border-default,#3f3f46)]"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Palette items */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {filteredPaletteItems.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => handleAddFieldFromPalette(item)}
                  className="w-full text-left p-2.5 rounded-xl border border-[var(--border-subtle,#27272a)] bg-[var(--bg-surface-3,#1b1b1d)]/50 hover:bg-[var(--bg-surface-3,#1b1b1d)] hover:border-[var(--pri,#4f46e5)]/60 transition group cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="size-8 rounded-lg bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)] flex items-center justify-center text-[var(--pri,#4f46e5)] group-hover:scale-105 transition shrink-0">
                      {renderPaletteIcon(item.iconName)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary,#ffffff)] truncate">{item.label}</p>
                      <p className="text-[10px] text-[var(--text-tertiary,#71717a)] truncate">{item.description}</p>
                    </div>
                  </div>
                  <Plus className="size-4 text-[var(--text-tertiary,#71717a)] group-hover:text-[var(--pri,#4f46e5)] shrink-0 transition" />
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* ── Center Canvas ──────────────────────────────────────── */}
        <main className="flex-1 bg-[var(--bg-surface,#09090b)] overflow-y-auto min-h-0 p-6 flex flex-col items-center">
          <div
            className={`w-full transition-all ${
              deviceViewport === "mobile" ? "max-w-sm" : deviceViewport === "tablet" ? "max-w-2xl" : "max-w-3xl"
            }`}
          >
            {previewOpen ? (
              /* ── Interactive Preview ── */
              <div className="p-6 rounded-2xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)] shadow-2xl space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary,#ffffff)]">{templateName}</h3>
                  <p className="text-xs text-[var(--text-secondary,#a1a1aa)] mt-1">
                    Interactive multi-step registration preview.
                  </p>
                </div>
                <FormRenderer
                  fields={fields}
                  settings={{
                    ...settings,
                    enable_terms: enableTerms,
                    enable_preview: enablePreview,
                    enable_payment: enablePayment,
                    steps,
                  }}
                  previewMode={true}
                />
              </div>
            ) : (
              /* ── Multi-Step Drag & Drop Editor ── */
              <div className="space-y-4">
                {/* ── Step Tabs Header Bar (Renamable Steps) ── */}
                <div className="p-3 bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)] rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                      Form Page Stepper ({steps.length} Step{steps.length > 1 ? "s" : ""})
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary,#71717a)]">
                      Click tab to switch page • Edit step name below
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {steps.map((st, idx) => {
                      const isActive = activeStepIndex === idx;
                      const stepCount = fields.filter((f) => (f.step_index ?? 0) === idx).length;
                      return (
                        <div
                          key={st.id || idx}
                          onClick={() => setActiveStepIndex(idx)}
                          className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer shrink-0 ${
                            isActive
                              ? "bg-[var(--pri,#f4f4f5)] border-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] shadow-sm"
                              : "bg-[var(--bg-surface-3,#1b1b1d)] border-[var(--border-subtle,#27272a)] text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)] hover:border-[var(--border-default,#3f3f46)]"
                          }`}
                        >
                          <span className={`size-4 rounded-full flex items-center justify-center text-[9px] font-mono ${
                            isActive ? "bg-[var(--primary-contrast,#09090b)] text-[var(--pri,#f4f4f5)]" : "bg-[var(--bg-surface-2,#18181b)] text-[var(--text-secondary,#a1a1aa)]"
                          }`}>
                            {idx + 1}
                          </span>

                          <input
                            type="text"
                            value={st.title}
                            onChange={(e) => handleRenameStep(idx, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-transparent border-b border-transparent hover:border-current focus:border-current focus:outline-none py-0 px-0.5 text-xs font-bold max-w-[140px] truncate"
                            placeholder={`Step ${idx + 1}`}
                          />

                          <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                            isActive ? "bg-black/10" : "bg-white/10"
                          }`}>
                            {stepCount} Q
                          </span>

                          {steps.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteStep(idx);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-400 transition"
                              title="Delete Step"
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Add Step Button */}
                    <button
                      type="button"
                      onClick={handleAddStep}
                      className="px-3 py-1.5 rounded-xl border border-dashed border-[var(--border-default,#3f3f46)] hover:border-[var(--pri,#4f46e5)] hover:bg-[var(--pri,#4f46e5)]/10 text-xs font-semibold text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--pri,#4f46e5)] flex items-center gap-1 transition cursor-pointer shrink-0"
                    >
                      <Plus className="size-3" />
                      <span>Add Page Step</span>
                    </button>

                    {/* Built-in summary step preview */}
                    {enablePreview && (
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold shrink-0">
                        <CheckCircle2 className="size-3" />
                        <span>Summary & T&C</span>
                      </div>
                    )}

                    {/* Built-in payment step preview */}
                    {enablePayment && (
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--pri,#4f46e5)]/10 border border-[var(--pri,#4f46e5)]/20 text-[var(--pri,#4f46e5)] text-[10px] font-bold shrink-0">
                        <CreditCard className="size-3" />
                        <span>Payment</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step Subtitle / Question count */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                    {steps[activeStepIndex]?.title || `Step ${activeStepIndex + 1}`} ({currentStepFields.length} Question{currentStepFields.length !== 1 ? "s" : ""})
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary,#71717a)]">
                    Drag the grip handle to reorder questions within this step
                  </span>
                </div>

                {currentStepFields.length === 0 ? (
                  <div className="p-12 border-2 border-dashed border-[var(--border-subtle,#27272a)] rounded-2xl text-center space-y-3 bg-[var(--bg-surface-2,#18181b)]">
                    <Layers className="size-10 text-[var(--pri,#4f46e5)]/50 mx-auto" />
                    <h4 className="text-sm font-bold text-[var(--text-primary,#ffffff)]">
                      {steps[activeStepIndex]?.title || `Step ${activeStepIndex + 1}`} has no questions
                    </h4>
                    <p className="text-xs text-[var(--text-secondary,#a1a1aa)] max-w-sm mx-auto">
                      Click any component on the left palette to add questions to this step, or move fields here using Field Settings.
                    </p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={currentStepFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
                        {currentStepFields.map((field, idx) => (
                          <SortableFieldCard
                            key={field.id}
                            field={field}
                            index={idx}
                            isSelected={selectedFieldId === field.id}
                            onSelect={(f) => setSelectedFieldId(f.id)}
                            onDelete={handleDeleteField}
                            onDuplicate={handleDuplicateField}
                            onMoveUp={handleMoveUp}
                            onMoveDown={handleMoveDown}
                            onUpdateField={handleUpdateField}
                            isFirst={idx === 0}
                            isLast={idx === currentStepFields.length - 1}
                          />
                        ))}
                      </div>
                    </SortableContext>

                    {/* DragOverlay ghost */}
                    <DragOverlay>
                      {activeDragField ? (
                        <DragGhostCard field={activeDragField} index={activeDragIndex} />
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                )}
              </div>
            )}
          </div>
        </main>

        {/* ── Right Inspector Panel ─────────────────────────────── */}
        {!previewOpen && selectedField && (
          <aside className="w-80 border-l border-[var(--border-subtle,#27272a)] bg-[var(--bg-surface-2,#18181b)] flex flex-col shrink-0">
            {/* Inspector header */}
            <div className="h-12 border-b border-[var(--border-subtle,#27272a)] px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Sliders className="size-4 text-[var(--pri,#4f46e5)]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary,#ffffff)]">
                  Field Settings
                </span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[var(--pri,#4f46e5)]/10 text-[var(--pri,#4f46e5)] border border-[var(--pri,#4f46e5)]/20">
                  {selectedField.type.replace(/_/g, " ")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFieldId(null)}
                className="p-1 rounded-lg text-[var(--text-tertiary,#71717a)] hover:text-[var(--text-primary,#ffffff)] hover:bg-[var(--bg-surface-3,#1b1b1d)] cursor-pointer transition"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Inspector body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Question / Display Label */}
              {inspectorSections.includes("label") && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                    Question / Display Label
                  </label>
                  <input
                    type="text"
                    value={selectedField.label}
                    onChange={(e) => handleUpdateField(selectedField.id, { label: e.target.value })}
                    className="w-full h-8 px-2.5 rounded-xl bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                    placeholder="Enter question text…"
                  />
                </div>
              )}

              {/* Step Assignment (Move question between steps) */}
              {steps.length > 1 && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                    Page Step
                  </label>
                  <select
                    value={selectedField.step_index ?? 0}
                    onChange={(e) => handleUpdateField(selectedField.id, { step_index: Number(e.target.value) })}
                    className="w-full h-8 px-2.5 rounded-xl bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                  >
                    {steps.map((st, idx) => (
                      <option key={st.id || idx} value={idx} className="bg-zinc-900 text-white">
                        {st.title} (Step {idx + 1})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Variable Identifier */}
              {inspectorSections.includes("name") && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                    Variable Identifier
                  </label>
                  <input
                    type="text"
                    disabled={selectedField.is_default}
                    value={selectedField.name}
                    onChange={(e) =>
                      handleUpdateField(selectedField.id, {
                        name: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                      })
                    }
                    className={`w-full h-8 px-2.5 rounded-xl font-mono text-[11px] bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none ${
                      selectedField.is_default ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    placeholder="field_name"
                  />
                </div>
              )}

              {/* Placeholder */}
              {inspectorSections.includes("placeholder") && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                    Placeholder Text
                  </label>
                  <input
                    type="text"
                    value={selectedField.placeholder || ""}
                    onChange={(e) => handleUpdateField(selectedField.id, { placeholder: e.target.value })}
                    className="w-full h-8 px-2.5 rounded-xl bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                    placeholder="e.g. Enter your answer…"
                  />
                </div>
              )}

              {/* Help Text */}
              {inspectorSections.includes("help_text") && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                    Help Text / Description
                  </label>
                  <textarea
                    rows={2}
                    value={selectedField.help_text || ""}
                    onChange={(e) => handleUpdateField(selectedField.id, { help_text: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none resize-none"
                    placeholder="Optional guidance shown below the field…"
                  />
                </div>
              )}



              {/* Options editor */}
              {inspectorSections.includes("options") && (
                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle,#27272a)]">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                      Answer Options
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const currentOpts = (selectedField.options as string[]) || [];
                        handleUpdateField(selectedField.id, {
                          options: [...currentOpts, `Option ${currentOpts.length + 1}`],
                        });
                      }}
                      className="text-[10px] font-bold text-[var(--pri,#4f46e5)] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="size-3" />
                      Add Option
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {((selectedField.options as string[]) || []).map((opt, optIdx) => (
                      <div key={optIdx} className="flex items-center gap-1.5">
                        <div className="shrink-0 text-[var(--text-tertiary,#71717a)]">
                          {selectedField.type === "radio" ? (
                            <div className="size-3.5 rounded-full border-2 border-[var(--border-default,#3f3f46)]" />
                          ) : (
                            <div className="size-3.5 rounded border-2 border-[var(--border-default,#3f3f46)]" />
                          )}
                        </div>
                        <input
                          type="text"
                          value={typeof opt === "string" ? opt : (opt as any).label}
                          onChange={(e) => {
                            const updated = [...((selectedField.options as string[]) || [])];
                            updated[optIdx] = e.target.value;
                            handleUpdateField(selectedField.id, { options: updated });
                          }}
                          className="flex-1 h-7 px-2 text-xs rounded-lg bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                          placeholder={`Option ${optIdx + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = ((selectedField.options as string[]) || []).filter((_, i) => i !== optIdx);
                            handleUpdateField(selectedField.id, { options: updated });
                          }}
                          className="p-1 rounded text-[var(--text-tertiary,#71717a)] hover:text-rose-400 cursor-pointer transition"
                          title="Remove option"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}

                    {((selectedField.options as string[]) || []).length === 0 && (
                      <p className="text-[11px] text-[var(--text-tertiary,#71717a)] italic py-2 text-center">
                        No options yet — click Add Option to start.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
