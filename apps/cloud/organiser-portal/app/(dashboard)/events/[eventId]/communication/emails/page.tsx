"use client";

import { useState, use } from "react";
import type { Campaign } from "@/services/email-service";
import { useCampaignPage } from "@/hooks/useCommunicationPages";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/use-auth-store";
import { useRetryAfter } from "@/hooks/useRetryAfter";
import type { ApiError } from "@/lib/api-client";

// ===== Components =====
import CampaignDashboard from "@/components/organizer/emails/dashboard/CampaignDashboard";
import CampaignList from "@/components/organizer/emails/campaign/CampaignList";
import CampaignBuilder from "@/components/organizer/emails/campaign/CampaignBuilder";
import RegistrationCampaignBuilder from "@/components/organizer/emails/campaign/RegistrationCampaignBuilder";
import CampaignDetail from "@/components/organizer/emails/campaign/CampaignDetail";
import TemplateEditor from "@/components/organizer/emails/templates/TemplateEditor";
import LogsTable from "@/components/organizer/emails/logs/LogsTable";

type SectionType = "speaker" | "participant" | "templates";
type InnerTabType = "dashboard" | "sent" | "campaigns";

export default function UnifiedEmailPage({ params: paramsPromise }: { params: Promise<{ eventId: string }> }) {
  const params = use(paramsPromise);
  const { eventId } = params;
  const { user } = useAuthStore();
  const access = usePermissions(eventId);
  return <ScopedEmailPage key={JSON.stringify([user?.id, user?.organization_id,
    eventId, access.policyRevision])} eventId={eventId} />;
}

function ScopedEmailPage({ eventId }: { eventId: string }) {
  const [section, setSection] = useState<SectionType>("speaker");
  const [activeTab, setActiveTab] = useState<InnerTabType>("dashboard");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const listing = useCampaignPage(eventId, section === "participant" ? "participant" : "speaker",
    cursors[cursors.length - 1]);
  const campaigns = listing.data?.items ?? [];
  const loading = listing.accessLoading || listing.isFetching;
  const problem = (listing.accessError || listing.error) as ApiError | null;
  const retrySeconds = useRetryAfter(problem);
  const errorText = listing.accessDenied ? "Campaign access is not available."
    : problem?.status === 401 ? "Your session expired. Please sign in again."
    : problem?.status === 403 ? "Your campaign access has changed."
    : problem?.status === 404 ? "Campaigns are unavailable in this context."
    : problem?.status === 429 ? "Too many requests. Wait before trying again."
    : problem?.status === 503 ? "The service is temporarily unavailable."
    : problem?.status === 409 || problem?.status === 412 ? "Campaign state changed. Reload the first page."
    : problem ? "Campaigns could not be loaded. Try again later." : null;
  const fetchCampaigns = () => {
    if (cursors.length > 1) setCursors([undefined]);
    else void listing.refetch();
  };

  const renderInnerContent = () => {
    if (section === "templates") {
      return <TemplateEditor eventId={eventId} />;
    }

    const isParticipant = section === "participant";

    switch (activeTab) {
      case "dashboard":
        if (errorText) return <div className="space-y-3">
          <p role="alert">{errorText}</p>
          {retrySeconds > 0 && <p>Try again in {retrySeconds}s.</p>}
          {problem?.correlationId && <p>Reference: {problem.correlationId}</p>}
          {!listing.accessDenied && ![401, 403, 404].includes(problem?.status ?? 0)
            && <button disabled={retrySeconds > 0 || loading} onClick={() => {
              if (listing.accessError) void listing.refreshAccess(); else fetchCampaigns();
            }}>Retry activity</button>}
        </div>;
        if (loading || !listing.data) return <p role="status">Loading communication activity…</p>;
        return <CampaignDashboard eventId={eventId} campaigns={campaigns} targetType={isParticipant ? "participant" : "speaker"} />;
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
              loading={loading}
              errorText={errorText}
            />
            <div className="flex items-center justify-between gap-4">
              <span>{loading ? "Loading…" : errorText ? "Page unavailable" : campaigns.length + " campaigns on this page"}</span>
              {retrySeconds > 0 && <span role="status">Try again in {retrySeconds}s.</span>}
              {problem?.correlationId && <span>Reference: {problem.correlationId}</span>}
              <div className="flex items-center gap-3">
                <button disabled={loading || !!errorText || cursors.length <= 1}
                  onClick={() => setCursors(previous => previous.slice(0, -1))}>Previous</button>
                <button disabled={loading || cursors.length <= 1}
                  onClick={() => setCursors([undefined])}>First page</button>
                <button disabled={loading || !!errorText || !listing.data?.has_next || !listing.data?.next_cursor}
                  onClick={() => { const next = listing.data?.next_cursor;
                    if (next) setCursors(previous => [...previous.slice(-99), next]); }}>Next</button>
                <button disabled={loading || retrySeconds > 0 || listing.accessDenied
                  || [401, 403, 404].includes(problem?.status ?? 0)} onClick={() => {
                  if (listing.accessError) void listing.refreshAccess(); else fetchCampaigns();
                }}>Refresh</button>
              </div>
            </div>
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
                onClick={() => { setSection(sec); setSelectedCampaign(null); setCursors([undefined]); }}
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

        {/* Inner Navigation Tabs */}
        {section !== "templates" && (
          <div className="flex items-center gap-2 mb-6 bg-white/[0.02] border border-white/5 p-1 rounded-xl w-fit">
            {(["dashboard", "sent", "campaigns"] as InnerTabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setSelectedCampaign(null);
                  setCursors([undefined]);
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
