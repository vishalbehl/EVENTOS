"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Globe, AlertCircle, Calendar, CheckCircle2, ChevronRight, 
  Upload, FileText, Check, Copy, ArrowLeft, ArrowRight, ShieldCheck, 
  MapPin, Loader2, Sparkles, Building, User, Mail, Phone, Map, Users
} from "lucide-react";
import { toast } from "sonner";

interface FormField {
  id: string;
  name: string;
  label: string;
  type: string; // text, date, select, checkbox, file, image
  is_default: boolean;
  is_required: boolean;
  is_active: boolean;
  options?: string[];
  placeholder?: string;
}

interface FormConfig {
  event_name: string;
  theme_color: string;
  logo_url?: string;
  is_live: boolean;
  fields: FormField[];
}

export default function PublicRegistrationPortal() {
  const { eventId } = useParams();
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [config, setConfig] = useState<FormConfig | null>(null);

  // Form submission state
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  
  // Registration success state
  const [successData, setSuccessData] = useState<{
    regno: string;
    name: string;
    role: string;
    message: string;
    status?: string;
    waitlist_position?: number;
  } | null>(null);

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (eventId) {
      fetchFormConfig();
    }
  }, [eventId]);

  const fetchFormConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/portal/registration/${eventId}/form?t=${Date.now()}`, {
        cache: "no-store"
      });
      if (!res.ok) {
        throw new Error("Failed to fetch event registration form.");
      }
      const data: FormConfig = await res.json();
      setConfig(data);
      
      // Initialize default values
      const initialForm: Record<string, any> = {};
      data.fields.forEach(f => {
        if (f.is_active) {
          if (f.type === "checkbox") {
            initialForm[f.id] = [];
          } else if (f.type === "select") {
            initialForm[f.id] = f.options && f.options.length > 0 ? f.options[0] : "";
          } else {
            initialForm[f.id] = "";
          }
        }
      });
      setFormData(initialForm);
    } catch (err: any) {
      console.error(err);
      toast.error("Could not fetch registration form. Please check the URL.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (fieldId: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const handleCheckboxChange = (fieldId: string, option: string, checked: boolean) => {
    const current = formData[fieldId] || [];
    let updated: string[];
    if (checked) {
      updated = [...current, option];
    } else {
      updated = current.filter((o: string) => o !== option);
    }
    handleInputChange(fieldId, updated);
  };

  // Upload file to backend storage
  const handleFileUpload = async (fieldId: string, file: File) => {
    setUploadingField(fieldId);
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);

      const res = await fetch(`${apiBase}/api/v1/portal/registration/${eventId}/upload`, {
        method: "POST",
        body: uploadForm
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = await res.json();
      if (data.status === "success" && data.url) {
        handleInputChange(fieldId, data.url);
        toast.success(`Uploaded ${file.name} successfully!`);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error(err);
      toast.error("File upload failed. Please try again.");
    } finally {
      setUploadingField(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    // Validate required fields
    const missingFields: string[] = [];
    config.fields.forEach(field => {
      if (field.is_active && field.is_required) {
        const val = formData[field.id];
        if (val === undefined || val === null || (typeof val === "string" && !val.trim()) || (Array.isArray(val) && val.length === 0)) {
          missingFields.push(field.label);
        }
        // Validate state for country type
        if (field.type === "country" || field.id === "country") {
          const stateVal = formData[`${field.id}_state`];
          if (!stateVal || (typeof stateVal === "string" && !stateVal.trim())) {
            missingFields.push(`${field.label} State/Province`);
          }
        }
      }
    });

    if (missingFields.length > 0) {
      toast.error(`Please fill in the required fields: ${missingFields.join(", ")}`);
      return;
    }

    // Format validation
    let validationError = "";
    config.fields.forEach(field => {
      if (field.is_active) {
        const val = formData[field.id];
        if (val && typeof val === "string" && val.trim()) {
          const stripped = val.trim();
          if (field.type === "email" || field.id === "email") {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(stripped)) {
              validationError = `Please enter a valid email address for '${field.label}'.`;
            }
          } else if (field.type === "phone" || field.id === "phone") {
            const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
            if (!phoneRegex.test(stripped)) {
              validationError = `Please enter a valid phone number for '${field.label}'.`;
            }
          }
        }
      }
    });

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/portal/registration/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.detail || "Registration failed.");
      }

      setSuccessData({
        regno: result.regno,
        name: result.name,
        role: result.role,
        message: result.message,
        status: result.status,
        waitlist_position: result.waitlist_position
      });
      toast.success(result.status === "waitlisted" ? "Added to waitlist!" : "Registration submitted!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Something went wrong during registration.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyRegNo = () => {
    if (!successData) return;
    navigator.clipboard.writeText(successData.regno);
    setCopied(true);
    toast.success("Registration number copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const getFieldIcon = (fieldId: string) => {
    switch (fieldId) {
      case "name": return <User className="h-4 w-4 text-indigo-400" />;
      case "email": return <Mail className="h-4 w-4 text-indigo-400" />;
      case "phone": return <Phone className="h-4 w-4 text-indigo-400" />;
      case "company": return <Building className="h-4 w-4 text-indigo-400" />;
      case "designation": return <Sparkles className="h-4 w-4 text-indigo-400" />;
      case "country": return <Map className="h-4 w-4 text-indigo-400" />;
      case "role": return <Users className="h-4 w-4 text-indigo-400" />;
      default: return null;
    }
  };

  // Render Skeleton Loaders
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-xl space-y-6">
          <div className="h-8 bg-white/5 animate-pulse rounded-xl w-1/3 mx-auto" />
          <div className="h-32 bg-white/5 animate-pulse rounded-[2.5rem]" />
          <div className="space-y-4">
            <div className="h-12 bg-white/5 animate-pulse rounded-xl" />
            <div className="h-12 bg-white/5 animate-pulse rounded-xl" />
            <div className="h-12 bg-white/5 animate-pulse rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Render Portal Inactive state
  if (!config || !config.is_live) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-3d p-10 max-w-md text-center border-rose-500/10 rounded-[2.5rem] bg-indigo-950/5 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="h-20 w-20 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-10 w-10 text-rose-400 animate-pulse" />
          </div>
          <h1 className="text-2xl font-black mb-4 text-[#E8EAFF] uppercase tracking-tighter">Registration Closed</h1>
          <p className="text-muted font-bold text-sm mb-6 leading-relaxed">
            The registration portal for <span className="text-indigo-400">{config?.event_name || "this event"}</span> is currently inactive or draft.
          </p>
          <div className="text-[10px] font-black text-muted uppercase tracking-[0.4em] opacity-40">
            EventOS Intelligence Desk
          </div>
        </motion.div>
      </div>
    );
  }

  // Render Success receipt Screen
  if (successData) {
    const isWaitlisted = successData.status === "waitlisted";
    const isSubmitted = successData.status === "submitted";

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`glass-3d p-10 max-w-lg w-full text-center rounded-[3rem] bg-[#0d0e1b]/80 relative overflow-hidden space-y-8 border ${
            isWaitlisted 
              ? "border-amber-500/20" 
              : isSubmitted 
                ? "border-indigo-500/20" 
                : "border-emerald-500/20"
          }`}
        >
          <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${
            isWaitlisted 
              ? "bg-amber-500/10" 
              : isSubmitted 
                ? "bg-indigo-500/10" 
                : "bg-emerald-500/10"
          }`} />
          
          <div className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto border ${
            isWaitlisted 
              ? "bg-amber-500/10 border-amber-500/20" 
              : isSubmitted 
                ? "bg-indigo-500/10 border-indigo-500/20" 
                : "bg-emerald-500/10 border-emerald-500/20"
          }`}>
            {isWaitlisted ? (
              <AlertCircle className="h-10 w-10 text-amber-400 animate-pulse" />
            ) : isSubmitted ? (
              <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
            ) : (
              <CheckCircle2 className="h-10 w-10 text-emerald-400 animate-bounce" />
            )}
          </div>

          <div className="space-y-2">
            <span className={`text-[9px] font-black uppercase tracking-[0.3em] block ${
              isWaitlisted 
                ? "text-amber-400" 
                : isSubmitted 
                  ? "text-indigo-400" 
                  : "text-emerald-400"
            }`}>
              {isWaitlisted 
                ? "Waitlist Registered" 
                : isSubmitted 
                  ? "Submission Pending Review" 
                  : "Registration Successful"}
            </span>
            <h1 className="text-3xl font-black text-[#E8EAFF] tracking-tighter">
              {isWaitlisted 
                ? "Hold Tight!" 
                : isSubmitted 
                  ? "Application Received" 
                  : "Welcome Aboard!"}
            </h1>
            <p className="text-muted font-bold text-xs leading-relaxed max-w-sm mx-auto">
              {isWaitlisted 
                ? `You have been added to the waitlist for ${config.event_name}.`
                : isSubmitted 
                  ? `Your registration for ${config.event_name} is under review.`
                  : `You have been registered for ${config.event_name}.`}
            </p>
          </div>

          <div className="p-6 rounded-[2rem] bg-white/5 border border-white/5 space-y-4">
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">
                Participant Name
              </span>
              <span className="text-lg font-black text-[#E8EAFF]">
                {successData.name}
              </span>
            </div>
            
            <div className="flex justify-between items-center px-4 py-2 bg-white/5 border border-white/5 rounded-xl">
              <span className="text-[9px] font-black text-muted uppercase tracking-widest">
                Category
              </span>
              <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">
                {successData.role}
              </span>
            </div>

            {isWaitlisted ? (
              <div className="flex flex-col items-center pt-2 border-t border-white/5">
                <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">
                  Waitlist Position
                </span>
                <span className="text-2xl font-black text-[#E8EAFF] tracking-wider uppercase">
                  #{successData.waitlist_position || 1}
                </span>
              </div>
            ) : isSubmitted ? (
              <div className="flex justify-between items-center px-4 py-2 bg-white/5 border border-white/5 rounded-xl">
                <span className="text-[9px] font-black text-muted uppercase tracking-widest">
                  Status
                </span>
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest">
                  Pending Review
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center pt-2 border-t border-white/5">
                <span className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">
                  Your Registration Number
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-[#E8EAFF] tracking-wider uppercase">
                    {successData.regno}
                  </span>
                  <button 
                    onClick={copyRegNo}
                    className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/10 active:scale-95 transition-all"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-[10px] font-bold text-muted leading-relaxed max-w-[280px] mx-auto">
            {isWaitlisted 
              ? "We will automatically promote and approve your registration as capacity frees up."
              : isSubmitted 
                ? "The event organizers will review your submission shortly. You will be notified via email."
                : "Please keep this registration number safe. You will need it to print your badge at the registration desk."}
          </p>

          <div className="pt-2">
            <button 
              onClick={() => {
                setSuccessData(null);
                setFormData({});
              }}
              className="btn-primary w-full h-12 rounded-full"
            >
              Register Another Person
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Render main form questionnaire
  return (
    <div className="min-h-screen py-16 px-6 md:px-10 flex flex-col justify-center items-center">
      
      {/* Event Header Info */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center space-y-4 mb-10 max-w-xl"
      >
        {config.logo_url ? (
          <img 
            src={config.logo_url} 
            alt="Event Logo" 
            className="h-16 object-contain mx-auto rounded-xl shadow-lg border border-white/10 bg-white/5 p-2" 
          />
        ) : (
          <div className="h-14 w-14 glass-3d rounded-2xl flex items-center justify-center border-indigo-500/30 mx-auto shadow-xl">
            <Globe className="h-6 w-6 text-indigo-400" />
          </div>
        )}
        
        <div>
          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em] block">
            Public Intake portal
          </span>
          <h1 className="text-3xl md:text-4xl font-black text-[#E8EAFF] tracking-tighter mt-1">
            {config.event_name}
          </h1>
          <p className="text-[10px] font-bold text-muted uppercase tracking-[0.2em] mt-1.5">
            Complete the form below to secure your access.
          </p>
        </div>
      </motion.div>

      {/* Main Registration Form */}
      <motion.form 
        onSubmit={handleSubmit}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-2xl glass-3d p-8 md:p-12 rounded-[2.5rem] bg-white/5 space-y-8 relative overflow-hidden shadow-2xl"
      >
        <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-6">
          {config.fields.filter(f => f.is_active).map(field => (
            <div key={field.id} className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                {field.label}
                {field.is_required && <span className="text-indigo-400 font-bold">*</span>}
              </label>

              {/* Text Input Types */}
              {field.type === "text" && (
                <div className="relative">
                  {getFieldIcon(field.id) && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2">
                      {getFieldIcon(field.id)}
                    </div>
                  )}
                  <input
                    type="text"
                    required={field.is_required}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                    value={formData[field.id] || ""}
                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                    className={`h-12 w-full bg-white/5 border border-white/10 rounded-xl font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all ${
                      getFieldIcon(field.id) ? "pl-12 pr-4" : "px-4"
                    }`}
                  />
                </div>
              )}

              {/* Email Input Types */}
              {field.type === "email" && (
                <div className="relative">
                  {getFieldIcon(field.id) && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2">
                      {getFieldIcon(field.id)}
                    </div>
                  )}
                  <input
                    type="email"
                    required={field.is_required}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                    value={formData[field.id] || ""}
                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                    className={`h-12 w-full bg-white/5 border border-white/10 rounded-xl font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all ${
                      getFieldIcon(field.id) ? "pl-12 pr-4" : "px-4"
                    }`}
                  />
                </div>
              )}

              {/* Phone Input Types */}
              {field.type === "phone" && (
                <div className="relative">
                  {getFieldIcon(field.id) && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2">
                      {getFieldIcon(field.id)}
                    </div>
                  )}
                  <input
                    type="tel"
                    required={field.is_required}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                    value={formData[field.id] || ""}
                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                    className={`h-12 w-full bg-white/5 border border-white/10 rounded-xl font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all ${
                      getFieldIcon(field.id) ? "pl-12 pr-4" : "px-4"
                    }`}
                  />
                </div>
              )}

              {/* Country Input Types */}
              {field.type === "country" && (
                <div className="space-y-4">
                  <div className="relative">
                    {getFieldIcon(field.id) && (
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        {getFieldIcon(field.id)}
                      </div>
                    )}
                    <select
                      required={field.is_required}
                      value={formData[field.id] || ""}
                      onChange={(e) => {
                        handleInputChange(field.id, e.target.value);
                        handleInputChange(`${field.id}_state`, "");
                      }}
                      className={`h-12 w-full bg-[#0d0e1b] border border-white/10 rounded-xl font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer ${
                        getFieldIcon(field.id) ? "pl-12 pr-4" : "px-4"
                      }`}
                    >
                      <option value="" className="bg-[#080912]">Select Country...</option>
                      {["India", "United States", "United Kingdom", "Canada", "Australia", "Germany"].map((c) => (
                        <option key={c} value={c} className="bg-[#080912]">{c}</option>
                      ))}
                    </select>
                  </div>

                  {formData[field.id] && (
                    <div className="space-y-2 animate-in fade-in duration-200">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                        State / Province
                        {field.is_required && <span className="text-indigo-400 font-bold">*</span>}
                      </label>
                      <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <MapPin className="h-4 w-4 text-indigo-400" />
                        </div>
                        <select
                          required={field.is_required}
                          value={formData[`${field.id}_state`] || ""}
                          onChange={(e) => handleInputChange(`${field.id}_state`, e.target.value)}
                          className="h-12 w-full bg-[#0d0e1b] border border-white/10 rounded-xl pl-12 pr-4 font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer"
                        >
                          <option value="" className="bg-[#080912]">Select State...</option>
                          {formData[field.id] === "India" && (
                            <>
                              {["Andhra Pradesh", "Delhi", "Gujarat", "Karnataka", "Kerala", "Maharashtra", "Tamil Nadu", "Telangana", "Uttar Pradesh", "West Bengal"].map((s) => (
                                <option key={s} value={s} className="bg-[#080912]">{s}</option>
                              ))}
                            </>
                          )}
                          {formData[field.id] === "United States" && (
                            <>
                              {["California", "Florida", "Georgia", "Illinois", "New York", "North Carolina", "Ohio", "Pennsylvania", "Texas", "Washington"].map((s) => (
                                <option key={s} value={s} className="bg-[#080912]">{s}</option>
                              ))}
                            </>
                          )}
                          {formData[field.id] === "United Kingdom" && (
                            <>
                              {["England", "Northern Ireland", "Scotland", "Wales"].map((s) => (
                                <option key={s} value={s} className="bg-[#080912]">{s}</option>
                              ))}
                            </>
                          )}
                          {formData[field.id] === "Canada" && (
                            <>
                              {["Alberta", "British Columbia", "Manitoba", "Nova Scotia", "Ontario", "Quebec", "Saskatchewan"].map((s) => (
                                <option key={s} value={s} className="bg-[#080912]">{s}</option>
                              ))}
                            </>
                          )}
                          {formData[field.id] === "Australia" && (
                            <>
                              {["New South Wales", "Queensland", "South Australia", "Tasmania", "Victoria", "Western Australia"].map((s) => (
                                <option key={s} value={s} className="bg-[#080912]">{s}</option>
                              ))}
                            </>
                          )}
                          {formData[field.id] === "Germany" && (
                            <>
                              {["Bavaria", "Berlin", "Hamburg", "Hesse", "North Rhine-Westphalia", "Saxony"].map((s) => (
                                <option key={s} value={s} className="bg-[#080912]">{s}</option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Date Selector */}
              {field.type === "date" && (
                <input
                  type="date"
                  required={field.is_required}
                  value={formData[field.id] || ""}
                  onChange={(e) => handleInputChange(field.id, e.target.value)}
                  className="h-12 w-full bg-white/5 border border-white/10 rounded-xl px-4 font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer"
                />
              )}

              {/* Dropdown Select option menu */}
              {field.type === "select" && (
                <div className="relative">
                  {getFieldIcon(field.id) && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      {getFieldIcon(field.id)}
                    </div>
                  )}
                  <select
                    value={formData[field.id] || ""}
                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                    className={`h-12 w-full bg-[#0d0e1b] border border-white/10 rounded-xl font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer ${
                      getFieldIcon(field.id) ? "pl-12 pr-4" : "px-4"
                    }`}
                  >
                    {(field.options || []).map((opt) => (
                      <option key={opt} value={opt} className="bg-[#080912]">
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Checkboxes Choice list */}
              {field.type === "checkbox" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white/5 border border-white/5 p-4 rounded-2xl">
                  {(field.options || []).map((opt) => {
                    const isChecked = (formData[field.id] || []).includes(opt);
                    return (
                      <label key={opt} className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleCheckboxChange(field.id, opt, e.target.checked)}
                          className="h-4 w-4 bg-white/5 border border-white/10 rounded text-indigo-500 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-muted uppercase tracking-wider">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* File or Image Upload widget */}
              {(field.type === "image" || field.type === "file") && (
                <div className="space-y-3">
                  {formData[field.id] ? (
                    <div className="flex items-center justify-between p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0 border border-emerald-500/20">
                          <Check className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-[#E8EAFF] uppercase tracking-wider truncate">File Uploaded</p>
                          <a 
                            href={formData[field.id]} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-[9px] text-indigo-400 font-bold hover:underline truncate block"
                          >
                            View Uploaded File
                          </a>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInputChange(field.id, "")}
                        className="text-[9px] font-black uppercase tracking-widest text-muted hover:text-rose-400 transition-colors"
                      >
                        Change File
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center border border-dashed border-white/10 hover:border-indigo-500/40 rounded-2xl p-6 bg-white/5 hover:bg-white/10 transition-all cursor-pointer relative group">
                      <input
                        type="file"
                        accept={field.type === "image" ? "image/*" : ".pdf,.docx,.xlsx,.doc"}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(field.id, file);
                        }}
                        disabled={uploadingField !== null}
                        className="hidden"
                      />
                      
                      {uploadingField === field.id ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
                          <span className="text-[9px] font-black text-muted uppercase tracking-widest">Uploading...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-center">
                          <Upload className="h-5 w-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                          <div>
                            <span className="text-[10px] font-black text-muted uppercase tracking-widest block">
                              Select {field.type === "image" ? "Image" : "Document"}
                            </span>
                            <span className="text-[8px] font-bold text-muted/60 uppercase tracking-wider mt-1 block">
                              Max 10MB
                            </span>
                          </div>
                        </div>
                      )}
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Submit Action */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={submitting || uploadingField !== null}
            className="btn-primary w-full h-14 rounded-full flex items-center justify-center gap-3 shadow-lg"
          >
            {submitting ? (
              <>Processing Registration... <Loader2 className="h-4 w-4 animate-spin" /></>
            ) : (
              <>Register for Event <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </div>
      </motion.form>
    </div>
  );
}
