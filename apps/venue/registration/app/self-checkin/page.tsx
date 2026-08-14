"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Edit3,
  Headphones,
  IdCard,
  LogOut,
  Mail,
  Phone,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  User,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { fetchVenueNodeBootstrap } from "@/lib/node-workstation";
import { compileTemplateToPdf } from "@/lib/pdf-compiler";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";
import { toast } from "sonner";

type View = "home" | "qr" | "search" | "profile" | "edit";

type Participant = {
  id: string;
  regno: string;
  name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  company?: string;
  designation?: string;
  country?: string;
  paid_status?: string;
  photo_url?: string;
  badge_code?: string;
  badge_status?: string;
  is_checked_in?: boolean;
  checked_in_at?: string | null;
  support_message?: string;
  payment_locked?: boolean;
  payment_lock_reason?: string;
  reprint_locked?: boolean;
  profile_edit_allowed?: boolean;
};

type Station = {
  id: string;
  station_name: string;
  station_type?: string;
};

type EventMetadata = {
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  venue_name?: string | null;
  timezone?: string | null;
};

export default function SelfCheckInPage() {
  const router = useRouter();
  const { logout } = useAuthStore();
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [eventMetadata, setEventMetadata] = useState<EventMetadata>({ name: "Event" });
  const [kioskName, setKioskName] = useState("SELF-KIOSK");
  const [kioskMenuOpen, setKioskMenuOpen] = useState(false);
  const [initialStation, setInitialStation] = useState<Station | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    name: "",
    email: "",
    phone: "",
    photo_url: "",
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const lastQrRef = useRef("");

  const now = useMemo(() => new Date(), []);
  const alreadyCheckedIn = Boolean(participant?.is_checked_in);
  const eventDateRange = formatEventDateRange(eventMetadata.start_date, eventMetadata.end_date);

  useEffect(() => {
    let mounted = true;
    apiClient.get<any>("/venue/scanning/stations")
      .then((res) => {
        if (!mounted) return;
        const list: Station[] = Array.isArray(res) ? res : [];
        const initial = list.find((station) =>
          `${station.station_name || ""} ${station.station_type || ""}`.toLowerCase().includes("initial")
        ) || list[0] || null;
        setInitialStation(initial);
      })
      .catch(() => setInitialStation(null));

    apiClient.get<EventMetadata>("/venue/registration/self-checkin/event")
      .then((eventInfo) => {
        if (mounted) setEventMetadata(eventInfo || { name: "Event" });
      })
      .catch(() => {
        if (mounted) setEventMetadata({ name: "Event" });
      });

    fetchVenueNodeBootstrap()
      .then((bootstrap) => {
        if (!mounted) return;
        const assignedName = bootstrap?.assignment?.station_id;
        setKioskName(assignedName?.trim() || "SELF-KIOSK");
      })
      .catch(() => {
        if (mounted) setKioskName("SELF-KIOSK");
      });

    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          if (!mounted) return;
          const cameras = devices.filter((device) => device.kind === "videoinput");
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
      console.error("Failed to start self check-in camera", error);
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
      void lookupParticipant(value);
      window.setTimeout(() => {
        if (lastQrRef.current === value) lastQrRef.current = "";
      }, 2200);
    }
    scanLoopRef.current = window.requestAnimationFrame(scanFrame);
  };

  const resetToHome = () => {
    stopCamera();
    setView("home");
    setParticipant(null);
    setQuery("");
  };

  const lookupParticipant = async (rawQuery?: string) => {
    const lookupQuery = (rawQuery || query).trim();
    if (!lookupQuery) return;
    setLookupBusy(true);
    try {
      const found = await apiClient.post<{ participant: Participant }>("/venue/registration/self-checkin/lookup", { query: lookupQuery });
      const nextParticipant = found.participant;

      setParticipant(nextParticipant);
      setEditForm({
        first_name: nextParticipant.first_name || "",
        last_name: nextParticipant.last_name || "",
        name: nextParticipant.name || "",
        email: nextParticipant.email || "",
        phone: nextParticipant.phone || "",
        photo_url: nextParticipant.photo_url || "",
      });
      setView("profile");
      stopCamera();
      if (nextParticipant.is_checked_in) {
        toast.info("Already checked in. You can reprint the badge or update details.");
      }
    } catch (error: any) {
      toast.error(error?.message || error?.detail || "Participant not found. Please contact support.");
    } finally {
      setLookupBusy(false);
    }
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    void lookupParticipant();
  };

  const handleSaveDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (!participant) return;
    setSaving(true);
    try {
      const res = await apiClient.put<{ participant: Participant }>(`/venue/registration/self-checkin/participants/${participant.id}`, editForm);
      setParticipant(res.participant);
      setView("profile");
      toast.success("Details updated.");
    } catch (error: any) {
      toast.error(error?.message || "Details could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  const printBlobDirectly = async (blob: Blob) => {
    const blobUrl = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = blobUrl;
    document.body.appendChild(iframe);

    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      window.setTimeout(resolve, 1200);
    });

    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      toast.success("Print dialog sent to connected printer.");
    } catch {
      window.open(blobUrl, "_blank");
      toast.info("Direct print unavailable. PDF opened as fallback.");
    } finally {
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(blobUrl);
      }, 30000);
    }
  };

  const handlePrintBadge = async () => {
    if (!participant) return;
    setPrinting(true);
    try {
      let printableParticipant = participant;
      if (!participant.is_checked_in) {
        try {
          await apiClient.post("/venue/registration/checkin", {
            participant_id: participant.id,
            station_id: initialStation?.id || undefined,
            station_name: initialStation?.station_name || "Initial Participant Check-In Point",
            scanner_id: "SELF-CHECKIN-KIOSK",
          });
          const refreshed = await apiClient.post<{ participant: Participant }>("/venue/registration/self-checkin/lookup", { query: participant.id });
          printableParticipant = refreshed.participant;
          setParticipant(printableParticipant);
          toast.success("Checked in at the initial gate.");
        } catch (error: any) {
          const message = String(error?.message || error?.detail || "");
          if (message.toLowerCase().includes("already") || message.toLowerCase().includes("limit exceeded")) {
            printableParticipant = { ...participant, is_checked_in: true };
            setParticipant(printableParticipant);
            toast.info("Already checked in. Reprinting badge.");
          } else {
            throw error;
          }
        }
      }

      await apiClient.post(`/venue/registration/participants/${printableParticipant.id}/print-badge`, {}).catch(() => {});
      const templatesRes: any = await apiClient.get("/venue/registration/templates");
      const templates = Array.isArray(templatesRes) ? templatesRes : [];
      const activeTemplate = templates.length > 0 ? templates[0].template_data || templates[0] : null;
      const pdf = await compileTemplateToPdf([printableParticipant as any], activeTemplate, { name: "EventOS" });
      await printBlobDirectly(pdf.output("blob"));
    } catch {
      toast.error("Failed to print badge. PDF fallback could not be generated.");
    } finally {
      setPrinting(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <main className="relative h-screen overflow-hidden bg-[var(--base)] text-[var(--text)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(16,185,129,0.14),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(255,255,255,0.06),transparent_26%)]" />
      <div className="pointer-events-none absolute inset-x-[-10%] bottom-[12%] h-44 opacity-20 [background:repeating-radial-gradient(ellipse_at_center,rgba(148,163,184,0.35)_0_1px,transparent_1px_11px)] blur-[0.2px] [transform:rotate(-5deg)]" />

      <header className="relative z-10 flex h-24 items-center justify-between px-7 lg:px-12">
        <div className="flex items-center gap-4">
          <img src="/brand/eventos-emblem-metal.png" alt="Eventos" className="size-12 scale-[1.85] object-contain" />
          <div>
            <p className="text-lg font-black uppercase tracking-[0.34em]">EVENTOS</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--pri)]">Self check-in kiosk</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-3 text-sm font-semibold text-[var(--text)] shadow-2xl backdrop-blur md:flex">
            <CalendarDays className="size-5 text-[var(--pri)]" />
            <span>{now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
            <span className="h-5 w-px bg-[var(--border)]" />
            <span>{now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setKioskMenuOpen((open) => !open)}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-3 text-left shadow-2xl backdrop-blur transition hover:bg-[var(--raised)]"
            >
              <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-[var(--muted)]">Kiosk</span>
              <span className="block text-sm font-black uppercase tracking-wider text-[var(--text)]">{kioskName}</span>
            </button>
            {kioskMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-52 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-2xl">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wider text-[var(--text)] transition hover:bg-[var(--raised)]"
                >
                  <LogOut className="size-4 text-[var(--pri)]" />
                  Logout kiosk
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex h-[calc(100vh-184px)] w-full max-w-6xl flex-col items-center justify-center px-6 text-center">
        {view === "home" && (
          <HomeView eventName={eventMetadata.name} eventDateRange={eventDateRange} onScan={() => setView("qr")} onSearch={() => setView("search")} />
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

        {view === "profile" && participant && (
          <div className="flex w-full flex-col items-center gap-4">
            <ProfileView
              participant={participant}
              alreadyCheckedIn={alreadyCheckedIn}
              printing={printing}
              onPrint={handlePrintBadge}
              onEdit={() => setView("edit")}
            />
            <Button onClick={resetToHome} variant="outline" className="h-12 min-w-64 rounded-2xl border-[var(--border)] bg-[var(--card)] px-8 text-sm font-black uppercase tracking-wider text-[var(--text)] shadow-2xl hover:bg-[var(--raised)]">
              Start over
            </Button>
          </div>
        )}

        {view === "edit" && participant && (
          <EditView
            participant={participant}
            editForm={editForm}
            setEditForm={setEditForm}
            saving={saving}
            onSubmit={handleSaveDetails}
            onBack={() => setView("profile")}
          />
        )}
      </section>

      <footer className="absolute bottom-0 left-0 right-0 z-10 flex h-20 items-center justify-between border-t border-[var(--border)] bg-[var(--base)]/90 px-7 backdrop-blur lg:px-12">
        <button
          type="button"
          onClick={() => toast.info("Please go to the nearest onsite support desk.")}
          className="flex items-center gap-4 rounded-2xl px-4 py-3 text-left transition hover:bg-[var(--raised)]"
        >
          <Headphones className="size-7 text-[var(--pri)]" />
          <span>
            <span className="block text-sm font-black">Need support?</span>
            <span className="block text-xs font-semibold text-[var(--muted)]">Go to nearest onsite support desk</span>
          </span>
        </button>

        <div className="text-right text-[10px] font-black uppercase tracking-[0.24em] text-[var(--muted)]">
          Tap kiosk name to logout
        </div>
      </footer>
    </main>
  );
}

function HomeView({ eventName, eventDateRange, onScan, onSearch }: { eventName: string; eventDateRange: string; onScan: () => void; onSearch: () => void }) {
  return (
    <div className="w-full">
      <div className="mx-auto grid size-20 place-items-center rounded-full border border-[var(--pri)]/55 bg-[var(--card)] shadow-2xl">
        <IdCard className="size-9 text-[var(--text)]" />
      </div>
      <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl">Welcome to {eventName || "Event"}</h1>
      <p className="mt-2 text-lg font-black uppercase tracking-[0.22em] text-[var(--pri)]">
        {eventDateRange === "Event dates pending" ? eventDateRange : `(${eventDateRange})`}
      </p>
      <p className="mx-auto mt-4 max-w-xl text-sm font-medium leading-6 text-[var(--muted)]">
        Please scan your QR code or enter your details to collect your badge.
      </p>

      <div className="mx-auto mt-7 grid max-w-2xl gap-5 md:grid-cols-2">
        <KioskChoice icon={QrCode} title="Scan QR Code" body="Scan your registration QR code" primary onClick={onScan} />
        <KioskChoice icon={UserRound} title="Enter Details" body="Search by name, email, phone, or registration code" onClick={onSearch} />
      </div>
    </div>
  );
}

function KioskChoice({ icon: Icon, title, body, onClick, primary = false }: { icon: typeof QrCode; title: string; body: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-[220px] flex-col items-center justify-center rounded-[1.7rem] border bg-[var(--card)] p-6 text-center shadow-2xl backdrop-blur transition duration-200 hover:-translate-y-1 hover:bg-[var(--raised)]",
        primary ? "border-[var(--pri)] shadow-2xl" : "border-[var(--border)]"
      )}
    >
      <Icon className="size-12 text-[var(--text)]" />
      <h2 className="mt-6 text-lg font-black">{title}</h2>
      <p className="mt-3 min-h-10 text-xs font-medium leading-5 text-[var(--muted)]">{body}</p>
      <span className={cn("mt-4 grid size-11 place-items-center rounded-full border transition group-hover:border-[var(--pri)] group-hover:text-[var(--pri)]", primary ? "border-[var(--pri)] text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)]")}>
        <ArrowRight className="size-6" />
      </span>
    </button>
  );
}

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
    <div className="w-full max-w-3xl">
      <BackButton onClick={onBack} />
      <h1 className="mt-4 text-3xl font-black">Scan QR Code</h1>
      <p className="mt-2 text-sm font-medium text-[var(--muted)]">Hold the emailed registration QR inside the frame.</p>
      <div className="mt-5 overflow-hidden rounded-[2rem] border border-[var(--pri)]/45 bg-[var(--card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3 text-left">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">{cameraActive ? "Auto scan active" : "Camera standby"}</p>
          <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)} className="max-w-[260px] rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 py-2 text-xs font-bold text-[var(--text)]">
            {videoDevices.length ? videoDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>) : <option>No camera detected</option>}
          </select>
        </div>
        <div className="relative min-h-[320px]">
          <video ref={videoRef} className="h-[320px] w-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/20">
            <div className="relative size-52 rounded-[2rem] border-2 border-[var(--pri)] shadow-2xl">
              <span className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 bg-[var(--pri)]" />
            </div>
          </div>
          {lookupBusy && <BusyOverlay label="Finding participant..." />}
        </div>
      </div>
    </div>
  );
}

function SearchView({ query, setQuery, lookupBusy, onSubmit, onBack }: { query: string; setQuery: (value: string) => void; lookupBusy: boolean; onSubmit: (event: FormEvent) => void; onBack: () => void }) {
  return (
    <div className="w-full max-w-xl">
      <BackButton onClick={onBack} />
      <div className="mt-5 rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl backdrop-blur">
        <Search className="mx-auto size-12 text-[var(--pri)]" />
        <h1 className="mt-4 text-3xl font-black">Enter Details</h1>
        <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-[var(--muted)]">Search by name, email, phone number, registration code, or QR token.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="Name, email, phone, or registration code" className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surf)] px-5 text-center text-base font-bold text-[var(--text)] placeholder:text-[var(--muted)]" />
          <Button type="submit" disabled={lookupBusy} className="h-12 w-full rounded-2xl bg-[var(--pri)] text-sm font-black uppercase tracking-wider text-[var(--primary-contrast)] hover:bg-[var(--pri)]/80">
            {lookupBusy ? <RefreshCw className="mr-2 size-5 animate-spin" /> : <ArrowRight className="mr-2 size-5" />}
            Find my badge
          </Button>
        </form>
      </div>
    </div>
  );
}

function ProfileView({ participant, alreadyCheckedIn, printing, onPrint, onEdit }: { participant: Participant; alreadyCheckedIn: boolean; printing: boolean; onPrint: () => void; onEdit: () => void }) {
  if (participant.payment_locked) {
    return (
      <div className="w-full max-w-2xl">
        <div className="rounded-[2.5rem] border-2 border-red-500/40 bg-[var(--card)] p-8 text-center shadow-2xl backdrop-blur space-y-6">
          <div className="mx-auto size-20 rounded-3xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center">
            <ShieldAlert className="size-10" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-[var(--text)]">Payment Required</h1>
            <p className="mt-2 text-sm font-medium text-[var(--muted)] max-w-md mx-auto">
              {participant.payment_lock_reason || "Your registration has a pending payment balance. Self-service check-in is restricted until payment is finalized."}
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-[var(--surf)] border border-[var(--border)] text-left flex items-center justify-between">
            <div>
              <p className="text-lg font-black text-[var(--text)]">{participant.name}</p>
              <p className="font-mono text-xs font-bold text-[var(--pri)]">{participant.regno}</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">{participant.role || "Delegate"}</p>
            </div>
            <span className="px-3.5 py-1.5 text-xs font-black uppercase tracking-wider rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
              {participant.paid_status || "Unpaid"}
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs font-bold text-amber-600 dark:text-amber-400">
            Please proceed to the nearest <strong>Registration & Onsite Help Desk</strong> to complete your payment and collect your badge.
          </div>
        </div>
      </div>
    );
  }

  const reprintDisabled = alreadyCheckedIn && participant.reprint_locked;
  const editDisabled = participant.profile_edit_allowed === false;

  return (
    <div className="w-full max-w-3xl">
      <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-5 text-left shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          {participant.photo_url ? <img src={participant.photo_url} alt={participant.name} className="size-24 rounded-[2rem] border border-[var(--border)] object-cover shadow-xl" /> : <NeutralParticipantAvatar />}
          <div className="min-w-0 flex-1">
            <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wider", alreadyCheckedIn ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-[var(--pri)]/40 bg-[var(--pri)]/10 text-[var(--pri)]")}>
              <CheckCircle2 className="size-4" />
              {alreadyCheckedIn ? "Already checked in" : "Ready for check in"}
            </div>
            <h1 className="mt-3 truncate text-4xl font-black tracking-tight">{participant.name}</h1>
            <p className="mt-1 font-mono text-sm font-bold text-[var(--pri)]">{participant.regno}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>{participant.role || "Delegate"}</Pill>
              {participant.company && <Pill>{participant.company}</Pill>}
              {participant.designation && <Pill>{participant.designation}</Pill>}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Info icon={Mail} label="Email" value={participant.email || "Not provided"} />
          <Info icon={Phone} label="Phone" value={participant.phone || "Not provided"} />
          <Info icon={ShieldAlert} label="Payment / review" value={participant.paid_status || "Not available"} />
          <Info icon={IdCard} label="Badge" value={participant.badge_code || participant.regno} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Button
            onClick={onPrint}
            disabled={printing || reprintDisabled}
            title={reprintDisabled ? "Reprint quota exceeded. Please visit the Registration Desk." : undefined}
            className={cn(
              "h-12 rounded-2xl text-xs font-black uppercase tracking-wider",
              reprintDisabled
                ? "bg-[var(--surf)] border border-[var(--border)] text-[var(--muted)] opacity-60 cursor-not-allowed"
                : "bg-[var(--pri)] text-[var(--primary-contrast)] hover:bg-[var(--pri)]/80"
            )}
          >
            {printing ? <RefreshCw className="mr-2 size-5 animate-spin" /> : <Printer className="mr-2 size-5" />}
            {reprintDisabled
              ? "Reprint Limit Reached (Visit Desk)"
              : alreadyCheckedIn
              ? "Reprint badge"
              : "Check in & print badge"}
          </Button>

          {!editDisabled ? (
            <Button onClick={onEdit} variant="outline" className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surf)] text-xs font-black uppercase tracking-wider text-[var(--text)] hover:bg-[var(--raised)]">
              <Edit3 className="mr-2 size-5" />
              Update details
            </Button>
          ) : (
            <Button disabled variant="outline" className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surf)] text-xs font-black uppercase tracking-wider text-[var(--muted)] opacity-50 cursor-not-allowed">
              <Edit3 className="mr-2 size-5" />
              Editing Locked (Visit Desk)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EditView({ participant, editForm, setEditForm, saving, onSubmit, onBack }: { participant: Participant; editForm: any; setEditForm: (value: any) => void; saving: boolean; onSubmit: (event: FormEvent) => void; onBack: () => void }) {
  return (
    <div className="w-full max-w-3xl">
      <BackButton onClick={onBack} />
      <form onSubmit={onSubmit} className="mt-5 rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-5 text-left shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-black">Update details</h1>
        <p className="mt-2 text-xs font-semibold text-[var(--muted)]">You can update only name, email, phone, and photo. For role or role code changes, visit the nearest onsite support desk.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Field label="First name"><Input value={editForm.first_name} onChange={(event) => setEditForm({ ...editForm, first_name: event.target.value })} className="h-10 rounded-xl border-[var(--border)] bg-[var(--surf)] text-[var(--text)]" /></Field>
          <Field label="Last name"><Input value={editForm.last_name} onChange={(event) => setEditForm({ ...editForm, last_name: event.target.value })} className="h-10 rounded-xl border-[var(--border)] bg-[var(--surf)] text-[var(--text)]" /></Field>
          <Field label="Display name"><Input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} className="h-10 rounded-xl border-[var(--border)] bg-[var(--surf)] text-[var(--text)]" /></Field>
          <Field label="Email"><Input value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} className="h-10 rounded-xl border-[var(--border)] bg-[var(--surf)] text-[var(--text)]" /></Field>
          <Field label="Phone"><Input value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} className="h-10 rounded-xl border-[var(--border)] bg-[var(--surf)] text-[var(--text)]" /></Field>
          <Field label="Photo URL"><Input value={editForm.photo_url} onChange={(event) => setEditForm({ ...editForm, photo_url: event.target.value })} className="h-10 rounded-xl border-[var(--border)] bg-[var(--surf)] text-[var(--text)]" /></Field>
        </div>
        <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold text-amber-500">
          Locked: role, role code, company, designation, payment/review status, registration code.
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack} className="h-11 rounded-xl border-[var(--border)] bg-transparent px-5 text-[var(--muted)] hover:bg-[var(--raised)]">Cancel</Button>
          <Button type="submit" disabled={saving} className="h-11 rounded-xl bg-[var(--pri)] px-6 text-xs font-black uppercase tracking-wider text-[var(--primary-contrast)]">
            {saving ? <RefreshCw className="mr-2 size-4 animate-spin" /> : null}
            Save and return
          </Button>
        </div>
      </form>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-bold text-[var(--muted)] transition hover:bg-[var(--raised)] hover:text-[var(--text)]">
      <ArrowLeft className="size-4" />
      Back
    </button>
  );
}

function NeutralParticipantAvatar() {
  return (
    <div className="relative grid size-24 shrink-0 place-items-center rounded-[2rem] border border-[var(--border)] bg-[radial-gradient(circle_at_30%_20%,#ffffff_0,#dbeafe_18%,#60a5fa_48%,#1d4ed8_100%)] shadow-xl">
      <div className="absolute inset-2 rounded-[1.6rem] border border-white/30 bg-white/10 shadow-inner" />
      <div className="relative grid size-16 place-items-center rounded-2xl bg-white/90 text-blue-700 shadow-xl rotate-[-6deg]">
        <User className="size-9" />
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
        <Icon className="size-4 text-[var(--pri)]" />
        {label}
      </div>
      <p className="mt-2 truncate text-sm font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-[var(--border)] bg-[var(--surf)] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--text)]">{children}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2"><span className="block text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">{label}</span>{children}</label>;
}

function BusyOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-sm">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-4 text-sm font-black text-[var(--text)]">
        <RefreshCw className="mr-2 inline size-5 animate-spin text-[var(--pri)]" />
        {label}
      </div>
    </div>
  );
}

function formatEventDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "Event dates pending";
  const format = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).replace(" ", "-");
  };
  const startText = start ? format(start) : "";
  const endDate = end || start;
  const endObj = endDate ? new Date(`${endDate}T00:00:00`) : null;
  const endText = endObj
    ? `${format(endDate!)} ${endObj.getFullYear()}`
    : "";
  return startText && endText ? `${startText} - ${endText}` : startText || endText;
}
