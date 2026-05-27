'use client'

import { useEffect, useState, use } from 'react'
import { getCampaigns, Campaign } from '@/services/email-service'
import { apiClient } from '@/lib/api-client'

import CampaignDashboard from '@/components/emails/dashboard/CampaignDashboard'
import CampaignList from '@/components/emails/campaign/CampaignList'
import CampaignDetail from '@/components/emails/campaign/CampaignDetail'
import LogsTable from '@/components/emails/logs/LogsTable'
import RegistrationTemplateEditor from '@/components/emails/templates/RegistrationTemplateEditor'
import RegistrationCampaignBuilder from '@/components/emails/campaign/RegistrationCampaignBuilder'
import AnnouncementsTab from '@/components/emails/AnnouncementsTab'

type TabType =
  | 'dashboard'
  | 'inbox'
  | 'sent'
  | 'campaigns'
  | 'templates'
  | 'announcements'

export default function RegistrationEmailPage({ params: paramsPromise }: { params: Promise<{ eventId: string }> }) {
  const params = use(paramsPromise)
  const { eventId } = params

  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)

  const fetchCampaigns = async () => {
    if (!eventId || eventId === 'undefined') return
    try {
      const data = await apiClient.get(`/events/${eventId}/notifications/campaigns?target_type=participant`)
      setCampaigns(data as Campaign[])
      if (selectedCampaign) {
        const updated = (data as Campaign[]).find(c => c.id === selectedCampaign.id)
        if (updated) setSelectedCampaign(updated)
      }
    } catch (err: any) {
      if (err?.status === 401) window.location.href = '/'
    }
  }

  useEffect(() => {
    if (eventId && eventId !== 'undefined') {
      fetchCampaigns()
      const interval = setInterval(fetchCampaigns, 5000)
      return () => clearInterval(interval)
    }
  }, [eventId])

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <CampaignDashboard eventId={eventId} campaigns={campaigns} targetType="participant" />
      case 'inbox':
        return (
          <div className="p-12 text-center text-[var(--muted)] font-black uppercase tracking-widest border border-white/5 bg-white/5 rounded-[2rem]">
            Inbox (Coming Soon)
          </div>
        )
      case 'sent':
        return <LogsTable eventId={eventId} targetType="participant" />
      case 'campaigns':
        if (selectedCampaign) {
          return (
            <CampaignDetail
              eventId={eventId}
              campaign={selectedCampaign}
              onBack={() => setSelectedCampaign(null)}
            />
          )
        }
        return (
          <div className="gap-6 flex-1 min-h-0 flex flex-col">
            <div className="shrink-0">
              <RegistrationCampaignBuilder eventId={eventId} onCreated={fetchCampaigns} />
            </div>
            <CampaignList
              campaigns={campaigns}
              eventId={eventId}
              onSelect={setSelectedCampaign}
              onDeleted={fetchCampaigns}
            />
          </div>
        )
      case 'templates':
        return <RegistrationTemplateEditor eventId={eventId} />
      case 'announcements':
        return <AnnouncementsTab eventId={eventId} />
      default:
        return null
    }
  }

  return (
    <div 
      className="h-full flex-1 flex flex-col min-h-0 relative w-full max-w-full overflow-hidden"
    >
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[var(--pri)] rounded-full blur-[120px] opacity-10 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-[var(--sec)] rounded-full blur-[120px] opacity-10" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0 mb-6 pb-4 border-b border-white/5">
          <div className="animate-in fade-in slide-in-from-left-4 duration-700">
            <h1 className="text-4xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
              REGISTRATION <span className="text-[var(--pri)]">CAMPAIGNS</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--muted)] mt-1">
              EventOS Participant Messaging & Campaign Ecosystem
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md animate-in fade-in slide-in-from-right-4 duration-700">
            {(['dashboard', 'inbox', 'sent', 'campaigns', 'templates', 'announcements'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSelectedCampaign(null) }}
                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                  activeTab === tab
                    ? 'bg-[var(--pri)] text-white shadow-[0_10px_20px_color-mix(in_srgb,var(--pri)_30%,transparent)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-white/5'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </header>

        <main className="perspective-1000 flex-1 min-h-0 flex flex-col">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out flex-1 min-h-0 flex flex-col">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  )
}
