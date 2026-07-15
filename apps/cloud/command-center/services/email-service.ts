// services/email-service.ts

import { apiClient, saveDownloadedFile } from "@/lib/api-client"

// ================= TYPES =================

export type Campaign = {
  id: string
  event_id: string
  name: string
  status: "draft" | "scheduled" | "sending" | "sent" | "failed"
  total_recipients: number
  sent_count: number
  open_count?: number
  subject?: string
  created_at: string
  scheduled_at?: string
  target_type: string
}

export type Template = {
  id: string
  name: string
  template_type: string
  subject: string
  body_html: string
}

export type Recipient = {
  id: string
  name: string
  email: string
  status: string
}

export type EmailLog = {
  id: string
  to_email: string
  subject: string
  status: "sent" | "failed" | "queued" | "bounced" | "delivered"
  sent_at: string
  opened_at?: string
  error_message?: string
}

export type PaginatedResponse<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
}

export type EmailAnalytics = {
  total_campaigns: number
  total_recipients: number
  total_sent: number
  failed_count: number
  opened_count: number
  success_rate: number
  open_rate: number
}

// ================= CAMPAIGNS =================

export const getCampaigns = async (eventId: string): Promise<Campaign[]> => {
  return apiClient.get(`/events/${eventId}/notifications/campaigns`)
}

export const createCampaign = async (
  eventId: string,
  payload: {
    name: string
    template_id: string
    recipient_filter: string
    session_id_filter?: string
    scheduled_at?: string
    speaker_ids?: string[]
  }
): Promise<Campaign> => {
  return apiClient.post(`/events/${eventId}/notifications/campaigns`, payload)
}

export const sendCampaign = async (eventId: string, campaignId: string) => {
  return apiClient.post(
    `/events/${eventId}/notifications/campaigns/${campaignId}/send`
  )
}

export const resendFailed = async (eventId: string, campaignId: string) => {
  return apiClient.post(
    `/events/${eventId}/notifications/campaigns/${campaignId}/resend-failed`
  )
}

export const deleteCampaign = async (eventId: string, campaignId: string): Promise<{ message: string }> => {
  return apiClient.delete(
    `/events/${eventId}/notifications/campaigns/${campaignId}`
  )
}

// ================= TEMPLATES =================

export const getTemplates = async (eventId: string): Promise<Template[]> => {
  return apiClient.get(`/events/${eventId}/notifications/templates`)
}

export const createTemplate = async (
  eventId: string,
  payload: {
    name: string
    template_type: string
    subject: string
    body_html: string
  }
): Promise<Template> => {
  return apiClient.post(`/events/${eventId}/notifications/templates`, payload)
}

export const updateTemplate = async (
  eventId: string,
  templateId: string,
  payload: Partial<Template>
): Promise<Template> => {
  return apiClient.patch(
    `/events/${eventId}/notifications/templates/${templateId}`,
    payload
  )
}

// ================= RECIPIENTS =================

export const getRecipients = async (
  eventId: string,
  filter: string
): Promise<Recipient[]> => {
  return apiClient.get(
    `/events/${eventId}/notifications/recipients`,
    { params: { filter } }
  )
}

// ================= ANALYTICS =================

export const getEmailAnalytics = async (eventId: string, targetType?: string): Promise<EmailAnalytics> => {
  return apiClient.get(`/events/${eventId}/notifications/analytics`, {
    params: targetType ? { target_type: targetType } : undefined
  })
}

// ================= TEST EMAIL =================

export const sendTestEmail = async (
  eventId: string,
  payload: {
    to: string
    subject: string
    body: string
  }
) => {
  return apiClient.post(
    `/events/${eventId}/notifications/campaigns/test`,
    payload
  )
}

// ================= LOGS =================

export const getEmailLogs = async (
  eventId: string,
  params?: {
    campaign_id?: string
    status?: string
    page?: number
    page_size?: number
    target_type?: string
  }
): Promise<PaginatedResponse<EmailLog>> => {
  const url = `/events/${eventId}/notifications/logs`;
  return apiClient.get(url, { params });
}

// ================= DOWNLOAD =================

export const downloadLogs = async (eventId: string) => {
  const file = await apiClient.download(`/events/${eventId}/notifications/logs/download`, {
    params: { event_id: eventId },
  })
  saveDownloadedFile(file, "email_logs.csv")
}
