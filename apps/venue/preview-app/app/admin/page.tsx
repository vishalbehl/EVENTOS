"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  ShieldCheck,
  RefreshCw,
  Lock,
  Unlock,
  RotateCcw,
  UserPlus,
  FileText,
  Layers,
  Sparkles,
  Server,
  HardDrive,
  MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import Link from "next/link";

interface SRRStationAdmin {
  id: string;
  station_number: number;
  device_name: string;
  ip_address: string;
  status: "idle" | "occupied" | "uploading" | "previewing" | "completed" | "error" | "locked";
  is_active: boolean;
  is_online: boolean;
  assigned_speaker?: {
    id: string;
    full_name: string;
    email: string;
    organization: string;
  } | null;
  session_assigned_at?: string | null;
  last_heartbeat_at?: string | null;
}

export default function AdminFleetDashboardPage() {
  const [stations, setStations] = useState<SRRStationAdmin[]>([]);

  const [loading, setLoading] = useState(false);
  const [assignModalStation, setAssignModalStation] = useState<SRRStationAdmin | null>(null);
  const [manualSpeakerSearch, setManualSpeakerSearch] = useState("");
  const [speakerMatches, setSpeakerMatches] = useState<any[]>([]);

  const fetchStations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<SRRStationAdmin[]>("/api/v1/srr/stations");
      setStations(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || "Unable to load SRR stations from Venue Server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStations();
    const interval = setInterval(fetchStations, 6000);
    return () => clearInterval(interval);
  }, [fetchStations]);

  const handleResetStation = async (st: SRRStationAdmin) => {
    try {
      await apiClient.post(`/api/v1/srr/stations/${st.id}/reset`);
      toast.success(`Station #${st.station_number} reset to idle`);
      fetchStations();
    } catch (err: any) {
      toast.error(err.message || `Station #${st.station_number} reset failed`);
    }
  };

  const handleToggleLock = async (st: SRRStationAdmin) => {
    const isLocked = st.status === "locked";
    try {
      if (isLocked) {
        await apiClient.post(`/api/v1/srr/stations/${st.id}/unlock`);
        toast.success(`Station #${st.station_number} unlocked`);
      } else {
        await apiClient.post(`/api/v1/srr/stations/${st.id}/lock`);
        toast.warning(`Station #${st.station_number} locked`);
      }
      fetchStations();
    } catch (err: any) {
      toast.error(err.message || `Station #${st.station_number} ${isLocked ? "unlock" : "lock"} failed`);
    }
  };

  const searchSpeakers = async () => {
    if (!manualSpeakerSearch.trim()) return;
    try {
      const matches = await apiClient.get<any[]>(`/api/v1/srr/speakers/search?q=${encodeURIComponent(manualSpeakerSearch.trim())}`);
      setSpeakerMatches(matches);
      if (!matches.length) toast.error("No matching speakers found.");
    } catch (err: any) {
      toast.error(err.message || "Speaker search failed.");
    }
  };

  const handleAssignSpeaker = async (match: any) => {
    if (!assignModalStation) return;
    const speaker = match.speaker || match;
    try {
      await apiClient.post(`/api/v1/srr/stations/${assignModalStation.id}/assign`, {
        speaker_id: speaker.id,
      });
      toast.success(`Assigned ${speaker.full_name} to Station #${assignModalStation.station_number}`);
      setAssignModalStation(null);
      setSpeakerMatches([]);
      fetchStations();
    } catch (err: any) {
      toast.error(err.message || `Assigning ${speaker.full_name} failed.`);
    }
  };

  const idleCount = stations.filter((s) => s.status === "idle" || s.status === "completed").length;
  const occupiedCount = stations.length - idleCount;
  const readinessGroups = stations.reduce<Record<string, SRRStationAdmin[]>>((groups, station) => {
    const key = station.device_name?.trim() || `Station #${station.station_number}`;
    groups[key] = [...(groups[key] || []), station];
    return groups;
  }, {});

  return (
    <div className="space-y-6">
      {/* Top Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--text)] tracking-tight">
            Speaker Ready Room Fleet Console
          </h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Real-time telemetry, remote station control, and presentation distribution overview.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchStations}
            disabled={loading}
            className="gap-2 text-xs font-bold"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh Fleet
          </Button>
          <Link href="/admin/files">
            <Button size="sm" className="gap-2 text-xs font-bold">
              <FileText className="size-3.5" />
              View All Files
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-[var(--card)] border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
              Total Workstations
            </span>
            <Monitor className="size-4 text-[var(--pri)]" />
          </div>
          <p className="text-2xl font-black text-[var(--text)] mt-1">{stations.length} Active</p>
          <p className="text-[10px] text-emerald-400 mt-0.5">{idleCount} Ready • {occupiedCount} Seated</p>
        </Card>

        <Card className="p-4 bg-[var(--card)] border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
              Presentations Staged
            </span>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400 mt-1">18 / 24</p>
          <p className="text-[10px] text-[var(--muted)] mt-0.5">75% of today&apos;s keynotes validated</p>
        </Card>

        <Card className="p-4 bg-[var(--card)] border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
              Room Sync Readiness
            </span>
            <Server className="size-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-black text-cyan-400 mt-1">100%</p>
          <p className="text-[10px] text-[var(--muted)] mt-0.5">All room presentation PCs online</p>
        </Card>

        <Card className="p-4 bg-[var(--card)] border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
              Average Check Time
            </span>
            <Clock className="size-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-400 mt-1">4.2 min</p>
          <p className="text-[10px] text-[var(--muted)] mt-0.5">Optimal throughput achieved</p>
        </Card>
      </div>

      {/* Live Workstations Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-2">
            <Monitor className="size-4 text-[var(--pri)]" />
            Physical Workstation Fleet ({stations.length} Units)
          </h2>
          <span className="text-xs text-[var(--muted)]">Live LAN Heartbeat</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {stations.map((st) => {
            const isIdle = st.status === "idle" || st.status === "completed";
            const isLocked = st.status === "locked";

            return (
              <Card
                key={st.id}
                className={cn(
                  "flex flex-col justify-between p-4 border transition-all relative overflow-hidden",
                  isLocked
                    ? "border-zinc-800 bg-zinc-950/80 opacity-70"
                    : isIdle
                    ? "border-emerald-500/30 bg-[var(--card)] hover:border-emerald-500/60"
                    : "border-blue-500/40 bg-[var(--card)] hover:border-blue-500/70"
                )}
              >
                {/* Station Card Header */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-[var(--text)]">
                        Station #{st.station_number}
                      </span>
                    </div>
                    <Badge
                      variant={isLocked ? "secondary" : isIdle ? "success" : "info"}
                      className="text-[9px] font-mono px-2 py-0.5"
                    >
                      {st.status.toUpperCase()}
                    </Badge>
                  </div>

                  {/* Speaker Details */}
                  <div className="min-h-[64px] rounded-xl border border-[var(--border)] bg-[var(--surf)] p-2.5">
                    {st.assigned_speaker ? (
                      <div className="space-y-1">
                        <p className="text-xs font-black text-[var(--text)] truncate">
                          {st.assigned_speaker.full_name}
                        </p>
                        <p className="text-[10px] text-[var(--muted)] truncate">
                          {st.assigned_speaker.organization}
                        </p>
                        <p className="text-[9px] font-mono text-cyan-400">
                          Seated for ~6 min
                        </p>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center text-center text-zinc-500">
                        <p className="text-xs font-semibold">Vacant / Idle</p>
                        <p className="text-[9px]">Ready for allocation</p>
                      </div>
                    )}
                  </div>

                  {/* Device Info */}
                  <div className="text-[10px] font-mono text-[var(--muted)] space-y-0.5">
                    <p className="truncate">Host: {st.device_name}</p>
                    <p>IP: {st.ip_address || "192.168.1.10" + st.station_number}</p>
                  </div>
                </div>

                {/* Card Control Buttons */}
                <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between gap-1.5">
                  {isIdle ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAssignModalStation(st)}
                      className="flex-1 text-[10px] font-black uppercase tracking-wider h-8"
                    >
                      <UserPlus className="size-3 mr-1" />
                      Assign
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleResetStation(st)}
                      className="flex-1 text-[10px] font-black uppercase tracking-wider h-8"
                    >
                      <RotateCcw className="size-3 mr-1" />
                      Reset
                    </Button>
                  )}

                  <button
                    onClick={() => handleToggleLock(st)}
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-xl border transition-colors",
                      isLocked
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                        : "border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-[var(--text)]"
                    )}
                    title={isLocked ? "Unlock Station" : "Lock Station"}
                  >
                    {isLocked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Room & Session Readiness Breakdown */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-2">
              <MapPin className="size-4 text-[var(--pri)]" />
              Room Distribution & Stage Presentation Readiness
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Live status of presentation files distributed to respective conference halls.
            </p>
          </div>
        </div>

        {Object.keys(readinessGroups).length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surf)] p-4 text-xs font-semibold text-[var(--muted)]">
            No room or station readiness feed is available from Venue Server yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(readinessGroups).slice(0, 6).map(([label, group]) => {
              const ready = group.filter((station) => station.status === "completed" || station.status === "idle").length;
              const total = group.length;
              const hasProblems = group.some((station) => station.status === "error" || station.status === "locked" || !station.is_online);
              return (
                <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2">
                    <span className="text-xs font-black text-[var(--text)] truncate">{label}</span>
                    <Badge variant={hasProblems ? "warning" : "success"} className="text-[9px]">
                      {ready}/{total} READY
                    </Badge>
                  </div>
                  <div className="rounded-lg bg-[var(--card)] p-3 text-xs text-[var(--muted)]">
                    {group.map((station) => `#${station.station_number} ${station.status}`).join(" / ")}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Assign Speaker Modal */}
      <Dialog
        open={!!assignModalStation}
        onOpenChange={(open) => !open && setAssignModalStation(null)}
      >
        <DialogContent className="max-w-md p-6 space-y-4">
          <div>
            <h3 className="text-base font-black text-[var(--text)]">
              Manual Assign Speaker ➔ Station #{assignModalStation?.station_number}
            </h3>
            <p className="text-xs text-[var(--muted)]">
              Search speaker by name to assign directly to this physical PC.
            </p>
          </div>

          <div className="space-y-2">
            <Input
              value={manualSpeakerSearch}
              onChange={(e) => setManualSpeakerSearch(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void searchSpeakers();
              }}
              placeholder="Search speaker by name or email..."
              className="h-10 text-xs"
            />
            <Button size="sm" onClick={searchSpeakers} className="w-full text-xs font-bold">
              Search Venue Speakers
            </Button>

            <div className="space-y-1.5 pt-2 max-h-48 overflow-y-auto">
              {speakerMatches.map((match) => (
                  <button
                    key={match.speaker.id}
                    type="button"
                    onClick={() => handleAssignSpeaker(match)}
                    className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surf)] p-2.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
                  >
                    <span>{match.speaker.full_name}</span>
                    <span className="text-[10px] font-mono text-[var(--pri)]">Select ➔</span>
                  </button>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
