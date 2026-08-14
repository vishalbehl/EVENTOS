"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Package,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Lock,
  RotateCcw,
  Box,
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  User,
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  QrCode,
  Camera,
  CameraOff,
} from "lucide-react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface KitCatalogItem {
  id: string;
  kit_name: string;
  category: string;
  total_quantity: number;
  distributed_quantity: number;
  remaining_quantity: number;
  description?: string;
  target_roles?: string[];
}

interface KitIssuedLog {
  id: string;
  participant_id: string;
  regno: string;
  participant_name: string;
  email: string;
  role: string;
  company?: string;
  kit_name: string;
  issued_at?: string;
  issued_by?: string;
  status: string;
}

interface KitPendingParticipant {
  id: string;
  regno: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  company?: string;
  checked_in?: boolean;
}

interface KitParticipant {
  id: string;
  regno: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  company?: string;
  checked_in?: boolean;
  is_checked_in?: boolean;
  badge_code?: string;
  qr_token?: string;
}

export default function KitDistributionPage() {
  const [kpis, setKpis] = useState({
    total_available: 0,
    total_distributed: 0,
    total_remaining: 0,
    total_types: 0,
    participants_not_received: 0,
  });
  const [kits, setKits] = useState<KitCatalogItem[]>([]);
  const [issuedLogs, setIssuedLogs] = useState<KitIssuedLog[]>([]);
  const [participantsWithoutKits, setParticipantsWithoutKits] = useState<KitPendingParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKitScanner, setShowKitScanner] = useState(false);
  const [kitScanQuery, setKitScanQuery] = useState("");
  const [kitLookupBusy, setKitLookupBusy] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<KitParticipant | null>(null);
  const [kitSearchResults, setKitSearchResults] = useState<KitParticipant[]>([]);
  const [selectedKitId, setSelectedKitId] = useState("");
  const [issuingKit, setIssuingKit] = useState(false);
  const [showKitCatalogModal, setShowKitCatalogModal] = useState(false);
  const [showNotReceivedModal, setShowNotReceivedModal] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPanelOpen, setCameraPanelOpen] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastQrRef = useRef("");

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Add Kit Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKitName, setNewKitName] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [newQuantity, setNewQuantity] = useState("100");
  const [newDescription, setNewDescription] = useState("");
  const [addingKit, setAddingKit] = useState(false);

  // Admin Reset Modal State
  const [resetTarget, setResetTarget] = useState<KitIssuedLog | null>(null);
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // Fetch summary & distribution logs
  const fetchData = async () => {
    try {
      setLoading(true);
      const res: any = await apiClient.get("/venue/registration/kits/summary");
      if (res) {
        if (res.kpis) setKpis(res.kpis);
        if (Array.isArray(res.kits)) setKits(res.kits);
        if (Array.isArray(res.issued_logs)) setIssuedLogs(res.issued_logs);
        if (Array.isArray(res.participants_without_kits)) setParticipantsWithoutKits(res.participants_without_kits);
      }
    } catch (err) {
      console.error("Failed to fetch kit distribution data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!showKitScanner) {
      stopCamera();
      return;
    }
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          const cameras = devices.filter((device) => device.kind === "videoinput");
          setVideoDevices(cameras);
          if (!selectedDeviceId && cameras[0]) setSelectedDeviceId(cameras[0].deviceId);
        })
        .catch(() => setVideoDevices([]));
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showKitScanner]);

  // Filtered Issued Logs
  const filteredLogs = useMemo(() => {
    return issuedLogs.filter((item) => {
      const q = searchTerm.toLowerCase().trim();
      return (
        !q ||
        item.participant_name.toLowerCase().includes(q) ||
        item.regno.toLowerCase().includes(q) ||
        item.kit_name.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q)
      );
    });
  }, [issuedLogs, searchTerm]);

  // Pagination calculation
  const totalEntries = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEntries);
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  // 1. Submit Add Kit
  const handleAddKit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKitName.trim()) {
      toast.error("Kit Name is required.");
      return;
    }

    try {
      setAddingKit(true);
      await apiClient.post("/venue/registration/kits", {
        kit_name: newKitName.trim(),
        category: newCategory.trim(),
        total_quantity: parseInt(newQuantity) || 100,
        description: newDescription.trim(),
      });

      toast.success(`New Kit '${newKitName}' added to catalog!`);
      setShowAddModal(false);
      setNewKitName("");
      setNewDescription("");
      fetchData();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Failed to create kit.";
      toast.error(msg);
    } finally {
      setAddingKit(false);
    }
  };

  const issueKitToParticipant = async (participant: KitParticipant, kitId?: string) => {
    setIssuingKit(true);
    try {
      await apiClient.post("/venue/registration/kits/issue", {
        participant_id: participant.id,
        kit_id: kitId || undefined,
        issued_by: "REGISTRATION-KIT-DESK",
      });
      toast.success(`Kit issued to ${participant.name}.`);
      setSelectedParticipant(null);
      setKitSearchResults([]);
      setKitScanQuery("");
      setSelectedKitId("");
      await fetchData();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Kit could not be issued.";
      toast.error(msg);
    } finally {
      setIssuingKit(false);
    }
  };

  const lookupParticipantForKit = async (rawQuery?: string, options?: { autoIssue?: boolean }) => {
    const q = (rawQuery || kitScanQuery).trim();
    if (!q) {
      toast.error("Scan QR or enter registration code, name, email, or phone.");
      return;
    }
    if (!options?.autoIssue) {
      setSelectedParticipant(null);
      setKitSearchResults([]);
    }
    setKitLookupBusy(true);
    try {
      const res: any = await apiClient.get(`/venue/registration/participants?q=${encodeURIComponent(q)}&limit=20`);
      const items: KitParticipant[] = Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : [];
      const lower = q.toLowerCase();
      const exact = items.find((p) =>
        [p.id, p.regno, p.badge_code, p.qr_token, p.email, p.phone]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase() === lower)
      );
      if (!options?.autoIssue && items.length > 1) {
        setKitSearchResults(items);
        toast.success(`Found ${items.length} matching participants. Select the correct one.`);
        return;
      }

      const participant = options?.autoIssue ? exact : exact || items[0] || null;
      if (!participant) {
        setSelectedParticipant(null);
        setKitSearchResults([]);
        toast.error("No participant found for this QR/details.");
        return;
      }
      const kitId = selectParticipantForKit(participant);
      if (options?.autoIssue) {
        toast.success(`Scanned ${participant.name}. Issuing kit automatically...`);
        await issueKitToParticipant(participant, kitId);
      } else {
        toast.success(`Loaded ${participant.name}. Review details, then issue kit.`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Participant lookup failed.");
    } finally {
      setKitLookupBusy(false);
    }
  };

  const selectParticipantForKit = (participant: KitParticipant) => {
    setSelectedParticipant(participant);
    setKitSearchResults([]);
    const eligibleKit = kits.find((kit: any) => {
      const roles = (kit.target_roles || ["All"]).map((role: string) => role.toLowerCase());
      const participantRole = (participant.role || "").toLowerCase();
      return roles.includes("all") || roles.includes(participantRole) || String(kit.category || "").toLowerCase() === participantRole;
    });
    const kitId = eligibleKit?.id || kits[0]?.id || "";
    setSelectedKitId(kitId);
    return kitId;
  };

  const handleIssueKit = async () => {
    if (!selectedParticipant) {
      toast.error("Select a participant first.");
      return;
    }
    setIssuingKit(true);
    try {
      await apiClient.post("/venue/registration/kits/issue", {
        participant_id: selectedParticipant.id,
        kit_id: selectedKitId || undefined,
        issued_by: "REGISTRATION-KIT-DESK",
      });
      toast.success(`Kit issued to ${selectedParticipant.name}.`);
      setSelectedParticipant(null);
      setKitSearchResults([]);
      setKitScanQuery("");
      setSelectedKitId("");
      await fetchData();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Kit could not be issued.";
      toast.error(msg);
    } finally {
      setIssuingKit(false);
    }
  };

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
    setCameraPanelOpen(false);
  };

  const startCamera = async (deviceId?: string) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Camera is not available in this browser/runtime.");
        return;
      }
      setCameraPanelOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
      });
      streamRef.current = stream;
      const cameras = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const videoInputs = cameras.filter((device) => device.kind === "videoinput");
      if (videoInputs.length) {
        setVideoDevices(videoInputs);
        if (!selectedDeviceId) setSelectedDeviceId(videoInputs[0].deviceId);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      scanKitQrFrame();
    } catch {
      setCameraActive(false);
      setCameraPanelOpen(false);
      toast.error("Camera could not be started. Use manual search instead.");
    }
  };

  const scanKitQrFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = window.requestAnimationFrame(scanKitQrFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      rafRef.current = window.requestAnimationFrame(scanKitQrFrame);
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    const value = code?.data?.trim();
    if (value && value !== lastQrRef.current && !kitLookupBusy) {
      lastQrRef.current = value;
      setKitScanQuery(value);
      void lookupParticipantForKit(value, { autoIssue: true });
      window.setTimeout(() => {
        if (lastQrRef.current === value) lastQrRef.current = "";
      }, 2200);
    }
    rafRef.current = window.requestAnimationFrame(scanKitQrFrame);
  };

  // 2. Submit Dual-Credential Kit Reset
  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;

    try {
      setResetting(true);
      await apiClient.post("/venue/registration/kits/reset", {
        participant_id: resetTarget.participant_id,
        admin_username: adminUsername,
        admin_password: adminPassword,
      });

      toast.success(`Kit issuance for '${resetTarget.participant_name}' has been reset!`);
      setResetTarget(null);
      setAdminPassword("");
      fetchData();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || err?.detail || "Invalid Admin Username or Password.";
      toast.error(msg);
    } finally {
      setResetting(false);
    }
  };

  const claimPercentage =
    kpis.total_available > 0 ? Math.round((kpis.total_distributed / kpis.total_available) * 100) : 0;
  const checkedInWithoutKit = useMemo(
    () => participantsWithoutKits.filter((participant) => participant.checked_in).length,
    [participantsWithoutKits]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4">
      {/* Header Bar */}
      <div className="shrink-0 bg-[var(--surf)] p-4 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[var(--text)] tracking-tight">Kit Distribution Management</h1>
            <p className="text-xs text-[var(--muted)] font-semibold mt-0.5">
              Read-only catalogue of assigned event kits & delegate distribution audit log
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button onClick={() => setShowKitScanner((open) => !open)} className="h-10 px-3 font-bold text-xs bg-[var(--pri)] text-[var(--primary-contrast)]">
            <QrCode className="w-4 h-4 mr-1.5" />
            {showKitScanner ? "Close QR Issue" : "Issue Kit by QR"}
          </Button>
          <Button variant="outline" onClick={fetchData} disabled={loading} className="h-10 px-3 font-bold text-xs">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* 5 KPI STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 shrink-0">
        <button
          type="button"
          onClick={() => setShowKitCatalogModal(true)}
          className="bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)] shadow-sm flex items-center gap-4 text-left transition hover:border-[var(--pri)] hover:bg-[var(--raised)]"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-black shrink-0">
            <Box className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-[var(--muted)] tracking-wider block">Total Kits Available</span>
            <span className="text-2xl font-black text-[var(--text)] tracking-tight">{kpis.total_available}</span>
            <span className="mt-0.5 block text-[9px] font-black uppercase tracking-wider text-[var(--pri)]">Click for catalogue</span>
          </div>
        </button>

        <div className="bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-black shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-[var(--muted)] tracking-wider block">Kits Distributed</span>
            <span className="text-2xl font-black text-[var(--text)] tracking-tight">{kpis.total_distributed}</span>
          </div>
        </div>

        <div className="bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-[var(--muted)] tracking-wider block">Remaining Inventory</span>
            <span className="text-2xl font-black text-emerald-600 tracking-tight">{kpis.total_remaining}</span>
          </div>
        </div>

        <div className="bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-[var(--muted)] tracking-wider block">Distribution Claim Rate</span>
            <span className="text-2xl font-black text-[var(--text)] tracking-tight">{claimPercentage}%</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowNotReceivedModal(true)}
          className="bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)] shadow-sm flex items-center gap-4 text-left transition hover:border-rose-500/50 hover:bg-[var(--raised)]"
        >
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-black shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-[var(--muted)] tracking-wider block">Participants Not Received</span>
            <span className="text-2xl font-black text-[var(--text)] tracking-tight">{kpis.participants_not_received ?? participantsWithoutKits.length}</span>
            <span className="mt-0.5 block text-[9px] font-black uppercase tracking-wider text-rose-500">{checkedInWithoutKit} checked-in pending</span>
          </div>
        </button>
      </div>

      {showKitScanner && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4 shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">QR Kit Issue Station</h3>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                  Scan participant QR or enter reg code/name/email/phone. Kit issue stays inside Registration mode.
                </p>
              </div>
              <Button variant="outline" onClick={() => (cameraActive || cameraPanelOpen ? stopCamera() : void startCamera(selectedDeviceId || undefined))} className="h-9 px-3 text-xs font-bold">
                {cameraActive ? <CameraOff className="mr-1.5 size-4" /> : <Camera className="mr-1.5 size-4" />}
                {cameraActive || cameraPanelOpen ? "Stop Camera" : "Start Camera"}
              </Button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void lookupParticipantForKit();
              }}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                <Input
                  value={kitScanQuery}
                  onChange={(event) => setKitScanQuery(event.target.value)}
                  placeholder="Scan QR or enter registration code, name, email, phone"
                  className="h-10 border-[var(--border)] bg-[var(--surf)] pl-9 text-xs font-bold"
                />
              </div>
              <Button type="submit" disabled={kitLookupBusy} className="h-10 bg-[var(--pri)] px-4 text-xs font-black text-[var(--primary-contrast)]">
                {kitLookupBusy ? <RefreshCw className="mr-1.5 size-4 animate-spin" /> : <ArrowRight className="mr-1.5 size-4" />}
                Find Participant
              </Button>
            </form>

            {kitSearchResults.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surf)]">
                <div className="border-b border-[var(--border)] px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
                    {kitSearchResults.length} matching participant(s) found
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {kitSearchResults.map((participant) => (
                    <button
                      key={participant.id}
                      type="button"
                      onClick={() => selectParticipantForKit(participant)}
                      className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2.5 text-left transition last:border-b-0 hover:bg-[var(--raised)]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-black text-[var(--acc)]">{participant.regno}</span>
                          <span className="truncate text-sm font-black text-[var(--text)]">{participant.name}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted)]">
                          {participant.email || participant.phone || "No contact"} {participant.company ? `· ${participant.company}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[9px] font-black uppercase text-[var(--text)]">
                          {participant.role || "Delegate"}
                        </span>
                        <span className={participant.is_checked_in || participant.checked_in ? "text-[9px] font-black uppercase text-emerald-500" : "text-[9px] font-black uppercase text-amber-500"}>
                          {participant.is_checked_in || participant.checked_in ? "Checked in" : "Not checked in"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {cameraPanelOpen && (
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-black">
                <video ref={videoRef} muted playsInline className="h-56 w-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                {videoDevices.length > 1 && (
                  <div className="border-t border-white/10 bg-black/80 p-2">
                    <select
                      value={selectedDeviceId}
                      onChange={(event) => {
                        const deviceId = event.target.value;
                        setSelectedDeviceId(deviceId);
                        if (cameraPanelOpen) void startCamera(deviceId);
                      }}
                      className="h-9 w-full rounded-xl border border-white/10 bg-black px-3 text-xs font-bold text-white"
                    >
                      {videoDevices.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
            {selectedParticipant ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--pri)]/10 text-[var(--pri)]">
                    <User className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-base font-black text-[var(--text)]">{selectedParticipant.name}</h4>
                    <p className="font-mono text-xs font-black text-[var(--acc)]">{selectedParticipant.regno}</p>
                    <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{selectedParticipant.email || selectedParticipant.phone || "No contact available"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                    <span className="block text-[9px] font-black uppercase text-[var(--muted)]">Role</span>
                    <span className="text-[var(--text)]">{selectedParticipant.role || "Delegate"}</span>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                    <span className="block text-[9px] font-black uppercase text-[var(--muted)]">Check-in</span>
                    <span className={selectedParticipant.is_checked_in || selectedParticipant.checked_in ? "text-emerald-500" : "text-amber-500"}>
                      {selectedParticipant.is_checked_in || selectedParticipant.checked_in ? "Checked in" : "Not checked in"}
                    </span>
                  </div>
                </div>

                <div className="hidden">
                  <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Kit to issue</label>
                  <select
                    value={selectedKitId}
                    onChange={(event) => setSelectedKitId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--text)]"
                  >
                    <option value="">Auto-select eligible kit</option>
                    {kits.map((kit) => (
                      <option key={kit.id} value={kit.id}>
                        {kit.kit_name}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  type="button"
                  onClick={handleIssueKit}
                  disabled={issuingKit || kitLookupBusy}
                  className="h-11 w-full bg-purple-600 text-xs font-black uppercase tracking-wider text-white hover:bg-purple-700 disabled:opacity-60"
                >
                  {issuingKit ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Package className="mr-2 size-4" />}
                  {issuingKit ? "Issuing Kit..." : "Issue Kit"}
                </Button>
              </div>
            ) : (
              <div className="grid h-full min-h-56 place-items-center text-center">
                <div>
                  <QrCode className="mx-auto size-10 text-[var(--muted)]" />
                  <h4 className="mt-3 text-sm font-black text-[var(--text)]">No participant selected</h4>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Scan QR or search details to issue a kit.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULL SCREEN TABLE CONTAINER MATCHING PARTICIPANT STRUCTURE */}
      <div className="flex-1 min-h-0 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden flex flex-col">
        {/* Table Filter Top Bar */}
        <div className="p-3 bg-[var(--surf)] border-b border-[var(--border)] flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Kit Distribution Audit Log</h3>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search Reg Code, Delegate Name, Kit..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 bg-[var(--card)] border-[var(--border)] text-xs font-semibold"
            />
          </div>
        </div>

        {/* Scrollable Table Body */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[var(--surf)] border-b border-[var(--border)] z-10 shadow-sm">
              <tr className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                <th className="p-3.5">Reg Code</th>
                <th className="p-3.5">Delegate Name</th>
                <th className="p-3.5">Role / Category</th>
                <th className="p-3.5">Kit Package Issued</th>
                <th className="p-3.5">Issued Time</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Admin Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-semibold text-[var(--text)]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-[var(--muted)]">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-600 mb-2" />
                    Loading kit distribution records...
                  </td>
                </tr>
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-[var(--muted)]">
                    No kit distribution logs found matching current search filter.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--raised)] transition-colors">
                    <td className="p-3.5 font-mono text-xs font-bold text-[var(--acc)]">{log.regno}</td>

                    <td className="p-3.5">
                      <div className="font-bold text-[var(--text)] text-sm">{log.participant_name}</div>
                      <div className="text-[11px] text-[var(--muted)] font-mono">{log.email}</div>
                    </td>

                    <td className="p-3.5">
                      <span className="px-2.5 py-1 bg-[var(--raised)] border border-[var(--border)] text-[var(--text)] text-[10px] font-black uppercase rounded-full">
                        {log.role || "Delegate"}
                      </span>
                    </td>

                    <td className="p-3.5 font-bold text-[var(--text)]">{log.kit_name}</td>

                    <td className="p-3.5 font-mono text-[var(--muted)]">
                      {log.issued_at ? new Date(log.issued_at).toLocaleTimeString() : "Just Now"}
                    </td>

                    <td className="p-3.5">
                      <span className="px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        {log.status}
                      </span>
                    </td>

                    <td className="p-3.5 text-right">
                      <Button
                        size="sm"
                        onClick={() => setResetTarget(log)}
                        className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider h-8 px-3"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />
                        Reset Issue
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination Bar */}
        <div className="p-3 bg-[var(--surf)] border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-3 text-[var(--muted)] font-bold">
            <span>
              Showing <strong className="text-[var(--text)]">{totalEntries > 0 ? startIndex + 1 : 0}</strong> to{" "}
              <strong className="text-[var(--text)]">{endIndex}</strong> of{" "}
              <strong className="text-[var(--text)]">{totalEntries}</strong> kit log entries
            </span>

            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[10px] uppercase tracking-wider">Per Page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 px-2 rounded-lg border border-[var(--border)] text-xs font-bold bg-[var(--card)] text-[var(--text)]"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 px-3 border-[var(--border)] text-xs font-bold"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Previous
            </Button>

            <span className="px-3 py-1 text-xs font-extrabold text-[var(--text)] bg-[var(--raised)] rounded-lg border border-[var(--border)]">
              Page {currentPage} of {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-3 border-[var(--border)] text-xs font-bold"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {showKitCatalogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[86vh] w-full max-w-6xl flex-col rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-2xl bg-blue-500/10 text-blue-600">
                  <Box className="size-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Kit Catalogue & Role Assignments</h3>
                  <p className="text-xs font-semibold text-[var(--muted)]">Same kit package cards, opened from Total Kits KPI.</p>
                </div>
              </div>
              <button onClick={() => setShowKitCatalogModal(false)} className="rounded-xl p-2 text-[var(--muted)] transition hover:bg-[var(--raised)] hover:text-[var(--text)]">
                <X className="size-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 custom-scrollbar">
              {kits.length === 0 ? (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-10 text-center">
                  <Package className="mx-auto size-10 text-[var(--muted)]" />
                  <p className="mt-3 text-sm font-black text-[var(--text)]">No kits configured yet</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Create kit packages from the Admin kit catalogue.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {kits.map((kit) => {
                    const roles = (kit as any).target_roles || ["All"];
                    return (
                      <div key={kit.id} className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 shadow-sm space-y-3">
                        <div className="flex items-start justify-between">
                          <span className="text-sm font-black text-[var(--text)]">{kit.kit_name}</span>
                          <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-[var(--raised)] border border-[var(--border)] text-[var(--acc)]">
                            {kit.category || "General"}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--muted)] font-semibold line-clamp-2">{kit.description || "Official Event Intake Package Kit"}</p>
                        <div className="space-y-1">
                          <span className="text-[9px] font-black uppercase text-[var(--muted)] block">Assigned Roles:</span>
                          <div className="flex flex-wrap gap-1">
                            {roles.map((r: string) => (
                              <span key={r} className="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1 pt-2 border-t border-[var(--border)] text-[10px] font-bold text-[var(--muted)]">
                          <span>Participant issue counts are shown in the audit table, not on catalogue cards.</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showNotReceivedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[86vh] w-full max-w-6xl flex-col rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-2xl bg-rose-500/10 text-rose-500">
                  <AlertTriangle className="size-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Participants Not Received Kit</h3>
                  <p className="text-xs font-semibold text-[var(--muted)]">
                    Participants with no kit issue record yet. Checked-in participants can receive a kit immediately.
                  </p>
                </div>
              </div>
              <button onClick={() => setShowNotReceivedModal(false)} className="rounded-xl p-2 text-[var(--muted)] transition hover:bg-[var(--raised)] hover:text-[var(--text)]">
                <X className="size-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 border-b border-[var(--border)] p-5 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4">
                <span className="block text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Total Pending</span>
                <span className="text-2xl font-black text-[var(--text)]">{participantsWithoutKits.length}</span>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-500">Checked-in Pending</span>
                <span className="text-2xl font-black text-emerald-500">{checkedInWithoutKit}</span>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <span className="block text-[10px] font-black uppercase tracking-wider text-amber-500">Need Check-in First</span>
                <span className="text-2xl font-black text-amber-500">{participantsWithoutKits.length - checkedInWithoutKit}</span>
              </div>
            </div>

            <div className="overflow-y-auto p-5 custom-scrollbar">
              {participantsWithoutKits.length === 0 ? (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-10 text-center">
                  <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
                  <p className="mt-3 text-sm font-black text-[var(--text)]">Everyone has received a kit</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">No pending participant-kit records found.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--surf)] text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                      <tr>
                        <th className="p-3.5">Reg Code</th>
                        <th className="p-3.5">Participant</th>
                        <th className="p-3.5">Role</th>
                        <th className="p-3.5">Company</th>
                        <th className="p-3.5">Check-in State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] font-semibold text-[var(--text)]">
                      {participantsWithoutKits.map((participant) => (
                        <tr key={participant.id} className="transition hover:bg-[var(--raised)]">
                          <td className="p-3.5 font-mono text-xs font-bold text-[var(--acc)]">{participant.regno}</td>
                          <td className="p-3.5">
                            <div className="text-sm font-bold text-[var(--text)]">{participant.name}</div>
                            <div className="font-mono text-[11px] text-[var(--muted)]">{participant.email || participant.phone || "No contact"}</div>
                          </td>
                          <td className="p-3.5">
                            <span className="rounded-full border border-[var(--border)] bg-[var(--raised)] px-2.5 py-1 text-[10px] font-black uppercase text-[var(--text)]">
                              {participant.role || "Delegate"}
                            </span>
                          </td>
                          <td className="p-3.5 text-[var(--muted)]">{participant.company || "N/A"}</td>
                          <td className="p-3.5">
                            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${
                              participant.checked_in
                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                                : "border-amber-500/20 bg-amber-500/10 text-amber-600"
                            }`}>
                              {participant.checked_in ? "Ready for Kit" : "Needs Check-in"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADD NEW KIT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-black">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Add New Kit Item</h3>
                  <p className="text-xs text-[var(--muted)]">Define kit catalog item for registration distribution</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-[var(--muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddKit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-[var(--muted)]">Kit Package Name</label>
                <Input
                  type="text"
                  placeholder="e.g. VIP Delegate Welcome Kit"
                  value={newKitName}
                  onChange={(e) => setNewKitName(e.target.value)}
                  required
                  className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-[var(--muted)]">Target Role / Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-xs font-bold text-[var(--text)]"
                  >
                    <option value="General">General Delegate</option>
                    <option value="Speaker">Speaker</option>
                    <option value="VIP">VIP</option>
                    <option value="Exhibitor">Exhibitor</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-[var(--muted)]">Total Inventory Qty</label>
                  <Input
                    type="number"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    required
                    className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-[var(--muted)]">Description / Package Contents</label>
                <Input
                  type="text"
                  placeholder="Includes Tote bag, Lanyard, Notebook, Pen"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)} className="h-11 px-5 text-xs font-bold">
                  Cancel
                </Button>
                <Button type="submit" disabled={addingKit} className="h-11 px-6 bg-[var(--pri)] text-[var(--primary-contrast)] font-extrabold text-xs">
                  {addingKit ? "Adding Kit..." : "Save Kit Item"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN PASSWORD PROTECTED RESET MODAL */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--text)]">Admin Kit Reset Authorization</h3>
                <p className="text-xs text-[var(--muted)]">Password required to revoke kit for '{resetTarget.participant_name}'</p>
              </div>
            </div>

            <form onSubmit={handleExecuteReset} className="space-y-4">
              <p className="text-xs text-[var(--muted)] bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
                Resetting will restore 1 item to kit inventory and allow this delegate to be issued a kit again.
              </p>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-[var(--muted)]">Admin Username</label>
                  <Input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="e.g. admin"
                    required
                    className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-[var(--muted)]">Admin Password</label>
                  <Input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter admin password"
                    required
                    className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <Button type="button" variant="outline" onClick={() => setResetTarget(null)} className="h-11 px-5 text-xs font-bold">
                  Cancel
                </Button>
                <Button type="submit" disabled={resetting} className="h-11 px-6 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs">
                  {resetting ? "Verifying..." : "Authorize Kit Reset"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
