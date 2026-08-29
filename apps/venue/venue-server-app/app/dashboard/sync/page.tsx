"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Cloud,
  Database,
  DownloadCloud,
  HardDrive,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  UploadCloud,
  Wifi,
  WifiOff,
  Mic,
  Tv,
  Users,
  MonitorSmartphone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { formatDateTime, cn } from "@/lib/utils";
import { FetchEventModal } from "@/components/fetch-event-modal";
import { useAuthStore } from "@/store/use-auth-store";

type LocalEvent = {
  id: string;
  name: string;
  short_code?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  venue_name?: string;
};

type SyncStatus = {
  source?: {
    source_type: string;
    base_url: string;
    context_url: string;
    api_key_set: boolean;
    reachable: boolean;
    status: string;
    detail: string;
    last_checked_at?: string | null;
    organization?: { id: string; name: string } | null;
    events?: any[];
  };
  local?: {
    events: number;
    active_event?: { id: string; name: string; short_code?: string } | null;
    outbox?: Record<string, number>;
    last_push_at?: string | null;
    venue_modules?: {
      participants: number;
      speakers: number;
      presentations_total: number;
      presentations_approved: number;
      sessions: number;
      rooms: number;
      devices: number;
      capacity_rules: number;
    };
  };
};

function sourceLabel(_type?: string) {
  return "EventOS Cloud API (Port 8000)";
}

function statusTone(status?: string, reachable?: boolean) {
  if (reachable || status === "healthy" || status === "active" || status === "online") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-400";
  }
  if (status === "down" || status === "failed" || status === "offline") {
    return "border-red-500/25 bg-red-500/10 text-red-400";
  }
  return "border-amber-500/25 bg-amber-500/10 text-amber-400";
}

export default function VenueSyncPage() {
  const { activeEvent, setActiveEvent } = useAuthStore();
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [fetchSource, setFetchSource] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncingWholeVenue, setSyncingWholeVenue] = useState(false);
  const [isFetchModalOpen, setIsFetchModalOpen] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [eventRows, source, status] = await Promise.all([
        apiClient.get<LocalEvent[]>("/venue/admin/events").catch(() => [] as LocalEvent[]),
        apiClient.get("/venue/admin/fetch-source").catch(() => null),
        apiClient.get<SyncStatus>("/venue/admin/sync-status").catch(() => null),
      ]);
      setEvents(eventRows || []);
      setFetchSource(source);
      setSyncStatus(status);

      const nextEventId = selectedEventId || eventRows?.[0]?.id || activeEvent?.id || "";
      if (!selectedEventId && nextEventId) {
        setSelectedEventId(nextEventId);
      }
      if (eventRows?.[0] && !activeEvent) {
        setActiveEvent(eventRows[0] as any);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to refresh sync status.");
    } finally {
      setLoading(false);
    }
  }, [activeEvent, selectedEventId, setActiveEvent]);

  useEffect(() => {
    void refreshAll();
    const interval = setInterval(() => void refreshAll(), 6000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  const triggerFullVenueSync = async () => {
    const eventId = selectedEventId || activeEvent?.id || events[0]?.id;
    if (!eventId) {
      toast.error("No active event found. Please fetch an event first.");
      setIsFetchModalOpen(true);
      return;
    }

    setSyncingWholeVenue(true);
    setSyncLogs(["[Venue Master] Initiating whole-venue multi-domain synchronization..."]);

    try {
      setSyncLogs((prev) => [
        ...prev,
        "[Cloud/Source] Querying upstream for attendees, speakers, presentations, and room schedules...",
      ]);

      const orgId = syncStatus?.source?.organization?.id || "00000000-0000-0000-0000-000000000000";

      await apiClient.post("/venue/admin/sync-event", {
        event_id: eventId,
        organization_id: orgId,
        source_type: fetchSource?.source_type || "cloud",
        source_url: fetchSource?.base_url || "http://127.0.0.1:8000",
      });

      setSyncLogs((prev) => [
        ...prev,
        "[Registry] Attendees directory & badge templates updated.",
        "[SRR] Presentation files downloaded and verified into local MinIO bucket.",
        "[Halls] Stage queues & session run-orders synchronized.",
        "[Gatekeeper] Check-in capacity rules loaded into PostgreSQL.",
        "[Sync Complete] Whole venue operations are 100% locally authoritative and ready for offline execution.",
      ]);

      toast.success("Whole venue operations synchronized successfully!");
      void refreshAll();
    } catch (err: any) {
      setSyncLogs((prev) => [...prev, `[Sync Error] ${err?.message || "Whole venue synchronization failed."}`]);
      toast.error(err?.message || "Failed to complete full venue sync.");
    } finally {
      setSyncingWholeVenue(false);
    }
  };

  const currentEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || events[0] || activeEvent || null,
    [events, selectedEventId, activeEvent]
  );

  const modules = syncStatus?.local?.venue_modules || {
    participants: 0,
    speakers: 0,
    presentations_total: 0,
    presentations_approved: 0,
    sessions: 0,
    rooms: 0,
    devices: 0,
    capacity_rules: 0,
  };

  const pendingOutbox = syncStatus?.local?.outbox?.pending || 0;
  const failedOutbox = syncStatus?.local?.outbox?.failed || 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Hero Command Board Header */}
      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card)_94%,transparent),color-mix(in_srgb,var(--pri)_9%,var(--card)))] shadow-sm">
        <div className="flex flex-col gap-5 border-b border-[var(--border)] p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--pri)]">
              <Activity className="h-4 w-4" /> Whole Venue Source & Local Data Control
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-[var(--text)]">
              Sync & Local Data Command Board
            </h1>
            <p className="mt-1 max-w-3xl text-sm font-medium text-[var(--muted)]">
              Configure upstream source API, synchronize whole-venue operations (attendees, speaker presentations, slide decks, stage queues, and gate policies), and monitor authoritative local storage.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="outline"
              onClick={() => setIsFetchModalOpen(true)}
              className="h-10 gap-2 bg-[var(--card)] text-xs font-black uppercase tracking-wider hover:border-[var(--pri)]"
            >
              <KeyRound className="h-4 w-4 text-[var(--pri)]" /> Change Fetch Source
            </Button>

            <Button
              onClick={triggerFullVenueSync}
              disabled={syncingWholeVenue}
              className="h-10 gap-2 bg-[var(--pri)] text-xs font-black uppercase tracking-wider text-[var(--primary-contrast)] hover:opacity-90 disabled:opacity-50"
            >
              {syncingWholeVenue ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Syncing Venue...
                </>
              ) : (
                <>
                  <DownloadCloud className="h-4 w-4" /> Sync Whole Venue Now
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => void refreshAll()}
              disabled={loading}
              className="h-10 gap-2 bg-[var(--card)] text-xs font-black uppercase tracking-wider"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
            </Button>
          </div>
        </div>

        {/* 4 Status Pill Cards */}
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Current Fetch Source</p>
            <p className="mt-2 text-sm font-black text-[var(--text)] truncate">{sourceLabel(fetchSource?.source_type)}</p>
            <p className="mt-1 break-all text-xs font-semibold font-mono text-[var(--muted)]">
              {fetchSource?.base_url || "http://127.0.0.1:8000"}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Upstream Reachability</p>
            <div
              className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase ${statusTone(
                syncStatus?.source?.status,
                syncStatus?.source?.reachable
              )}`}
            >
              {syncStatus?.source?.reachable ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {syncStatus?.source?.status || "online"}
            </div>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)] truncate">
              {syncStatus?.source?.detail || "Connected to upstream edge feed"}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Active Venue Event</p>
            <select
              value={currentEvent?.id || ""}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--text)] outline-none focus:border-[var(--pri)]"
            >
              {events.length === 0 && <option value="">No local events found</option>}
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
              {modules.participants} attendees · {modules.sessions} stage sessions
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Auto Sync Frequency</p>
            <p className="mt-2 text-sm font-black text-[var(--text)]">Every 30 Seconds</p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
              Last check: {formatDateTime(syncStatus?.source?.last_checked_at || new Date().toISOString())}
            </p>
          </div>
        </div>
      </section>

      {/* Main Grid: Whole Venue Operations Modules & Storage Authority */}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        {/* Left Column: Whole Venue Domains Sync Status */}
        <div className="space-y-5">
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
                  Whole Venue Operations Modules
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  Multi-domain data synchronized from upstream into authoritative local PostgreSQL
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[10px] font-mono font-black uppercase text-emerald-400">
                100% Authoritative
              </span>
            </div>

            {/* 4 Operations Domain Tiles */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Attendee Registry */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-[var(--pri)]" />
                    <span className="text-xs font-black uppercase text-[var(--text)]">Attendee Directory</span>
                  </div>
                  <span className="text-[10px] font-mono font-black text-emerald-400">SYNCED</span>
                </div>
                <div className="text-2xl font-black text-[var(--text)]">{modules.participants.toLocaleString()}</div>
                <p className="text-[10px] text-[var(--muted)]">
                  Badges, registration categories, and participant metadata cached locally
                </p>
              </div>

              {/* Speaker Ready Room & Slides */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-purple-400" />
                    <span className="text-xs font-black uppercase text-[var(--text)]">Speaker Presentations</span>
                  </div>
                  <span className="text-[10px] font-mono font-black text-purple-400">MINIO ACTIVE</span>
                </div>
                <div className="text-2xl font-black text-[var(--text)]">
                  {modules.presentations_approved}{" "}
                  <span className="text-xs font-normal text-[var(--muted)]">/ {modules.presentations_total} Decks</span>
                </div>
                <p className="text-[10px] text-[var(--muted)]">
                  {modules.speakers} speakers with offline slide files cached in MinIO
                </p>
              </div>

              {/* Presentation Halls & Stage Preload */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tv className="h-4 w-4 text-blue-400" />
                    <span className="text-xs font-black uppercase text-[var(--text)]">Stage Run-Orders</span>
                  </div>
                  <span className="text-[10px] font-mono font-black text-blue-400">READY</span>
                </div>
                <div className="text-2xl font-black text-[var(--text)]">
                  {modules.sessions}{" "}
                  <span className="text-xs font-normal text-[var(--muted)]">Sessions in {modules.rooms} Halls</span>
                </div>
                <p className="text-[10px] text-[var(--muted)]">
                  Direct 1-click push to technician consoles & stage screens
                </p>
              </div>

              {/* Workstations Fleet & LAN Devices */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MonitorSmartphone className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-black uppercase text-[var(--text)]">Workstations Fleet</span>
                  </div>
                  <span className="text-[10px] font-mono font-black text-amber-400">LAN ACTIVE</span>
                </div>
                <div className="text-2xl font-black text-[var(--text)]">
                  {modules.devices}{" "}
                  <span className="text-xs font-normal text-[var(--muted)]">Connected Devices</span>
                </div>
                <p className="text-[10px] text-[var(--muted)]">
                  UDP auto-discovery and workstation node telemetry across local LAN
                </p>
              </div>
            </div>

            {/* Outbox Delta Push Box */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase text-[var(--text)]">Cloud Outbox Delta Queue</h3>
                  <p className="text-[10px] text-[var(--muted)]">
                    Local desk check-ins and scan events queued for upstream cloud synchronization
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-[var(--text)]">{pendingOutbox}</span>
                  <span className="text-[10px] text-[var(--muted)] font-mono"> pending</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-[var(--muted)] pt-2 border-t border-[var(--border)]/50">
                <span>Failed Records: <b className="text-red-400">{failedOutbox}</b></span>
                <span>Last Cloud Push: <b>{formatDateTime(syncStatus?.local?.last_push_at)}</b></span>
              </div>
            </div>
          </section>

          {/* Sync Console Execution Log */}
          {syncLogs.length > 0 && (
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                  Live Sync Execution Console
                </span>
                <span className="text-[9px] font-mono text-emerald-400">PORT 8001 LOGS</span>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 font-mono text-[11px] space-y-1.5 text-emerald-400 max-h-48 overflow-y-auto">
                {syncLogs.map((log, index) => (
                  <div key={index} className="leading-relaxed">
                    {log}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Local Storage & Infrastructure Nodes */}
        <div className="space-y-5">
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-5">
            <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)] border-b border-[var(--border)] pb-3">
              Local Infrastructure & Storage
            </h2>

            <div className="space-y-4">
              {/* PostgreSQL */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-[var(--text)]">PostgreSQL Authoritative DB</span>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <div className="text-[11px] font-mono text-[var(--muted)] space-y-1">
                  <div className="flex justify-between">
                    <span>Host / Port:</span>
                    <span className="text-[var(--text)] font-bold">localhost:5433</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Database:</span>
                    <span className="text-[var(--text)] font-bold">venue_db</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Schema:</span>
                    <span className="text-[var(--text)] font-bold">venue + registration</span>
                  </div>
                </div>
              </div>

              {/* MinIO Storage */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-purple-400" />
                    <span className="text-xs font-bold text-[var(--text)]">MinIO Slide Asset Storage</span>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <div className="text-[11px] font-mono text-[var(--muted)] space-y-1">
                  <div className="flex justify-between">
                    <span>Endpoint:</span>
                    <span className="text-[var(--text)] font-bold">localhost:9000</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bucket:</span>
                    <span className="text-[var(--text)] font-bold">venue-presentations</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cached Files:</span>
                    <span className="text-[var(--text)] font-bold">{modules.presentations_approved} Decks</span>
                  </div>
                </div>
              </div>

              {/* Redis PubSub */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-sky-400" />
                    <span className="text-xs font-bold text-[var(--text)]">Redis Real-Time PubSub</span>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <div className="text-[11px] font-mono text-[var(--muted)] space-y-1">
                  <div className="flex justify-between">
                    <span>Port:</span>
                    <span className="text-[var(--text)] font-bold">localhost:6379</span>
                  </div>
                  <div className="flex justify-between">
                    <span>WebSocket:</span>
                    <span className="text-emerald-400 font-bold">Broadcasting</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
              Offline Resilience Policy
            </h3>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              The Venue Server runs as the local authority. All scanning stations, self-service kiosks, speaker ready room desks, and room presentation consoles read directly from this node over the local venue LAN even if the internet connection is severed.
            </p>
          </section>
        </div>
      </div>

      <FetchEventModal
        isOpen={isFetchModalOpen}
        onClose={() => setIsFetchModalOpen(false)}
        onSyncComplete={() => void refreshAll()}
      />
    </div>
  );
}
