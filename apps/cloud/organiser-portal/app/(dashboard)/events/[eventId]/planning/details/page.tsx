'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe, Building2, MapPin, Calendar, Users, Info, Clock, 
  CheckCircle2, Plus, ExternalLink, RefreshCw, Upload, Save, 
  Loader2, Trash2, Mail, Phone, ShieldCheck, FileSpreadsheet, 
  Sliders, Link2, AlertCircle
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { useEvent, useUpdateEvent } from '@/hooks/useEvents'
import { useSessions } from '@/hooks/useSessions'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/use-auth-store'
import { Skeleton } from '@/components/ui/skeleton'
import { CountryStateEntry, fetchCountryStates, getStatesForCountry } from '@/lib/country-states'
import { useEventCapabilities } from '@/lib/capabilities'

type DetailsTab = 'overview' | 'venue' | 'organizer' | 'modules' | 'team'
type ProgramStatus = 'draft' | 'final' | 'updated'

const statusToProgram = (status?: string): ProgramStatus => {
  if (status === 'active') return 'final'
  if (status === 'completed' || status === 'archived') return 'updated'
  return 'draft'
}

const programToStatus = (status: ProgramStatus) => {
  if (status === 'final') return 'active'
  if (status === 'updated') return 'completed'
  return 'draft'
}

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : '')
const toDateTimeInput = (value?: string | null) => (value ? value.slice(0, 16) : '')
const csvFormats = (value: string) =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean)

const VENUE_FACILITIES_PRESETS = [
  'High Speed WiFi',
  'Parking Available',
  'Wheelchair Accessible',
  'Catering Services',
  'Audio & Visual Systems',
  'On-site Accommodation',
  'Business Center',
  'Air Conditioned',
]

const TABS: { id: DetailsTab; label: string; icon: any }[] = [
  { id: 'overview',  label: 'Event Overview',     icon: Globe },
  { id: 'venue',     label: 'Venue & Location',   icon: Building2 },
  { id: 'organizer', label: 'Host & Organiser',   icon: Mail },
  { id: 'modules',   label: 'Modules & Deadlines',icon: Sliders },
  { id: 'team',      label: 'Team Access',        icon: Users },
]

export default function EventPlanningDetailsPage() {
  const { eventId } = useParams()
  const router = useRouter()
  const eventIdValue = eventId as string
  const { user } = useAuthStore()

  const { data: event, isLoading: eventLoading, refetch: refetchEvent } = useEvent(eventIdValue)
  const { data: sessions } = useSessions(eventIdValue)
  const updateEvent = useUpdateEvent(eventIdValue)
  const { data: capabilityData } = useEventCapabilities()

  const isAdmin = useMemo(() => {
    return user && ['super_admin', 'organiser', 'admin'].includes(user.role)
  }, [user])

  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as DetailsTab | null
  const [activeTab, setActiveTab] = useState<DetailsTab>(tabParam || 'overview')

  const [isSaving, setIsSaving] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([])
  const [analytics, setAnalytics] = useState<any>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  // Master Form State
  const [form, setForm] = useState({
    name: '',
    short_code: '',
    country: '',
    state: '',
    organizer_details: {
      name: '',
      email: '',
      phone: '',
      website: '',
    },
    location: '',
    venue_name: '',
    start_date: '',
    end_date: '',
    status: 'draft' as ProgramStatus,
    upload_deadline: '',
    max_file_size_mb: 500,
    allowed_formats: 'pptx, pdf, mp4, zip, folder',
    timezone: 'Asia/Kolkata',
    tagline: '',
    description: '',
    map_link: '',
    venue_images: [] as string[],
    venue_details: {
      website: '',
      email: '',
      phone: '',
      facilities: [] as string[],
      notes: '',
    },
    registration_enabled: true,
    speaker_enabled: true,
  })

  useEffect(() => {
    fetchCountryStates().then(setCountryStates).catch(console.error)
  }, [])

  useEffect(() => {
    if (!eventIdValue) return
    apiClient.get<any>(`/events/${eventIdValue}/participants/analytics-dashboard`)
      .then(res => setAnalytics(res))
      .catch(err => console.error('Failed to load analytics dashboard data', err))
  }, [eventIdValue])

  useEffect(() => {
    if (tabParam && ['overview', 'venue', 'organizer', 'modules', 'team'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  useEffect(() => {
    if (activeTab === 'team' && isAdmin) {
      setUsersLoading(true)
      apiClient.get<any[]>('/users')
        .then((res) => {
          const assigned = res.filter((u: any) =>
            u.assignments?.some((a: any) => a.event_id === eventIdValue)
          )
          setUsers(assigned)
        })
        .catch((err) => {
          console.error('Failed to fetch event users', err)
        })
        .finally(() => {
          setUsersLoading(false)
        })
    }
  }, [activeTab, isAdmin, eventIdValue])

  useEffect(() => {
    if (!event) return
    const details = (event as any).organizer_details || { name: '', email: '', phone: '', website: '' }
    const vDetails = (event as any).venue_details || {}

    setForm((current) => ({
      ...current,
      name: event.name || '',
      short_code: event.short_code || '',
      country: (event as any).country || '',
      state: (event as any).state || '',
      organizer_details: {
        name: details.name || (event as any).organizer_name || '',
        email: details.email || '',
        phone: details.phone || '',
        website: details.website || '',
      },
      location: event.location || '',
      venue_name: event.venue_name || '',
      start_date: toDateInput(event.start_date),
      end_date: toDateInput(event.end_date),
      status: statusToProgram(event.status),
      upload_deadline: toDateTimeInput(event.upload_deadline),
      max_file_size_mb: event.max_file_size_mb || 500,
      allowed_formats: (event.allowed_formats?.length ? event.allowed_formats : ['pptx', 'pdf', 'mp4', 'zip', 'folder']).join(', '),
      timezone: event.timezone || 'Asia/Kolkata',
      tagline: (event as any).tagline || '',
      description: (event as any).description || '',
      map_link: (event as any).map_link || '',
      venue_images: (event as any).venue_images || [],
      venue_details: {
        website: vDetails.website || '',
        email: vDetails.email || '',
        phone: vDetails.phone || '',
        facilities: vDetails.facilities || [],
        notes: vDetails.notes || '',
      },
      registration_enabled: (event as any).registration_settings?.enabled ?? true,
      speaker_enabled: (event as any).speaker_settings?.enabled ?? true,
    }))
  }, [event])

  const allowedFormats = useMemo(() => csvFormats(form.allowed_formats), [form.allowed_formats])

  const speakerCount = useMemo(() => {
    if (!sessions) return 0
    const set = new Set()
    sessions.forEach(s => s.speakers?.forEach(sp => set.add(sp.id)))
    return set.size
  }, [sessions])

  const sessionsCount = sessions?.length || 0

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const eventPayload: Record<string, unknown> = {
        name: form.name,
        short_code: form.short_code.toUpperCase(),
        country: form.country || null,
        state: form.state || null,
        organizer_name: form.organizer_details.name || null,
        organizer_details: form.organizer_details,
        location: form.location || null,
        venue_name: form.venue_name || null,
        status: programToStatus(form.status),
        timezone: form.timezone,
        upload_deadline: form.upload_deadline || null,
        max_file_size_mb: Number(form.max_file_size_mb),
        allowed_formats: allowedFormats,
        tagline: form.tagline,
        description: form.description,
        map_link: form.map_link || null,
        venue_images: form.venue_images || [],
        venue_details: form.venue_details,
        registration_settings: {
          ...((event as any)?.registration_settings || {}),
          enabled: form.registration_enabled,
        },
        speaker_settings: {
          ...((event as any)?.speaker_settings || {}),
          enabled: form.speaker_enabled,
        },
      }
      if (form.start_date) eventPayload.start_date = form.start_date
      if (form.end_date) eventPayload.end_date = form.end_date

      await updateEvent.mutateAsync(eventPayload)
      toast.success('Event planning & details updated successfully! 🚀')
      refetchEvent()
    } catch (error: any) {
      toast.error(error?.message || 'Could not save configuration.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleUploadVenueImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploadingImage(true)
    const file = files[0]
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await apiClient.post<{ url: string; venue_images?: string[] }>(
        `/events/${eventIdValue}/venue-images/upload`,
        formData,
        {
          headers: {
            'Content-Type': undefined,
            'Idempotency-Key': crypto.randomUUID(),
          },
        }
      )

      const newImages = res.venue_images || [...form.venue_images, res.url]
      setForm(prev => ({
        ...prev,
        venue_images: newImages,
      }))
      toast.success('Venue image uploaded successfully.')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Failed to upload venue image.')
    } finally {
      setIsUploadingImage(false)
    }
  }

  if (eventLoading) {
    return (
      <div className="w-full p-6 space-y-6">
        <Skeleton className="h-8 w-64 rounded-lg bg-[var(--bg-surface-2)]" />
        <Skeleton className="h-64 rounded-2xl bg-[var(--bg-surface-2)]" />
      </div>
    )
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet className="h-4 w-4 text-[var(--pri)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">Planning &amp; Details</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Event Master Details
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Core event schedule, dates, location, venue configuration, organizer credentials, and module activation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--pri)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-md shadow-[var(--pri)]/20 hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Save Details</span>
          </button>
        </div>
      </div>

      {/* ── Tabs Bar ── */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] w-fit overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Tab Content Panels ── */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-sm">
        
        {/* ── TAB 1: MASTER OVERVIEW & SCHEDULE ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-4xl">
            {/* Live Metrics Header */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">Registered Delegates</span>
                <span className="text-xl font-bold text-[var(--text-primary)] mt-1 block">
                  {analytics?.kpis?.total_registrations ?? 0}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">Active Speakers</span>
                <span className="text-xl font-bold text-[var(--text-primary)] mt-1 block">
                  {speakerCount}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">Scheduled Sessions</span>
                <span className="text-xl font-bold text-[var(--text-primary)] mt-1 block">
                  {sessionsCount}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">Ticket Collections</span>
                <span className="text-xl font-bold text-emerald-500 mt-1 block">
                  {analytics?.kpis?.total_revenue ? `₹ ${Number(analytics.kpis.total_revenue).toLocaleString()}` : '₹ 0'}
                </span>
              </div>
            </div>

            {/* Event Info Fields */}
            <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-[var(--text-primary)] block">Event Name / Title</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)] block">Event Tagline / Sub-heading</label>
                  <input
                    type="text"
                    placeholder="e.g. Advancing the Frontiers of Technology"
                    value={form.tagline}
                    onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)] block">Event Short Code</label>
                  <input
                    type="text"
                    placeholder="CONF2026"
                    value={form.short_code}
                    onChange={(e) => setForm({ ...form, short_code: e.target.value.toUpperCase() })}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-mono font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)] block">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)] block">End Date</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)] block">Primary Timezone</label>
                  <select
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                    <option value="UTC">UTC (Coordinated Universal Time - UTC+00:00)</option>
                    <option value="America/New_York">America/New_York (EST/EDT - UTC-05:00)</option>
                    <option value="Europe/London">Europe/London (GMT/BST - UTC+00:00)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST - UTC+04:00)</option>
                    <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+08:00)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)] block">Event Lifecycle Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ProgramStatus })}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  >
                    <option value="draft">Draft (Private Setup)</option>
                    <option value="final">Active / Live (Public Visibility)</option>
                    <option value="updated">Completed / Archived</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Event Description &amp; Overview</label>
                <textarea
                  rows={4}
                  placeholder="Provide a comprehensive summary of the event conference..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: VENUE & LOCATION ── */}
        {activeTab === 'venue' && (
          <div className="space-y-6 max-w-4xl">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Venue Location &amp; Facilities Setup
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Physical venue configuration, maps geolocation, and on-site facility badges.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Venue / Convention Center Name</label>
                <input
                  type="text"
                  placeholder="e.g. Jio World Convention Centre"
                  value={form.venue_name}
                  onChange={(e) => setForm({ ...form, venue_name: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Complete Address / Street Location</label>
                <textarea
                  rows={2}
                  placeholder="Street address, building name, block, area..."
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Country</label>
                <select
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value, state: '' })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                >
                  <option value="">Select Country</option>
                  {countryStates.map((c) => (
                    <option key={c.country} value={c.country}>{c.country}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">State / Province</label>
                <select
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  disabled={!form.country}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none disabled:opacity-50"
                >
                  <option value="">Select State</option>
                  {getStatesForCountry(countryStates, form.country).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Venue Official Website</label>
                <input
                  type="url"
                  placeholder="https://venue.com"
                  value={form.venue_details.website}
                  onChange={(e) => setForm({ ...form, venue_details: { ...form.venue_details, website: e.target.value } })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Google Maps Link</label>
                <input
                  type="url"
                  placeholder="https://maps.google.com/?q=..."
                  value={form.map_link}
                  onChange={(e) => setForm({ ...form, map_link: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>
            </div>

            {/* Venue Facilities Checklist */}
            <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] block">
                Venue Amenities &amp; Facilities
              </span>
              <div className="flex flex-wrap gap-2">
                {VENUE_FACILITIES_PRESETS.map((fac) => {
                  const isSelected = form.venue_details.facilities.includes(fac)
                  return (
                    <button
                      key={fac}
                      type="button"
                      onClick={() => {
                        const updated = isSelected
                          ? form.venue_details.facilities.filter(f => f !== fac)
                          : [...form.venue_details.facilities, fac]
                        setForm({ ...form, venue_details: { ...form.venue_details, facilities: updated } })
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--pri)]/10 text-[var(--pri)] border-[var(--pri)]/30 font-bold'
                          : 'bg-[var(--bg-surface-2)] text-[var(--text-secondary)] border-[var(--border-default)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {fac}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Venue Gallery Upload */}
            <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Venue Image Gallery ({form.venue_images.length})
                </span>
                {isUploadingImage && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--pri)]" />}
              </div>

              <input
                id="venue-image-upload-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadVenueImage}
                disabled={isUploadingImage}
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {form.venue_images.map((img, i) => (
                  <div key={i} className="h-28 rounded-xl overflow-hidden border border-[var(--border-default)] relative group bg-[var(--bg-surface-2)]">
                    <img src={img} alt="Venue" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition cursor-pointer">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = form.venue_images.filter((_, idx) => idx !== i)
                          setForm({ ...form, venue_images: updated })
                        }}
                        className="p-1.5 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  disabled={isUploadingImage}
                  onClick={() => document.getElementById('venue-image-upload-input')?.click()}
                  className="h-28 rounded-xl border-2 border-dashed border-[var(--border-default)] hover:border-[var(--pri)] flex flex-col items-center justify-center text-center bg-[var(--bg-surface-2)]/50 hover:bg-[var(--bg-surface-2)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Plus className="h-5 w-5 text-[var(--text-secondary)] mb-1" />
                  <span className="text-[11px] font-bold text-[var(--text-secondary)]">Add Venue Photo</span>
                </button>
              </div>
            </div>

            {/* Internal Notes */}
            <div className="space-y-1.5 pt-4 border-t border-[var(--border-subtle)]">
              <label className="text-xs font-bold text-[var(--text-primary)] block">Internal Logistics &amp; Operational Notes</label>
              <textarea
                rows={3}
                placeholder="Instructions for venue logistics, security clearance, parking access..."
                value={form.venue_details.notes}
                onChange={(e) => setForm({ ...form, venue_details: { ...form.venue_details, notes: e.target.value } })}
                className="w-full p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none resize-none"
              />
            </div>
          </div>
        )}

        {/* ── TAB 3: HOST & ORGANISER PROFILE ── */}
        {activeTab === 'organizer' && (
          <div className="space-y-6 max-w-4xl">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Host Organisation Profile &amp; Contact Credentials
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Official entity details, contact email, phone helpline, and website.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Host Organisation / Entity Name</label>
                <input
                  type="text"
                  placeholder="e.g. International Medical Conference Board"
                  value={form.organizer_details.name}
                  onChange={(e) => setForm({
                    ...form,
                    organizer_details: { ...form.organizer_details, name: e.target.value },
                  })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Official Inquiry &amp; Support Email</label>
                <input
                  type="email"
                  placeholder="contact@organisation.org"
                  value={form.organizer_details.email}
                  onChange={(e) => setForm({
                    ...form,
                    organizer_details: { ...form.organizer_details, email: e.target.value },
                  })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Helpline / Support Phone Number</label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={form.organizer_details.phone}
                  onChange={(e) => setForm({
                    ...form,
                    organizer_details: { ...form.organizer_details, phone: e.target.value },
                  })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Official Organisation Website</label>
                <input
                  type="url"
                  placeholder="https://organisation.org"
                  value={form.organizer_details.website}
                  onChange={(e) => setForm({
                    ...form,
                    organizer_details: { ...form.organizer_details, website: e.target.value },
                  })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: MODULES & DEADLINES ── */}
        {activeTab === 'modules' && (
          <div className="space-y-6 max-w-4xl">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Module Activation &amp; Upload Deadlines
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Enable core event services and enforce presentation file submission limits.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">Registration Module</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Enable attendee registrations, ticketing, and badge issuance.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, registration_enabled: !form.registration_enabled })}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border ${
                    form.registration_enabled ? 'bg-[var(--pri)] border-[var(--pri)]' : 'bg-[var(--bg-surface-3)] border-[var(--border-default)]'
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full transition-transform duration-300 shadow-sm ${
                    form.registration_enabled ? 'translate-x-5 bg-[var(--primary-contrast)]' : 'translate-x-0.5 bg-[var(--text-secondary)]'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div>
                  <span className="text-xs font-bold text-[var(--text-primary)] block">Speaker &amp; Presentation Module</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Enable speaker management, presentation file collection, and ePosters.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, speaker_enabled: !form.speaker_enabled })}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border ${
                    form.speaker_enabled ? 'bg-[var(--pri)] border-[var(--pri)]' : 'bg-[var(--bg-surface-3)] border-[var(--border-default)]'
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full transition-transform duration-300 shadow-sm ${
                    form.speaker_enabled ? 'translate-x-5 bg-[var(--primary-contrast)]' : 'translate-x-0.5 bg-[var(--text-secondary)]'
                  }`} />
                </button>
              </div>
            </div>

            {/* Submission Limits */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[var(--border-subtle)]">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Presentation Upload Deadline</label>
                <input
                  type="datetime-local"
                  value={form.upload_deadline}
                  onChange={(e) => setForm({ ...form, upload_deadline: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Max File Size Limit (MB)</label>
                <input
                  type="number"
                  min={10}
                  max={2048}
                  value={form.max_file_size_mb}
                  onChange={(e) => setForm({ ...form, max_file_size_mb: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-[var(--text-primary)] block">Allowed File Extensions</label>
                <input
                  type="text"
                  placeholder="pptx, pdf, mp4, zip, folder"
                  value={form.allowed_formats}
                  onChange={(e) => setForm({ ...form, allowed_formats: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 5: EVENT TEAM ACCESS ── */}
        {activeTab === 'team' && (
          <div className="space-y-6 max-w-4xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Assigned Team &amp; Workspace Access
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Organisers, coordinators, and staff members assigned to this event workspace.
                </p>
              </div>
              <Badge className="bg-[var(--pri)]/10 text-[var(--pri)] border-[var(--pri)]/20 text-xs font-bold px-2.5 py-1">
                {users.length} Team Members
              </Badge>
            </div>

            {usersLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-2">
                <Loader2 className="h-6 w-6 text-[var(--pri)] animate-spin" />
                <span className="text-xs font-bold text-[var(--text-secondary)]">Loading team members...</span>
              </div>
            ) : users.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {users.map((u, i) => (
                  <div key={i} className="p-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center font-bold text-xs shrink-0 border border-[var(--pri)]/20">
                      {((u.first_name?.[0] || '') + (u.last_name?.[0] || 'U')).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {u.first_name} {u.last_name}
                      </p>
                      <span className="text-[11px] text-[var(--text-secondary)] truncate block font-mono">
                        {u.email}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--card)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                      {u.role || 'Member'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 rounded-xl border border-dashed border-[var(--border-default)] text-center bg-[var(--bg-surface-2)]/40">
                <Users className="h-6 w-6 text-[var(--text-secondary)] mx-auto mb-1.5" />
                <p className="text-xs font-bold text-[var(--text-primary)]">No specific team assignments</p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Organisers with workspace access can manage this event. Assign team members in People &amp; Teams.
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
