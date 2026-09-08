"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  MonitorSmartphone,
  Plus,
  Trash2,
  ShieldCheck,
  Search,
  Activity,
  Cpu,
  Wifi,
  Network,
  Radio,
  Server,
  CheckCircle2,
  RefreshCw,
  Copy,
  ExternalLink,
  Laptop,
  Printer,
  QrCode,
  Layers,
  ArrowRight,
  Sparkles,
  SignalHigh,
  X,
  Edit3,
  Check,
  Globe,
  HardDrive,
  Clock,
  RotateCcw,
  Lock,
  Unlock,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn, copyToClipboard as safeCopyToClipboard } from "@/lib/utils";

interface NetworkAdapter {
  name: string;
  description: string;
  mac_address?: string;
  status: string;
  link_speed?: string;
  media_type: "Wi-Fi" | "Ethernet";
  ip_address?: string;
  prefix_length: number;
  subnet?: string;
  gateway?: string;
  is_default: boolean;
  is_active: boolean;
  interface_index?: number;
}

interface DiscoveredDevice {
  ip_address: string;
  mac_address: string;
  hostname?: string;
  vendor?: string;
  interface_name: string;
  media_type: string;
  status: string;
  is_registered: boolean;
  bound_device_id?: string;
  bound_device_name?: string;
  bound_device_type?: string;
  assigned_station?: string;
  is_local?: boolean;
  interface_index?: number;
  discovery_source?: string;
  last_seen?: string;
}

interface Workstation {
  id: string;
  device_name: string;
  device_type: string;
  hostname?: string;
  ip_address?: string;
  mac_address?: string;
  status: string;
  room_name?: string;
  os_version?: string;
  last_seen?: string;
  registered_at?: string;
  mode?: string;
  capacity_rule_id?: string;
  assignment_status?: string;
  assignment_id?: string;
  allowed_modes?: string[];
  snapshot_version?: number;
  last_sync_at?: string;
  station_number?: number;
  active_speaker?: string | null;
}

const SRR_STATIONS = [
  "SRR Preview Workstation 1",
  "SRR Preview Workstation 2",
  "SRR Preview Workstation 3",
  "SRR Preview Workstation 4",
  "SRR Preview Workstation 5",
  "SRR Preview Workstation 6",
  "SRR Intake Check-in Gate",
  "SRR Technician Master Desk",
];

export default function AdminDevicesPage() {
  const [adapters, setAdapters] = useState<NetworkAdapter[]>([]);
  const [selectedAdapterName, setSelectedAdapterName] = useState<string>("");
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const [stationsList] = useState<string[]>(SRR_STATIONS);

  const [loadingAdapters, setLoadingAdapters] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isSavingAdapter, setIsSavingAdapter] = useState(false);
  const [pingingId, setPingingId] = useState<string | null>(null);

  // Binding Modal State
  const [isBindModalOpen, setIsBindModalOpen] = useState(false);
  const [selectedDiscovered, setSelectedDiscovered] = useState<DiscoveredDevice | null>(null);
  const [bindDeviceId, setBindDeviceId] = useState("SRR-WS-01");
  const [bindDeviceName, setBindDeviceName] = useState("");
  const [bindDeviceType, setBindDeviceType] = useState("workstation");
  const [bindStation, setBindStation] = useState("");
  const [bindMode, setBindMode] = useState<"workstation" | "scanning" | "admin">("workstation");
  const [bindAllowedModes, setBindAllowedModes] = useState<Array<"workstation" | "scanning" | "admin">>(["workstation"]);
  const [isBinding, setIsBinding] = useState(false);

  // Unbind / Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resyncingId, setResyncingId] = useState<string | null>(null);

  // 1. Fetch Network Adapters
  const fetchAdapters = useCallback(async () => {
    try {
      setLoadingAdapters(true);
      let res: any = null;
      try {
        res = await apiClient.get("/api/v1/venue/admin/network/adapters");
      } catch {
        // Network adapter inventory is authoritative server data. If it is
        // unavailable, keep the state empty instead of manufacturing a LAN
        // adapter from assumptions.
        res = [];
      }

      if (Array.isArray(res) && res.length > 0) {
        setAdapters(res);
        const active =
          res.find((a: NetworkAdapter) => a.is_active) ||
          res.find((a: NetworkAdapter) => a.is_default && a.status === "Up") ||
          res.find((a: NetworkAdapter) => a.status === "Up") ||
          res[0];

        if (active) {
          setSelectedAdapterName(active.name);
          scanSelectedNetwork(active.name, active.subnet);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to detect host network adapters.");
    } finally {
      setLoadingAdapters(false);
    }
  }, []);

  // 2. Fetch Registered Workstations
  const fetchWorkstations = useCallback(async () => {
    try {
      const res: any = await apiClient.get("/api/v1/venue/admin/workstations");
      if (Array.isArray(res)) {
        setWorkstations(res);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 3. Handle Adapter Dropdown Selection
  const handleAdapterChange = (newAdapterName: string) => {
    setSelectedAdapterName(newAdapterName);
    const target = adapters.find((a) => a.name === newAdapterName);
    if (target) {
      scanSelectedNetwork(target.name, target.subnet);
    }
  };

  // 4. Save Network Binding to Venue Server Database
  const handleSaveNetworkBinding = async () => {
    const target = adapters.find((a) => a.name === selectedAdapterName);
    if (!target) {
      toast.error("Please select a network adapter first.");
      return;
    }

    try {
      setIsSavingAdapter(true);
      await apiClient.post("/api/v1/venue/admin/network/select-adapter", {
        adapter_name: target.name,
        description: target.description,
        media_type: target.media_type,
        ip_address: target.ip_address,
        subnet: target.subnet,
        gateway: target.gateway,
        mac_address: target.mac_address,
      });

      toast.success(`Active venue network "${target.name}" (${target.media_type}) saved to database!`);
      await fetchAdapters();
      scanSelectedNetwork(target.name, target.subnet);
    } catch (err: any) {
      toast.error(err.message || "Failed to persist network adapter selection.");
    } finally {
      setIsSavingAdapter(false);
    }
  };

  // 5. Scan Connected Devices on the Selected Adapter Subnet
  const scanSelectedNetwork = async (adName?: string, subnet?: string) => {
    const name = adName || selectedAdapterName;
    const target = adapters.find((a) => a.name === name);

    setIsScanning(true);
    try {
      const res: any = await apiClient.post(
        "/api/v1/venue/admin/network/scan",
        {
          adapter_name: name,
          subnet: subnet || target?.subnet,
          quick_sweep: true,
        },
        { timeout: 60000 }
      );

      if (Array.isArray(res)) {
        setDiscoveredDevices(res);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to scan network subnet.");
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    fetchAdapters();
    fetchWorkstations();
  }, [fetchAdapters, fetchWorkstations]);

  // Open Binding Modal for a discovered device
  const handleOpenBindModal = (dev: DiscoveredDevice) => {
    const existing = workstations.find((ws) =>
      ws.id === dev.bound_device_id ||
      (ws.mac_address && dev.mac_address && ws.mac_address.toUpperCase() === dev.mac_address.toUpperCase())
    );
    const existingMode = existing?.mode === "scanning" || existing?.mode === "workstation" || existing?.mode === "admin"
      ? existing.mode
      : "workstation";

    setSelectedDiscovered(dev);
    setBindDeviceId(dev.bound_device_id || (existingMode === "scanning" ? `SRR-SCAN-0${workstations.length + 1}` : `SRR-WS-0${workstations.length + 1}`));
    setBindDeviceName(existing?.device_name || dev.bound_device_name || (dev.hostname ? `${dev.hostname} Terminal` : `SRR Workstation 0${workstations.length + 1}`));
    setBindDeviceType(existing?.device_type || (existingMode === "scanning" ? "scanner" : "workstation"));
    setBindMode(existingMode);

    const existingAllowedModes = Array.isArray(existing?.allowed_modes) && existing.allowed_modes.length > 0
      ? existing.allowed_modes.filter((v): v is "workstation" | "scanning" | "admin" => ["workstation", "scanning", "admin"].includes(v))
      : [existingMode];
    const nextAllowedModes = Array.from(new Set([existingMode, ...existingAllowedModes])) as Array<"workstation" | "scanning" | "admin">;
    setBindAllowedModes(nextAllowedModes);

    setBindStation(existing?.room_name || dev.assigned_station || stationsList[0] || SRR_STATIONS[0]);
    setIsBindModalOpen(true);
  };

  const handleBindModeChange = (next: "workstation" | "scanning" | "admin") => {
    setBindMode(next);
    setBindAllowedModes((current) => Array.from(new Set([next, ...current])));
    if (next === "scanning") {
      setBindDeviceType("scanner");
      setBindStation("SRR Intake Check-in Gate");
      if (bindDeviceId.startsWith("SRR-WS")) setBindDeviceId(`SRR-SCAN-0${workstations.length + 1}`);
    } else if (next === "admin") {
      setBindDeviceType("admin_terminal");
      setBindStation("SRR Technician Master Desk");
      if (bindDeviceId.startsWith("SRR-WS") || bindDeviceId.startsWith("SRR-SCAN")) setBindDeviceId(`SRR-ADMIN-0${workstations.length + 1}`);
    } else {
      setBindDeviceType("workstation");
      setBindStation(stationsList[0] || SRR_STATIONS[0]);
      if (bindDeviceId.startsWith("SRR-SCAN") || bindDeviceId.startsWith("SRR-ADMIN")) setBindDeviceId(`SRR-WS-0${workstations.length + 1}`);
    }
  };

  // Submit Workstation Binding
  const handleBindSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDiscovered) return;
    if (!bindDeviceName.trim()) {
      toast.error("Device Name is required.");
      return;
    }

    try {
      setIsBinding(true);
      await apiClient.post("/api/v1/venue/admin/workstations/bind", {
        device_id: bindDeviceId.trim(),
        name: bindDeviceName.trim(),
        type: bindDeviceType,
        mac_address: selectedDiscovered.mac_address,
        ip_address: selectedDiscovered.ip_address,
        hostname: selectedDiscovered.hostname,
        assigned_station: bindStation,
        network_type: selectedDiscovered.media_type,
        mode: bindMode,
        permissions: { allowed_modes: bindAllowedModes },
      });

      toast.success(`Workstation "${bindDeviceName}" bound to MAC ${selectedDiscovered.mac_address} successfully!`);
      setIsBindModalOpen(false);
      setSelectedDiscovered(null);
      fetchWorkstations();
      scanSelectedNetwork();
    } catch (err: any) {
      toast.error(err.message || "Failed to bind workstation.");
    } finally {
      setIsBinding(false);
    }
  };

  // Unbind / Delete Workstation
  const handleUnbindWorkstation = async (id: string, name: string) => {
    const confirmDelete = window.confirm(`Are you sure you want to unbind workstation "${name}"?`);
    if (!confirmDelete) return;

    try {
      setDeletingId(id);
      await apiClient.delete(`/api/v1/venue/admin/workstations/${id}`);
      toast.success(`Workstation "${name}" unbound.`);
      fetchWorkstations();
      scanSelectedNetwork();
    } catch (err: any) {
      toast.error(err.message || "Failed to unbind workstation.");
    } finally {
      setDeletingId(null);
    }
  };

  // Ping Workstation
  const handlePingWorkstation = async (id: string, name: string) => {
    try {
      setPingingId(id);
      const res: any = await apiClient.post(`/api/v1/venue/admin/workstations/${id}/ping`);
      if (res.is_reachable === true) {
        toast.success(`Workstation "${name}" is reachable${res.latency_ms != null ? ` (${res.latency_ms}ms)` : ""}.`);
      } else {
        toast.info(`Workstation "${name}" was not actively probed. Last heartbeat: ${res.last_heartbeat_at || "unavailable"}.`);
      }
      fetchWorkstations();
    } catch (err: any) {
      toast.error(`Workstation "${name}" did not respond.`);
    } finally {
      setPingingId(null);
    }
  };

  // Schedule Resync
  const handleResyncWorkstation = async (id: string, name: string) => {
    try {
      setResyncingId(id);
      const result: any = await apiClient.post(`/api/v1/venue/admin/workstations/${id}/resync`);
      toast.success(`${name} will download snapshot v${result.snapshot_version || 1} on its next sync.`);
      fetchWorkstations();
    } catch (err: any) {
      toast.error(err.message || "Unable to schedule node re-sync.");
    } finally {
      setResyncingId(null);
    }
  };

  // Revoke Workstation
  const handleRevokeWorkstation = async (id: string, name: string) => {
    const reason = window.prompt(`Revoke ${name}? Enter an audit reason.`);
    if (!reason?.trim()) return;
    try {
      await apiClient.post(`/api/v1/venue/admin/workstations/${id}/revoke`, { reason: reason.trim() });
      toast.success(`${name} has been revoked and can no longer sync.`);
      fetchWorkstations();
    } catch (err: any) {
      toast.error(err.message || "Unable to revoke workstation.");
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      toast.success(`${label} copied to clipboard!`);
    } else {
      toast.error(`Could not copy ${label}`);
    }
  };

  const currentAdapter = adapters.find((a) => a.name === selectedAdapterName);
  const localDevice = discoveredDevices.find((device) => device.is_local);

  return (
    <div className="space-y-6 w-full pb-12">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. TOP BANNER: NETWORK ADAPTER SELECTOR & HOST METRICS       */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col lg:flex-row gap-5 items-start lg:items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-[var(--text)] tracking-tight flex items-center gap-2">
              <Network className="w-5 h-5 text-[var(--pri)]" /> Hardware Network Discovery & SRR Fleet Controller
            </h2>
          </div>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Select the host network adapter from the dropdown to bind to all SRR review desks, discover client hardware, and assign terminal roles
          </p>
        </div>

        {/* Adapter Dropdown & Action Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Adapter Dropdown Selector */}
          <div className="flex items-center gap-2 bg-[var(--surf)] border border-[var(--border)] rounded-xl p-1.5 px-3">
            <div className="flex items-center gap-1.5 text-xs font-black uppercase text-[var(--muted)]">
              {currentAdapter?.media_type === "Wi-Fi" ? (
                <Wifi className="w-4 h-4 text-blue-500" />
              ) : (
                <Network className="w-4 h-4 text-emerald-500" />
              )}
              <span className="hidden sm:inline">Active Interface:</span>
            </div>

            <select
              value={selectedAdapterName}
              onChange={(e) => handleAdapterChange(e.target.value)}
              disabled={loadingAdapters}
              className="bg-transparent text-xs font-bold text-[var(--text)] focus:outline-none cursor-pointer py-1 pr-2"
            >
              {adapters.map((ad) => (
                <option key={ad.name} value={ad.name} className="bg-[var(--card)] text-[var(--text)]">
                  {ad.name} ({ad.media_type} - {ad.ip_address || "No IP"} - {ad.link_speed || "1 Gbps"})
                </option>
              ))}
            </select>
          </div>

          {/* Save Network Binding Button */}
          <Button
            onClick={handleSaveNetworkBinding}
            disabled={isSavingAdapter || !selectedAdapterName}
            className="h-10 text-xs font-extrabold bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 gap-1.5 shadow-sm cursor-pointer"
            title="Save selected network adapter and bind operational subnet to PostgreSQL database"
          >
            <CheckCircle2 className={cn("w-4 h-4", isSavingAdapter && "animate-spin")} />
            {isSavingAdapter ? "Saving to DB..." : "Save Network Binding"}
          </Button>

          <Button
            variant="outline"
            onClick={fetchAdapters}
            disabled={loadingAdapters}
            className="h-10 text-xs font-bold border-[var(--border)] bg-[var(--surf)] text-[var(--text)] gap-1.5 cursor-pointer"
            title="Refresh Host Network Adapters"
          >
            <RefreshCw className={cn("w-4 h-4", loadingAdapters && "animate-spin")} /> Refresh
          </Button>

          <Button
            onClick={() => scanSelectedNetwork()}
            disabled={isScanning || !selectedAdapterName}
            className="h-10 bg-[var(--pri)] text-[var(--primary-contrast)] font-bold gap-2 shadow-md hover:opacity-90 cursor-pointer"
          >
            <Activity className={cn("w-4 h-4", isScanning && "animate-spin")} />
            {isScanning ? "Scanning Subnet..." : "Discover Devices"}
          </Button>
        </div>
      </div>

      {/* Selected Adapter Quick Metrics Bar */}
      {currentAdapter && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)] shadow-sm text-xs font-bold">
          <div className="space-y-0.5">
            <span className="text-[9px] uppercase font-black tracking-wider text-[var(--muted)] block">Adapter Name & Type</span>
            <div className="flex items-center gap-1.5 text-[var(--text)]">
              {currentAdapter.media_type === "Wi-Fi" ? <Wifi className="w-3.5 h-3.5 text-blue-500" /> : <Network className="w-3.5 h-3.5 text-emerald-500" />}
              <span>{currentAdapter.name} ({currentAdapter.media_type})</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[9px] uppercase font-black tracking-wider text-[var(--muted)] block">Host IP & Subnet</span>
            <span className="font-mono text-[var(--text)]">
              {currentAdapter.ip_address ? `${currentAdapter.ip_address}/${currentAdapter.prefix_length}` : "DHCP Assigned"}
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[9px] uppercase font-black tracking-wider text-[var(--muted)] block">Link Speed</span>
            <span className="font-mono text-[var(--acc)]">{currentAdapter.link_speed || "1 Gbps Full Duplex"}</span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[9px] uppercase font-black tracking-wider text-[var(--muted)] block">Host MAC & Route</span>
            <span className="font-mono text-[var(--muted)]">{currentAdapter.mac_address || "Auto Detected"}</span>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. LIVE DISCOVERED DEVICES (TABULAR VIEW)                     */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-base font-black text-[var(--text)] flex items-center gap-2">
              <Search className="w-5 h-5 text-[var(--pri)]" /> Live Discovered Subnet Devices ({discoveredDevices.length})
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              {discoveredDevices.length} device{discoveredDevices.length === 1 ? "" : "s"} detected on {currentAdapter?.subnet || "active network"}, including this workstation{localDevice ? ` (${localDevice.ip_address})` : ""}.
            </p>
          </div>

          <Button
            onClick={() => scanSelectedNetwork()}
            disabled={isScanning || !selectedAdapterName}
            className="h-9 px-4 text-xs font-bold bg-[var(--pri)] text-[var(--primary-contrast)] gap-1.5 shrink-0 cursor-pointer"
          >
            <Activity className={cn("w-3.5 h-3.5", isScanning && "animate-spin")} />
            {isScanning ? "Scanning Subnet..." : "Re-Scan Subnet"}
          </Button>
        </div>

        {discoveredDevices.length === 0 ? (
          <div className="bg-[var(--card)] p-12 rounded-2xl border border-[var(--border)] text-center space-y-3">
            <Radio className="w-10 h-10 mx-auto text-[var(--muted)] animate-pulse" />
            <h4 className="text-sm font-black text-[var(--text)]">
              {isScanning ? "Scanning subnet for connected SRR stations..." : "No connected devices detected on this subnet yet"}
            </h4>
            <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
              Make sure SRR review laptops, check-in scanning terminals, or technician laptops are powered on and connected to this venue network.
            </p>
            {!isScanning && (
              <Button
                onClick={() => scanSelectedNetwork()}
                className="bg-[var(--pri)] text-[var(--primary-contrast)] text-xs font-bold h-9 cursor-pointer"
              >
                Scan Subnet Now
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--surf)] border-b border-[var(--border)] text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="py-3.5 px-4">Device / Hostname</th>
                    <th className="py-3.5 px-4">Client IP</th>
                    <th className="py-3.5 px-4">Hardware MAC</th>
                    <th className="py-3.5 px-4">Interface / Media</th>
                    <th className="py-3.5 px-4">Binding Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-medium">
                  {discoveredDevices.map((dev, idx) => (
                    <tr key={idx} className="hover:bg-[var(--surf)]/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[var(--surf)] border border-[var(--border)] flex items-center justify-center text-[var(--pri)] shrink-0">
                            <Laptop className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-[var(--text)] block">
                              {dev.hostname || `SRR-Node-${dev.ip_address.split('.').pop()}`}
                            </span>
                            <span className="text-[10px] text-[var(--muted)] font-mono">
                              {dev.vendor || "Network Client"}
                              {dev.is_local ? " · THIS WORKSTATION" : ""}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[var(--acc)]">
                        {dev.ip_address}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[var(--text)]">
                        <div className="flex items-center gap-1.5">
                          <span>{dev.mac_address}</span>
                          <button
                            onClick={() => copyToClipboard(dev.mac_address, "MAC Address")}
                            className="text-[var(--muted)] hover:text-[var(--text)] p-1 rounded transition-colors cursor-pointer"
                            title="Copy MAC Address"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={cn(
                            "px-2 py-0.5 text-[9px] font-black uppercase rounded-md border inline-flex items-center gap-1",
                            dev.media_type === "Wi-Fi"
                              ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                              : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          )}
                        >
                          {dev.media_type === "Wi-Fi" ? <Wifi className="w-2.5 h-2.5" /> : <Network className="w-2.5 h-2.5" />}
                          {dev.media_type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {dev.is_registered ? (
                          <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 inline-block">
                            Bound: {dev.bound_device_name || dev.bound_device_id}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 inline-block">
                            Unassigned Node
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {dev.is_registered ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenBindModal(dev)}
                            className="h-7 text-xs font-bold border-[var(--border)] bg-[var(--surf)] text-[var(--text)] hover:bg-[var(--raised)] gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3 text-[var(--pri)]" /> Edit
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleOpenBindModal(dev)}
                            className="h-7 text-xs font-bold bg-[var(--pri)] text-[var(--primary-contrast)] gap-1 shadow-xs cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Bind
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. AUTHORIZED MULTI-WORKSTATIONS (TABULAR VIEW)               */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-[var(--text)] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" /> Authorized SRR Workstations & Desks ({workstations.length})
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Workstations bound to hardware MAC addresses with assigned speaker review roles and room checkpoints
            </p>
          </div>

          <Button
            variant="outline"
            onClick={fetchWorkstations}
            className="h-9 text-xs font-bold border-[var(--border)] bg-[var(--surf)] text-[var(--text)] gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh List
          </Button>
        </div>

        {workstations.length === 0 ? (
          <div className="bg-[var(--card)] p-10 rounded-2xl border border-[var(--border)] text-center space-y-3">
            <MonitorSmartphone className="w-10 h-10 mx-auto text-[var(--muted)]" />
            <h4 className="text-sm font-black text-[var(--text)]">No Authorized SRR Workstations Registered</h4>
            <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
              Use the subnet scanner above to discover review desks or check-in nodes, and click "Bind" to register them into the database.
            </p>
          </div>
        ) : (
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--surf)] border-b border-[var(--border)] text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="py-3.5 px-4">Workstation / ID</th>
                    <th className="py-3.5 px-4">Assigned Desk / Room</th>
                    <th className="py-3.5 px-4">Role & Mode</th>
                    <th className="py-3.5 px-4">IP & MAC Address</th>
                    <th className="py-3.5 px-4">Live Status</th>
                    <th className="py-3.5 px-4">Snapshot</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-medium">
                  {workstations.map((ws) => (
                    <tr key={ws.id} className="hover:bg-[var(--surf)]/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[var(--text)]">{ws.device_name}</div>
                        <span className="font-mono text-[10px] text-[var(--muted)]">{ws.id}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 inline-block">
                          {ws.room_name || "SRR Staging"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-[var(--surf)] border border-[var(--border)] text-[var(--acc)]">
                            {ws.device_type?.replace("_", " ") || "workstation"}
                          </span>
                          {ws.mode && (
                            <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-blue-500/10 text-blue-600 border border-blue-500/20">
                              {ws.mode}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-[var(--acc)] text-xs">{ws.ip_address || "Dynamic"}</div>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--muted)]">
                          <span>{ws.mac_address || "N/A"}</span>
                          {ws.mac_address && (
                            <button
                              onClick={() => copyToClipboard(ws.mac_address || "", "MAC")}
                              className="hover:text-[var(--text)] p-0.5 cursor-pointer"
                              title="Copy MAC"
                            >
                              <Copy className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-bold">
                          <span className={cn("w-2 h-2 rounded-full", ws.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-zinc-400")} />
                          <span className="capitalize">{ws.status}</span>
                        </div>
                        <span className="text-[10px] text-[var(--muted)] block">{ws.last_seen || "Active Session"}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[var(--text)]">
                        {ws.snapshot_version !== undefined ? `v${ws.snapshot_version}` : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePingWorkstation(ws.id, ws.device_name)}
                            disabled={pingingId === ws.id}
                            className="h-7 px-2 text-[11px] font-bold border-[var(--border)] bg-[var(--surf)] text-[var(--text)] hover:border-[var(--pri)] gap-1 cursor-pointer"
                            title="Ping Latency Test"
                          >
                            <Activity className={cn("w-3 h-3", pingingId === ws.id && "animate-spin text-[var(--pri)]")} />
                            <span className="hidden md:inline">Ping</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResyncWorkstation(ws.id, ws.device_name)}
                            disabled={resyncingId === ws.id || ws.assignment_status === "revoked"}
                            className="h-7 px-2 text-[11px] font-bold border-[var(--border)] bg-[var(--surf)] text-[var(--text)] gap-1 cursor-pointer"
                            title="Schedule Snapshot Re-sync"
                          >
                            <RotateCcw className={cn("w-3 h-3 text-[var(--pri)]", resyncingId === ws.id && "animate-spin")} />
                            <span className="hidden md:inline">Re-sync</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevokeWorkstation(ws.id, ws.device_name)}
                            disabled={ws.assignment_status === "revoked"}
                            className="h-7 px-2 text-[11px] font-bold border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 gap-1 cursor-pointer"
                            title="Revoke Workstation"
                          >
                            <Lock className="w-3 h-3" />
                            <span className="hidden md:inline">Revoke</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnbindWorkstation(ws.id, ws.device_name)}
                            disabled={deletingId === ws.id}
                            className="h-7 px-2 text-[11px] font-bold border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400 hover:bg-red-500/10 gap-1 cursor-pointer"
                            title="Delete / Unbind"
                          >
                            <Trash2 className={cn("w-3 h-3", deletingId === ws.id && "animate-spin")} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. WORKSTATION BINDING MODAL DIALOG                          */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isBindModalOpen && selectedDiscovered && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[var(--card)] rounded-3xl border border-[var(--border)] shadow-2xl w-full max-w-lg overflow-hidden space-y-0">
            {/* Modal Header */}
            <div className="p-6 pb-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surf)]/50">
              <div>
                <h3 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
                  <MonitorSmartphone className="w-5 h-5 text-[var(--pri)]" /> Bind SRR Workstation
                </h3>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  Assign terminal role and station context to hardware MAC <span className="font-mono text-[var(--acc)] font-bold">{selectedDiscovered.mac_address}</span>
                </p>
              </div>
              <button
                onClick={() => setIsBindModalOpen(false)}
                className="p-1.5 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleBindSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-[var(--muted)] tracking-wider">Device ID</label>
                  <Input
                    value={bindDeviceId}
                    onChange={(e) => setBindDeviceId(e.target.value)}
                    required
                    placeholder="SRR-WS-01"
                    className="h-10 text-xs font-mono font-bold bg-[var(--surf)] border-[var(--border)] rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-[var(--muted)] tracking-wider">Device Name</label>
                  <Input
                    value={bindDeviceName}
                    onChange={(e) => setBindDeviceName(e.target.value)}
                    required
                    placeholder="SRR Review Desk 1"
                    className="h-10 text-xs font-bold bg-[var(--surf)] border-[var(--border)] rounded-xl"
                  />
                </div>
              </div>

              {/* Mode Selection */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase text-[var(--muted)] tracking-wider">Operating Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["workstation", "scanning", "admin"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleBindModeChange(mode)}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center gap-1",
                        bindMode === mode
                          ? "bg-[var(--pri)] text-[var(--primary-contrast)] border-[var(--pri)] shadow-sm"
                          : "bg-[var(--surf)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                      )}
                    >
                      {mode === "workstation" ? <Laptop className="w-4 h-4" /> : mode === "scanning" ? <QrCode className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                      <span>{mode}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Assigned Station Context */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase text-[var(--muted)] tracking-wider">Assigned SRR Desk / Gate</label>
                <select
                  value={bindStation}
                  onChange={(e) => setBindStation(e.target.value)}
                  className="w-full h-10 bg-[var(--surf)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl px-3 focus:outline-none cursor-pointer"
                >
                  {stationsList.map((station) => (
                    <option key={station} value={station} className="bg-[var(--card)] text-[var(--text)]">
                      {station}
                    </option>
                  ))}
                </select>
              </div>

              {/* Locked Hardware Info */}
              <div className="p-3 rounded-xl bg-[var(--surf)] border border-[var(--border)] space-y-1 text-xs font-mono text-[var(--muted)]">
                <div className="flex justify-between">
                  <span>Client IP:</span>
                  <span className="text-[var(--text)] font-bold">{selectedDiscovered.ip_address}</span>
                </div>
                <div className="flex justify-between">
                  <span>Hardware MAC:</span>
                  <span className="text-[var(--text)] font-bold">{selectedDiscovered.mac_address}</span>
                </div>
                <div className="flex justify-between">
                  <span>Interface:</span>
                  <span className="text-[var(--text)]">{selectedDiscovered.media_type} ({selectedDiscovered.interface_name})</span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsBindModalOpen(false)}
                  className="h-10 text-xs font-bold border-[var(--border)] bg-[var(--surf)] text-[var(--text)] cursor-pointer"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={isBinding}
                  className="h-10 text-xs font-extrabold bg-[var(--pri)] text-[var(--primary-contrast)] shadow-md hover:opacity-90 gap-1.5 cursor-pointer"
                >
                  <Check className={cn("w-4 h-4", isBinding && "animate-spin")} />
                  {isBinding ? "Binding Node..." : "Confirm & Bind Workstation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
