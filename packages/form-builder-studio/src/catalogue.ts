import { FormField, FormFieldType } from "./types";

export interface PaletteItemDefinition {
  type: FormFieldType;
  label: string;
  category: "basic" | "choice" | "identity" | "media" | "layout";
  iconName: string;
  description: string;
  defaultConfig: Partial<FormField>;
}

export const PALETTE_ITEMS: PaletteItemDefinition[] = [
  // ── Basic Inputs ──────────────────────────────────
  {
    type: "text",
    label: "Short Text",
    category: "basic",
    iconName: "Type",
    description: "Single-line text input for names, answers, or codes",
    defaultConfig: {
      label: "Short Text Question",
      placeholder: "Type your answer...",
      grid_width: "full",
    },
  },
  {
    type: "textarea",
    label: "Long Text / Area",
    category: "basic",
    iconName: "AlignLeft",
    description: "Multi-line text area for descriptions, bios, and feedback",
    defaultConfig: {
      label: "Detailed Response",
      placeholder: "Provide detailed information here...",
      grid_width: "full",
    },
  },
  {
    type: "email",
    label: "Email Address",
    category: "basic",
    iconName: "Mail",
    description: "Formatted email input with validation",
    defaultConfig: {
      label: "Email Address",
      placeholder: "attendee@example.com",
      grid_width: "half",
    },
  },
  {
    type: "phone",
    label: "Phone Number",
    category: "basic",
    iconName: "Phone",
    description: "Telephone number input with country dial-code support",
    defaultConfig: {
      label: "Phone Number",
      placeholder: "+1 (555) 000-0000",
      grid_width: "half",
    },
  },
  {
    type: "number",
    label: "Numeric Input",
    category: "basic",
    iconName: "Hash",
    description: "Number only field (years, age, quantity, count)",
    defaultConfig: {
      label: "Quantity / Value",
      placeholder: "0",
      grid_width: "half",
    },
  },
  {
    type: "date",
    label: "Date Picker",
    category: "basic",
    iconName: "Calendar",
    description: "Calendar date selector for birthdates, arrival dates, etc.",
    defaultConfig: {
      label: "Date",
      placeholder: "Select date",
      grid_width: "half",
    },
  },
  {
    type: "time",
    label: "Time Picker",
    category: "basic",
    iconName: "Clock",
    description: "Time selector for schedules and check-in slots",
    defaultConfig: {
      label: "Preferred Time",
      placeholder: "Select time",
      grid_width: "half",
    },
  },

  // ── Choice & Selection ────────────────────────────
  {
    type: "select",
    label: "Dropdown Select",
    category: "choice",
    iconName: "ChevronDown",
    description: "Single choice dropdown menu",
    defaultConfig: {
      label: "Select an Option",
      placeholder: "Choose from list...",
      options: ["Option 1", "Option 2", "Option 3"],
      grid_width: "half",
    },
  },
  {
    type: "radio",
    label: "Radio Buttons",
    category: "choice",
    iconName: "CircleDot",
    description: "Single choice visible radio list",
    defaultConfig: {
      label: "Choose One",
      options: ["Option A", "Option B", "Option C"],
      grid_width: "full",
    },
  },
  {
    type: "checkbox",
    label: "Checkboxes",
    category: "choice",
    iconName: "CheckSquare",
    description: "Multiple choice checkboxes",
    defaultConfig: {
      label: "Select All Applicable",
      options: ["Feature 1", "Feature 2", "Feature 3"],
      grid_width: "full",
    },
  },
  {
    type: "multiselect",
    label: "Multi-Select Tags",
    category: "choice",
    iconName: "ListFilter",
    description: "Searchable tag-based multi-selection",
    defaultConfig: {
      label: "Interests & Topics",
      placeholder: "Pick multiple items...",
      options: ["AI & ML", "Cloud Architecture", "Healthcare", "Design Systems"],
      grid_width: "full",
    },
  },

  // ── Identity & Location ───────────────────────────
  {
    type: "title",
    label: "Title / Prefix",
    category: "identity",
    iconName: "UserCheck",
    description: "Prefix dropdown (Dr., Prof., Mr., Ms., Mrs.)",
    defaultConfig: {
      id: "title",
      name: "title",
      label: "Title / Prefix",
      placeholder: "Select title",
      options: ["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."],
      grid_width: "third",
    },
  },
  {
    type: "country",
    label: "Country & State",
    category: "identity",
    iconName: "Globe",
    description: "Integrated country dropdown with cascading state/province",
    defaultConfig: {
      id: "country",
      name: "country",
      label: "Country & State",
      placeholder: "Select country",
      options: [],
      grid_width: "full",
    },
  },
  {
    type: "role",
    label: "Registration Role",
    category: "identity",
    iconName: "ShieldCheck",
    description: "Event registration attendee role or pass tier",
    defaultConfig: {
      id: "role",
      name: "role",
      label: "Registration Role",
      placeholder: "Select your role category",
      options: ["General Attendee", "Speaker", "Delegate", "Student", "VIP"],
      grid_width: "half",
    },
  },

  // ── Media & Rich ──────────────────────────────────
  {
    type: "file",
    label: "File Upload",
    category: "media",
    iconName: "UploadCloud",
    description: "Accept documents, PDFs, presentations, or attachments",
    defaultConfig: {
      label: "Upload Document",
      help_text: "Allowed formats: PDF, DOCX, PPTX (Up to 25MB)",
      grid_width: "full",
      validation: {
        allowed_file_types: [".pdf", ".docx", ".pptx"],
        max_file_size_mb: 25,
      },
    },
  },
  {
    type: "image",
    label: "Photo / Image Upload",
    category: "media",
    iconName: "Image",
    description: "Attendee badge photo, headshot, or passport picture",
    defaultConfig: {
      label: "Upload Headshot / Photo",
      help_text: "PNG, JPG, WEBP up to 10MB",
      grid_width: "half",
      validation: {
        allowed_file_types: [".png", ".jpg", ".jpeg", ".webp"],
        max_file_size_mb: 10,
      },
    },
  },
  {
    type: "signature",
    label: "Digital Signature",
    category: "media",
    iconName: "PenTool",
    description: "Electronic signature pad for waivers and consent",
    defaultConfig: {
      label: "Sign Here",
      help_text: "Please sign in the box using your mouse or finger",
      grid_width: "full",
    },
  },
  {
    type: "rating",
    label: "Star Rating",
    category: "media",
    iconName: "Star",
    description: "5-star rating scale for satisfaction feedback",
    defaultConfig: {
      label: "Overall Satisfaction Rating",
      grid_width: "half",
      validation: {
        min_value: 1,
        max_value: 5,
      },
    },
  },
  {
    type: "nps",
    label: "Net Promoter Score (NPS)",
    category: "media",
    iconName: "BarChart3",
    description: "0 to 10 scale: How likely are you to recommend this event?",
    defaultConfig: {
      label: "How likely are you to recommend this event to a colleague?",
      help_text: "0 = Not likely at all, 10 = Extremely likely",
      grid_width: "full",
      validation: {
        min_value: 0,
        max_value: 10,
      },
    },
  },
  {
    type: "terms",
    label: "Terms & Conditions",
    category: "media",
    iconName: "FileCheck",
    description: "Mandatory agreement checkbox with clickable terms modal",
    defaultConfig: {
      label: "I agree to the Event Terms & Privacy Policy",
      is_required: true,
      grid_width: "full",
    },
  },

  // ── Layout & Decorators ───────────────────────────
  {
    type: "section_header",
    label: "Section Header",
    category: "layout",
    iconName: "Heading",
    description: "Divide the questionnaire into distinct visual steps or sections",
    defaultConfig: {
      label: "Section Title",
      help_text: "Optional subtext or instructions for this section.",
      grid_width: "full",
      is_required: false,
    },
  },
  {
    type: "divider",
    label: "Divider Line",
    category: "layout",
    iconName: "Minus",
    description: "Visual horizontal line separator",
    defaultConfig: {
      label: "Divider",
      grid_width: "full",
      is_required: false,
    },
  },
  {
    type: "rich_text",
    label: "Rich Text / Instructions",
    category: "layout",
    iconName: "FileText",
    description: "Formatted announcement or instructions block",
    defaultConfig: {
      label: "Notice",
      help_text: "Please double check all information before finalizing your submission.",
      grid_width: "full",
      is_required: false,
    },
  },
];

export function createFieldFromPalette(item: PaletteItemDefinition, sortOrder: number): FormField {
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const id = item.defaultConfig.id || `${item.type}_${randomSuffix}`;
  const name = item.defaultConfig.name || id;

  return {
    id,
    name,
    label: item.defaultConfig.label || item.label,
    type: item.type,
    placeholder: item.defaultConfig.placeholder || "",
    help_text: item.defaultConfig.help_text || "",
    default_value: item.defaultConfig.default_value ?? null,
    is_required: item.defaultConfig.is_required ?? false,
    is_active: item.defaultConfig.is_active ?? true,
    is_default: item.defaultConfig.is_default ?? false,
    sort_order: sortOrder,
    grid_width: item.defaultConfig.grid_width || "full",
    options: item.defaultConfig.options ? [...(item.defaultConfig.options as string[])] : undefined,
    validation: item.defaultConfig.validation ? { ...item.defaultConfig.validation } : undefined,
    category: item.category,
  };
}
