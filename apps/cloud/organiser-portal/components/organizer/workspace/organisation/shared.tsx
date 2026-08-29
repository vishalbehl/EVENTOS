"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { OrganiserSection } from "../OrganiserSection";

export const organisationTabs = [
  ["Profile", "/organisation/profile"],
  ["Workspaces & Branches", "/organisation/branches"],
  ["Documents", "/organisation/documents"],
  ["Branding", "/organisation/branding"],
  ["Preferences", "/organisation/preferences"],
].map(([label, href]) => ({ label, href }));

export function OrganisationPage({
  actions,
  children,
}: {
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <OrganiserSection
      title="Organisation"
      description="Manage organisation identity, branches, documents, branding, and shared preferences."
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
  const query = useQuery({
    queryKey: ["organisation", "profile"],
    queryFn: () =>
      apiGet<Record<string, any>>("/organiser/organisation/profile"),
  });
  const [form, setForm] = useState<Record<string, any>>({});
  const initial = useRef<Record<string, any>>({});
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const org = query.data;
    if (!org) return;
    const next = {
      name: org.name || "",
      billing_email: org.billing_email || "",
      organization_type: org.organization_type || "",
      industry: org.industry || "",
      portal_name: org.portal_name || "",
      country: org.country || "",
      timezone: org.timezone || "",
      language: org.language || "English",
      date_format: org.date_format || "DD/MM/YYYY",
      time_format: org.time_format || "24 Hour",
      currency: org.currency || "INR",
      primary_color: org.primary_color || "#7c3aed",
      secondary_color: org.secondary_color || "#ff426d",
      logo_url: org.logo_url || "",
      legal_name: org.legal_name || "",
      registration_number: org.registration_number || "",
      contact_email: org.contact_email || "",
      contact_phone: org.contact_phone || "",
      website_url: org.website_url || "",
      billing_address: org.billing_address || {},
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
      const { version, ...payload } = form;
      return apiClient.put<Record<string, any>>(
        "/organiser/organisation/profile",
        payload,
        { headers: { "If-Match": String(version) } },
      );
    },
    onSuccess: async (result) => {
      initial.current = { ...result };
      setForm({ ...result });
      await queryClient.invalidateQueries({ queryKey: ["organisation"] });
      toast.success("Organisation updated.");
    },
    onError: (error: any) =>
      toast.error(error?.message || "Organisation update failed."),
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
