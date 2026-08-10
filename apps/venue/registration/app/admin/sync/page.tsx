"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Cloud,
  Database,
  FolderOpen,
  HardDriveDownload,
  KeyRound,
  Loader2,
  RefreshCw,
  UploadCloud,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

type LocalDbStatus = { exists: boolean; path?: string; sizeBytes: number; updatedAt?: number };
type LocalEvent = { id: string; name: string; short_code?: string; status?: string; start_date?: string; end_date?: string; venue_name?: string };
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
  };
  local?: {
    events: number;
    active_event?: { id: string; name: string; short_code?: string } | null;
    outbox?: Record<string, number>;
    last_push_at?: string | null;
  };
};

function isAuthError(error: any) {
  return error?.authExpired || error?.status === 401;
}

function formatDateTime(value?: string | number | null) {
  if (!value) return "Never";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function formatBytes(value?: number | null) {
  if (!value || value < 1) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileName(value?: string | null) {
  if (!value) return "";
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || value;
}

function sourceLabel(type?: string) {
  if (type === "registration_server") return "On-site Registration Server";
  if (type === "venue_server") return "On-site Venue Server";
  return "Command Center / Cloud";
}

function statusTone(status?: string, reachable?: boolean) {
  if (reachable || status === "healthy" || status === "active") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (status === "down" || status === "failed") return "border-red-500/25 bg-red-500/10 text-red-300";
  return "border-amber-500/25 bg-amber-500/10 text-amber-300";
}

export default function AdminSyncPage() {
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [metrics, setMetrics] = useState<any>(null);
  const [localDbStatus, setLocalDbStatus] = useState<LocalDbStatus | null>(null);
  const [setupStatus, setSetupStatus] = useState<any>(null);
  const [fetchSource, setFetchSource] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingLocalDb, setExportingLocalDb] = useState(false);
  const [importingLocalDb, setImportingLocalDb] = useState(false);
  const [syncingLocalSnapshot, setSyncingLocalSnapshot] = useState(false);
  const [lastAutoSnapshotAt, setLastAutoSnapshotAt] = useState<number | null>(null);

  const activeEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || events[0] || null,
    [events, selectedEventId],
  );
  const setupMarker = (setupStatus?.marker || {}) as Record<string, any>;
  const sharedPostgres = (setupStatus?.sharedPostgres || setupMarker || {}) as Record<string, any>;
  const validation = (setupStatus?.validation || {}) as Record<string, any>;
  const setupMode = validation.mode || setupMarker.mode;
  const usingSharedPostgres = setupMode === "shared_postgres";
  const usingUploadedLocalDb = setupMode === "uploaded_local_db";
  const uploadedLocalDatabase = (setupStatus?.uploadedLocalDatabase || {}) as LocalDbStatus & { importedFrom?: string };

  const refreshLocalSetup = useCallback(async () => {
    if (!window.venueDesktop) return;
    const status = await window.venueDesktop.getRegistrationSetupStatus();
    setSetupStatus(status);
    setLocalDbStatus(status.uploadedLocalDatabase?.exists ? status.uploadedLocalDatabase : status.localDatabase);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [eventRows, source, status] = await Promise.all([
        apiClient.get<LocalEvent[]>("/venue/admin/events"),
        apiClient.get("/venue/admin/fetch-source"),
        apiClient.get<SyncStatus>("/venue/admin/sync-status"),
      ]);
      setEvents(eventRows || []);
      setFetchSource(source);
      setSyncStatus(status);
      const nextEventId = selectedEventId || eventRows?.[0]?.id || "";
      if (!selectedEventId && nextEventId) setSelectedEventId(nextEventId);
      if (nextEventId) {
        const metricRows = await apiClient.get("/venue/admin/dashboard/metrics", { params: { event_id: nextEventId } }).catch(() => null);
        setMetrics(metricRows);
      }
      await refreshLocalSetup().catch(() => undefined);
    } catch (error: any) {
      if (isAuthError(error)) return;
      toast.error(error?.message || "Failed to refresh sync controls.");
    } finally {
      setLoading(false);
    }
  }, [refreshLocalSetup, selectedEventId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const updateLocalSnapshot = useCallback(async () => {
    const eventId = activeEvent?.id;
    if (!eventId || !window.venueDesktop || syncingLocalSnapshot) return;
    setSyncingLocalSnapshot(true);
    try {
      const snapshot = await apiClient.get(`/venue/admin/events/${eventId}/local-db-snapshot`);
      const status = await window.venueDesktop.loadLocalSnapshot(snapshot);
      setLocalDbStatus(status);
      setLastAutoSnapshotAt(Date.now());
    } catch (error) {
      console.error(error);
    } finally {
      setSyncingLocalSnapshot(false);
    }
  }, [activeEvent?.id, syncingLocalSnapshot]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshAll();
      if (syncStatus?.source?.reachable) {
        updateLocalSnapshot();
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [refreshAll, syncStatus?.source?.reachable, updateLocalSnapshot]);

  const exportLocalDatabase = async () => {
    if (!window.venueDesktop) {
      toast.error("Local DB download is available only inside the desktop app.");
      return;
    }
    setExportingLocalDb(true);
    try {
      const result = await window.venueDesktop.exportLocalDatabase();
      if (!result.canceled) {
        setLocalDbStatus(await window.venueDesktop.getLocalDatabaseStatus());
        toast.success("Updated local SQLite DB downloaded.");
      }
    } catch (error: any) {
      if (isAuthError(error)) return;
      toast.error(error?.message || "Failed to download local DB.");
    } finally {
      setExportingLocalDb(false);
    }
  };

  const importLocalDatabase = async () => {
    if (!window.venueDesktop) {
      toast.error("Local DB import is available only inside the desktop app.");
      return;
    }
    setImportingLocalDb(true);
    try {
      const result = await window.venueDesktop.importLocalDatabase();
      if (!result.canceled) {
        await refreshLocalSetup();
        toast.success("Registration SQLite package imported.");
      }
    } catch (error: any) {
      if (isAuthError(error)) return;
      toast.error(error?.message || "Failed to import local DB.");
    } finally {
      setImportingLocalDb(false);
    }
  };

  const openLocalDbFolder = async () => {
    if (!window.venueDesktop?.openLocalDatabaseFolder) {
      toast.error("Open folder is available only inside the desktop app.");
      return;
    }
    const result = await window.venueDesktop.openLocalDatabaseFolder();
    if (result.opened) {
      toast.success("Local DB folder opened.");
    } else {
      toast.error(result.error || "Unable to open local DB folder.");
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card)_94%,transparent),color-mix(in_srgb,var(--pri)_9%,var(--card)))] shadow-sm">
        <div className="flex flex-col gap-5 border-b border-[var(--border)] p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--pri)]">
              <Activity className="h-4 w-4" /> Source API control
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-[var(--text)]">Sync & local data command board</h1>
            <p className="mt-1 max-w-3xl text-sm font-medium text-[var(--muted)]">
              Change the fetch API used by this Registration Server and watch local/cloud freshness in one place. API keys are issued by Command Center or the on-site Venue Server.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => document.dispatchEvent(new CustomEvent("open-fetch-event-modal"))} className="h-10 gap-2 bg-[var(--card)] text-xs font-black uppercase tracking-wider">
              <KeyRound className="h-4 w-4" /> Change fetch API
            </Button>
            <Button variant="outline" onClick={refreshAll} disabled={loading} className="h-10 gap-2 bg-[var(--card)] text-xs font-black uppercase tracking-wider">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-4 p-6 lg:grid-cols-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Current fetch source</p>
            <p className="mt-2 text-base font-black text-[var(--text)]">{sourceLabel(fetchSource?.source_type)}</p>
            <p className="mt-2 break-all text-xs font-semibold text-[var(--muted)]">{fetchSource?.base_url || "No source URL saved"}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Cloud reachability</p>
            <div className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase ${statusTone(syncStatus?.source?.status, syncStatus?.source?.reachable)}`}>
              {syncStatus?.source?.reachable ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {syncStatus?.source?.status || "unknown"}
            </div>
            <p className="mt-2 text-xs font-semibold text-[var(--muted)]">{syncStatus?.source?.detail || "Waiting for status check."}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Event in control</p>
            <select
              value={activeEvent?.id || ""}
              onChange={(event) => setSelectedEventId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--pri)]"
            >
              {events.length === 0 && <option value="">No local events</option>}
              {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
            <p className="mt-2 text-xs font-semibold text-[var(--muted)]">{metrics?.summary?.participants ?? metrics?.participants ?? 0} participants loaded locally</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Auto refresh</p>
            <p className="mt-2 text-base font-black text-[var(--text)]">Every 5 seconds</p>
            <p className="mt-2 text-xs font-semibold text-[var(--muted)]">Last check: {formatDateTime(syncStatus?.source?.last_checked_at)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-[var(--text)]">
                <Database className="h-4 w-4 text-[var(--pri)]" /> Local SQLite fallback sync
              </h2>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Desktop fallback DB is refreshed automatically while the cloud source is reachable.</p>
            </div>
            <Button variant="outline" onClick={updateLocalSnapshot} disabled={syncingLocalSnapshot || !activeEvent} className="gap-2 text-xs font-black uppercase tracking-wider">
              {syncingLocalSnapshot ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync SQLite now
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Fallback DB</p>
              <p className="mt-2 text-lg font-black text-[var(--text)]">{localDbStatus?.exists ? "Ready" : "Not created"}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{localDbStatus?.exists ? `${Math.max(1, Math.round((localDbStatus.sizeBytes || 0) / 1024))} KB` : "Use desktop setup first"}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Last SQLite refresh</p>
              <p className="mt-2 text-sm font-black text-[var(--text)]">{formatDateTime(lastAutoSnapshotAt || localDbStatus?.updatedAt)}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Polling every 5 seconds</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Cloud push queue</p>
              <p className="mt-2 text-lg font-black text-[var(--text)]">{syncStatus?.local?.outbox?.pending || 0} pending</p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{syncStatus?.local?.outbox?.failed || 0} failed · last push {formatDateTime(syncStatus?.local?.last_push_at)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--border)] pt-4">
            <Button variant="outline" onClick={importLocalDatabase} disabled={importingLocalDb} className="gap-2 text-xs font-black uppercase tracking-wider">
              {importingLocalDb ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Import SQLite package
            </Button>
            <Button onClick={exportLocalDatabase} disabled={exportingLocalDb} className="gap-2 text-xs font-black uppercase tracking-wider">
              {exportingLocalDb ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />} Download updated local DB
            </Button>
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-[var(--text)]">
            <Cloud className="h-4 w-4 text-sky-400" /> Shared DB mode
          </h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Active database mode</p>
              <p className="mt-2 text-base font-black text-[var(--text)]">
                {usingSharedPostgres
                  ? "Shared Registration PostgreSQL"
                  : usingUploadedLocalDb
                    ? "Uploaded SQLite package"
                    : "Not configured"}
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{validation.configured ? "Health check passed" : validation.reason || "Open first-run setup"}</p>
            </div>

            {usingSharedPostgres && (
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-sky-200">Registration shared PostgreSQL</p>
                <div className="mt-3 grid gap-3 text-xs font-semibold text-[var(--muted)]">
                  <div className="flex items-center justify-between gap-3">
                    <span>Database</span>
                    <span className="max-w-[14rem] truncate font-black text-[var(--text)]">{sharedPostgres.database || setupMarker.database || "Not recorded"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Host / port</span>
                    <span className="max-w-[14rem] truncate font-black text-[var(--text)]">
                      {sharedPostgres.host || setupMarker.host || "localhost"}:{sharedPostgres.port || setupMarker.port || "5432"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Postgres user</span>
                    <span className="max-w-[14rem] truncate font-black text-[var(--text)]">{sharedPostgres.postgresUser || sharedPostgres.postgres_user || setupMarker.postgresUser || "Not recorded"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Configured</span>
                    <span className="font-black text-[var(--text)]">{formatDateTime(sharedPostgres.configuredAt || setupMarker.configuredAt)}</span>
                  </div>
                </div>
              </div>
            )}

            {usingUploadedLocalDb && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-200">Uploaded local SQLite</p>
                <div className="mt-3 grid gap-3 text-xs font-semibold text-[var(--muted)]">
                  <div className="flex items-center justify-between gap-3">
                    <span>DB file</span>
                    <span className="max-w-[14rem] truncate font-black text-[var(--text)]">
                      {fileName(uploadedLocalDatabase.path || setupMarker.sqlitePath || setupMarker.importedFrom) || "uploaded-registration.db"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Size</span>
                    <span className="font-black text-[var(--text)]">{formatBytes(uploadedLocalDatabase.sizeBytes)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Imported from</span>
                    <span className="max-w-[14rem] truncate font-black text-[var(--text)]">{fileName(setupMarker.importedFrom) || "Local file"}</span>
                  </div>
                </div>
                <Button variant="outline" onClick={openLocalDbFolder} className="mt-4 w-full gap-2 bg-[var(--card)] text-xs font-black uppercase tracking-wider">
                  <FolderOpen className="h-4 w-4" /> Open folder
                </Button>
              </div>
            )}

            {!usingSharedPostgres && !usingUploadedLocalDb && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-200">Setup required</p>
                <p className="mt-2 text-xs font-semibold text-[var(--muted)]">
                  Restart the desktop app to choose Shared PostgreSQL or upload a local SQLite package before login.
                </p>
              </div>
            )}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Live source update</p>
              <p className="mt-2 text-base font-black text-[var(--text)]">{syncStatus?.source?.reachable ? "Main source reachable" : "Main source offline"}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Pending local outbox records are pushed by the server scheduler when the source is reachable.</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
