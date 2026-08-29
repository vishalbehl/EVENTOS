"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ShieldCheck, UserCheck, ScanLine, Loader2,
  WifiOff, MonitorSmartphone, Settings, Lock, ArrowRight, Sun, Moon, Database, UploadCloud, Server, Check, Users, X, RotateCcw, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth-service";
import { useAuthStore, type AppMode } from "@/store/use-auth-store";
import { allowedModesForAssignment, fetchVenueNodeBootstrap, type VenueNodeAssignment } from "@/lib/node-workstation";
import { toast } from "sonner";

type OperatorMode = Exclude<AppMode, "admin">;

const OPERATIONAL_MODES: Array<{
  id: OperatorMode;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
    {
      id: "registration",
      label: "Registration",
      sublabel: "Onsite desk registration and support",
      icon: UserCheck,
    },
    {
      id: "scanning",
      label: "Gate Scanning",
      sublabel: "Live QR camera & gatekeeper rules",
      icon: ScanLine,
    },
    {
      id: "self_checkin",
      label: "Self Check-in + Printing",
      sublabel: "Participant QR kiosk and badge print",
      icon: Users,
    },
  ];

const routeForMode = (mode?: AppMode | null) => {
  if (mode === "admin") return "/admin";
  if (mode === "scanning") return "/scanning";
  if (mode === "self_checkin") return "/self-checkin";
  return "/registry";
};
type SetupValidation = {
  configured?: boolean;
  reason?: string | null;
  mode?: string | null;
  tableCount?: number;
  contractTableCount?: number;
  missingTables?: string[];
  missingColumns?: Record<string, string[]>;
  health?: { localUsers?: number; setupMarker?: string | null };
};

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, accessToken, setMode, mode } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [rememberMe, setRememberMe] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [localDbStatus, setLocalDbStatus] = useState<{ exists: boolean; path: string; sizeBytes: number; updatedAt?: number; adminUsername?: string } | null>(null);
  const [localDbBusy, setLocalDbBusy] = useState(false);
  const [setupChecking, setSetupChecking] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);
  const [desktopRuntime, setDesktopRuntime] = useState(false);
  const [setupReason, setSetupReason] = useState("");
  const [setupValidation, setSetupValidation] = useState<SetupValidation | null>(null);
  const [postgresBusy, setPostgresBusy] = useState(false);
  const [setupAdminUsername, setSetupAdminUsername] = useState("admin");
  const [setupAdminPassword, setSetupAdminPassword] = useState("");
  const [pgHost, setPgHost] = useState("127.0.0.1");
  const [pgPort, setPgPort] = useState("5432");
  const [pgDatabase, setPgDatabase] = useState("eventos_registration_shared");
  const [pgUser, setPgUser] = useState("postgres");
  const [pgPassword, setPgPassword] = useState("");
  const [sharedPostgresIntent, setSharedPostgresIntent] = useState<"connect" | "create">("connect");

  // Default mode selection
  const [selectedMode, setSelectedMode] = useState<OperatorMode>("registration");
  const [assignedNode, setAssignedNode] = useState<VenueNodeAssignment | null>(null);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [resettingDb, setResettingDb] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const handleResetDatabase = async () => {
    setResettingDb(true);
    try {
      if (window.venueDesktop?.resetRegistrationDatabase) {
        await window.venueDesktop.resetRegistrationDatabase();
      }
      setSetupComplete(false);
      setSetupReason("Database configuration reset.");
      setSetupValidation(null);
      setDbModalOpen(false);
      setConfirmResetOpen(false);
      toast.success("Registration database configuration has been reset.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to reset database configuration.");
    } finally {
      setResettingDb(false);
    }
  };

  useEffect(() => {
    const savedTheme = ((localStorage.getItem("eventos-theme") || localStorage.getItem("theme")) as "light" | "dark") || "dark";
    const validTheme = savedTheme === "light" ? "light" : "dark";
    setTheme(validTheme);
    document.documentElement.setAttribute("data-theme", validTheme);
    if (validTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchVenueNodeBootstrap()
      .then((bootstrap) => {
        if (!mounted) return;
        if (bootstrap?.assignment) {
          setAssignedNode(bootstrap.assignment);
          const allowed = allowedModesForAssignment(bootstrap.assignment);
          // If currently selected mode is not allowed for this workstation, auto-select the first allowed mode
          if (allowed.length > 0 && !allowed.includes(selectedMode)) {
            setSelectedMode(allowed[0]);
          }
        } else {
          setAssignedNode(null);
        }
      })
      .catch(() => {
        if (mounted) setAssignedNode(null);
      });
    return () => {
      mounted = false;
    };
  }, [selectedMode]);

  useEffect(() => {
    const desktopApi = window.venueDesktop;
    const isDesktopRuntime = Boolean(desktopApi);
    setDesktopRuntime(isDesktopRuntime);
    if (!desktopApi) {
      setSetupChecking(false);
      setSetupComplete(true);
      return;
    }
    let mounted = true;
    desktopApi.getRegistrationSetupStatus()
      .then((status) => {
        if (!mounted) return;
        setLocalDbStatus(status.localDatabase);
        setSetupComplete(Boolean(status.configured));
        const validation = status.validation as SetupValidation | undefined;
        setSetupValidation(validation || null);
        setSetupReason(validation?.reason ? `${validation.mode || "setup"}: ${validation.reason}` : "");
      })
      .catch((error) => {
        console.error(error);
        toast.error("Local fallback database could not be prepared.");
      })
      .finally(() => {
        if (mounted) setSetupChecking(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    localStorage.setItem("eventos-theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    if (nextTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username || !password) {
      toast.error("Credentials required.");
      return;
    }

    const allowedModes = allowedModesForAssignment(assignedNode);
    if (assignedNode && allowedModes.length > 0 && !allowedModes.includes(selectedMode)) {
      toast.error(`Mode '${selectedMode.toUpperCase()}' is not permitted on this workstation.`);
      return;
    }

    setLoading(true);
    try {
      const effectiveMode = selectedMode;
      await authService.login({ email: username, password, mode: effectiveMode }, rememberMe);
      setMode?.(effectiveMode);

      sessionStorage.setItem("session_active", "true");
      toast.success(`Authenticated as ${effectiveMode.toUpperCase()} Mode.`);

      setTimeout(() => {
        router.push(routeForMode(effectiveMode));
      }, 300);
    } catch (error: any) {
      toast.error(error.message || "Authentication failed.");
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminUsername || !adminPassword) {
      toast.error("Admin credentials required.");
      return;
    }

    setAdminLoading(true);
    try {
      await authService.login({ email: adminUsername, password: adminPassword, mode: "admin" }, rememberMe);
      setMode?.("admin");
      sessionStorage.setItem("session_active", "true");
      toast.success("Authenticated as Admin Mode.");
      setAdminLoginOpen(false);
      setTimeout(() => router.push("/admin"), 350);
    } catch (error: any) {
      toast.error(error.message || "Admin authentication failed.");
      setAdminLoading(false);
    }
  };

  const handleImportLocalDatabase = async () => {
    if (!window.venueDesktop) {
      toast.error("Local DB import is available only inside the desktop app.");
      return;
    }
    setLocalDbBusy(true);
    try {
      const status = await window.venueDesktop.importLocalDatabase();
      if (!status.canceled) {
        setLocalDbStatus(status);
        setSetupComplete(true);
        toast.success("Local database imported. This workstation can now run from the uploaded SQLite DB.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to import local database.");
    } finally {
      setLocalDbBusy(false);
    }
  };

  const handleSharedPostgresSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.venueDesktop) {
      toast.error("Shared Postgres setup is available only inside the desktop app.");
      return;
    }
    setPostgresBusy(true);
    try {
      await window.venueDesktop.setupRegistrationPostgres({
        local_admin_username: setupAdminUsername,
        local_admin_password: setupAdminPassword,
        host: pgHost,
        port: Number(pgPort),
        database: pgDatabase,
        postgres_user: pgUser,
        postgres_password: pgPassword,
        create_if_missing: sharedPostgresIntent === "create",
      });
      const status = await window.venueDesktop.getRegistrationSetupStatus();
      setLocalDbStatus(status.localDatabase);
      setSetupValidation(status.validation as SetupValidation);
      setSetupComplete(true);
      setSetupReason("");
      toast.success(sharedPostgresIntent === "connect" ? "Connected to existing Registration shared Postgres DB. Continue to login." : "Registration shared Postgres DB is ready. Continue to login.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to setup registration shared Postgres DB.");
    } finally {
      setPostgresBusy(false);
    }
  };

  if (desktopRuntime && (setupChecking || !setupComplete)) {
    return (
      <div className="flex min-h-screen w-full bg-[var(--base)] text-[var(--text)] font-sans overflow-hidden transition-colors">
        <div className="hidden lg:flex lg:w-5/12 flex-col justify-between bg-[var(--surf)] border-r border-[var(--border)] p-10 xl:p-12 relative overflow-hidden">
          {/* Theme-Responsive 3D Isometric Registration Booth Background Art */}
          <div className="pointer-events-none absolute inset-0 -z-0 select-none overflow-hidden">
            <img
              key={theme}
              src={theme === "light" ? "/backgrounds/registration-booth-light.png" : "/backgrounds/registration-booth-dark.png"}
              alt={theme === "light" ? "Registration Booth Light" : "Registration Booth Dark"}
              className="absolute inset-0 size-full w-full h-full object-fill"
            />
          </div>

          <div className="relative z-10 space-y-7">
            <div className="flex items-center gap-3 mb-4">
              <span className="grid size-12 shrink-0 place-items-center overflow-visible">
                <img src="/brand/eventos-emblem-metal.png" alt="Eventos Emblem" width={48} height={48} className="size-full scale-[2.05] object-contain drop-shadow-md" />
              </span>
              <div>
                <span className="text-2xl font-black uppercase tracking-[0.25em] text-[var(--text)] block leading-none">EVENT<span className="text-[var(--acc)]">OS</span></span>
                <span className="block text-xs font-bold tracking-widest text-[var(--pri)] mt-1.5 uppercase">Registration Software</span>
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-black text-[var(--text)] tracking-tight leading-tight drop-shadow-sm">First-time Registration Setup</h2>
              <p className="text-sm text-[var(--muted)] font-medium mt-2 leading-relaxed">
                This setup belongs to the Registration Software only. Venue Server may exist, or this app can later fetch directly from cloud.
              </p>
            </div>
            <div className="space-y-4 pt-3 border-t border-[var(--border)]/70">
              <div className="flex gap-4 items-start bg-[var(--card)]/40 p-3 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)] flex items-center justify-center font-black shrink-0 shadow-md">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[var(--text)] uppercase tracking-wider">Local SQLite always exists</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Created on boot with setup admin stored in SQLite, not hardcoded UI validation.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start bg-[var(--card)]/40 p-3 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-[var(--sec)] text-[var(--primary-contrast)] flex items-center justify-center font-black shrink-0 shadow-md">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[var(--text)] uppercase tracking-wider">Registration shared Postgres</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Created on any chosen PC and used as the main shared registration database.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="relative z-10 text-xs text-[var(--muted)] pt-6 border-t border-[var(--border)]/70 font-mono">
            Registration DB setup must complete before login
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-between p-8 sm:p-12 lg:p-16 max-w-[920px] w-full mx-auto">
          <div className="flex justify-end items-center gap-3">
            {setupValidation?.configured && (
              <button
                type="button"
                onClick={() => setSetupComplete(true)}
                className="p-2.5 px-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--raised)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
                <span>Back to Login</span>
              </button>
            )}
            <button onClick={toggleTheme} className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--raised)] transition-all cursor-pointer flex items-center gap-2 text-xs font-bold">
              {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            </button>
          </div>

          <div className="w-full max-w-3xl mx-auto space-y-6 my-auto">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-[var(--text)]">Choose registration data source</h2>
              <p className="text-xs text-[var(--muted)] font-bold uppercase tracking-wider mt-1.5">
                Upload a prepared local DB or create the Registration shared Postgres DB
              </p>
              {setupReason && (
                <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-500">
                  Previous setup is not available: {setupReason}. Please setup the database again.
                </p>
              )}
              {setupValidation && (
                <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-xs font-bold text-[var(--muted)]">
                  <span className="text-[var(--text)]">Database health:</span>{" "}
                  {setupValidation.mode || "not selected"}
                  {typeof setupValidation.tableCount === "number" && (
                    <span> {setupValidation.tableCount}/{setupValidation.contractTableCount || "?"} contract tables checked</span>
                  )}
                  {setupValidation.health?.localUsers !== undefined && (
                    <span> {setupValidation.health.localUsers} local admin user{setupValidation.health.localUsers === 1 ? "" : "s"}</span>
                  )}
                  {Boolean(setupValidation.missingTables?.length) && (
                    <span className="text-amber-500"> {setupValidation.missingTables?.length} missing tables</span>
                  )}
                  {setupValidation.configured && <span className="text-emerald-500"> · ready</span>}
                </div>
              )}
            </div>

            {setupChecking ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-[var(--pri)]" />
                <p className="mt-3 text-xs font-black uppercase tracking-wider text-[var(--muted)]">Preparing local setup database...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[var(--pri)]/10 p-2.5 text-[var(--pri)]"><UploadCloud className="h-5 w-5" /></div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">Add / upload local DB</h3>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--muted)]">
                        Use this for a workstation that received an exported Registration SQLite DB.
                      </p>
                    </div>
                  </div>
                  <Button type="button" onClick={handleImportLocalDatabase} disabled={localDbBusy} className="w-full h-11 gap-2 bg-[var(--pri)] text-[var(--primary-contrast)] font-black text-xs uppercase tracking-wider">
                    {localDbBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    Upload local DB and continue
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => setSharedPostgresIntent("connect")}
                  className={cn(
                    "rounded-2xl border p-5 text-left shadow-sm transition hover:bg-[var(--raised)]",
                    sharedPostgresIntent === "connect" ? "border-[var(--pri)] bg-[var(--pri)]/10" : "border-[var(--border)] bg-[var(--card)]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[var(--pri)]/10 p-2.5 text-[var(--pri)]"><Server className="h-5 w-5" /></div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">Connect existing shared DB</h3>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--muted)]">
                        Use this on another PC to connect to the Registration Postgres DB hosted on the first/server PC.
                      </p>
                    </div>
                  </div>
                  <span className="mt-4 inline-flex rounded-full border border-[var(--border)] bg-[var(--surf)] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--pri)]">
                    Recommended for workstation PCs
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSharedPostgresIntent("create")}
                  className={cn(
                    "rounded-2xl border p-5 text-left shadow-sm transition hover:bg-[var(--raised)]",
                    sharedPostgresIntent === "create" ? "border-[var(--pri)] bg-[var(--pri)]/10" : "border-[var(--border)] bg-[var(--card)]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[var(--pri)]/10 p-2.5 text-[var(--pri)]"><Database className="h-5 w-5" /></div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">Create shared Postgres DB</h3>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--muted)]">
                        Use this on the PC that will host the shared Registration database for the venue LAN.
                      </p>
                    </div>
                  </div>
                  <span className="mt-4 inline-flex rounded-full border border-[var(--border)] bg-[var(--surf)] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
                    Server / admin PC
                  </span>
                </button>

                <form onSubmit={handleSharedPostgresSetup} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4 lg:col-span-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[var(--pri)]/10 p-2.5 text-[var(--pri)]"><Server className="h-5 w-5" /></div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
                        {sharedPostgresIntent === "connect" ? "Existing shared Postgres connection" : "New shared Postgres setup"}
                      </h3>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--muted)]">
                        {sharedPostgresIntent === "connect"
                          ? "Enter the host/IP, database, and credentials from the PC already hosting Registration Postgres."
                          : "Creates the Registration Software shared DB after validating admin from local SQLite."}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input value={setupAdminUsername} onChange={(e) => setSetupAdminUsername(e.target.value)} placeholder="Local admin username" className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold" required />
                    <Input value={setupAdminPassword} onChange={(e) => setSetupAdminPassword(e.target.value)} placeholder="Local admin password" type="password" className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold" required />
                    <Input value={pgHost} onChange={(e) => setPgHost(e.target.value)} placeholder="Postgres host" className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold" required />
                    <Input value={pgPort} onChange={(e) => setPgPort(e.target.value)} placeholder="Port" inputMode="numeric" className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold" required />
                    <Input value={pgDatabase} onChange={(e) => setPgDatabase(e.target.value)} placeholder="Database name" className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold sm:col-span-2" required />
                    <Input value={pgUser} onChange={(e) => setPgUser(e.target.value)} placeholder="Postgres admin user" className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold" required />
                    <Input value={pgPassword} onChange={(e) => setPgPassword(e.target.value)} placeholder="Postgres admin password" type="password" className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold" required />
                  </div>

                  <Button type="submit" disabled={postgresBusy} className="w-full h-11 gap-2 bg-[var(--pri)] text-[var(--primary-contrast)] font-black text-xs uppercase tracking-wider">
                    {postgresBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                    {sharedPostgresIntent === "connect" ? "Connect shared Postgres and continue" : "Create shared Postgres and continue"}
                  </Button>
                </form>
              </div>
            )}
          </div>

          <div className="text-center text-[10px] text-[var(--muted)] font-mono">
            Existing login screen appears after Registration data setup
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen max-h-screen w-screen bg-[var(--base)] text-[var(--text)] font-sans overflow-hidden transition-colors">

      {/* Left Sidebar (Command Center Branding Area) */}
      <div className="hidden lg:flex lg:w-5/12 h-full flex-col justify-between bg-[var(--surf)] border-r border-[var(--border)] p-8 xl:p-10 relative overflow-hidden shrink-0">
        {/* Theme-Responsive 3D Isometric Registration Booth Background Art */}
        <div className="pointer-events-none absolute inset-0 -z-0 select-none overflow-hidden">
          <img
            key={theme}
            src={theme === "light" ? "/backgrounds/registration-booth-light.png" : "/backgrounds/registration-booth-dark.png"}
            alt={theme === "light" ? "Registration Booth Light" : "Registration Booth Dark"}
            className="absolute inset-0 size-full w-full h-full object-fill"
          />
        </div>

        <div className="relative z-10 space-y-5">
          {/* Metal Emblem Brand Header */}
          <div className="flex items-center gap-3 mb-2">
            <span className="grid size-11 shrink-0 place-items-center overflow-visible">
              <img
                src="/brand/eventos-emblem-metal.png"
                alt="Eventos Emblem"
                width={44}
                height={44}
                className="size-full scale-[2.05] object-contain drop-shadow-md"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </span>
            <div>
              <span className="text-xl font-black uppercase tracking-[0.25em] text-[var(--text)] block leading-none">
                EVENT<span className="text-[var(--acc)]">OS</span>
              </span>
              <span className="block text-[11px] font-bold tracking-widest text-[var(--pri)] mt-1 uppercase">
                Registration Software
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-2xl xl:text-3xl font-black text-[var(--text)] tracking-tight leading-tight drop-shadow-sm">
              Onsite Event Registration Software
            </h2>
            <p className="text-xs xl:text-sm text-[var(--muted)] font-medium mt-1.5 leading-relaxed">
              High-availability local edge server for delegate registration, badge printing, check-in, and data sync.
            </p>
          </div>

          <div className="space-y-3 pt-2.5 border-t border-[var(--border)]/70">
            <div className="flex gap-3.5 items-start bg-[var(--card)]/40 p-2.5 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)] flex items-center justify-center font-black shrink-0 shadow-md">
                <WifiOff className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-xs xl:text-sm text-[var(--text)] uppercase tracking-wider">100% Local/Offline Support</h3>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">Operates seamlessly without internet connection</p>
              </div>
            </div>

            <div className="flex gap-3.5 items-start bg-[var(--card)]/40 p-2.5 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-[var(--sec)] text-[var(--primary-contrast)] flex items-center justify-center font-black shrink-0 shadow-md">
                <ScanLine className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-xs xl:text-sm text-[var(--text)] uppercase tracking-wider">Live Camera & QR Scan Mode</h3>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">Delegate gatekeeper limits</p>
              </div>
            </div>

            <div className="flex gap-3.5 items-start bg-[var(--card)]/40 p-2.5 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-[var(--card)] border border-[var(--border)] text-[var(--text)] flex items-center justify-center font-black shrink-0 shadow-md">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-xs xl:text-sm text-[var(--text)] uppercase tracking-wider">3 Operator Modes + Admin</h3>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">Registration Desk • Gate Scanning • Self Check-in</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-[11px] text-[var(--muted)] pt-3 border-t border-[var(--border)]/70 font-mono">
          <span>© 2026 EVENTOS OS v1.0</span>
        </div>
      </div>

      {/* Right Login Area */}
      <div className="flex-1 h-full flex flex-col justify-between p-6 sm:p-8 xl:p-10 max-w-[750px] w-full mx-auto overflow-hidden">
        {/* Top Header Controls */}
        <div className="flex justify-end items-center gap-2.5 shrink-0">
          {desktopRuntime && (
            <button
              type="button"
              onClick={() => setDbModalOpen(true)}
              className="p-2 px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--raised)] transition-all cursor-pointer flex items-center gap-2 text-xs font-bold shadow-sm"
              title="Change or reset database configuration"
            >
              <Database className="w-4 h-4 text-[var(--pri)]" />
              <span>Database Settings</span>
            </button>
          )}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--raised)] transition-all cursor-pointer flex items-center gap-2 text-xs font-bold shadow-sm"
          >
            {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </button>
        </div>

        {/* Center Login Form */}
        <div className="w-full max-w-xl mx-auto space-y-5 my-auto">
          <div>
            <h2 className="text-2xl xl:text-3xl font-black tracking-tight text-[var(--text)]">Authenticate Terminal Access</h2>
            <p className="text-xs text-[var(--muted)] font-bold uppercase tracking-wider mt-1">
              Select operational terminal mode & sign in
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">

            {/* Mode Selection Cards */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">Operator Modes</label>
              {assignedNode && (
                <div className="rounded-xl border border-[var(--pri)]/25 bg-[var(--pri)]/10 px-3.5 py-2 text-xs font-bold text-[var(--text)]">
                  This workstation is provisioned for{" "}
                  <span className="font-black uppercase text-[var(--pri)]">{assignedNode.station_id || assignedNode.mode}</span>.
                  Only allowed modes are active on this PC.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {OPERATIONAL_MODES.map((item) => {
                  const Icon = item.icon;
                  const isSelected = selectedMode === item.id;
                  // TEST OVERRIDE: Allow all modes on login screen for testing
                  const isLockedOut = false;
                  // const isLockedOut = Boolean(assignedNode && !allowedModesForAssignment(assignedNode).includes(item.id));
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isLockedOut}
                      onClick={() => {
                        if (!isLockedOut) setSelectedMode(item.id);
                      }}
                      className={cn(
                        "group relative flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer text-center outline-none select-none",
                        isLockedOut
                          ? "cursor-not-allowed opacity-40 grayscale bg-[var(--surf)] border-dashed border-[var(--border)]"
                          : isSelected
                            ? "border-[var(--pri)] bg-[var(--raised)] shadow-md shadow-[var(--pri)]/5 ring-1 ring-[var(--pri)]/20"
                            : "border-[var(--border)] bg-[var(--card)] hover:border-[color-mix(in_srgb,var(--border)_50%,var(--pri))] hover:bg-[var(--raised)]/60"
                      )}
                    >
                      {/* Top-Right Selection Indicator Badge */}
                      <div
                        className={cn(
                          "absolute top-2 right-2 size-3.5 rounded-full flex items-center justify-center transition-all duration-200",
                          isLockedOut
                            ? "bg-red-500/10 text-red-400 border border-red-500/30"
                            : isSelected
                              ? "bg-[var(--pri)] text-[var(--primary-contrast)] scale-100 opacity-100"
                              : "border border-[var(--border)] group-hover:border-[var(--muted)] scale-90 opacity-60"
                        )}
                      >
                        {isLockedOut ? <Lock className="size-2 text-red-400" /> : isSelected && <Check className="size-2 stroke-[3.5]" />}
                      </div>

                      {/* Icon Container */}
                      <div
                        className={cn(
                          "size-8 rounded-lg flex items-center justify-center mb-1.5 transition-all duration-200",
                          isSelected && !isLockedOut
                            ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm"
                            : "bg-[var(--surf)] border border-[var(--border)] text-[var(--muted)] group-hover:text-[var(--text)] group-hover:border-[var(--pri)]/30"
                        )}
                      >
                        <Icon className="size-4" />
                      </div>

                      {/* Title & Description */}
                      <span
                        className={cn(
                          "font-black text-[11px] uppercase tracking-wider transition-colors",
                          isLockedOut ? "text-[var(--muted)] line-through" : isSelected ? "text-[var(--text)]" : "text-[var(--muted)] group-hover:text-[var(--text)]"
                        )}
                      >
                        {item.label}
                      </span>
                      <span
                        className={cn(
                          "text-[9px] mt-0.5 font-semibold leading-tight line-clamp-1 transition-colors",
                          isLockedOut
                            ? "text-red-400 font-bold"
                            : isSelected
                              ? "text-[var(--text)]/80"
                              : "text-[var(--muted)]/70 group-hover:text-[var(--muted)]"
                        )}
                      >
                        {isLockedOut ? "Not allowed on PC" : item.sublabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Input Credentials */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">Username or Email</label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username or Email"
                  required
                  className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl focus:ring-1 focus:ring-[var(--pri)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl focus:ring-1 focus:ring-[var(--pri)]"
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-[var(--primary-contrast)] font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Authenticating...
                </>
              ) : (
                <>
                  <span>Login to {selectedMode.toUpperCase()}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>

            <div className="border-t border-[var(--border)] pt-3 text-center">
              <button
                type="button"
                onClick={() => setAdminLoginOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-[11px] font-black uppercase tracking-wider text-[var(--text)] transition-colors hover:bg-[var(--raised)]"
              >
                <ShieldCheck className="size-3.5 text-[var(--pri)]" />
                Login as Admin Mode
              </button>
            </div>
          </form>
        </div>
      </div>

      {adminLoginOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleAdminLogin} className="w-full max-w-md rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-2xl bg-[var(--pri)] text-[var(--primary-contrast)]">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pri)]">Management console</p>
                  <h2 className="text-xl font-black text-[var(--text)]">Admin Mode Login</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAdminLoginOpen(false);
                  setAdminLoading(false);
                }}
                className="grid size-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-[var(--text)]"
                aria-label="Close admin login"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">Admin username or email</label>
                <Input
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="admin"
                  className="h-12 rounded-xl bg-[var(--surf)] text-sm font-bold"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">Admin password</label>
                <Input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="h-12 rounded-xl bg-[var(--surf)] text-sm font-bold"
                  required
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[var(--border)] pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAdminLoginOpen(false);
                  setAdminLoading(false);
                }}
                className="h-11 px-5 text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={adminLoading}
                className="h-11 bg-[var(--pri)] px-6 text-xs font-black text-[var(--primary-contrast)]"
              >
                {adminLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Authenticating
                  </>
                ) : (
                  "Login as Admin"
                )}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Database Settings & Reset Modal */}
      {dbModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-2xl bg-[var(--pri)] text-[var(--primary-contrast)]">
                  <Database className="size-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pri)]">Configuration Manager</p>
                  <h2 className="text-xl font-black text-[var(--text)]">Database Settings & Reset</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDbModalOpen(false);
                  setConfirmResetOpen(false);
                }}
                className="grid size-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                aria-label="Close database settings"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Current Active DB Status */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--muted)]">Active DB Mode:</span>
                  <span className="font-black uppercase text-[var(--pri)]">
                    {setupValidation?.mode === "shared_postgres" ? "Shared PostgreSQL" : setupValidation?.mode === "uploaded_local_db" ? "Local SQLite" : "Provisioned"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--muted)]">Connection Status:</span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-emerald-500">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    Ready & Configured
                  </span>
                </div>
                {setupValidation?.tableCount !== undefined && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--muted)]">Verified Contract Tables:</span>
                    <span className="font-bold text-[var(--text)]">{setupValidation.tableCount} tables checked</span>
                  </div>
                )}
              </div>

              {!confirmResetOpen ? (
                <div className="space-y-3 pt-2">
                  <Button
                    type="button"
                    onClick={() => {
                      setDbModalOpen(false);
                      setSetupComplete(false);
                    }}
                    className="w-full h-12 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-[var(--primary-contrast)] font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Settings className="size-4" />
                    <span>Change Database Connection / Source</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmResetOpen(true)}
                    className="w-full h-12 border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="size-4" />
                    <span>Reset Database Configuration</span>
                  </Button>
                </div>
              ) : (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-start gap-3 text-red-400">
                    <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-black text-xs uppercase tracking-wider text-red-400">Confirm Database Reset</h4>
                      <p className="text-xs text-red-300/90 mt-1 leading-relaxed">
                        This will purge the stored database connection settings, saved secrets, and setup markers. The application will return to first-time setup mode.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmResetOpen(false)}
                      disabled={resettingDb}
                      className="h-10 px-4 text-xs font-bold rounded-xl"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleResetDatabase}
                      disabled={resettingDb}
                      className="h-10 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer"
                    >
                      {resettingDb ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Resetting...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="size-3.5" />
                          Confirm & Reset DB
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-[var(--border)] pt-3 text-center text-[10px] text-[var(--muted)] font-mono">
              EventOS Registration Database Controller
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
