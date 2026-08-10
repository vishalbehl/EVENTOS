"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2, XCircle, ShieldAlert, Search,
  Camera, RefreshCw, User, Clock, MapPin, Lock,
  ChevronRight, ChevronLeft, AlertCircle, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { clearVenueNodeConfiguration, fetchVenueNodeBootstrap } from "@/lib/node-workstation";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Station {
  id: string;
  station_name: string;
  station_type: string;
  allowed_roles: string[];
  max_checkins_per_delegate: number;
  station_capacity: number;
  current_count: number;
}

interface ScanParticipant {
  id: string;
  name: string;
  regno: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  checked_in?: boolean;
  is_companion?: boolean;
}

interface ScanResult {
  status: "success" | "rejected" | "admin_overridden";
  reason?: string;
  requires_admin_override?: boolean;
  participant?: ScanParticipant;
  station_name?: string;
  scan_time?: string;
  admin_overridden_by?: string;
}

interface RecentScan {
  id: string;
  participant_name: string;
  regno: string;
  role: string;
  company: string;
  station_name: string;
  station_id: string | null;
  status: string;
  scan_type: string;
  rejection_reason: string | null;
  created_at: string | null;
}

// ─── Welcome / Rejection Popup ────────────────────────────────────────────────

const AUTO_CLOSE_SECS = 8;

function WelcomePopup({
  result,
  onClose,
  onOverride,
}: {
  result: ScanResult;
  onClose: () => void;
  onOverride: () => void;
}) {
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SECS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCountdown(AUTO_CLOSE_SECS);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          onClose();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [result]);

  const isSuccess = result.status === "success" || result.status === "admin_overridden";
  const isOverridden = result.status === "admin_overridden";
  const p = result.participant;

  const pct = (countdown / AUTO_CLOSE_SECS) * 100;
  const r = 22;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div
        className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden ${
          isSuccess
            ? isOverridden
              ? "bg-amber-950/95 border-amber-500/40"
              : "bg-emerald-950/95 border-emerald-500/40"
            : "bg-red-950/95 border-red-500/40"
        }`}
      >
        {/* Status Banner */}
        <div
          className={`px-6 pt-6 pb-4 flex items-center gap-4 ${
            isSuccess ? (isOverridden ? "text-amber-400" : "text-emerald-400") : "text-red-400"
          }`}
        >
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
              isSuccess ? (isOverridden ? "bg-amber-500/20" : "bg-emerald-500/20") : "bg-red-500/20"
            }`}
          >
            {isSuccess ? (
              isOverridden ? <ShieldAlert className="w-8 h-8" /> : <CheckCircle2 className="w-8 h-8" />
            ) : (
              <XCircle className="w-8 h-8" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-black leading-tight">
              {isSuccess ? (isOverridden ? "Override Approved" : "Welcome!") : "Access Denied"}
            </h2>
            <p className="text-sm opacity-70 mt-0.5">
              {isSuccess ? `Gate cleared · ${result.station_name}` : result.reason || "Check-in rejected"}
            </p>
          </div>
          {/* Countdown ring */}
          <div className="shrink-0 relative">
            <svg width="52" height="52" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
              <circle
                cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="4"
                strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-black">{countdown}</span>
          </div>
        </div>

        {/* Participant Card */}
        {p && (
          <div className="mx-5 mb-4 bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center font-black text-xl text-white shrink-0 ${
                  isSuccess ? (isOverridden ? "bg-amber-500" : "bg-emerald-500") : "bg-red-500"
                }`}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-xl font-black text-white leading-tight">{p.name}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs font-mono text-white/50">{p.regno}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-black uppercase text-white/70">
                    {p.role}
                  </span>
                  {p.is_companion && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-[10px] font-black uppercase text-purple-300">
                      Companion
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10">
              {[
                { label: "Organisation", value: p.company || "N/A" },
                { label: "Phone", value: p.phone || "N/A" },
                {
                  label: "Check-In Time",
                  value: result.scan_time
                    ? new Date(result.scan_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                    : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                },
                { label: "Gate Station", value: result.station_name || "Main Gate" },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">{item.label}</p>
                  <p className="text-xs font-bold text-white/80 mt-0.5 truncate">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          {!isSuccess && (
            <Button
              onClick={onOverride}
              className="flex-1 h-10 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl"
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Admin Override
            </Button>
          )}
          <Button
            onClick={onClose}
            className="flex-1 h-10 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/10"
          >
            {isSuccess ? "Done" : "Dismiss"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Override Modal ─────────────────────────────────────────────────────

function AdminOverrideModal({
  reason, onClose, onSubmit, submitting,
}: {
  reason: string;
  onClose: () => void;
  onSubmit: (username: string, password: string) => void;
  submitting: boolean;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-[var(--text)]">Admin Gate Override</h3>
            <p className="text-xs text-[var(--muted)]">Authenticate to bypass capacity rules</p>
          </div>
        </div>
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-700 dark:text-amber-300 font-medium">
          <strong>Reason:</strong> {reason || "Station check-in limit reached."}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(username, password); }} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase text-[var(--muted)]">Admin Username</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" required
              className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase text-[var(--muted)]">Admin Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter admin password" required
              className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)]" />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
            <Button type="button" variant="outline" onClick={onClose} className="h-11 px-5 text-xs font-bold">Cancel</Button>
            <Button type="submit" disabled={submitting} className="h-11 px-6 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs">
              {submitting ? "Authenticating..." : "Authorize Override"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChangeGateModal({
  gateName, stations, selectedGateId, onGateSelect, onClose, onSubmit, submitting,
}: {
  gateName: string;
  stations: Station[];
  selectedGateId: string;
  onGateSelect: (id: string) => void;
  onClose: () => void;
  onSubmit: (username: string, password: string) => void;
  submitting: boolean;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
          <div className="w-10 h-10 rounded-xl bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center"><Lock className="w-5 h-5" /></div>
          <div><h3 className="text-lg font-black text-[var(--text)]">Change workstation gate</h3><p className="text-xs text-[var(--muted)]">Admin approval is required to rebind this workstation.</p></div>
        </div>
        <div className="p-3 rounded-xl bg-[var(--surf)] text-xs font-bold text-[var(--text)] space-y-2">
          <p>Choose the new gate to activate on this workstation.</p>
          <select value={selectedGateId} onChange={(e) => onGateSelect(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-xs font-bold text-[var(--text)]" required>
            {stations.map((station) => <option key={station.id} value={station.id}>{station.station_name}</option>)}
          </select>
          <p className="text-[10px] text-[var(--muted)]">Selected: <strong>{gateName}</strong></p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(username, password); }} className="space-y-4">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Admin username" required className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)]" />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" required className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)]" />
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]"><Button type="button" variant="outline" onClick={onClose} className="h-11 px-5 text-xs font-bold">Cancel</Button><Button type="submit" disabled={submitting} className="h-11 px-6 text-xs font-extrabold">{submitting ? "Saving..." : "Save and activate"}</Button></div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RealScanningPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [assignedStationId, setAssignedStationId] = useState<string | null>(null);
  const [showGateModal, setShowGateModal] = useState(false);
  const [pendingGateId, setPendingGateId] = useState<string | null>(null);
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [loadingStations, setLoadingStations] = useState(true);

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const rafRef = useRef<number>(0);
  const qrLoopRef = useRef<boolean>(false);
  const lastDecodeRef = useRef<string>("");
  const lastDecodeTimeRef = useRef<number>(0);
  const DEBOUNCE_MS = 2500;

  const [searchQuery, setSearchQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [qrDetected, setQrDetected] = useState(false);

  const [popupResult, setPopupResult] = useState<ScanResult | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(true);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchStations = async () => {
    try {
      setLoadingStations(true);
      const res: any = await apiClient.get("/venue/scanning/stations");
      const list: Station[] = Array.isArray(res) ? res : [];
      setStations(list);
      let assignedGate: string | null = null;
      const bootstrap = await fetchVenueNodeBootstrap();
      if (bootstrap?.assignment?.mode === "scanning" && bootstrap.assignment.capacity_rule_id) {
        assignedGate = bootstrap.assignment.capacity_rule_id;
      }
      if (!assignedGate) {
        try {
          const workstations: any[] = await apiClient.get("/venue/admin/workstations");
          const scanningAssignments = workstations.filter((ws) => ws.assignment_status !== "revoked" && ws.mode === "scanning" && ws.capacity_rule_id);
          if (scanningAssignments.length === 1) {
            assignedGate = scanningAssignments[0].capacity_rule_id;
            clearVenueNodeConfiguration();
          }
        } catch {
          // Non-admin scanner users may not read workstation inventory. In
          // that case the node bootstrap or local node-agent assignment must
          // provide the gate.
        }
      }
      if (!assignedGate && list.length === 1) {
        assignedGate = list[0].id;
      }
      if (assignedGate) {
        setAssignedStationId(assignedGate);
        setSelectedStationId(assignedGate);
      } else {
        setAssignedStationId(null);
        setSelectedStationId("");
      }
    } catch (e) { console.error("fetchStations:", e); }
    finally { setLoadingStations(false); }
  };

  const fetchRecentScans = useCallback(async (stationId?: string) => {
    try {
      const id = stationId ?? selectedStationId;
      const qs = id ? `?limit=40&station_id=${encodeURIComponent(id)}` : "?limit=40";
      const res: any = await apiClient.get(`/venue/scanning/recent${qs}`);
      setRecentScans(Array.isArray(res) ? res : []);
    } catch (e) { console.error("fetchRecentScans:", e); }
  }, [selectedStationId]);

  useEffect(() => { fetchStations(); }, []);
  useEffect(() => { if (selectedStationId) fetchRecentScans(selectedStationId); }, [selectedStationId]);

  // ── Camera ────────────────────────────────────────────────────────────────

  const enumerateCameras = async () => {
    if (typeof window === "undefined" || !navigator?.mediaDevices) return;
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
      tmp.getTracks().forEach((t) => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === "videoinput");
      setVideoDevices(cams);
      if (cams.length > 0) setSelectedDeviceId((prev) => prev || cams[0].deviceId);
    } catch (err: any) {
      setCameraError(err?.name === "NotAllowedError"
        ? "Camera permission denied. Allow camera access in browser settings."
        : "No camera detected or access failed.");
    }
  };

  useEffect(() => { enumerateCameras(); }, []);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    qrLoopRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async (deviceId: string) => {
    stopCamera();
    const requestId = ++cameraRequestRef.current;
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: "environment" },
      });
      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (error: any) {
          if (error?.name !== "AbortError") throw error;
          return;
        }
      }
      setCameraActive(true);
    } catch (err: any) {
      setCameraError(err?.name === "NotAllowedError"
        ? "Camera permission denied. Please allow access in browser settings."
        : err?.message || "Failed to start camera.");
      setCameraActive(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    if (selectedDeviceId) startCamera(selectedDeviceId);
    return stopCamera;
  }, [selectedDeviceId]);

  // ── QR Decode Loop ────────────────────────────────────────────────────────

  const scanningRef = useRef(false);
  useEffect(() => { scanningRef.current = scanning; }, [scanning]);

  const tickQR = useCallback(async () => {
    if (!qrLoopRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2 || video.paused || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(tickQR);
      return;
    }

    const W = video.videoWidth;
    const H = video.videoHeight;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { rafRef.current = requestAnimationFrame(tickQR); return; }

    ctx.drawImage(video, 0, 0, W, H);
    try {
      const imageData = ctx.getImageData(0, 0, W, H);
      const { default: jsQR } = await import("jsqr");
      const code = jsQR(imageData.data, W, H, { inversionAttempts: "dontInvert" });

      if (code?.data) {
        const now = Date.now();
        const sameScan = code.data === lastDecodeRef.current && now - lastDecodeTimeRef.current < DEBOUNCE_MS;
        if (!sameScan && !scanningRef.current) {
          lastDecodeRef.current = code.data;
          lastDecodeTimeRef.current = now;
          setQrDetected(true);
          await performScan(code.data);
          setTimeout(() => setQrDetected(false), 800);
        }
      }
    } catch (_) {}

    rafRef.current = requestAnimationFrame(tickQR);
  }, []);

  useEffect(() => {
    if (cameraActive) {
      qrLoopRef.current = true;
      rafRef.current = requestAnimationFrame(tickQR);
    } else {
      qrLoopRef.current = false;
      cancelAnimationFrame(rafRef.current);
    }
    return () => { qrLoopRef.current = false; cancelAnimationFrame(rafRef.current); };
  }, [cameraActive, tickQR]);

  // ── Scan ──────────────────────────────────────────────────────────────────

  const performScan = useCallback(async (query: string) => {
    if (!query.trim() || scanningRef.current) return;
    try {
      setScanning(true);
      if (!assignedStationId || !selectedStationId) {
        toast.error("This workstation is not assigned to a check-in gate.");
        return;
      }
      const res: ScanResult = await apiClient.post("/venue/scanning/scan", {
        query: query.trim(),
        station_id: selectedStationId || undefined,
        scan_type: "check_in",
      });
      setPopupResult(res);
      if (res.status === "rejected") setOverrideReason(res.reason || "");
      fetchRecentScans(selectedStationId);
      fetchStations();
    } catch (err: any) {
      toast.error(err?.message || err?.detail || "Scan failed.");
    } finally {
      setScanning(false);
    }
  }, [assignedStationId, selectedStationId]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) { performScan(searchQuery.trim()); setSearchQuery(""); }
  };

  // ── Admin Override ────────────────────────────────────────────────────────

  const handleOverride = async (adminUsername: string, adminPassword: string) => {
    if (!popupResult?.participant?.id || !selectedStationId) {
      toast.error("Missing scan state."); return;
    }
    try {
      setOverrideSubmitting(true);
      const res: ScanResult = await apiClient.post("/venue/scanning/override-scan", {
        participant_id: popupResult.participant.id,
        station_id: selectedStationId,
        admin_username: adminUsername,
        admin_password: adminPassword,
        reason: overrideReason || "Admin Gate Override",
      });
      setPopupResult(res);
      setShowOverrideModal(false);
      toast.success("Admin Override approved!");
      fetchRecentScans(selectedStationId);
      fetchStations();
    } catch (err: any) {
      toast.error(err?.message || err?.detail || "Override authentication failed.");
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleGateChange = async (adminUsername: string, adminPassword: string) => {
    if (!pendingGateId) return;
    try {
      setGateSubmitting(true);
      const res: any = await apiClient.post("/venue/scanning/change-gate", {
        station_id: pendingGateId,
        admin_username: adminUsername,
        admin_password: adminPassword,
      });
      setAssignedStationId(res.capacity_rule_id);
      setSelectedStationId(res.capacity_rule_id);
      setShowGateModal(false);
      setPendingGateId(null);
      toast.success(`Workstation gate activated: ${res.gate_name}`);
      await fetchStations();
    } catch (err: any) {
      toast.error(err?.message || err?.detail || "Gate change authorization failed.");
    } finally {
      setGateSubmitting(false);
    }
  };

  // ── Print Badge ────────────────────────────────────────────────────────────

  const selectedStation = stations.find((s) => s.id === selectedStationId);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden gap-3">

      {/* Header */}
      <div className="shrink-0 bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)] flex items-center justify-center">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">Active Gate:</span>
              {selectedStation && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-[10px] font-black uppercase">
                  {selectedStation.current_count} / {selectedStation.station_capacity || "∞"} capacity
                </span>
              )}
            </div>
            <select
              value={selectedStationId}
              // Gate selection is never a normal operator control. A bound
              // workstation receives its gate from Admin assignment; changing
              // it is exposed only through the authenticated Change gate flow.
              disabled
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-transparent text-base font-black text-[var(--text)] border-none focus:outline-none cursor-pointer max-w-xs"
            >
              {loadingStations ? <option>Loading...</option> :
                stations.length === 0 ? <option>No stations configured</option> :
                  stations.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[var(--card)] text-[var(--text)]">
                      {s.station_name} — {s.max_checkins_per_delegate}/delegate · Cap {s.station_capacity}
                    </option>
                  ))}
            </select>
            {assignedStationId ? <div className="flex items-center gap-2 mt-1"><p className="text-[10px] font-bold text-emerald-500">Bound gate — changes require Admin authorization.</p><Button type="button" variant="outline" className="h-7 px-2 text-[10px] font-bold" onClick={() => { const firstOther = stations.find((station) => station.id !== assignedStationId); if (firstOther) { setPendingGateId(firstOther.id); setShowGateModal(true); } else toast.error("No other check-in gates are configured."); }}>Change gate</Button></div> : <div className="flex items-center gap-2 mt-1"><p className="text-[10px] font-bold text-amber-500">This workstation is not bound yet. Log in as Admin on this device, import/sync local DB, then assign this workstation from Admin Devices.</p></div>}
          </div>
        </div>

        <form onSubmit={handleManualSubmit} className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="w-4 h-4 text-[var(--muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Reg No, Name, Email, Phone or QR data..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl"
            />
          </div>
          <Button type="submit" disabled={scanning || !searchQuery.trim()}
            className="h-11 px-5 bg-[var(--pri)] text-[var(--primary-contrast)] font-extrabold rounded-xl">
            {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Check In"}
          </Button>
        </form>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">

        {/* Camera Panel */}
        <div className="flex-1 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm flex flex-col p-4 overflow-hidden min-w-0">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-[var(--pri)]" />
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Live Camera Feed</h3>
              {cameraActive && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" /> LIVE
                </span>
              )}
              {scanning && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500">
                  <Zap className="w-3 h-3" /> Processing...
                </span>
              )}
            </div>

            {videoDevices.length > 0 ? (
              <select
                value={selectedDeviceId}
                onChange={(e) => { setSelectedDeviceId(e.target.value); startCamera(e.target.value); }}
                className="h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--surf)] text-xs font-bold text-[var(--text)] focus:outline-none max-w-[200px] truncate"
              >
                {videoDevices.map((d, idx) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${idx + 1}`}</option>
                ))}
              </select>
            ) : (
              <button onClick={enumerateCameras}
                className="h-8 px-3 rounded-lg border border-[var(--border)] bg-[var(--surf)] text-xs font-bold text-[var(--muted)] flex items-center gap-1 hover:bg-[var(--raised)]">
                <RefreshCw className="w-3 h-3" /> Detect Cameras
              </button>
            )}
          </div>

          {/* Video Box */}
          <div className={`flex-1 bg-slate-950 rounded-xl overflow-hidden relative flex items-center justify-center min-h-0 border-2 transition-all duration-300 ${
            qrDetected ? "border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.4)]" : "border-[var(--border)]"
          }`}>
            <video ref={videoRef} className={`w-full h-full object-cover transition-opacity duration-300 ${cameraActive ? "opacity-100" : "opacity-0"}`}
              playsInline muted autoPlay />
            <canvas ref={canvasRef} className="hidden" />

            {cameraActive && !cameraError && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className={`w-56 h-56 rounded-2xl relative transition-all duration-200 ${
                  qrDetected ? "border-4 border-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.6)]" : "border-2 border-white/40"
                }`}>
                  <div className={`absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 rounded-tl ${qrDetected ? "border-emerald-400" : "border-white/70"}`} />
                  <div className={`absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 rounded-tr ${qrDetected ? "border-emerald-400" : "border-white/70"}`} />
                  <div className={`absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 rounded-bl ${qrDetected ? "border-emerald-400" : "border-white/70"}`} />
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 rounded-br ${qrDetected ? "border-emerald-400" : "border-white/70"}`} />
                  {!qrDetected && (
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                  )}
                  {qrDetected && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {!cameraActive && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Camera className="w-12 h-12 text-white/20" />
                <p className="text-xs font-bold uppercase tracking-wider text-white/30">Starting camera...</p>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <AlertCircle className="w-10 h-10 text-red-400" />
                <p className="text-sm font-bold text-white/70">{cameraError}</p>
                <button onClick={enumerateCameras}
                  className="px-4 py-2 rounded-lg bg-white/10 text-white text-xs font-bold hover:bg-white/20">
                  Retry Camera
                </button>
              </div>
            )}

            <p className="absolute bottom-3 left-0 right-0 text-center text-white/50 text-[11px] font-bold font-mono tracking-wider">
              ALIGN QR CODE INSIDE FRAME · AUTO SCAN ACTIVE
            </p>
          </div>
        </div>

        {/* Recent Scans Sidebar */}
        <div className={`bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm flex flex-col transition-all duration-200 shrink-0 ${drawerOpen ? "w-72" : "w-11"}`}>
          <div className="p-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
            <button onClick={() => setDrawerOpen(!drawerOpen)}
              className="p-1 rounded-lg hover:bg-[var(--raised)] text-[var(--muted)]">
              {drawerOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            {drawerOpen && (
              <div className="flex items-center justify-between flex-1 ml-2">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Gate Scans</h4>
                  <p className="text-[9px] text-[var(--muted)] mt-0.5">{selectedStation?.station_name || "All stations"}</p>
                </div>
                <button onClick={() => fetchRecentScans(selectedStationId)}
                  className="p-1.5 rounded-lg hover:bg-[var(--raised)] text-[var(--muted)]">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {drawerOpen && (
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
              {recentScans.length === 0 ? (
                <p className="text-[11px] text-[var(--muted)] text-center py-8">No scans at this gate yet.</p>
              ) : (
                recentScans.map((s) => (
                  <div key={s.id} className={`p-2.5 rounded-xl border space-y-1 ${
                    s.status === "success" ? "border-emerald-500/20 bg-emerald-500/5"
                      : s.status === "admin_overridden" ? "border-amber-500/20 bg-amber-500/5"
                        : "border-red-500/20 bg-red-500/5"
                  }`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-[var(--text)] truncate">{s.participant_name}</span>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                        s.status === "success" ? "bg-emerald-500/15 text-emerald-600"
                          : s.status === "admin_overridden" ? "bg-amber-500/15 text-amber-600"
                            : "bg-red-500/15 text-red-600"
                      }`}>
                        {s.status === "admin_overridden" ? "override" : s.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--muted)] font-mono">
                      <span>{s.regno}</span>
                      <span>{s.created_at ? new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                    </div>
                    <p className="text-[9px] text-[var(--muted)] truncate">{s.role} · {s.station_name}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Popups */}
      {popupResult && !showOverrideModal && (
        <WelcomePopup
          result={popupResult}
          onClose={() => { setPopupResult(null); lastDecodeRef.current = ""; }}
          onOverride={() => setShowOverrideModal(true)}
        />
      )}

      {showOverrideModal && (
        <AdminOverrideModal
          reason={overrideReason}
          onClose={() => setShowOverrideModal(false)}
          onSubmit={handleOverride}
          submitting={overrideSubmitting}
        />
      )}
      {showGateModal && pendingGateId && (
        <ChangeGateModal
          gateName={stations.find((s) => s.id === pendingGateId)?.station_name || "selected gate"}
          stations={stations}
          selectedGateId={pendingGateId}
          onGateSelect={setPendingGateId}
          onClose={() => { setShowGateModal(false); setPendingGateId(null); }}
          onSubmit={handleGateChange}
          submitting={gateSubmitting}
        />
      )}
    </div>
  );
}
