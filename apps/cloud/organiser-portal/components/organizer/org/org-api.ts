"use client";

import { apiClient } from "@/lib/api-client";
import { countryOptions, getTimezoneOptions } from "@/lib/organisation-locale-options";

export type OrgRole = "owner" | "admin" | "member" | "billing_only";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  billing_email?: string | null;
  country: string;
  timezone: string;
  is_active: boolean;
  onboarding_completed: boolean;
  organization_type?: string | null;
  industry?: string | null;
  expected_events_per_year?: string | null;
  average_attendees_per_event?: string | null;
  primary_goal?: string | null;
  language?: string;
  portal_name?: string | null;
  date_format?: string;
  time_format?: string;
  currency?: string;
  onboarding_step?: number;
  onboarding_draft?: Record<string, any> | null;
  created_at: string;
  event_count?: number;
  member_count?: number;
  storage_used_gb?: number;
  last_event_at?: string | null;
};

export type OrgMe = {
  organization: Organization;
  member_count: number;
  event_count: number;
  storage_used_gb: number;
  entitlement_limits: { events: number | null; users: number | null; storage_gb: number | null };
  commercial: {
    availability: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
    freshness_at: string;
    source: string;
    contract_id: string | null;
    contract_status: string | null;
    offer_id: string | null;
    offer_name: string | null;
  };
  org_role: OrgRole;
};

export type OrgMember = {
  id: string;
  user_id?: string | null;
  name: string;
  email: string;
  org_role: OrgRole;
  accepted_at?: string | null;
  invited_at?: string | null;
  is_active: boolean;
  is_2fa_enabled?: boolean;
  last_login_at?: string | null;
  event_ids?: string[];
};

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 50);
}

export function usageTone(value: number, max: number) {
  const pct = max ? (value / max) * 100 : 0;
  if (pct > 90) return "bg-[var(--dan)]";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export const orgApi = {
  checkSlug: (slug: string) => apiClient.get<{ available: boolean }>(`/auth/check-slug?slug=${encodeURIComponent(slugify(slug))}`),
  signup: (data: Record<string, unknown>) => apiClient.post<any>("/auth/signup", data),
  previewInvite: (token: string, signal?: AbortSignal) => apiClient.post<{ membership_id: string; organization_id: string; organization_name: string; org_role: string; version: number; expires_at: string }>("/auth/invitation", { token }, { signal }),
  acceptInvite: (token: string, version: number, key: string, signal?: AbortSignal) => apiClient.post<{ organization_id: string; organization_name: string; state: "ACCEPTED" }>("/auth/accept-invite", { token }, { signal, headers: { "If-Match": String(version), "Idempotency-Key": key } }),
  me: () => apiClient.get<OrgMe>("/organisations/me"),
  updateMe: (data: Partial<Organization>) => {
    const payload = { ...data };
    if (typeof payload.slug === "string") {
      payload.slug = slugify(payload.slug);
    }
    return apiClient.put<{ organization: Organization }>("/organisations/me", payload);
  },
  // Compatibility first page only; never use this array to infer tenant totals.
  members: () => apiClient.get<OrgMember[]>("/organisations/me/members"),
  membersPage: (cursor?: string | null, signal?: AbortSignal) => apiClient.get<{ items: OrgMember[]; next_cursor: string | null; has_next: boolean }>(
    `/organiser/members/cursor?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { signal }),
  invite: (email: string, org_role: OrgRole, key: string) => apiClient.post<{ message: string; invite_token?: string | null; expires_at: string; replayed: boolean }>(
    "/organisations/me/members/invite",
    { email, org_role },
    { headers: { "Idempotency-Key": key } },
  ),
  updateMember: (id: string, org_role: OrgRole, version: number, reason: string) => apiClient.put(`/organisations/me/members/${id}`, { org_role, reason }, { headers: { "If-Match": String(version) } }),
  removeMember: (id: string, version: number, reason: string) => apiClient.delete(`/organisations/me/members/${id}?reason=${encodeURIComponent(reason)}`, { headers: { "If-Match": String(version) } }),
  platformOrgs: (params = "") => apiClient.get<{ items: Organization[]; page: number; per_page: number }>(`/platform/organisations${params}`),
  platformOrg: (id: string) => apiClient.get<any>(`/platform/organisations/${id}`),
  platformUpdate: (id: string, data: Record<string, unknown>) => apiClient.put(`/platform/organisations/${id}`, data),
  eventOffers: () => apiClient.get<any[]>("/commercial/catalog?family=EVENT"),
  eventOffer: (id: string) => apiClient.get<any>("/commercial/catalog/" + id),
  capacityOffers: () => apiClient.get<any[]>("/commercial/catalog?family=CAPACITY_ADDON"),
  capacityOffer: (id: string) => apiClient.get<any>("/commercial/catalog/" + id),
  calculatePrice: (data: Record<string, any>) => apiClient.post<any>("/commercial/pricing/preview", data),
  currentCommercialContract: async () => {
    const contracts = await apiClient.get<any[]>("/commercial/contracts");
    const contract = contracts?.[0];
    const item = contract?.items?.[0];
    return {
      status: contract?.status,
      contract_id: contract?.id,
      contract_status: contract?.status,
      ends_at: contract?.ends_at,
      offer: { id: item?.offer_id, name: item?.offer_code || item?.display_name || "No active commercial offer" },
      usage: { events: { max: 0 } },
    };
  },
  requestCommercialQuote: (data: Record<string, any>) =>
    apiClient.post<any>("/commercial/requests", {
      account_type: "ORGANIZER",
      request_type: "QUOTE",
      events: data.event_id ? [{ event_id: data.event_id, offer_code: data.offer_code, capacity_addon_codes: data.capacity_addon_codes || [] }] : [],
      reason: data.reason,
      billing_profile: {
        billing_name: data.billing_name,
        billing_email: data.billing_email,
        billing_phone: data.billing_phone,
        gst_number: data.gst_number,
      },
    }, {
      headers: { "Idempotency-Key": crypto.randomUUID() },
    }),
  commercialAccessRequests: () =>
    apiClient.get<any>("/commercial/requests"),
};

export const countries = countryOptions.map((country) => ({
  value: country.code,
  label: `${country.flag} ${country.name}`,
}));

export const timezones = getTimezoneOptions();
