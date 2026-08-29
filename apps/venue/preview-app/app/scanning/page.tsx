"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Headphones,
  UserSearch,
  LogOut,
  Mail,
  MapPin,
  Monitor,
  Phone,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Sparkles,
  User,
  UserRound,
  Presentation,
  Clock,
  Settings,
  Sun,
  Moon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";
import { useSRRStore } from "@/store/use-srr-store";
import { apiClient } from "@/lib/api-client";
import { useTheme } from "@/hooks/useTheme";
import { toast } from "sonner";

type View = "home" | "qr" | "search" | "result";

interface SpeakerData {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
  session_title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  files_count: number;
}

export default function ScanningModePage() {
  const router = useRouter();
  const { setStationNumber, setMode, logout } = useAuthStore();
  const { setSpeaker: setCurrentSpeaker, setSessions, setCurrentStep, selectSession } = useSRRStore();
  const { theme, setTheme } = useTheme();

  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [speaker, setSpeaker] = useState<SpeakerData | null>(null);
  const [assignedStation, setAssignedStation] = useState<number>(2);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [kioskMenuOpen, setKioskMenuOpen] = useState(false);

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState<Date | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const lastQrRef = useRef("");

  useEffect(() => {
    setMounted(true);
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize video devices
  useEffect(() => {
    let mounted = true;
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          if (!mounted) return;
          const cameras = devices.filter((d) => d.kind === "videoinput");
          setVideoDevices(cameras);
          if (cameras[0]) setSelectedDeviceId(cameras[0].deviceId);
        })
        .catch(() => setVideoDevices([]));
    }
    return () => {
      mounted = false;
      stopCamera();
    };
  }, []);

  // Camera start/stop on view change
  useEffect(() => {
    if (view === "qr" && selectedDeviceId) {
      void startCamera(selectedDeviceId);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [view, selectedDeviceId]);

  const startCamera = async (deviceId?: string) => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      scanLoopRef.current = window.requestAnimationFrame(scanFrame);
    } catch (error) {
      console.error("Failed to start camera", error);
      setCameraActive(false);
      toast.error("Camera unavailable. Please use Enter Details.");
    }
  };

  const stopCamera = () => {
    if (scanLoopRef.current) {
      window.cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      scanLoopRef.current = window.requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      scanLoopRef.current = window.requestAnimationFrame(scanFrame);
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    const value = code?.data?.trim();

    if (value && value !== lastQrRef.current && !lookupBusy) {
      lastQrRef.current = value;
      setQuery(value);
      void lookupSpeaker(value);
      window.setTimeout(() => {
        if (lastQrRef.current === value) lastQrRef.current = "";
      }, 2200);
    }
    scanLoopRef.current = window.requestAnimationFrame(scanFrame);
  };

  const resetToHome = useCallback(() => {
    stopCamera();
    setView("home");
    setSpeaker(null);
    setQuery("");
  }, []);

  const lookupSpeaker = async (rawQuery?: string) => {
    const term = (rawQuery || query).trim().toLowerCase();
    if (!term) return;
    setLookupBusy(true);

    try {
      const result = await apiClient.post<any>("/api/v1/srr/checkin", {
        qr_code: term,
        checkin_method: view === "qr" ? "qr_scan" : "manual",
      });
      const sessions = result.sessions || [];
      const found: SpeakerData = {
        id: result.speaker.id,
        name: result.speaker.full_name,
        email: result.speaker.email,
        role: result.speaker.designation || "Speaker",
        organization: result.speaker.organization || "",
        session_title: sessions[0]?.title || "No session assigned",
        room_name: sessions[0]?.room_name || "Unassigned room",
        start_time: sessions[0]?.start_time || "",
        end_time: sessions[0]?.end_time || "",
        files_count: sessions.reduce((count: number, session: any) => count + (session.presentations?.length || 0), 0),
      };
      setAssignedStation(result.station_number);
      setStationNumber(result.station_number);
      setCurrentSpeaker(result.speaker);
      setSessions(sessions);
      setCurrentStep(sessions.length > 0 ? 2 : 1);
      if (sessions.length > 0) selectSession(0);
      setSpeaker(found);
      setView("result");
      stopCamera();
      toast.success(`Speaker identified: ${found.name}`);
    } catch (err: any) {
      const status = err.status;
      if (status === 404) toast.error("Speaker not found for this venue event.");
      else if (status === 409) toast.error("All SRR workstations are busy, offline, or locked.");
      else if (status === 400) toast.error("Venue Server is not configured for SRR check-in.");
      else toast.error(err.message || "Venue Server is offline or unavailable.");
    } finally {
      setLookupBusy(false);
    }
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    void lookupSpeaker();
  };

  const handleOpenWorkstation = () => {
    if (!speaker) return;
    setStationNumber(assignedStation);
    setMode("workstation");
    toast.success(`Redirecting to Workstation #${assignedStation} for ${speaker.name}...`);
    router.push("/workstation");
  };

  const handlePrintRoutingTicket = () => {
    setPrinting(false);
    toast.error("Routing ticket printing is not connected to a printer service yet.");
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <main className="relative h-screen overflow-hidden bg-[var(--base)] text-[var(--text)] select-none font-sans">
      {/* Theme-Responsive Kiosk Background Images */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <img
          src="/backgrounds/scanning-bg-light.png"
          alt="Scanning Background Light"
          className="size-full object-cover dark:hidden"
        />
        <img
          src="/backgrounds/scanning-bg-dark.png"
          alt="Scanning Background Dark"
          className="size-full object-cover hidden dark:block"
        />
        <div className="absolute inset-0 bg-white/10 dark:bg-black/25 backdrop-blur-[0.5px]" />
      </div>

      {/* Top Kiosk Header Bar (1:1 Registration Software Layout) */}
      <header className="relative z-10 flex h-24 items-center justify-between px-7 lg:px-12">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <img
            src="/brand/eventos-emblem-metal.png"
            alt="Eventos"
            className="size-12 scale-[1.85] object-contain"
          />
          <div>
            <p className="text-lg font-black uppercase tracking-[0.34em] text-[var(--text)]">EVENTOS</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--pri)]">
              Speaker Check-in kiosk
            </p>
          </div>
        </div>

        {/* Right Controls: Live Date/Time Pill, Theme Toggler & Kiosk Menu */}
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)]/90 px-5 py-3 text-sm font-semibold text-[var(--text)] shadow-2xl backdrop-blur-md md:flex">
            <CalendarDays className="size-5 text-[var(--pri)]" />
            <span suppressHydrationWarning>
              {mounted && time
                ? time.toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
                : "25 Aug 2026"}
            </span>
            <span className="h-5 w-px bg-[var(--border)]" />
            <span suppressHydrationWarning>
              {mounted && time
                ? time.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                })
                : "11:00:00 am"}
            </span>
          </div>

          {/* Theme Toggler */}
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="grid size-11 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--card)]/90 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--raised)] shadow-2xl backdrop-blur-md transition cursor-pointer"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4 text-slate-700" />}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setKioskMenuOpen((open) => !open)}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)]/90 px-5 py-3 text-left shadow-2xl backdrop-blur-md transition hover:bg-[var(--raised)] cursor-pointer"
            >
              <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-[var(--muted)]">
                Kiosk
              </span>
              <span className="block text-sm font-black uppercase tracking-wider text-[var(--text)]">
                INTAKE-KIOSK
              </span>
            </button>

            {kioskMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-52 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-2xl space-y-1">
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--text)] transition hover:bg-[var(--raised)] cursor-pointer"
                >
                  <Settings className="size-4 text-[var(--muted)]" />
                  Change Mode
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wider text-red-400 transition hover:bg-red-500/10 cursor-pointer"
                >
                  <LogOut className="size-4" />
                  Logout kiosk
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Kiosk Center Section */}
      <section className="relative z-10 mx-auto flex h-[calc(100vh-176px)] w-full max-w-6xl flex-col items-center justify-center px-6 text-center">
        {view === "home" && (
          <HomeView
            onScan={() => setView("qr")}
            onSearch={() => setView("search")}
          />
        )}

        {view === "qr" && (
          <QrView
            cameraActive={cameraActive}
            lookupBusy={lookupBusy}
            selectedDeviceId={selectedDeviceId}
            setSelectedDeviceId={setSelectedDeviceId}
            videoDevices={videoDevices}
            videoRef={videoRef}
            canvasRef={canvasRef}
            onBack={resetToHome}
          />
        )}

        {view === "search" && (
          <SearchView
            query={query}
            setQuery={setQuery}
            lookupBusy={lookupBusy}
            onSubmit={handleSearchSubmit}
            onBack={resetToHome}
          />
        )}

        {view === "result" && speaker && (
          <WorkstationResultView
            speaker={speaker}
            assignedStation={assignedStation}
            onReset={resetToHome}
          />
        )}
      </section>

      {/* Bottom Kiosk Footer (1:1 Registration Software Layout) */}
      <footer className="absolute bottom-0 left-0 right-0 z-10 flex h-20 items-center justify-between border-t border-[var(--border)] bg-[var(--base)]/90 px-7 backdrop-blur lg:px-12">
        <button
          type="button"
          onClick={() => toast.info("Please go to the nearest Speaker Ready Room help desk.")}
          className="flex items-center gap-4 rounded-2xl px-4 py-3 text-left transition hover:bg-[var(--raised)] cursor-pointer"
        >
          <Headphones className="size-7 text-[var(--pri)]" />
          <span>
            <span className="block text-sm font-black text-[var(--text)]">Need support?</span>
            <span className="block text-xs font-semibold text-[var(--muted)]">
              Go to nearest Speaker Ready Room help desk
            </span>
          </span>
        </button>
      </footer>
    </main>
  );
}

// 1. Home View (1:1 with Registration Software HomeView)
function HomeView({ onScan, onSearch }: { onScan: () => void; onSearch: () => void }) {
  return (
    <div className="w-full">
      <div className="mx-auto grid size-20 place-items-center rounded-full border border-[var(--pri)]/55 bg-[var(--card)] shadow-2xl">
        <UserSearch className="size-9 text-[var(--text)]" />
      </div>
      <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl text-[var(--text)]">
        Speaker Check-In
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-sm font-medium leading-6 text-[var(--muted)]">
        Please scan your speaker badge or enter your details to locate your assigned presentation workstation.
      </p>

      <div className="mx-auto mt-7 grid max-w-2xl gap-5 md:grid-cols-2">
        <KioskChoice
          icon={QrCode}
          title="Scan QR Code"
          body="Scan your speaker badge or pass QR code"
          primary
          onClick={onScan}
        />
        <KioskChoice
          icon={UserRound}
          title="Enter Details"
          body="Search by name, email, or presentation session title"
          onClick={onSearch}
        />
      </div>
    </div>
  );
}

function KioskChoice({
  icon: Icon,
  title,
  body,
  onClick,
  primary = false,
}: {
  icon: any;
  title: string;
  body: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-[220px] flex-col items-center justify-center rounded-[1.7rem] border bg-[var(--card)] p-6 text-center shadow-2xl backdrop-blur transition duration-200 hover:-translate-y-1 hover:bg-[var(--raised)] cursor-pointer",
        primary ? "border-[var(--pri)] shadow-2xl" : "border-[var(--border)]"
      )}
    >
      <Icon className="size-12 text-[var(--text)]" />
      <h2 className="mt-6 text-lg font-black text-[var(--text)]">{title}</h2>
      <p className="mt-3 min-h-10 text-xs font-medium leading-5 text-[var(--muted)]">{body}</p>
      <span
        className={cn(
          "mt-4 grid size-11 place-items-center rounded-full border transition group-hover:border-[var(--pri)] group-hover:text-[var(--pri)]",
          primary ? "border-[var(--pri)] text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)]"
        )}
      >
        <ArrowRight className="size-6" />
      </span>
    </button>
  );
}

// 2. QR Camera Scanner View (Square 1:1 Viewport)
function QrView({
  cameraActive,
  lookupBusy,
  selectedDeviceId,
  setSelectedDeviceId,
  videoDevices,
  videoRef,
  canvasRef,
  onBack,
}: {
  cameraActive: boolean;
  lookupBusy: boolean;
  selectedDeviceId: string;
  setSelectedDeviceId: (value: string) => void;
  videoDevices: MediaDeviceInfo[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-md mx-auto">
      <BackButton onClick={onBack} />
      <h1 className="mt-3 text-2xl font-black text-[var(--text)]">Scan QR Code</h1>
      <p className="mt-1 text-xs font-medium text-[var(--muted)]">
        Hold your badge QR code inside the square frame.
      </p>
      <div className="mt-4 overflow-hidden rounded-[2rem] border border-[var(--pri)]/45 bg-[var(--card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5 text-left">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--muted)]">
            {cameraActive ? "Auto scan active" : "Camera standby"}
          </p>
          <select
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
            className="max-w-[200px] rounded-xl border border-[var(--border)] bg-[var(--surf)] px-2.5 py-1 text-[11px] font-bold text-[var(--text)]"
          >
            {videoDevices.length ? (
              videoDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))
            ) : (
              <option>No camera detected</option>
            )}
          </select>
        </div>
        <div className="relative aspect-square w-full bg-black overflow-hidden">
          <video ref={videoRef} className="size-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25">
            <div className="relative size-48 rounded-[2rem] border-2 border-[var(--pri)] shadow-2xl">
              <span className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 bg-[var(--pri)] animate-pulse" />
            </div>
          </div>
          {lookupBusy && <BusyOverlay label="Finding speaker & assigning workstation..." />}
        </div>
      </div>
    </div>
  );
}

// 3. Search View (1:1 with Registration Software SearchView)
function SearchView({
  query,
  setQuery,
  lookupBusy,
  onSubmit,
  onBack,
}: {
  query: string;
  setQuery: (value: string) => void;
  lookupBusy: boolean;
  onSubmit: (event: FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-xl">
      <BackButton onClick={onBack} />
      <div className="mt-5 rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl backdrop-blur">
        <Search className="mx-auto size-12 text-[var(--pri)]" />
        <h1 className="mt-4 text-3xl font-black text-[var(--text)]">Enter Details</h1>
        <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-[var(--muted)]">
          Search by speaker name, email, or presentation session title.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            placeholder="Search by speaker name, email, or badge code..."
            className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surf)] px-5 text-center text-base font-bold text-[var(--text)] placeholder:text-[var(--muted)]"
          />
          <Button
            type="submit"
            disabled={lookupBusy}
            className="h-12 w-full rounded-2xl bg-[var(--pri)] text-sm font-black uppercase tracking-wider text-[var(--primary-contrast)] hover:bg-[var(--pri)]/80 cursor-pointer shadow-md"
          >
            {lookupBusy ? <RefreshCw className="mr-2 size-5 animate-spin" /> : <ArrowRight className="mr-2 size-5" />}
            Find my workstation
          </Button>
        </form>
      </div>
    </div>
  );
}

// 4. Result View (Clean Speaker Profile + Free Workstation Allocation Card + 7s Perimeter Glow Effect)
function WorkstationResultView({
  speaker,
  assignedStation,
  onReset,
}: {
  speaker: SpeakerData;
  assignedStation: number;
  onReset: () => void;
}) {
  const TOTAL_SECONDS = 7;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(() => {
    const timer = setTimeout(() => {
      onResetRef.current();
    }, TOTAL_SECONDS * 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full max-w-3xl space-y-6">
      {/* Speaker Clean Identity Card (No Session List, No Room/Time, No Print Pass) */}
      <div className="rounded-[2.5rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl backdrop-blur text-left flex items-center gap-5">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-3xl bg-[var(--pri)] text-[var(--primary-contrast)] font-black text-2xl shadow-xl">
          {speaker.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)}
        </div>
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-black text-[var(--text)] truncate">{speaker.name}</h2>
            <Badge className="border border-[var(--pri)]/40 bg-[var(--pri)]/10 text-[var(--pri)] text-[10px] font-black uppercase px-2.5 py-0.5">
              {speaker.role}
            </Badge>
          </div>
          <p className="text-xs text-[var(--muted)] font-semibold">{speaker.organization}</p>
        </div>
      </div>

      {/* Prominent Free Workstation Allocation Card */}
      <div className="relative overflow-hidden rounded-[2.5rem] border-2 border-emerald-500/60 bg-emerald-500/10 dark:bg-emerald-500/15 p-8 shadow-md text-left flex items-center justify-between gap-6">
        {/* Progress Beam Along the Bottom */}
        <div
          className="absolute bottom-0 left-0 h-1.5 bg-emerald-500"
          style={{
            animation: "progress-bar 7s linear forwards",
          }}
        />

        {/* Workstation Info */}
        <div className="flex items-center gap-5 min-w-0">
          <div className="grid size-20 shrink-0 place-items-center rounded-3xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shadow-xl">
            <Monitor className="size-10" />
          </div>
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">
              FREE WORKSTATION ALLOCATED
            </span>
            <h3 className="text-3xl sm:text-4xl font-black text-emerald-950 dark:text-emerald-200">
              PROCEED TO WORKSTATION #{assignedStation}
            </h3>
            <p className="text-xs text-emerald-800 dark:text-emerald-400 font-medium">
              Workstation #{assignedStation} is ready. Please proceed to the assigned physical desk.
            </p>
          </div>
        </div>
      </div>

      {/* Action Footer: Done / Scan Next */}
      <div className="flex justify-center pt-2">
        <Button
          onClick={onReset}
          variant="outline"
          className="h-12 min-w-64 rounded-2xl border-[var(--border)] bg-[var(--card)] hover:bg-[var(--raised)] text-sm font-black uppercase tracking-wider text-[var(--text)] shadow-2xl cursor-pointer"
        >
          <span>Done / Scan Next</span>
        </Button>
      </div>

      <style jsx>{`
        @keyframes progress-bar {
          from {
            width: 0%;
          }
          to {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--text)] shadow-2xl transition hover:bg-[var(--raised)] cursor-pointer"
    >
      <ArrowLeft className="size-4" />
      Back
    </button>
  );
}

function BusyOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw className="size-8 text-[var(--pri)] animate-spin" />
        <p className="text-xs font-black uppercase tracking-wider text-white">{label}</p>
      </div>
    </div>
  );
}
