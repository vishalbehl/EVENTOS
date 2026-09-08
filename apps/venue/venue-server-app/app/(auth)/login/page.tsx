"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Loader2,
  WifiOff, Settings, Sun, Moon, Database, UploadCloud, Server, Check, RotateCcw, AlertTriangle, X, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { toast } from "sonner";

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
  const { setAuth, initializeFromStorage } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [localDbStatus, setLocalDbStatus] = useState<{ exists: boolean; path: string; sizeBytes: number; updatedAt?: number; adminUsername?: string } | null>(null);
  const [localDbBusy, setLocalDbBusy] = useState(false);
  const [setupChecking, setSetupChecking] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);
  const [desktopRuntime, setDesktopRuntime] = useState(false);
  const [setupReason, setSetupReason] = useState("");
  const [setupValidation, setSetupValidation] = useState<SetupValidation | null>(null);
  const [postgresBusy, setPostgresBusy] = useState(false);
  const [setupAdminUsername, setSetupAdminUsername] = useState("admin@eventos.com");
  const [setupAdminPassword, setSetupAdminPassword] = useState("admin123");
  const [pgHost, setPgHost] = useState("127.0.0.1");
  const [pgPort, setPgPort] = useState("5433");
  const [pgDatabase, setPgDatabase] = useState(() => {
    if (typeof window === "undefined") return "venue_db";
    const stored = localStorage.getItem("eventos_venue_db_name");
    return !stored || stored === "eventos_venue_server" ? "venue_db" : stored;
  });
  const [pgUser, setPgUser] = useState("postgres");
  const [pgPassword, setPgPassword] = useState("venue_password");
  const [sharedPostgresIntent, setSharedPostgresIntent] = useState<"connect" | "create">("connect");
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [resettingDb, setResettingDb] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const handleResetDatabase = async () => {
    setResettingDb(true);
    try {
      // @ts-ignore
      if (window.venueDesktop?.resetVenueDatabase) {
        // @ts-ignore
        await window.venueDesktop.resetVenueDatabase();
      }
      localStorage.removeItem("eventos_venue_db_name");
      setSetupComplete(false);
      setSetupReason("Venue database configuration was reset.");
      setDbModalOpen(false);
      setConfirmResetOpen(false);
      toast.success("Venue database configuration reset successfully.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to reset venue database.");
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
    // @ts-ignore
    const desktopApi = window.venueDesktop;
    const isDesktopRuntime = Boolean(desktopApi);
    setDesktopRuntime(isDesktopRuntime);

    initializeFromStorage();
    const token = localStorage.getItem("venue_session_active");
    if (token) {
      router.replace("/dashboard");
      return;
    }

    const checkDbAndSetup = async () => {
      setSetupChecking(true);
      try {
        let dbConfigured = true;
        if (desktopApi?.getVenueSetupStatus) {
          try {
            const status = await desktopApi.getVenueSetupStatus();
            if (status?.database) {
              setPgDatabase(status.database);
              localStorage.setItem("eventos_venue_db_name", status.database);
            }
            if (status?.host) setPgHost(status.host);
            if (status?.port) setPgPort(String(status.port));
            if (status?.user) setPgUser(status.user);
            if (status?.configured === false) {
              dbConfigured = false;
            }
          } catch {
            // ignore
          }
        }

        if (!dbConfigured) {
          setSetupComplete(false);
          setSetupReason("Venue database configuration required.");
          setSetupChecking(false);
          return;
        }

        // Check backend database health
        try {
          const setupRes = await apiClient.get<any>("/setup/status");
          if (setupRes?.database_ready && !setupRes?.setup_required) {
            setSetupComplete(true);
          } else if (setupRes?.database_ready && setupRes?.setup_required) {
            setSetupComplete(false);
            setSetupReason("Administrator setup required.");
          } else {
            setSetupComplete(false);
            setSetupReason("Venue database is unavailable or not initialized.");
          }
        } catch (err: any) {
          // A failed status probe is not proof that the database exists. Do
          // not show the login form until the authoritative setup endpoint
          // confirms both connectivity and an initialized administrator.
          setSetupComplete(false);
          setSetupReason(err?.message || "Venue database is offline or not created.");
        }
      } finally {
        setSetupChecking(false);
      }
    };

    checkDbAndSetup();
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
    const cleanIdentifier = username.trim();
    if (!cleanIdentifier || !password) {
      toast.error("Credentials required.");
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post<any>("/auth/login", {
        username: cleanIdentifier,
        email: cleanIdentifier,
        password: password,
        mode: "admin",
      });

      setAuth(
        {
          id: response.user.id,
          username: response.user.username || response.user.email,
          email: response.user.email,
          name: response.user.full_name,
          role: response.user.role,
          full_name: response.user?.full_name,
        },
        "cookie-session"
      );

      sessionStorage.setItem("session_active", "true");
      toast.success("Venue Master Server Authenticated");
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 350);
    } catch (error: any) {
      toast.error(error.message || "Invalid credentials");
      setLoading(false);
    }
  };

  const handleImportLocalDatabase = async () => {
    // @ts-ignore
    if (!window.venueDesktop) {
      toast.error("Local DB import is available only inside the desktop app.");
      return;
    }
    setLocalDbBusy(true);
    try {
      // @ts-ignore
      const status = await window.venueDesktop.importLocalDatabase();
      if (!status.canceled) {
        setLocalDbStatus(status);
        setSetupComplete(true);
        toast.success("Local database imported. Venue server can now run from the uploaded SQLite DB.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to import local database.");
    } finally {
      setLocalDbBusy(false);
    }
  };

  const handleSharedPostgresSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    // @ts-ignore
    if (!window.venueDesktop) {
      toast.error("Shared Postgres setup is available only inside the desktop app.");
      return;
    }
    setPostgresBusy(true);
    try {
      // @ts-ignore
      await window.venueDesktop.setupVenueDatabases({
        local_admin_username: setupAdminUsername,
        local_admin_password: setupAdminPassword,
        host: pgHost,
        port: Number(pgPort),
        database: pgDatabase,
        user: pgUser,
        password: pgPassword
      });
      toast.success("Venue Master Database configured!");
      localStorage.setItem("eventos_venue_db_name", pgDatabase);
      setUsername(setupAdminUsername);
      setPassword(setupAdminPassword);
      setSetupComplete(true);
      setSetupChecking(false);

      setTimeout(async () => {
        try {
          const res = await apiClient.post<any>("/auth/login", {
            email: setupAdminUsername,
            username: setupAdminUsername,
            password: setupAdminPassword,
            mode: "admin"
          });
          if (res?.user) {
            setAuth(
              {
                id: res.user.id,
                username: res.user.username || res.user.email,
                email: res.user.email,
                name: res.user.full_name,
                role: res.user.role,
                full_name: res.user?.full_name,
              },
              "cookie-session"
            );
          }
          localStorage.setItem("venue_session_active", "true");
          sessionStorage.setItem("session_active", "true");
          window.location.href = "/dashboard";
        } catch (err) {
          toast.info("Database configured. Please log in with your admin credentials.");
        }
      }, 1000);
    } catch (error: any) {
      toast.error(error?.message || "Failed to configure Venue Master Postgres.");
    } finally {
      setPostgresBusy(false);
    }
  };

  // Setup View (Fixed Non-scrolling Viewport)
  if (desktopRuntime && (setupChecking || !setupComplete)) {
    return (
      <div className="flex h-screen max-h-screen w-screen bg-[var(--base)] text-[var(--text)] font-sans overflow-hidden transition-colors">
        {/* Left Branding Area */}
        <div className="hidden lg:flex lg:w-5/12 h-full flex-col justify-between bg-[var(--surf)] border-r border-[var(--border)] p-8 xl:p-10 relative overflow-hidden shrink-0">
          {/* Theme-Responsive 3D Isometric Venue Master Server Background Art */}
          <div className="pointer-events-none absolute inset-0 -z-0 select-none overflow-hidden">
            <img
              key={theme}
              src={theme === "light" ? "/backgrounds/venue-server-light.png" : "/backgrounds/venue-server-dark.png"}
              alt={theme === "light" ? "Venue Master Server Light" : "Venue Master Server Dark"}
              className="absolute inset-0 size-full w-full h-full object-fill"
            />
          </div>

          <div className="relative z-10 space-y-5">
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
                  Venue Master Server
                </span>
              </div>
            </div>

            <div>
              <h2 className="text-2xl xl:text-3xl font-black text-[var(--text)] tracking-tight leading-tight drop-shadow-sm">
                Venue Master Database Setup
              </h2>
              <p className="text-xs xl:text-sm text-[var(--muted)] font-medium mt-1.5 leading-relaxed">
                Configure the local PostgreSQL server and fallback SQLite engine to host the venue master database.
              </p>
            </div>

            <div className="space-y-3 pt-2.5 border-t border-[var(--border)]/70">
              <div className="flex gap-3.5 items-start bg-[var(--card)]/40 p-2.5 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)] flex items-center justify-center font-black shrink-0 shadow-md">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-xs xl:text-sm text-[var(--text)] uppercase tracking-wider">High-Speed PostgreSQL</h3>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">Primary high-concurrency database for presentation & SRR workflows</p>
                </div>
              </div>

              <div className="flex gap-3.5 items-start bg-[var(--card)]/40 p-2.5 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-[var(--sec)] text-[var(--primary-contrast)] flex items-center justify-center font-black shrink-0 shadow-md">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-xs xl:text-sm text-[var(--text)] uppercase tracking-wider">Local SQLite Backup</h3>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">Automated offline replication for catastrophic network resilience</p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between text-[11px] text-[var(--muted)] pt-3 border-t border-[var(--border)]/70 font-mono">
            <span>© 2026 EVENTOS OS v1.0</span>
          </div>
        </div>

        {/* Right Setup Form Area */}
        <div className="flex-1 h-full flex flex-col justify-between p-6 sm:p-8 xl:p-10 max-w-[860px] w-full mx-auto overflow-hidden">
          <div className="flex justify-end items-center gap-3 shrink-0">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--raised)] transition-all cursor-pointer flex items-center gap-2 text-xs font-bold"
            >
              {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            </button>
          </div>

          <div className="w-full max-w-2xl mx-auto space-y-4 my-auto">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-[var(--text)]">Configure Venue Database</h2>
              <p className="text-xs text-[var(--muted)] font-bold uppercase tracking-wider mt-1">
                Select connection mode or import a prepared database package
              </p>
              {setupReason && (
                <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-bold text-amber-500">
                  {setupReason}
                </p>
              )}
            </div>

            {setupChecking ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-[var(--pri)]" />
                <p className="mt-3 text-xs font-black uppercase tracking-wider text-[var(--muted)]">Checking database connectivity...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSharedPostgresIntent("connect")}
                    className={cn(
                      "rounded-xl border p-3.5 text-left transition-all",
                      sharedPostgresIntent === "connect"
                        ? "border-[var(--pri)] bg-[var(--raised)] ring-1 ring-[var(--pri)]/20"
                        : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--raised)]/60"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg bg-[var(--pri)]/10 p-2 text-[var(--pri)]"><Server className="h-4 w-4" /></div>
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Connect Existing</h3>
                        <p className="text-[10px] text-[var(--muted)] mt-0.5">PostgreSQL instance</p>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSharedPostgresIntent("create")}
                    className={cn(
                      "rounded-xl border p-3.5 text-left transition-all",
                      sharedPostgresIntent === "create"
                        ? "border-[var(--pri)] bg-[var(--raised)] ring-1 ring-[var(--pri)]/20"
                        : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--raised)]/60"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg bg-[var(--pri)]/10 p-2 text-[var(--pri)]"><Database className="h-4 w-4" /></div>
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Create / Init DB</h3>
                        <p className="text-[10px] text-[var(--muted)] mt-0.5">Provision fresh schemas</p>
                      </div>
                    </div>
                  </button>
                </div>

                <form onSubmit={handleSharedPostgresSetup} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <Input
                      value={setupAdminUsername}
                      onChange={(e) => setSetupAdminUsername(e.target.value)}
                      placeholder="Admin username"
                      className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl"
                      required
                    />
                    <Input
                      value={setupAdminPassword}
                      onChange={(e) => setSetupAdminPassword(e.target.value)}
                      placeholder="Admin password"
                      type="password"
                      className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl"
                      required
                    />
                    <Input
                      value={pgHost}
                      onChange={(e) => setPgHost(e.target.value)}
                      placeholder="Host (127.0.0.1)"
                      className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl"
                      required
                    />
                    <Input
                      value={pgPort}
                      onChange={(e) => setPgPort(e.target.value)}
                      placeholder="Port (5433 for Venue Docker)"
                      inputMode="numeric"
                      className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl"
                      required
                    />
                    <Input
                      value={pgDatabase}
                      onChange={(e) => setPgDatabase(e.target.value)}
                      placeholder="Database name"
                      className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl col-span-2"
                      required
                    />
                    <Input
                      value={pgUser}
                      onChange={(e) => setPgUser(e.target.value)}
                      placeholder="Postgres user"
                      className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl"
                      required
                    />
                    <Input
                      value={pgPassword}
                      onChange={(e) => setPgPassword(e.target.value)}
                      placeholder="Postgres password"
                      type="password"
                      className="h-10 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={postgresBusy}
                    className="w-full h-10 gap-2 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-[var(--primary-contrast)] font-black text-xs uppercase tracking-wider rounded-xl shadow-md"
                  >
                    {postgresBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                    {sharedPostgresIntent === "connect" ? "Connect Database & Continue" : "Provision Database & Continue"}
                  </Button>
                </form>

                <div className="flex items-center justify-between pt-1 text-[11px] text-[var(--muted)]">
                  <span>Need to import an offline SQLite backup?</span>
                  <button
                    type="button"
                    onClick={handleImportLocalDatabase}
                    disabled={localDbBusy}
                    className="font-bold text-[var(--pri)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    Upload SQLite DB
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="text-center text-[10px] text-[var(--muted)] font-mono shrink-0">
            Venue Server Database Initialization
          </div>
        </div>
      </div>
    );
  }

  // Main Fixed Split Login Screen
  return (
    <div className="flex h-screen max-h-screen w-screen bg-[var(--base)] text-[var(--text)] font-sans overflow-hidden transition-colors">
      {/* Left Sidebar (Branding & Value Props) */}
      <div className="hidden lg:flex lg:w-5/12 h-full flex-col justify-between bg-[var(--surf)] border-r border-[var(--border)] p-8 xl:p-10 relative overflow-hidden shrink-0">
        {/* Theme-Responsive 3D Isometric Venue Master Server Background Art */}
        <div className="pointer-events-none absolute inset-0 -z-0 select-none overflow-hidden">
          <img
            key={theme}
            src={theme === "light" ? "/backgrounds/venue-server-light.png" : "/backgrounds/venue-server-dark.png"}
            alt={theme === "light" ? "Venue Master Server Light" : "Venue Master Server Dark"}
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
                Venue Master Server
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-2xl xl:text-3xl font-black text-[var(--text)] tracking-tight leading-tight drop-shadow-sm">
              Onsite Venue Server Console
            </h2>
            <p className="text-xs xl:text-sm text-[var(--muted)] font-medium mt-1.5 leading-relaxed">
              High-availability local edge master node for Speaker Ready Room, Presentation Management, Display Broadcasts, and Cloud Synchronization.
            </p>
          </div>

          <div className="space-y-3 pt-2.5 border-t border-[var(--border)]/70">
            <div className="flex gap-3.5 items-start bg-[var(--card)]/40 p-2.5 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)] flex items-center justify-center font-black shrink-0 shadow-md">
                <WifiOff className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-xs xl:text-sm text-[var(--text)] uppercase tracking-wider">100% Local/Offline Support</h3>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">Operates seamlessly without active internet connection</p>
              </div>
            </div>

            <div className="flex gap-3.5 items-start bg-[var(--card)]/40 p-2.5 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-[var(--sec)] text-[var(--primary-contrast)] flex items-center justify-center font-black shrink-0 shadow-md">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-xs xl:text-sm text-[var(--text)] uppercase tracking-wider">Central Venue Management</h3>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">Real-time SRR workstations and room display control</p>
              </div>
            </div>

            <div className="flex gap-3.5 items-start bg-[var(--card)]/40 p-2.5 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-[var(--card)] border border-[var(--border)] text-[var(--text)] flex items-center justify-center font-black shrink-0 shadow-md">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-xs xl:text-sm text-[var(--text)] uppercase tracking-wider">Cloud API Synchronization</h3>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">Instant upstream/downstream queue & asset sync</p>
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
            className="p-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--raised)] transition-all cursor-pointer flex items-center gap-2 text-xs font-bold"
          >
            {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </button>
        </div>

        {/* Center Login Form */}
        <div className="w-full max-w-xl mx-auto space-y-5 my-auto">
          <div>
            <h2 className="text-2xl xl:text-3xl font-black tracking-tight text-[var(--text)]">Authenticate Console Access</h2>
            <p className="text-xs text-[var(--muted)] font-bold uppercase tracking-wider mt-1">
              Sign in to Venue Master Server
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Input Credentials */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">Admin Username or Email</label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl focus:ring-1 focus:ring-[var(--pri)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">Admin Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl focus:ring-1 focus:ring-[var(--pri)]"
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-[var(--primary-contrast)] font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-2 mt-4 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Authenticating...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Login to Venue Console</span>
                </>
              )}
            </Button>
          </form>
        </div>

        <div className="text-center text-[10px] text-[var(--muted)] font-mono shrink-0">
          Venue Master Node Security Gateway
        </div>
      </div>

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
                  <span className="font-black uppercase text-[var(--pri)]">Venue Master PostgreSQL</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--muted)]">Connection Status:</span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-emerald-500">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    Ready & Configured
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--muted)]">Database Name:</span>
                  <span className="font-bold text-[var(--text)]">{pgDatabase}</span>
                </div>
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
                    <span>Change Database Connection</span>
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
                      <h4 className="font-black text-xs uppercase tracking-wider text-red-400">Confirm Venue DB Reset</h4>
                      <p className="text-xs text-red-300/90 mt-1 leading-relaxed">
                        This will clear the Venue Server database URL and local SQLite backup pointer. The application will return to the database initialization screen.
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
              EventOS Venue Server Database Controller
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
