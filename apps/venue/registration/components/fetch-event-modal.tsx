"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Download, Globe2, KeyRound, Server, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";

type FetchSourceType = "cloud" | "registration_server" | "venue_server";
type SourceContext = {
  organization?: { id: string; name: string; slug?: string } | null;
  events?: Array<{ id: string; organization_id?: string; name: string; short_code?: string; status?: string; start_date?: string; end_date?: string; venue_name?: string }>;
  detail?: string;
};

export function FetchEventModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  
  const [step, setStep] = useState<"source" | "review" | "syncing" | "done">("source");
  const [syncStatus, setSyncStatus] = useState("");
  const [sourceContext, setSourceContext] = useState<SourceContext | null>(null);
  
  const [sourceType, setSourceType] = useState<FetchSourceType>("cloud");
  const [sourceUrl, setSourceUrl] = useState("http://127.0.0.1:8000");
  const [apiKey, setApiKey] = useState("");
  const [fetchCredential, setFetchCredential] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setStep("source");
      setSelectedOrgId("");
      setSelectedEventId("");
      setSourceContext(null);
      setApiKey("");
      setLoginError("");
      apiClient.get<{ source_type: FetchSourceType; base_url: string; api_key_set: boolean }>("/venue/admin/fetch-source")
        .then((config) => {
          setSourceType(config.source_type || "cloud");
          setSourceUrl(config.base_url || "http://127.0.0.1:8000");
          if (config.api_key_set) setFetchCredential("__stored__");
        })
        .catch(() => undefined);
    }
  }, [isOpen, fetchCredential]);

  const loadSourceContext = async () => {
    const status = await apiClient.get<{ source?: SourceContext & { reachable?: boolean; status?: string } }>("/venue/admin/sync-status");
    const context = status.source || {};
    if (!context.reachable) {
      throw new Error(context.detail || "Failed to verify fetch API key.");
    }
    const event = context.events?.[0];
    if (!context.organization?.id || !event?.id) {
      throw new Error("This API key did not return an organizer and event context.");
    }
    setSourceContext(context);
    setSelectedOrgId(context.organization.id);
    setSelectedEventId(event.id);
    setStep("review");
  };

  const handleSourceSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setLoginError("");
    try {
      if (apiKey) {
        await apiClient.post("/venue/admin/fetch-source", {
          source_type: sourceType,
          base_url: sourceUrl,
          api_key: apiKey,
        });
        setFetchCredential(apiKey);
      } else if (!fetchCredential) {
        throw new Error("Paste the source API key before continuing.");
      }
      await loadSourceContext();
    } catch (e: any) {
      setLoginError(e?.message || "Failed to save fetch source.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleFetch = async () => {
    if (!selectedEventId || !fetchCredential) return;
    setStep("syncing");
    setSyncStatus("Initializing connection...");
    
    try {
      setSyncStatus("Downloading registration snapshot...");
      try {
        await apiClient.post("/venue/admin/sync-event", { 
          event_id: selectedEventId,
          organization_id: selectedOrgId,
          source_type: sourceType,
          source_url: sourceUrl,
        }, {
          headers: apiKey ? { "X-Fetch-Api-Key": apiKey } : undefined
        });
        setSyncStatus("Applying snapshot to local DB...");
        if (window.venueDesktop) {
          try {
            const snapshot = await apiClient.get(`/venue/admin/events/${selectedEventId}/local-db-snapshot`);
            setSyncStatus("Updating desktop SQLite fallback DB...");
            await window.venueDesktop.loadLocalSnapshot(snapshot);
          } catch (error) {
            console.error(error);
            setSyncStatus("Event synced, but desktop SQLite fallback could not be updated.");
            await new Promise((resolve) => setTimeout(resolve, 1800));
          }
        }
        setTimeout(() => setStep("done"), 1000);
      } catch (error) {
        console.error(error);
        setSyncStatus("Failed to sync data.");
        setTimeout(() => setStep("review"), 3000);
      }
    } catch (e) {
      setSyncStatus("Error syncing data.");
      setTimeout(() => setStep("review"), 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] shadow-2xl shadow-black/30 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surf)]/70 p-5">
          <h3 className="flex items-center gap-2 font-black uppercase tracking-wider text-[var(--text)]">
            <Download className="w-5 h-5 text-[var(--pri)]" />
            Fetch Event Data
          </h3>
          <button
            onClick={onClose}
            disabled={step === "syncing"}
            className="grid size-8 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--raised)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          {step === "source" && (
            <form onSubmit={handleSourceSave} className="space-y-4">
              <div className="mb-6">
                <h4 className="text-sm font-black text-[var(--text)]">Fetch Source API Key</h4>
                <p className="text-xs text-[var(--muted)] mt-1">Choose where registration data will be pulled from. Cloud works from anywhere; Registration Server and Venue Server must be reachable on the same network.</p>
              </div>
              
              {loginError && (
                <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-xs font-semibold text-red-400">
                  {loginError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[var(--muted)] mb-1">Source Type</label>
                <div className="relative">
                  <Server className="absolute left-3 top-2.5 w-4 h-4 text-[var(--muted)]" />
                  <select value={sourceType} onChange={(e) => setSourceType(e.target.value as FetchSourceType)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surf)] py-2 pl-9 pr-4 text-sm text-[var(--text)] outline-none transition focus:border-[var(--pri)] focus:ring-2 focus:ring-[var(--pri)]/25">
                    <option value="cloud">Command Center / Cloud</option>
                    <option value="registration_server">On-site Registration Server</option>
                    <option value="venue_server">On-site Venue Server</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-[var(--muted)] mb-1">Source URL</label>
                <div className="relative">
                  <Globe2 className="absolute left-3 top-2.5 w-4 h-4 text-[var(--muted)]" />
                  <input required type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder={sourceType === "cloud" ? "https://api.eventos..." : "http://192.168.1.10:8001"} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surf)] py-2 pl-9 pr-4 text-sm text-[var(--text)] outline-none transition focus:border-[var(--pri)] focus:ring-2 focus:ring-[var(--pri)]/25" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--muted)] mb-1">Fetch API Key</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-[var(--muted)]" />
                <input required={!fetchCredential} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={fetchCredential ? "Leave blank to verify stored key" : "Paste source API key"} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surf)] py-2 pl-9 pr-4 text-sm text-[var(--text)] outline-none transition focus:border-[var(--pri)] focus:ring-2 focus:ring-[var(--pri)]/25" />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-bold text-[var(--muted)] transition-colors hover:bg-[var(--raised)] hover:text-[var(--text)]">Cancel</button>
                <button type="submit" disabled={isAuthenticating} className="rounded-lg bg-[var(--pri)] px-4 py-2 text-sm font-black text-[var(--primary-contrast)] transition-colors hover:opacity-90 disabled:opacity-50">
                  {isAuthenticating ? "Verifying..." : apiKey ? "Save & Verify" : "Verify Stored Key"}
                </button>
              </div>
            </form>
          )}

          {step === "review" && (
            <div className="space-y-5">
              <p className="text-sm text-[var(--muted)]">This API key is event-scoped. Registration Software will fetch only the organizer and event shown below.</p>
              
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">Organizer</p>
                <p className="mt-2 text-base font-black text-[var(--text)]">{sourceContext?.organization?.name || "Verified organizer"}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{sourceContext?.organization?.slug || selectedOrgId}</p>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">Event</p>
                <p className="mt-2 text-base font-black text-[var(--text)]">{sourceContext?.events?.[0]?.name || "Verified event"}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                  {[sourceContext?.events?.[0]?.short_code, sourceContext?.events?.[0]?.venue_name, sourceContext?.events?.[0]?.status].filter(Boolean).join(" · ") || selectedEventId}
                </p>
              </div>

              <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3">
                <button type="button" onClick={() => setStep("source")} className="rounded-lg px-4 py-2 text-sm font-bold text-[var(--muted)] transition-colors hover:bg-[var(--raised)] hover:text-[var(--text)]">Change API</button>
                <button 
                  onClick={handleFetch} 
                  disabled={!selectedEventId}
                  className="flex items-center gap-2 rounded-lg bg-[var(--pri)] px-4 py-2 text-sm font-black text-[var(--primary-contrast)] transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Download
                </button>
              </div>
            </div>
          )}

          {step === "syncing" && (
            <div className="py-8 flex flex-col items-center justify-center space-y-4">
              <div className="h-12 w-12 rounded-full border-4 border-[var(--border)] border-t-[var(--pri)] animate-spin"></div>
              <p className="font-bold text-[var(--text)]">{syncStatus}</p>
            </div>
          )}

          {step === "done" && (
            <div className="py-8 flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mb-2 border border-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <p className="text-lg font-black text-[var(--text)]">Sync Complete!</p>
              <p className="text-sm text-[var(--muted)] text-center">The event data has been successfully downloaded to the local database.</p>
              <button 
                onClick={() => {
                  onClose();
                  window.location.reload();
                }}
                className="mt-6 rounded-lg bg-[var(--pri)] px-6 py-2.5 font-black text-[var(--primary-contrast)] transition-colors hover:opacity-90"
              >
                Reload Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
