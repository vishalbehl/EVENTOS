"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Download, Globe2, KeyRound, Server, X, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FetchSourceType = "cloud";
type SourceContext = {
  organization?: { id: string; name: string; slug?: string } | null;
  events?: Array<{ id: string; organization_id?: string; name: string; short_code?: string; status?: string; start_date?: string; end_date?: string; venue_name?: string }>;
  detail?: string;
};

export function FetchEventModal({
  isOpen,
  onClose,
  onSyncComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}) {
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");

  const [step, setStep] = useState<"source" | "review" | "syncing" | "done">("source");
  const [syncStatus, setSyncStatus] = useState("");
  const [sourceContext, setSourceContext] = useState<SourceContext | null>(null);

  const [sourceType] = useState<FetchSourceType>("cloud");
  const [sourceUrl, setSourceUrl] = useState("http://127.0.0.1:8000");
  const [apiKey, setApiKey] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setStep("source");
      setSelectedOrgId("");
      setSelectedEventId("");
      setSourceContext(null);
      setApiKey("");
      setLoginError("");

      apiClient
        .get<{ source_type: string; base_url: string; api_key_set: boolean }>("/venue/admin/fetch-source")
        .then((config) => {
          setSourceUrl(config.base_url || "http://127.0.0.1:8000");
        })
        .catch(() => undefined);
    }
  }, [isOpen]);

  const loadSourceContext = async () => {
    const status = await apiClient.get<{ source?: SourceContext & { reachable?: boolean; status?: string } }>(
      "/venue/admin/sync-status"
    );
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
      if (!apiKey) {
        throw new Error("Please enter a valid Fetch API Key.");
      }
      await apiClient.post("/venue/admin/fetch-source", {
        source_type: sourceType,
        base_url: sourceUrl,
        api_key: apiKey,
      });
      await loadSourceContext();
    } catch (e: any) {
      setLoginError(e?.message || "Failed to connect to fetch source.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleFetch = async () => {
    if (!selectedEventId) return;
    setStep("syncing");
    setSyncStatus("Connecting to source API...");

    try {
      setSyncStatus("Downloading full event schema, participants, speakers, and schedule...");
      await apiClient.post("/venue/admin/sync-event", {
        event_id: selectedEventId,
        organization_id: selectedOrgId,
        source_type: sourceType,
        source_url: sourceUrl,
      });

      setSyncStatus("Caching presentation slides & media assets into local MinIO...");
      setStep("done");
      if (onSyncComplete) onSyncComplete();
    } catch (e: any) {
      setLoginError(e?.message || "Sync failed. Please check source server and retry.");
      setStep("source");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl space-y-4">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surf)] border border-[var(--border)] text-[var(--pri)]">
            <Download className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
              Fetch & Provision Event Data
            </h2>
            <p className="text-[10px] text-[var(--muted)]">Synchronize full event data into local Venue Server</p>
          </div>
        </div>

        {loginError && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-bold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{loginError}</span>
          </div>
        )}

        {step === "source" && (
          <form onSubmit={handleSourceSave} className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-[var(--pri)]/30 bg-[var(--surf)] p-3">
              <Globe2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-[var(--text)]">EventOS Main Cloud Server</div>
                <div className="text-[10px] text-[var(--muted)]">Direct upstream synchronization for events, schedules, speakers, & assets</div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                Base URL
              </label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="http://127.0.0.1:8000"
                className="h-10 text-xs font-semibold"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                Fetch API Key
              </label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste Venue API key generated in Command Center..."
                className="h-10 text-xs font-semibold"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAuthenticating}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--pri)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--primary-contrast)]"
              >
                {isAuthenticating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Connect & Validate <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {step === "review" && sourceContext && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-4 space-y-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
                Source Event Identified
              </div>
              <div className="space-y-1">
                <div className="font-bold text-sm text-[var(--text)]">
                  {sourceContext.events?.[0]?.name || "Discovered Event"}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Organizer: {sourceContext.organization?.name || "Event Organizer"}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep("source")}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
              >
                Back
              </button>
              <button
                onClick={handleFetch}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--pri)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--primary-contrast)]"
              >
                <Download className="h-4 w-4" />
                <span>Pull Event Data into Venue Server</span>
              </button>
            </div>
          </div>
        )}

        {step === "syncing" && (
          <div className="py-8 text-center space-y-4">
            <RefreshCw className="h-10 w-10 animate-spin text-[var(--pri)] mx-auto" />
            <div className="space-y-1">
              <div className="text-xs font-black uppercase text-[var(--text)]">Synchronizing Live Data</div>
              <div className="text-[10px] text-[var(--muted)] font-mono">{syncStatus}</div>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="py-8 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
            <div className="space-y-1">
              <div className="text-xs font-black uppercase text-[var(--text)]">Event Provisioned Successfully</div>
              <div className="text-[10px] text-[var(--muted)]">
                Local database updated. Dashboard metrics and staging rooms are now live.
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl bg-[var(--pri)] px-6 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--primary-contrast)]"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
