"use client";

import React, { useState, useEffect } from "react";
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
  HardDrive
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn, copyToClipboard as safeCopyToClipboard } from "@/lib/utils";
import { saveVenueNodeConfiguration } from "@/lib/node-workstation";

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
}

interface CapacityRule { id: string; station_name: string; station_type?: string; }

const REGISTRATION_STATIONS = [
  "Main Registration Desk",
  "Registration Desk 1",
  "Registration Desk 2",
  "VIP / Helpdesk Counter",
];

export default function AdminDevicesPage() {
  const [adapters, setAdapters] = useState<NetworkAdapter[]>([]);
  const [selectedAdapterName, setSelectedAdapterName] = useState<string>("");
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const [stationsList, setStationsList] = useState<string[]>(REGISTRATION_STATIONS);
  const [capacityRules, setCapacityRules] = useState<CapacityRule[]>([]);

  const [loadingAdapters, setLoadingAdapters] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [pingingId, setPingingId] = useState<string | null>(null);

  // Binding Modal
  const [isBindModalOpen, setIsBindModalOpen] = useState(false);
  const [selectedDiscovered, setSelectedDiscovered] = useState<DiscoveredDevice | null>(null);
  const [bindDeviceId, setBindDeviceId] = useState("REG-DESK-01");
  const [bindDeviceName, setBindDeviceName] = useState("");
  const [bindDeviceType, setBindDeviceType] = useState("registration_desk");
  const [bindStation, setBindStation] = useState("Main Entrance Intake");
  const [bindMode, setBindMode] = useState<"registration" | "scanning" | "self_checkin">("registration");
  const [bindAllowedModes, setBindAllowedModes] = useState<Array<"registration" | "scanning" | "self_checkin">>(["registration"]);
  const [bindCapacityRuleId, setBindCapacityRuleId] = useState("");
  const [isBinding, setIsBinding] = useState(false);

  // Unbind/Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resyncingId, setResyncingId] = useState<string | null>(null);

  // 1. Fetch Network Adapters & Persisted Configuration
  const fetchAdapters = async () => {
    try {
      setLoadingAdapters(true);
      const res: any = await apiClient.get("/venue/admin/network/adapters");
      if (Array.isArray(res)) {
        setAdapters(res);
        // Find active adapter or default gateway
        const active =
          res.find((a) => a.is_active) ||
          res.find((a) => a.is_default && a.status === "Up") ||
          res.find((a) => a.status === "Up") ||
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
  };

  // 2. Fetch Registered Workstations
  const fetchWorkstations = async () => {
    try {
      const res: any = await apiClient.get("/venue/admin/workstations");
      if (Array.isArray(res)) {
        setWorkstations(res);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 3. Fetch Check-in Gates for scanning assignment.
  const fetchStations = async () => {
    try {
      const res: any = await apiClient.get("/venue/registration/capacity");
      if (res && res.stations && res.stations.length > 0) {
        setCapacityRules(res.stations.map((s: any) => ({ id: String(s.id), station_name: s.station_name, station_type: s.station_type })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [isSavingAdapter, setIsSavingAdapter] = useState(false);

  // 4. Handle Adapter Dropdown Selection
  const handleAdapterChange = (newAdapterName: string) => {
    setSelectedAdapterName(newAdapterName);
    const target = adapters.find((a) => a.name === newAdapterName);
    if (target) {
      scanSelectedNetwork(target.name, target.subnet);
    }
  };

  // Explicitly Save Network Binding to PostgreSQL Database
  const handleSaveNetworkBinding = async () => {
    const target = adapters.find((a) => a.name === selectedAdapterName);
    if (!target) {
      toast.error("Please select a network adapter first.");
      return;
    }

    try {
      setIsSavingAdapter(true);
      await apiClient.post("/venue/admin/network/select-adapter", {
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
      const res: any = await apiClient.post("/venue/admin/network/scan", {
        adapter_name: name,
        subnet: subnet || target?.subnet,
        quick_sweep: true,
      });

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
    fetchStations();
  }, []);

  // Open Binding Modal for a discovered device
  const handleOpenBindModal = (dev: DiscoveredDevice) => {
    const existing = workstations.find((ws) =>
      ws.id === dev.bound_device_id ||
      (ws.mac_address && dev.mac_address && ws.mac_address.toUpperCase() === dev.mac_address.toUpperCase())
    );
    const existingMode = existing?.mode === "scanning" || existing?.mode === "registration" || existing?.mode === "self_checkin"
      ? existing.mode
      : "registration";
    setSelectedDiscovered(dev);
    setBindDeviceId(dev.bound_device_id || (existingMode === "scanning" ? `SCAN-0${workstations.length + 1}` : existingMode === "self_checkin" ? `SELF-KIOSK-0${workstations.length + 1}` : `REG-DESK-0${workstations.length + 1}`));
    setBindDeviceName(existing?.device_name || dev.bound_device_name || (dev.hostname ? `${dev.hostname} Terminal` : existingMode === "self_checkin" ? `Self Check-in Kiosk 0${workstations.length + 1}` : `Registration Desk 0${workstations.length + 1}`));
    setBindDeviceType(existing?.device_type || (existingMode === "scanning" ? "scanner" : existingMode === "self_checkin" ? "kiosk" : "registration_desk"));
    setBindMode(existingMode);
    const existingAllowedModes = Array.isArray(existing?.allowed_modes) && existing.allowed_modes.length > 0
      ? existing.allowed_modes.filter((value): value is "registration" | "scanning" | "self_checkin" => ["registration", "scanning", "self_checkin"].includes(value))
      : [existingMode];
    const nextAllowedModes = Array.from(new Set([existingMode, ...existingAllowedModes])) as Array<"registration" | "scanning" | "self_checkin">;
    setBindAllowedModes(nextAllowedModes);
    setBindCapacityRuleId(nextAllowedModes.includes("scanning") ? (existing?.capacity_rule_id || capacityRules[0]?.id || "") : "");
    setBindStation(existingMode === "scanning"
      ? (capacityRules.find((rule) => rule.id === existing?.capacity_rule_id)?.station_name || capacityRules[0]?.station_name || "")
      : existingMode === "self_checkin"
        ? (existing?.room_name || dev.assigned_station || `SELF-KIOSK-${workstations.length + 1}`)
        : (existing?.room_name || dev.assigned_station || stationsList[0] || REGISTRATION_STATIONS[0]));
    setIsBindModalOpen(true);
  };

  const handleBindModeChange = (next: "registration" | "scanning" | "self_checkin") => {
    setBindMode(next);
    setBindAllowedModes((current) => Array.from(new Set([next, ...current])));
    if (next === "scanning") {
      const firstGate = capacityRules[0];
      setBindDeviceType("scanner");
      setBindCapacityRuleId(firstGate?.id || "");
      setBindStation(firstGate?.station_name || "");
      if (bindDeviceId.startsWith("REG-DESK")) setBindDeviceId(`SCAN-0${workstations.length + 1}`);
    } else if (next === "self_checkin") {
      setBindDeviceType("kiosk");
      setBindCapacityRuleId("");
      setBindStation(`SELF-KIOSK-${workstations.length + 1}`);
      if (bindDeviceId.startsWith("REG-DESK") || bindDeviceId.startsWith("SCAN")) setBindDeviceId(`SELF-KIOSK-0${workstations.length + 1}`);
    } else {
      setBindDeviceType("registration_desk");
      setBindCapacityRuleId("");
      setBindStation(stationsList[0] || REGISTRATION_STATIONS[0]);
      if (bindDeviceId.startsWith("SCAN")) setBindDeviceId(`REG-DESK-0${workstations.length + 1}`);
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
    if (bindAllowedModes.includes("scanning") && !bindCapacityRuleId) {
      toast.error("Select the check-in gate because scanning is allowed on this workstation.");
      return;
    }

    try {
      setIsBinding(true);
      const binding: any = await apiClient.post("/venue/admin/workstations/bind", {
        device_id: bindDeviceId.trim(),
        name: bindDeviceName.trim(),
        type: bindDeviceType,
        mac_address: selectedDiscovered.mac_address,
        ip_address: selectedDiscovered.ip_address,
        hostname: selectedDiscovered.hostname,
        assigned_station: bindStation,
        network_type: selectedDiscovered.media_type,
        mode: bindMode,
        capacity_rule_id: bindAllowedModes.includes("scanning") ? bindCapacityRuleId : null,
        permissions: { allowed_modes: bindAllowedModes },
      });

      toast.success(`Workstation "${bindDeviceName}" bound to MAC ${selectedDiscovered.mac_address} successfully!`);
      if (binding?.assignment_id && binding?.enrollment_token) {
        const nodeConfiguration = {
          venue_server: (process.env.NEXT_PUBLIC_VENUE_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || window.location.origin).replace(/\/api\/v1\/?$/, ""),
          assignment_id: binding.assignment_id,
          enrollment_token: binding.enrollment_token,
        };
        // If Admin is binding this same workstation, provision its browser immediately.
        if (selectedDiscovered.is_local) {
          saveVenueNodeConfiguration(nodeConfiguration);
        }
      }
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
      await apiClient.delete(`/venue/admin/workstations/${id}`);
      toast.success(`Workstation "${name}" unbound.`);
      fetchWorkstations();
      scanSelectedNetwork();
    } catch (err: any) {
      toast.error(err.message || "Failed to unbind workstation.");
    } finally {
      setDeletingId(null);
    }
  };

  // Ping Workstation to test live latency
  const handlePingWorkstation = async (id: string, name: string) => {
    try {
      setPingingId(id);
      const res: any = await apiClient.post(`/venue/admin/workstations/${id}/ping`);
      toast.success(`Workstation "${name}" is reachable! Latency: ${res.latency_ms || 2}ms`);
      fetchWorkstations();
    } catch (err: any) {
      toast.error(`Workstation "${name}" did not respond.`);
    } finally {
      setPingingId(null);
    }
  };

  const handleResyncWorkstation = async (id: string, name: string) => {
    try {
      setResyncingId(id);
      const result: any = await apiClient.post(`/venue/admin/workstations/${id}/resync`);
      toast.success(`${name} will download snapshot v${result.snapshot_version} on its next sync.`);
      fetchWorkstations();
    } catch (err: any) {
      toast.error(err.message || "Unable to schedule node re-sync.");
    } finally {
      setResyncingId(null);
    }
  };

  const handleRevokeWorkstation = async (id: string, name: string) => {
    const reason = window.prompt(`Revoke ${name}? Enter an audit reason.`);
    if (!reason?.trim()) return;
    try {
      await apiClient.post(`/venue/admin/workstations/${id}/revoke`, { reason: reason.trim() });
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
      {/* Top Banner Header with Adapter Dropdown Selector */}
      <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col lg:flex-row gap-5 items-start lg:items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-[var(--text)] tracking-tight flex items-center gap-2">
              <Network className="w-5 h-5 text-[var(--pri)]" /> Hardware Network Discovery & Workstation Controller
            </h2>

          </div>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Select venue network adapter from the dropdown to bind to all connected nodes, discover client hardware, and assign workstation roles
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
            className="h-10 text-xs font-extrabold bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 gap-1.5 shadow-sm"
            title="Save selected network adapter and bind operational subnet to PostgreSQL database"
          >
            <CheckCircle2 className={cn("w-4 h-4", isSavingAdapter && "animate-spin")} />
            {isSavingAdapter ? "Saving to DB..." : "Save Network Binding"}
          </Button>

          <Button
            variant="outline"
            onClick={fetchAdapters}
            disabled={loadingAdapters}
            className="h-10 text-xs font-bold border-[var(--border)] bg-[var(--surf)] text-[var(--text)] gap-1.5"
            title="Refresh Host Network Adapters"
          >
            <RefreshCw className={cn("w-4 h-4", loadingAdapters && "animate-spin")} /> Refresh
          </Button>

          <Button
            onClick={() => scanSelectedNetwork()}
            disabled={isScanning || !selectedAdapterName}
            className="h-10 bg-[var(--pri)] text-[var(--primary-contrast)] font-bold gap-2 shadow-md hover:opacity-90"
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
      {/* STEP 2: LIVE DISCOVERED DEVICES (CARD STYLE 3-COLUMN VIEW)     */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-base font-black text-[var(--text)] flex items-center gap-2">
              <Search className="w-5 h-5 text-[var(--pri)]" /> Live Discovered Subnet Devices ({discoveredDevices.length})
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              {discoveredDevices.length} device{discoveredDevices.length === 1 ? "" : "s"} detected on {currentAdapter?.subnet || "active network"}, including this workstation{localDevice ? ` (${localDevice.ip_address})` : ""}. Each row is tied to the live IP, MAC, interface, and discovery source.
            </p>
          </div>

          <Button
            onClick={() => scanSelectedNetwork()}
            disabled={isScanning || !selectedAdapterName}
            className="h-9 px-4 text-xs font-bold bg-[var(--pri)] text-[var(--primary-contrast)] gap-1.5 shrink-0"
          >
            <Activity className={cn("w-3.5 h-3.5", isScanning && "animate-spin")} />
            {isScanning ? "Scanning Subnet..." : "Re-Scan Subnet"}
          </Button>
        </div>

        {discoveredDevices.length === 0 ? (
          <div className="bg-[var(--card)] p-12 rounded-2xl border border-[var(--border)] text-center space-y-3">
            <Radio className="w-10 h-10 mx-auto text-[var(--muted)] animate-pulse" />
            <h4 className="text-sm font-black text-[var(--text)]">
              {isScanning ? "Scanning subnet for connected client nodes..." : "No connected devices detected on this subnet yet"}
            </h4>
            <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
              Make sure client laptops, kiosks, thermal printers, or barcode scanners are powered on and connected to this Ethernet switch or Wi-Fi network.
            </p>
            {!isScanning && (
              <Button
                onClick={() => scanSelectedNetwork()}
                className="bg-[var(--pri)] text-[var(--primary-contrast)] text-xs font-bold h-9"
              >
                Scan Subnet Now
              </Button>
            )}
          </div>
        ) : (
          /* 3-Column Card Style for Live Discovered Devices */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {discoveredDevices.map((dev, idx) => (
              <div
                key={idx}
                className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 flex flex-col justify-between hover:border-[var(--pri)] transition-all"
              >
                <div className="space-y-3.5">
                  {/* Card Header with Hostname and Media Type Badge */}
                  <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-[var(--surf)] border border-[var(--border)] flex items-center justify-center text-[var(--pri)] font-bold">
                        <Laptop className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-[var(--text)]">{dev.hostname || `Node-${dev.ip_address.split('.').pop()}`}</h4>
                      <span className="text-[10px] text-[var(--muted)] font-mono block">{dev.vendor || "Network Client"}{dev.is_local ? " · THIS WORKSTATION" : ""}</span>
                      </div>
                    </div>

                    <span
                      className={cn(
                        "px-2 py-0.5 text-[9px] font-black uppercase rounded-md border",
                        dev.media_type === "Wi-Fi"
                          ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                          : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                      )}
                    >
                      {dev.media_type}
                    </span>
                  </div>

                  {/* Hardware Metrics (IP, MAC, Vendor) */}
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-xl bg-[var(--surf)] border border-[var(--border)] flex justify-between items-center text-xs font-bold">
                      <span className="text-[10px] font-black uppercase text-[var(--muted)]">Client IP:</span>
                      <span className="font-mono text-[var(--acc)] font-bold">{dev.ip_address}</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[var(--surf)] border border-[var(--border)] flex justify-between items-center text-xs font-bold">
                      <span className="text-[10px] font-black uppercase text-[var(--muted)]">Hardware MAC:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[var(--text)] text-xs">{dev.mac_address}</span>
                        <button
                          onClick={() => copyToClipboard(dev.mac_address, "MAC Address")}
                          className="text-[var(--muted)] hover:text-[var(--text)] p-1 rounded transition-colors"
                          title="Copy MAC Address"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Registration Status Banner */}
                    <div className="p-2 rounded-xl bg-[var(--surf)] border border-[var(--border)] flex justify-between items-center text-[10px] font-bold">
                      <span className="uppercase text-[var(--muted)] font-black">Binding State:</span>
                      {dev.is_registered ? (
                        <span className="px-2 py-0.5 font-black uppercase rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          Bound: {dev.bound_device_name || dev.bound_device_id}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 font-black uppercase rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          Unassigned Node
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-semibold text-[var(--muted)]">
                      <span>Interface: <span className="font-mono text-[var(--text)]">{dev.interface_name}</span></span>
                      <span>{dev.discovery_source || "neighbor table"}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Button */}
                {dev.is_registered ? (
                  <Button
                    variant="outline"
                    onClick={() => handleOpenBindModal(dev)}
                    className="w-full h-8 text-xs font-bold border-[var(--border)] bg-[var(--surf)] text-[var(--text)] hover:bg-[var(--raised)] gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[var(--pri)]" /> Edit Device Binding
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleOpenBindModal(dev)}
                    className="w-full h-8 text-xs font-bold bg-[var(--pri)] text-[var(--primary-contrast)] gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Bind as Workstation
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* STEP 3 & 4: REGISTERED AUTHORIZED WORKSTATIONS DASHBOARD      */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-[var(--text)] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" /> Authorized Multi-Workstations ({workstations.length})
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Workstations bound to hardware MAC addresses with assigned terminal roles and station checkpoints (stored in database)
            </p>
          </div>

          <Button
            variant="outline"
            onClick={fetchWorkstations}
            className="h-9 text-xs font-bold border-[var(--border)] bg-[var(--surf)] text-[var(--text)] gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh List
          </Button>
        </div>

        {workstations.length === 0 ? (
          <div className="bg-[var(--card)] p-10 rounded-2xl border border-[var(--border)] text-center space-y-3">
            <MonitorSmartphone className="w-10 h-10 mx-auto text-[var(--muted)]" />
            <h4 className="text-sm font-black text-[var(--text)]">No Authorized Workstations Registered</h4>
            <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
              Use the subnet scanner above to discover client terminals, kiosks, or printers, and click "Bind as Workstation" to register them into the database.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {workstations.map((ws) => (
              <div
                key={ws.id}
                className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 flex flex-col justify-between hover:border-[var(--pri)] transition-all"
              >
                <div className="space-y-3">
                  {/* Card Top */}
                  <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
                    <div className="space-y-1">
                      <h4 className="text-base font-black text-[var(--text)]">{ws.device_name}</h4>
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-[var(--surf)] border border-[var(--border)] text-[var(--acc)]">
                          {ws.device_type.replace("_", " ")}
                        </span>
                        <span className="px-2 py-0.5 text-[9px] font-bold rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          {ws.room_name || "Main Entrance Intake"}
                        </span>
                        {ws.mode && <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-blue-500/10 text-blue-600 border border-blue-500/20">{ws.mode}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handlePingWorkstation(ws.id, ws.device_name)}
                        disabled={pingingId === ws.id}
                        className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--pri)] transition-all cursor-pointer"
                        title="Test Connection / Ping"
                      >
                        <Activity className={cn("w-3.5 h-3.5", pingingId === ws.id && "animate-spin text-[var(--pri)]")} />
                      </button>

                      <button
                        onClick={() => handleUnbindWorkstation(ws.id, ws.device_name)}
                        disabled={deletingId === ws.id}
                        className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-red-500 hover:border-red-500 transition-all cursor-pointer"
                        title="Unbind / Delete Workstation"
                      >
                        <Trash2 className={cn("w-3.5 h-3.5", deletingId === ws.id && "animate-spin")} />
                      </button>
                    </div>
                  </div>

                  {/* Hardware & Network Metrics */}
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-xl bg-[var(--surf)] border border-[var(--border)] flex justify-between items-center text-xs font-bold">
                      <span className="text-[10px] font-black uppercase text-[var(--muted)]">Hardware MAC:</span>
                      <span className="font-mono text-[var(--text)]">{ws.mac_address || "N/A"}</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[var(--surf)] border border-[var(--border)] flex justify-between items-center text-xs font-bold">
                      <span className="text-[10px] font-black uppercase text-[var(--muted)]">Client IP:</span>
                      <span className="font-mono text-[var(--acc)]">{ws.ip_address || "DHCP Assigned"}</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[var(--surf)] border border-[var(--border)] flex justify-between items-center text-xs font-bold">
                      <span className="text-[10px] font-black uppercase text-[var(--muted)]">Hostname:</span>
                      <span className="text-[var(--text)]">{ws.hostname || "Workstation Node"}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--surf)] border border-[var(--border)] flex justify-between items-center text-xs font-bold">
                      <span className="text-[10px] font-black uppercase text-[var(--muted)]">Replica:</span>
                      <span className="text-[var(--text)]">{ws.assignment_status || "not provisioned"} · v{ws.snapshot_version ?? 0}</span>
                    </div>
                  </div>
                </div>

                {/* Footer with Status and Ping */}
                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[10px] font-bold text-[var(--muted)]">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("w-2 h-2 rounded-full", ws.status === "online" ? "bg-emerald-500" : "bg-zinc-400")} />
                    Status: {ws.status.toUpperCase()}
                  </span>
                  <div className="flex items-center gap-3">
                  <button onClick={() => handleResyncWorkstation(ws.id, ws.device_name)} disabled={resyncingId === ws.id || ws.assignment_status === "revoked"} className="text-[var(--pri)] hover:underline disabled:opacity-40">
                    {resyncingId === ws.id ? "Scheduling…" : "Re-sync"}
                  </button>
                  <button onClick={() => handleRevokeWorkstation(ws.id, ws.device_name)} disabled={ws.assignment_status === "revoked"} className="text-red-500 hover:underline disabled:opacity-40">Revoke</button>
                  <button
                    onClick={() => handlePingWorkstation(ws.id, ws.device_name)}
                    className="text-[var(--pri)] hover:underline flex items-center gap-1"
                  >
                    Ping Station ➔
                  </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL: BIND WORKSTATION / DEVICE ID CONFIGURATION              */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isBindModalOpen && selectedDiscovered && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[var(--pri)]" /> Bind Workstation & Assign Device ID
              </h3>
              <button
                onClick={() => {
                  setIsBindModalOpen(false);
                  setSelectedDiscovered(null);
                }}
                className="text-[var(--muted)] hover:text-[var(--text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBindSubmit} className="space-y-4">
              {/* Hardware Summary Banner */}
              <div className="p-3 bg-[var(--surf)] border border-[var(--border)] rounded-xl space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-[var(--muted)]">Target Hardware MAC:</span>
                  <span className="font-mono text-[var(--text)]">{selectedDiscovered.mac_address}</span>
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-[var(--muted)]">Discovered IP & Vendor:</span>
                  <span className="font-mono text-[var(--acc)]">
                    {selectedDiscovered.ip_address} ({selectedDiscovered.vendor || "Client"})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Device ID Code *</label>
                  <Input
                    required
                    placeholder="e.g. REG-DESK-01"
                    value={bindDeviceId}
                    onChange={(e) => setBindDeviceId(e.target.value)}
                    className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {["REG-DESK-01", "KIOSK-01", "SCAN-01", "PRINT-01"].map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setBindDeviceId(code)}
                        className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-[var(--raised)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Workstation Role</label>
                  <select
                    value={bindDeviceType}
                    onChange={(e) => setBindDeviceType(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--surf)] text-[var(--text)]"
                  >
                    <option value="registration_desk">Registration Desk</option>
                    <option value="kiosk">Self-Service QR Kiosk</option>
                    <option value="scanner">Entrance Barcode Scanner</option>
                    <option value="printer">Thermal Badge Printer</option>
                    <option value="helpdesk">VIP / Helpdesk Terminal</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Primary Application Mode</label>
                  <select value={bindMode} onChange={(e) => handleBindModeChange(e.target.value as "registration" | "scanning" | "self_checkin")} className="w-full h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--surf)] text-[var(--text)]">
                    <option value="registration">Registration</option>
                    <option value="scanning">Scanning</option>
                    <option value="self_checkin">Self Check-in Kiosk</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">
                    {bindMode === "scanning" ? "Assigned Check-in Gate" : bindMode === "self_checkin" ? "Kiosk Name" : "Assigned Desk / Counter"}
                  </label>
                  {bindMode === "self_checkin" ? (
                    <Input
                      value={bindStation}
                      onChange={(e) => {
                        setBindStation(e.target.value);
                        setBindCapacityRuleId("");
                      }}
                      required
                      placeholder="SELF-KIOSK-1"
                      className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                    />
                  ) : (
                    <select
                      value={bindMode === "scanning" ? bindCapacityRuleId : bindStation}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (bindMode === "scanning") {
                          setBindCapacityRuleId(value);
                          setBindStation(capacityRules.find((rule) => rule.id === value)?.station_name || "");
                        } else {
                          setBindStation(value);
                          setBindCapacityRuleId("");
                        }
                      }}
                      required
                      className="w-full h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--surf)] text-[var(--text)]"
                    >
                      <option value="">Select {bindMode === "scanning" ? "check-in gate" : "desk / counter"}</option>
                      {bindMode === "scanning"
                        ? capacityRules
                            .filter((rule) => !rule.station_name?.toLowerCase().includes("initial") && !rule.station_name?.toLowerCase().includes("intake"))
                            .map((rule) => <option key={rule.id} value={rule.id}>{rule.station_name}</option>)
                        : stationsList.map((stn) => <option key={stn} value={stn}>{stn}</option>)}
                    </select>
                  )}
                  <p className="mt-1 text-[9px] font-semibold text-[var(--muted)]">
                    {bindMode === "scanning"
                      ? "Scanning mode is locked to this gate online and offline."
                      : bindMode === "self_checkin"
                        ? "Self check-in mode is locked to this kiosk assignment on this PC."
                        : "Registration mode uses a desk/counter name, not a check-in gate."}
                  </p>
                </div>
              </div>

              {bindAllowedModes.includes("scanning") && bindMode !== "scanning" && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-3">
                  <label className="text-xs font-bold text-[var(--text)] block mb-1">Scanning Check-in Gate</label>
                  <select
                    value={bindCapacityRuleId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBindCapacityRuleId(value);
                    }}
                    required
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border)] text-xs font-bold bg-[var(--card)] text-[var(--text)]"
                  >
                    <option value="">Select check-in gate</option>
                    {capacityRules
                      .filter((rule) => !rule.station_name?.toLowerCase().includes("initial") && !rule.station_name?.toLowerCase().includes("intake"))
                      .map((rule) => <option key={rule.id} value={rule.id}>{rule.station_name}</option>)}
                  </select>
                  <p className="mt-1 text-[9px] font-semibold text-[var(--muted)]">
                    This gate is used whenever this reused workstation launches Scanning mode.
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-3">
                <label className="text-xs font-bold text-[var(--text)] block mb-2">Allowed Modes on this Workstation</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["registration", "Registration"],
                    ["scanning", "Scanning"],
                    ["self_checkin", "Self Check-in"],
                  ].map(([value, label]) => {
                    const modeValue = value as "registration" | "scanning" | "self_checkin";
                    const checked = bindAllowedModes.includes(modeValue);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          if (modeValue === bindMode) return;
                          setBindAllowedModes((current) => {
                            if (checked) {
                              const next = current.filter((item) => item !== modeValue);
                              return next.length ? next : [bindMode];
                            }
                            if (modeValue === "scanning" && !bindCapacityRuleId) {
                              const firstGate = capacityRules[0];
                              setBindCapacityRuleId(firstGate?.id || "");
                            }
                            return Array.from(new Set([...current, modeValue]));
                          });
                        }}
                        className={cn(
                          "flex items-center justify-between rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition",
                          checked ? "border-[var(--pri)] bg-[var(--pri)]/10 text-[var(--text)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--raised)]",
                          modeValue === bindMode && "cursor-default"
                        )}
                      >
                        {label}{modeValue === bindMode ? " · Primary" : ""}
                        {checked && <Check className="size-3.5 text-[var(--pri)]" />}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[9px] font-semibold text-[var(--muted)]">
                  Primary mode opens by default. Checked modes can also be launched from this same PC.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text)] block mb-1">Friendly Device Name *</label>
                <Input
                  required
                  placeholder="e.g. Main Registration Desk A"
                  value={bindDeviceName}
                  onChange={(e) => setBindDeviceName(e.target.value)}
                  className="h-10 text-xs font-semibold bg-[var(--surf)] border-[var(--border)] text-[var(--text)]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsBindModalOpen(false);
                    setSelectedDiscovered(null);
                  }}
                  className="border-[var(--border)] bg-[var(--surf)] text-[var(--text)]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isBinding}
                  className="bg-[var(--pri)] text-[var(--primary-contrast)] font-bold gap-1.5"
                >
                  {isBinding ? "Binding Device..." : "Authorize & Bind Workstation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
