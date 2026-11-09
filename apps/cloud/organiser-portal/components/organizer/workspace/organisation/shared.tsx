"use client";

import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient, apiGet } from "@/lib/api-client";
import { usePortalQueryScope } from "@/hooks/useAccessBootstrap";
import { INDIA_DEFAULTS } from "@/lib/organisation-locale-options";
import { cn } from "@/lib/utils";
import { OrganiserSection } from "../OrganiserSection";

export const organisationTabs = [
  ["Profile", "/organisation/profile"],
  ["Branding", "/organisation/branding"],
  ["Contact & Address", "/organisation/contact-address"],
  ["Preferences", "/organisation/preferences"],
  ["Compliance & Legal", "/organisation/compliance"],
  ["Activity & Audit", "/organisation/audit"],
].map(([label, href]) => ({ label, href }));

const profileWriteFields = [
  "name", "description", "legal_name", "registration_number", "organization_type",
  "industry", "billing_email", "contact_email", "contact_phone", "website_url",
  "billing_address", "portal_name", "country", "timezone", "language", "date_format",
  "time_format", "currency",
] as const;

export function OrganisationPage({
  actions,
  eyebrow,
  title = "Organisation",
  description = "Manage your organisation profile, branding, contact information, preferences, and compliance.",
  children,
}: {
  actions?: ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <OrganiserSection
      eyebrow={eyebrow}
      title={title}
      description={description}
      tabs={organisationTabs}
      actions={actions}
    >
      {children}
    </OrganiserSection>
  );
}

export function useOrganisationEditor() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scope = usePortalQueryScope();
  const query = useQuery({
    queryKey: ["organisation", ...scope, "profile"],
    queryFn: () =>
      apiGet<Record<string, any>>("/organiser/organisation/profile"),
  });
  const [form, setForm] = useState<Record<string, any>>({});
  const initial = useRef<Record<string, any>>({});
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const retryKey = useRef(crypto.randomUUID());

  useEffect(() => {
    const org = query.data;
    if (!org) return;
    const next = {
      name: org.name || "",
      description: org.description || "",
      billing_email: org.billing_email || "",
      organization_type: org.organization_type || "",
      industry: org.industry || "",
      portal_name: org.portal_name || "",
      country: org.country || INDIA_DEFAULTS.country,
      timezone: org.timezone || INDIA_DEFAULTS.timezone,
      language: normalizeLanguage(org.language),
      date_format: org.date_format || INDIA_DEFAULTS.dateFormat,
      time_format: org.time_format || INDIA_DEFAULTS.timeFormat,
      currency: normalizeCurrency(org.currency) || INDIA_DEFAULTS.currency,
      primary_color: org.primary_color || "#7c3aed",
      secondary_color: org.secondary_color || "#ff426d",
      logo_url: org.logo_url || "",
      legal_name: org.legal_name || "",
      registration_number: org.registration_number || "",
      contact_email: org.contact_email || "",
      contact_phone: org.contact_phone || "",
      website_url: org.website_url || "",
      billing_address: Object.fromEntries(
        ["line1", "line2", "city", "state", "postal_code", "country"]
          .filter((key) => org.billing_address?.[key] != null)
          .map((key) => [key, org.billing_address[key]]),
      ),
      version: org.version || 1,
    };
    initial.current = next;
    setForm(next);
  }, [query.data]);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial.current),
    [form],
  );
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (
        dirty &&
        anchor?.href &&
        anchor.target !== "_blank" &&
        new URL(anchor.href).origin === window.location.origin
      ) {
        event.preventDefault();
        event.stopPropagation();
        setPendingHref(anchor.href);
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);
  const mutation = useMutation({
    mutationFn: () => {
      const version = form.version;
      const payload = Object.fromEntries(profileWriteFields.map((key) => [key, form[key]]));
      return apiClient.put<Record<string, any>>(
        "/organiser/organisation/profile",
        payload,
        { headers: { "If-Match": String(version), "Idempotency-Key": retryKey.current } },
      );
    },
    onSuccess: async (result) => {
      retryKey.current = crypto.randomUUID();
      initial.current = { ...result };
      setForm({ ...result });
      await queryClient.invalidateQueries({ queryKey: ["organisation"] });
      toast.success("Organisation updated.");
    },
    onError: (error: any) =>
      toast.error(error?.status === 412 ? "The organisation changed elsewhere. Refresh before saving again." : error?.message || "Organisation update failed."),
  });
  const save = () => mutation.mutate();
  const discard = () => setForm({ ...initial.current });
  const navigationGuard = (
    <Dialog
      open={Boolean(pendingHref)}
      onOpenChange={(open) => {
        if (!open) setPendingHref(null);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription>
            Your organisation changes have not been saved. Leaving now restores
            the last saved version.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingHref(null)}>
            Stay on page
          </Button>
          <Button
            onClick={() => {
              const href = pendingHref;
              setForm({ ...initial.current });
              setPendingHref(null);
              if (href) router.push(href);
            }}
          >
            Discard and leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return {
    query,
    form,
    setForm,
    save,
    discard,
    dirty,
    saving: mutation.isPending,
    navigationGuard,
  };
}

function normalizeCurrency(value?: string | null) {
  return String(value || "").trim().split(/\s|\(/)[0].toUpperCase();
}

function normalizeLanguage(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.toLowerCase() === "english") return INDIA_DEFAULTS.language;
  return normalized;
}

export function OrganisationField({
  label,
  hint,
  icon,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <label className={cn("organisation-field", className)}>
      <span className="organisation-field-label">{label}</span>
      <span className="organisation-field-control">
        {icon ? <span className="organisation-field-icon" aria-hidden>{icon}</span> : null}
        <input {...props} />
      </span>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function OrganisationSelect({
  label,
  hint,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label className={cn("organisation-field", className)}>
      <span className="organisation-field-label">{label}</span>
      <span className="organisation-field-control">
        <select {...props}>{children}</select>
      </span>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function OrganisationSaveActions({
  dirty,
  saving,
  onDiscard,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div className="organisation-save-actions">
      <Button variant="outline" onClick={onDiscard} disabled={!dirty || saving}>Discard</Button>
      <Button onClick={onSave} disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</Button>
    </div>
  );
}
