"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Monitor,
  HardDrive,
  Server,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff,
  Cpu,
  Radio,
  Search,
  Plus,
  Trash2,
  Edit3,
  Lock,
  Unlock,
  RotateCcw,
  ExternalLink,
  Copy,
  Sparkles,
  Layers,
  MapPin,
  Clock,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface NetworkAdapter {
  name: string;
  description: string;
  ip_address: string;
  mac_address: string;
  subnet: string;
  gateway: string;
  media_type: "Ethernet" | "Wi-Fi";
  status: "active" | "inactive";
  link_speed: string;
}

interface DiscoveredNode {
  ip_address: string;
  mac_address: string;
  hostname: string;
  vendor: string;
  media_type: string;
  status: "online" | "idle" | "offline";
  is_bound: boolean;
  bound_station_id?: string;
  bound_station_name?: string;
  bound_role?: "workstation" | "intake_kiosk" | "stage_pc";
  bound_room?: string;
  last_seen: string;
}

interface ProvisionedStation {
  id: string;
  station_number: number;
  station_name: string;
  device_name: string;
  role: "workstation" | "intake_kiosk" | "stage_pc";
  room_name?: string;
  ip_address: string;
  mac_address: string;
  status: "idle" | "occupied" | "previewing" | "uploading" | "completed" | "locked" | "error" | "offline";
  active_speaker?: string | null;
  assigned_session?: string | null;
  last_heartbeat: string;
  enrollment_token: string;
}

export default function AdminDevicesPage() {
  const [adapters, setAdapters] = useState<NetworkAdapter[]>([]);
  const [discoveredNodes, setDiscoveredNodes] = useState<DiscoveredNode[]>([]);
  const [stations, setStations] = useState<ProvisionedStation[]>([]);

  const [scanningLan, setScanningLan] = useState(false);
  const [bindModalNode, setBindModalNode] = useState<DiscoveredNode | null>(null);
  const [bindStationNumber, setBindStationNumber] = useState<number>(6);
  const [bindRole, setBindRole] = useState<"workstation" | "intake_kiosk" | "stage_pc">("workstation");
  const [bindRoom, setBindRoom] = useState<string>("");
  const [enrollModalStation, setEnrollModalStation] = useState<ProvisionedStation | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const system = typeof window !== "undefined" ? await (window as any).srrDesktop?.getSystemInfo?.() : null;
      if (system) {
        setAdapters([{
          name: system.interfaceName,
          description: `${system.hostname} ${system.platform}`,
          ip_address: system.ipv4,
          mac_address: system.mac,
          subnet: "",
          gateway: "",
          media_type: system.interfaceName?.toLowerCase().includes("wi") ? "Wi-Fi" : "Ethernet",
          status: "active",
          link_speed: "unknown",
        }]);
      }
      const response = await apiClient.get<any>("/api/v1/srr/devices");
      setDiscoveredNodes(response.discovered || []);
      setStations((response.devices || []).map((device: any) => ({
        id: device.id,
        station_number: device.station_number,
        station_name: `Workstation #${device.station_number}`,
        device_name: device.device_name,
        role: device.role || "workstation",
        ip_address: device.ip_address || "",
        mac_address: "",
        status: device.status,
        active_speaker: device.assigned_speaker?.full_name || null,
        last_heartbeat: device.last_heartbeat_at || "Never",
        enrollment_token: "",
      })));
    } catch (err: any) {
      toast.error(err.message || "Unable to load SRR device fleet.");
    }
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const handleScanSubnet = () => {
    setScanningLan(true);
    setDiscoveredNodes([]);
    setScanningLan(false);
    toast.error("Subnet discovery is not wired for SRR Preview yet. Use Venue Network diagnostics for real scans.");
  };

  const handleConfirmBind = async () => {
    if (!bindModalNode) return;
    try {
      const result = await apiClient.post<any>("/api/v1/srr/devices/enroll", {
        station_number: bindStationNumber,
        device_name: bindModalNode.hostname || `SRR-WS-0${bindStationNumber}`,
        ip_address: bindModalNode.ip_address,
        role: bindRole,
      });
      setEnrollModalStation({
        id: result.device.id,
        station_number: result.device.station_number,
        station_name: `Workstation #${result.device.station_number}`,
        device_name: result.device.device_name,
        role: bindRole,
        room_name: bindRole === "stage_pc" ? bindRoom : undefined,
        ip_address: result.device.ip_address || "",
        mac_address: bindModalNode.mac_address,
        status: result.device.reported_status || result.device.status,
        active_speaker: null,
        last_heartbeat: result.device.last_heartbeat_at || "Never",
        enrollment_token: result.enrollment_token,
      });
      toast.success(`Enrolled ${bindModalNode.hostname || "device"} as Workstation #${bindStationNumber}`);
      setBindModalNode(null);
      await loadDevices();
    } catch (err: any) {
      toast.error(err.message || "Device enrollment failed.");
    }
  };

  const handleResetStation = async (st: ProvisionedStation) => {
    try {
      await apiClient.post(`/api/v1/srr/stations/${st.id}/reset`);
      toast.success(`Workstation #${st.station_number} remotely reset to Standby`);
      await loadDevices();
    } catch (err: any) {
      toast.error(err.message || "Station reset failed.");
    }
  };

  const handleToggleLock = async (st: ProvisionedStation) => {
    const isLocked = st.status === "locked";
    try {
      await apiClient.post(`/api/v1/srr/stations/${st.id}/${isLocked ? "unlock" : "lock"}`);
      toast.info(`Workstation #${st.station_number} ${isLocked ? "unlocked" : "locked"}`);
      await loadDevices();
    } catch (err: any) {
      toast.error(err.message || "Station lock update failed.");
    }
  };

  const copyToken = (token: string) => {
    if (!token) {
      toast.error("No enrollment token is available. Create a new enrollment first.");
      return;
    }
    navigator.clipboard.writeText(token);
    toast.success("Enrollment token copied to clipboard!");
  };

  return (
    <div className="space-y-8">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div>
          <h1 className="text-2xl font-black text-[var(--text)] tracking-tight">
            LAN Device Telemetry & Fleet Management
          </h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Discover physical workstations, intake kiosks, and stage presentation PCs on the venue LAN subnet.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={handleScanSubnet}
            disabled={scanningLan}
            className="h-10 px-4 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-[var(--primary-contrast)] font-bold text-xs uppercase tracking-wider gap-2 shadow-sm"
          >
            <RefreshCw className={cn("size-3.5", scanningLan && "animate-spin")} />
            {scanningLan ? "Scanning Subnet..." : "Scan Subnet LAN"}
          </Button>
        </div>
      </div>

      {/* 1. Host Network Adapters Card */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--surf)] border border-[var(--border)] text-[var(--pri)]">
              <Cpu className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
                Local Host Network Adapters
              </h3>
              <p className="text-xs text-[var(--muted)]">Active network interfaces detected on this technician console.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {adapters.map((ad) => (
            <div key={ad.name} className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--text)] flex items-center gap-2">
                  <Wifi className="size-4 text-[var(--pri)]" />
                  {ad.name} ({ad.media_type})
                </span>
                <Badge variant="success" className="text-[9px]">ACTIVE</Badge>
              </div>
              <p className="text-[10px] text-[var(--muted)] truncate">{ad.description}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[var(--muted)] pt-1 border-t border-[var(--border)]">
                <div>IP: <span className="text-[var(--text)] font-bold">{ad.ip_address}</span></div>
                <div>MAC: <span className="text-[var(--text)] font-bold">{ad.mac_address}</span></div>
                <div>Subnet: <span className="text-[var(--text)]">{ad.subnet}</span></div>
                <div>Speed: <span className="text-emerald-400">{ad.link_speed}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Provisioned SRR Fleet Matrix */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-2">
            <Monitor className="size-4 text-[var(--pri)]" />
            Provisioned Workstation Fleet ({stations.length} Units)
          </h2>
          <span className="text-xs text-[var(--muted)]">Real-Time WebSocket Heartbeats</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {stations.map((st) => {
            const isIdle = st.status === "idle";
            const isLocked = st.status === "locked";

            return (
              <Card
                key={st.id}
                className={cn(
                  "flex flex-col justify-between p-4 border transition-all relative overflow-hidden shadow-lg",
                  isLocked
                    ? "border-zinc-800 bg-zinc-950/80 opacity-75"
                    : isIdle
                    ? "border-emerald-500/30 bg-[var(--card)] hover:border-emerald-500/60"
                    : "border-[var(--pri)]/40 bg-[var(--card)] hover:border-[var(--pri)]/70"
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-[var(--text)]">
                      {st.station_name}
                    </span>
                    <Badge
                      variant={isLocked ? "secondary" : isIdle ? "success" : "info"}
                      className="text-[9px] font-mono px-2 py-0.5"
                    >
                      {st.status.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="min-h-[64px] rounded-xl border border-[var(--border)] bg-[var(--surf)] p-2.5">
                    {st.active_speaker ? (
                      <div className="space-y-1">
                        <p className="text-xs font-black text-[var(--text)] truncate">{st.active_speaker}</p>
                        <p className="text-[10px] text-[var(--muted)] truncate">{st.assigned_session}</p>
                        <p className="text-[9px] font-mono text-cyan-400">Seated & Active</p>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center text-center text-[var(--muted)]">
                        <p className="text-xs font-semibold">Vacant / Standby</p>
                        <p className="text-[9px]">Ready for allocation</p>
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] font-mono text-[var(--muted)] space-y-0.5">
                    <p className="truncate">Host: {st.device_name}</p>
                    <p>IP: {st.ip_address}</p>
                    <p>MAC: {st.mac_address}</p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEnrollModalStation(st)}
                    className="flex-1 text-[10px] font-black uppercase tracking-wider h-8"
                    title="View Enrollment Config"
                  >
                    Token
                  </Button>

                  <Button
                    size="sm"
                    variant={isIdle ? "outline" : "destructive"}
                    onClick={() => handleResetStation(st)}
                    className="flex-1 text-[10px] font-black uppercase tracking-wider h-8"
                  >
                    <RotateCcw className="size-3 mr-1" />
                    Reset
                  </Button>

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

      {/* 3. Discovered LAN Hardware Table */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-2">
              <Radio className="size-4 text-[var(--pri)]" />
              Discovered Hardware Nodes on Subnet (192.168.1.0/24)
            </h3>
            <p className="text-xs text-[var(--muted)]">
              All physical network endpoints detected via ARP and WebSocket discovery.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surf)] text-[10px] font-black uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="px-5 py-3">Hardware Node</th>
                <th className="px-5 py-3">IP Address</th>
                <th className="px-5 py-3">MAC Address</th>
                <th className="px-5 py-3">Vendor / Device</th>
                <th className="px-5 py-3">Binding Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {discoveredNodes.map((n) => (
                <tr key={n.mac_address} className="hover:bg-[var(--surf)]/50 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-[var(--text)] flex items-center gap-2">
                    {n.bound_role === "stage_pc" ? (
                      <Server className="size-4 text-purple-400" />
                    ) : (
                      <Monitor className="size-4 text-[var(--pri)]" />
                    )}
                    <span>{n.hostname}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs font-mono text-[var(--text)]">
                    {n.ip_address}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-mono text-[var(--muted)]">
                    {n.mac_address}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[var(--muted)]">
                    {n.vendor}
                  </td>
                  <td className="px-5 py-3.5">
                    {n.is_bound ? (
                      <Badge variant="success" className="text-[9px]">
                        <CheckCircle2 className="size-3 mr-1" />
                        {n.bound_station_name}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/30">
                        Unbound Node
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {!n.is_bound ? (
                      <Button
                        size="sm"
                        onClick={() => setBindModalNode(n)}
                        className="h-8 px-3 text-[10px] font-black uppercase tracking-wider bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-[var(--primary-contrast)]"
                      >
                        Bind Hardware
                      </Button>
                    ) : (
                      <span className="text-[10px] font-mono text-[var(--muted)]">Bound & Online</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bind Hardware Modal */}
      <Dialog open={!!bindModalNode} onOpenChange={(open) => !open && setBindModalNode(null)}>
        <DialogContent className="max-w-md p-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--surf)] border border-[var(--border)] text-[var(--pri)]">
              <Plus className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--text)]">Bind Hardware to Station</h3>
              <p className="text-xs text-[var(--muted)]">Assign this physical MAC address to an operational role.</p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3 text-xs font-mono text-[var(--muted)] space-y-1">
            <div>Target IP: <span className="text-[var(--text)] font-bold">{bindModalNode?.ip_address}</span></div>
            <div>Target MAC: <span className="text-[var(--text)] font-bold">{bindModalNode?.mac_address}</span></div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)] block mb-1">
                Assign Station Number
              </label>
              <Input
                type="number"
                min={1}
                max={20}
                value={bindStationNumber}
                onChange={(e) => setBindStationNumber(Number(e.target.value))}
                className="h-10 text-xs bg-[var(--surf)] border-[var(--border)]"
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)] block mb-1">
                Station Role
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setBindRole("workstation")}
                  className={cn(
                    "p-2.5 rounded-xl border text-xs font-bold text-center",
                    bindRole === "workstation"
                      ? "border-[var(--pri)] bg-[var(--pri)] text-[var(--primary-contrast)]"
                      : "border-[var(--border)] bg-[var(--surf)] text-[var(--muted)]"
                  )}
                >
                  Workstation
                </button>
                <button
                  type="button"
                  onClick={() => setBindRole("intake_kiosk")}
                  className={cn(
                    "p-2.5 rounded-xl border text-xs font-bold text-center",
                    bindRole === "intake_kiosk"
                      ? "border-cyan-500 bg-cyan-600 text-black"
                      : "border-[var(--border)] bg-[var(--surf)] text-[var(--muted)]"
                  )}
                >
                  Intake Kiosk
                </button>
                <button
                  type="button"
                  onClick={() => setBindRole("stage_pc")}
                  className={cn(
                    "p-2.5 rounded-xl border text-xs font-bold text-center",
                    bindRole === "stage_pc"
                      ? "border-purple-500 bg-purple-600 text-white"
                      : "border-[var(--border)] bg-[var(--surf)] text-[var(--muted)]"
                  )}
                >
                  Stage PC
                </button>
              </div>
            </div>

            {bindRole === "stage_pc" && (
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)] block mb-1">
                  Target Conference Room
                </label>
                <Input
                  value={bindRoom}
                  onChange={(e) => setBindRoom(e.target.value)}
                  placeholder="e.g. Hall A"
                  className="h-10 text-xs bg-[var(--surf)] border-[var(--border)]"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setBindModalNode(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBind}
              className="bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-[var(--primary-contrast)] font-bold text-xs uppercase tracking-wider"
            >
              Confirm Hardware Binding
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enrollment Token Modal */}
      <Dialog open={!!enrollModalStation} onOpenChange={(open) => !open && setEnrollModalStation(null)}>
        <DialogContent className="max-w-md p-6 space-y-4">
          <div>
            <h3 className="text-base font-black text-[var(--text)]">
              Workstation Provisioning & Enrollment
            </h3>
            <p className="text-xs text-[var(--muted)]">
              Use this enrollment token to configure a new physical PC running the SRR Desktop App.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
              Enrollment Token
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold text-[var(--pri)] select-all truncate">
                {enrollModalStation?.enrollment_token}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToken(enrollModalStation?.enrollment_token || "")}
                className="h-8 px-2.5 text-xs"
              >
                <Copy className="size-3.5 mr-1" />
                Copy
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--muted)] space-y-1 font-mono">
            <div>Station ID: {enrollModalStation?.station_name}</div>
            <div>Assigned IP: {enrollModalStation?.ip_address}</div>
            <div>MAC Binding: {enrollModalStation?.mac_address}</div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
