"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Save, CheckCircle2, ArrowLeft, Printer, RefreshCw, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { compileTemplateToPdf } from "@/lib/pdf-compiler";
import { toast } from "sonner";

interface FormField {
  id: string;
  name: string;
  label: string;
  type: string;
  is_default?: boolean;
  is_required?: boolean;
  is_active?: boolean;
  options?: string[];
  placeholder?: string;
}

export default function DynamicOnSiteRegistrationPage() {
  const router = useRouter();
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [adminOverride, setAdminOverride] = useState(false);
  const [capacityError, setCapacityError] = useState<string | null>(null);

  const [fields, setFields] = useState<FormField[]>([]);
  const [terms, setTerms] = useState("");
  const [formData, setFormData] = useState<Record<string, any>>({
    role: "Delegate",
    paid_status: "Paid",
    amount: "1500",
    payment_method: "Cash"
  });

  const fetchFormConfig = async () => {
    try {
      setLoadingConfig(true);
      const res: any = await apiClient.get("/venue/registration/form-config");
      if (res && res.fields) {
        setFields(res.fields.filter((f: FormField) => f.is_active !== false));
        if (res.terms_and_conditions) setTerms(res.terms_and_conditions);
      }
    } catch (err) {
      console.error("Failed to load form config:", err);
      // Fallback standard fields
      setFields([
        { id: "first_name", name: "first_name", label: "First Name", type: "text", is_required: true, placeholder: "First Name" },
        { id: "last_name", name: "last_name", label: "Last Name", type: "text", is_required: true, placeholder: "Last Name" },
        { id: "email", name: "email", label: "Email Address", type: "email", is_required: true, placeholder: "email@example.com" },
        { id: "phone", name: "phone", label: "Phone Number", type: "phone", is_required: false, placeholder: "+91 9876543210" },
        { id: "role", name: "role", label: "Registration Category", type: "select", is_required: true, options: ["Delegate", "Speaker", "VIP", "Exhibitor"] },
        { id: "company", name: "company", label: "Organization / Company", type: "text", is_required: false, placeholder: "Company Name" },
      ]);
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    fetchFormConfig();
  }, []);

  const handleInputChange = (fieldId: string, val: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCapacityError(null);
    const firstName = formData.first_name || formData.name?.split(" ")[0] || "";
    const lastName = formData.last_name || formData.name?.split(" ").slice(1).join(" ") || "";

    if (!firstName && !formData.name) {
      toast.error("First Name is required.");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        first_name: firstName,
        last_name: lastName || "Delegate",
        email: formData.email || "",
        phone: formData.phone || "",
        role: formData.role || "Delegate",
        company: formData.company || "",
        designation: formData.designation || "",
        country: formData.country || "India",
        paid_status: formData.paid_status || "Paid",
        amount: parseFloat(formData.amount || "1500"),
        payment_method: formData.payment_method || "Cash",
        custom_fields: formData,
        admin_override: adminOverride,
      };

      const res: any = await apiClient.post("/venue/registration/participants", payload);
      setSuccessData(res.participant || res);
      toast.success("Participant registered successfully!");
    } catch (err: any) {
      const errMsg = typeof err === "string" ? err : err?.message || err?.detail || "Failed to register participant.";
      console.error("Registration error details:", errMsg, err);

      if (errMsg.toLowerCase().includes("capacity limit")) {
        setCapacityError(errMsg);
      }
      toast.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintBadgeNow = async () => {
    if (!successData) return;
    try {
      toast.info(`Compiling badge PDF for ${successData.name}...`);
      const templatesRes: any = await apiClient.get("/venue/registration/templates");
      const templates = Array.isArray(templatesRes) ? templatesRes : [];
      const badgeTemplates = templates.filter((t: any) => t.template_type !== "certificate");

      const activeTemplate =
        badgeTemplates.length > 0
          ? badgeTemplates[0].template_data || badgeTemplates[0].templateData || badgeTemplates[0]
          : {
              width_mm: 76,
              height_mm: 100,
              pages: [
                {
                  backgroundColor: "#FFFFFF",
                  fields: [
                    { type: "text", placeholder: "{{name}}", x_mm: 5, y_mm: 20, w_mm: 66, h_mm: 12, fontSize: 16, bold: true, color: "#1E293B", align: "center" },
                    { type: "text", placeholder: "{{role}}", x_mm: 5, y_mm: 35, w_mm: 66, h_mm: 8, fontSize: 12, bold: true, color: "#2563EB", align: "center" },
                    { type: "text", placeholder: "{{company}}", x_mm: 5, y_mm: 45, w_mm: 66, h_mm: 8, fontSize: 10, color: "#64748B", align: "center" },
                    { type: "qr", qrValue: "{{regno}}", x_mm: 23, y_mm: 58, w_mm: 30, h_mm: 30 },
                  ],
                },
              ],
            };

      const pdf = await compileTemplateToPdf([successData], activeTemplate, { name: "EventX OS" });
      const blobUrl = URL.createObjectURL(pdf.output("blob"));
      window.open(blobUrl, "_blank");
      toast.success("Badge PDF generated! Spool opened in new tab.");
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to generate badge PDF.");
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/registry">
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-[var(--muted)]">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-xl font-black text-[var(--text)] tracking-tight">On-Site Registration Desk</h2>
            <p className="text-xs text-[var(--muted)]">Form dynamically inherited from saved event registration template</p>
          </div>
        </div>

        <Button variant="outline" onClick={fetchFormConfig} disabled={loadingConfig} className="h-9 text-xs font-bold">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingConfig ? "animate-spin" : ""}`} /> Reload Form Template
        </Button>
      </div>

      {successData ? (
        <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-lg p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-[var(--text)]">Registration Successful!</h3>
            <p className="text-[var(--muted)] text-sm mt-1">
              Participant <strong className="text-[var(--text)]">{successData.name}</strong> has been registered.
            </p>
            <p className="text-sm font-mono text-[var(--acc)] font-black mt-2">
              Registration ID: {successData.regno}
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 pt-4">
            <Button
              onClick={handlePrintBadgeNow}
              className="bg-[var(--pri)] text-[var(--primary-contrast)] font-bold gap-2 h-11 px-6 shadow-md"
            >
              <Printer className="w-4 h-4" /> Print Badge PDF Now
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSuccessData(null);
                setFormData({ role: "Delegate", paid_status: "Paid", amount: "1500", payment_method: "Cash" });
              }}
              className="h-11 px-6 font-bold"
            >
              Register Another Delegate
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-[var(--card)] p-8 rounded-2xl border border-[var(--border)] shadow-sm space-y-6">
          {loadingConfig ? (
            <div className="py-20 text-center text-[var(--muted)]">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[var(--pri)] mb-3" />
              <p className="text-sm font-bold">Loading inherited registration form template...</p>
            </div>
          ) : (
            <>
              {/* Dynamic Field Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {fields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <label className="block text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                      {field.label} {field.is_required && <span className="text-red-500">*</span>}
                    </label>

                    {field.type === "select" ? (
                      <select
                        value={formData[field.id] || (field.options && field.options[0]) || ""}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full h-11 px-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-sm font-semibold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)]"
                      >
                        {(field.options || ["Delegate", "Speaker", "VIP", "Exhibitor"]).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
                        value={formData[field.id] || ""}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                        required={field.is_required}
                        className="h-11 bg-[var(--surf)] border-[var(--border)] text-sm font-semibold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)]"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Capacity Error Warning Banner */}
              {capacityError && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-700 dark:text-amber-300 space-y-2">
                  <div className="font-bold flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>{capacityError}</span>
                  </div>
                  <p className="text-[11px] opacity-90">
                    The Organiser overall event registration limit has been reached. Check the box below to authorize an admin override.
                  </p>
                </div>
              )}

              {/* Admin Capacity Override Checkbox */}
              <div className="flex items-center justify-between p-3 bg-[var(--surf)] border border-[var(--border)] rounded-xl">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={adminOverride}
                    onChange={(e) => setAdminOverride(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--pri)] focus:ring-[var(--pri)]"
                  />
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Admin Capacity Override (Bypass Event Registration Limits)</span>
                </label>
              </div>

              {/* Terms Banner */}
              {terms && (
                <div className="p-4 bg-[var(--raised)] border border-[var(--border)] rounded-xl text-xs text-[var(--muted)] flex items-start gap-3">
                  <FileText className="w-5 h-5 text-[var(--acc)] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[var(--text)] block mb-0.5">Attendee Declaration & Terms:</strong>
                    {terms}
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-[var(--primary-contrast)] font-extrabold h-12 px-8 text-sm shadow-lg flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  {submitting ? "Processing Registration..." : adminOverride ? "Force Register (Admin Override)" : "Complete Registration & Print Badge"}
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
