"use client";

import { apiClient } from "@/lib/api-client";

export type OrgRole = "owner" | "admin" | "member" | "billing_only";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  plan: "trial" | "starter" | "pro" | "enterprise";
  plan_expires_at?: string | null;
  primary_color: string;
  secondary_color: string;
  billing_email?: string | null;
  country: string;
  timezone: string;
  max_events: number;
  max_users: number;
  max_storage_gb: number;
  is_active: boolean;
  onboarding_completed: boolean;
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
  plan_limits: { events: number; users: number; storage_gb: number };
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
};

export const orgApi = {
  checkSlug: (slug: string) => apiClient.get<{ available: boolean }>(`/auth/check-slug?slug=${encodeURIComponent(slug)}`),
  signup: (data: Record<string, unknown>) => apiClient.post<any>("/auth/signup", data),
  acceptInvite: (data: Record<string, unknown>) => apiClient.post<any>("/auth/accept-invite", data),
  me: () => apiClient.get<OrgMe>("/organisations/me"),
  updateMe: (data: Partial<Organization>) => apiClient.put<{ organization: Organization }>("/organisations/me", data),
  members: () => apiClient.get<OrgMember[]>("/organisations/me/members"),
  invite: (email: string, org_role: OrgRole) => apiClient.post<{ message: string; invite_token?: string }>("/organisations/me/members/invite", { email, org_role }),
  updateMember: (id: string, org_role: OrgRole) => apiClient.put(`/organisations/me/members/${id}`, { org_role }),
  removeMember: (id: string) => apiClient.delete(`/organisations/me/members/${id}`),
  platformOrgs: (params = "") => apiClient.get<{ items: Organization[]; page: number; per_page: number }>(`/platform/organisations${params}`),
  platformOrg: (id: string) => apiClient.get<any>(`/platform/organisations/${id}`),
  platformUpdate: (id: string, data: Record<string, unknown>) => apiClient.put(`/platform/organisations/${id}`, data),
  impersonate: (id: string) => apiClient.post<{ access_token: string }>(`/platform/organisations/${id}/impersonate`),
  plans: () => apiClient.get<any[]>("/organisations/plans"),
  subscribe: (data: Record<string, unknown>) => apiClient.post<any>("/organisations/me/subscribe", data),
};

export const countries = [
  { value: "IN", label: "India" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "SG", label: "Singapore" },
];

export const timezones = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 50);
}

export function usageTone(value: number, max: number) {
  const pct = max ? (value / max) * 100 : 0;
  if (pct > 90) return "bg-[var(--dan)]";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}
