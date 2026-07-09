"use client";

import { useEffect, useState, use } from "react";
import { getCampaigns, Campaign } from "@/services/email-service";
import { apiClient } from "@/lib/api-client";

// ===== Components =====
import CampaignDashboard from "@/components/organizer/emails/dashboard/CampaignDashboard";
import CampaignList from "@/components/organizer/emails/campaign/CampaignList";
import CampaignBuilder from "@/components/organizer/emails/campaign/CampaignBuilder";
import RegistrationCampaignBuilder from "@/components/organizer/emails/campaign/RegistrationCampaignBuilder";
import CampaignDetail from "@/components/organizer/emails/campaign/CampaignDetail";
import TemplateEditor from "@/components/organizer/emails/templates/TemplateEditor";
import LogsTable from "@/components/organizer/emails/logs/LogsTable";

type SectionType = "speaker" | "participant" | "templates";
type InnerTabType = "dashboard" | "inbox" | "sent" | "campaigns";

export default function UnifiedEmailPage({ params: paramsPromise }: { params: Promise<{ eventId: string }> }) {
  const params = use(paramsPromise);
  const { eventId } = params;

  const [section, setSection] = useState<SectionType>("speaker");
  const [activeTab, setActiveTab] = useState<InnerTabType>("dashboard");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Fetch campaigns based on the active section (speaker vs participant)
  const fetchCampaigns = async () => {
    if (!eventId || eventId === "undefined") return;
    try {
      if (section === "participant") {
        const data = await apiClient.get(`/events/${eventId}/notifications/campaigns?target_type=participant`);
        setCampaigns(data as Campaign[]);
        if (selectedCampaign) {
          const updated = (data as Campaign[]).find(c => c.id === selectedCampaign.id);
          if (updated) setSelectedCampaign(updated);
        }
      } else {
        const data = await getCampaigns(eventId);
        setCampaigns(data);
        if (selectedCampaign) {
          const updated = data.find(c => c.id === selectedCampaign.id);
          if (updated) setSelectedCampaign(updated);
        }
      }
    } catch (err: any) {
      console.error("Failed to fetch campaigns:", err);
    }
  };

  useEffect(() => {
    setSelectedCampaign(null);
    fetchCampaigns();
  }, [section, eventId]);

  useEffect(() => {
    if (eventId && eventId !== "undefined") {
      fetchCampaigns();
      const interval = setInterval(fetchCampaigns, 5000);
      return () => clearInterval(interval);
    }
  }, [eventId, section]);

  const renderInnerContent = () => {
    if (section === "templates") {
      return <TemplateEditor eventId={eventId} />;
    }

    const isParticipant = section === "participant";

    switch (activeTab) {
      case "dashboard":
        return <CampaignDashboard eventId={eventId} campaigns={campaigns} targetType={isParticipant ? "participant" : "speaker"} />;
      case "inbox":
        return (
          <div className="p-12 text-center text-[var(--muted)] font-black uppercase tracking-widest border border-white/5 bg-white/5 rounded-[2rem]">
            Inbox (Coming Soon)
          </div>
        );
      case "sent":
        return <LogsTable eventId={eventId} targetType={isParticipant ? "participant" : "speaker"} />;
      case "campaigns":
        if (selectedCampaign) {
          return (
            <CampaignDetail
              eventId={eventId}
              campaign={selectedCampaign}
              onBack={() => setSelectedCampaign(null)}
            />
          );
        }
        return (
          <div className="gap-6 flex-1 min-h-0 flex flex-col">
            <div className="shrink-0">
              {isParticipant ? (
                <RegistrationCampaignBuilder eventId={eventId} onCreated={fetchCampaigns} />
              ) : (
                <CampaignBuilder eventId={eventId} onCreated={fetchCampaigns} />
              )}
            </div>
            <CampaignList
              campaigns={campaigns}
              eventId={eventId}
              onSelect={setSelectedCampaign}
              onDeleted={fetchCampaigns}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 relative w-full max-w-full overflow-hidden p-6">
      {/* Background Aesthetics */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[var(--pri)] rounded-full blur-[120px] opacity-10 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-[var(--sec)] rounded-full blur-[120px] opacity-10" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        {/* Top Section Selector Bar */}
        <div className="flex flex-col gap-4 border-b border-white/5 pb-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[var(--color-text-primary)] to-[var(--color-text-secondary)] bg-clip-text text-transparent">
              Email Manager
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Configure, compose, and review email campaigns for your speakers and registration participants.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-2xl border border-white/5 backdrop-blur-md">
            {(["speaker", "participant", "templates"] as SectionType[]).map((sec) => (
              <button
                key={sec}
                onClick={() => setSection(sec)}
                className={`
                  px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-350
                  ${section === sec
                    ? "bg-[var(--color-primary-mid)] text-[var(--color-text-inverse)] shadow-lg"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5"
                  }
                `}
              >
                {sec === "speaker" ? "Speaker Email" : sec === "participant" ? "Registration Email" : "Templates"}
              </button>
            ))}
          </div>
        </div>

        {/* Inner Navigation Tabs (for Dashboard, Inbox, Sent, Campaigns) */}
        {section !== "templates" && (
          <div className="flex items-center gap-2 mb-6 bg-white/[0.02] border border-white/5 p-1 rounded-xl w-fit">
            {(["dashboard", "inbox", "sent", "campaigns"] as InnerTabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setSelectedCampaign(null);
                }}
                className={`
                  px-5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all
                  ${activeTab === tab
                    ? "bg-white/10 text-[var(--color-text-primary)] border border-white/5"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5"
                  }
                `}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* Main Content Area */}
        <main className="perspective-1000 flex-1 min-h-0 flex flex-col">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out flex-1 min-h-0 flex flex-col">
            {renderInnerContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
