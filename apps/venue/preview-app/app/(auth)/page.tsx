"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Monitor,
  ScanLine,
  ShieldCheck,
  WifiOff,
  Settings,
  ArrowRight,
  Sun,
  Moon,
  Database,
  UploadCloud,
  Download,
  FolderOpen,
  Check,
  X,
  Loader2,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuthStore, type AppMode } from "@/store/use-auth-store";
import { useTheme } from "@/hooks/useTheme";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface OperatorModeOption {
  id: AppMode;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

// 2 Primary Operator Terminal Modes (Admin Mode is accessed exclusively via the dedicated console login below)
const OPERATIONAL_MODES: OperatorModeOption[] = [
  {
    id: "workstation",
    label: "Workstation Mode",
    sublabel: "Speaker slide staging & preview kiosk",
    icon: Monitor,
  },
  {
    id: "scanning",
    label: "Gate Scanning Mode",
    sublabel: "Entrance intake QR & auto-assign station",
    icon: ScanLine,
  },
];

const routeForMode = (mode: AppMode) => {
  if (mode === "admin") return "/admin";
  if (mode === "scanning") return "/scanning";
  return "/workstation";
};

export default function LoginPage() {
  const router = useRouter();
  const { setMode, mode, setAuth } = useAuthStore();
  const { theme, setTheme } = useTheme();

  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedMode, setSelectedMode] = useState<AppMode>("workstation");

  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [localDbBusy, setLocalDbBusy] = useState(false);
  const [resettingDb, setResettingDb] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [localDbStatus, setLocalDbStatus] = useState<{
    exists: boolean;
    path: string;
    sizeBytes: number;
    updatedAt?: number;
    tablesCount?: number;
    isValidSqlite?: boolean;
    validationMessage?: string;
  }>({
    exists: false,
    path: "",
    sizeBytes: 0,
  });

  // Admin Direct Login Modal State
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    if (mode && (mode === "workstation" || mode === "scanning")) {
      setSelectedMode(mode);
    }

    if (typeof window !== "undefined" && (window as any).srrDesktop?.getLocalDatabaseStatus) {
      (window as any).srrDesktop.getLocalDatabaseStatus().then((status: any) => {
        if (status) setLocalDbStatus(status);
      }).catch(() => { });
    }
  }, [mode]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  };

  const normalizeUser = (user: any) => ({
    id: String(user.id),
    username: user.username,
    name: user.full_name || user.name || user.username,
    role: user.role,
    allowed_modes: user.allowed_modes || ["workstation", "scanning", "admin"],
  });

  const navigateToMode = async (targetMode: AppMode) => {
    if (!username || !password) {
      toast.error("Venue Server username and password are required.");
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.post<{ authenticated: boolean; user: any }>("/api/v1/auth/login", {
        username,
        password,
        mode: targetMode,
      });
      setMode(targetMode);
      setAuth(normalizeUser(response.user));
      const targetRoute = routeForMode(targetMode);
      toast.success(`Launching ${targetMode.toUpperCase()} Mode...`);
      router.push(targetRoute);
      if (typeof window !== "undefined") {
        window.location.assign(targetRoute);
      }
    } catch (err: any) {
      toast.error(err.message || "Venue Server login failed.");
    } finally {
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
      const response = await apiClient.post<{ authenticated: boolean; user: any }>("/api/v1/auth/login", {
        username: adminUsername,
        password: adminPassword,
        mode: "admin",
      });
      setMode("admin");
      setAuth(normalizeUser(response.user));
      toast.success("Authenticated as Admin Mode.");
      setAdminLoginOpen(false);
      router.push("/admin");
      if (typeof window !== "undefined") {
        window.location.assign("/admin");
      }
    } catch (err: any) {
      toast.error(err.message || "Admin login failed.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleImportLocalDatabase = async () => {
    if (typeof window !== "undefined" && (window as any).srrDesktop?.importLocalDatabase) {
      setLocalDbBusy(true);
      try {
        const status = await (window as any).srrDesktop.importLocalDatabase();
        if (!status.canceled) {
          setLocalDbStatus(status);
          toast.success("Local SQLite database imported successfully!");
        }
      } catch (err: any) {
        toast.error(`Import failed: ${err.message}`);
      } finally {
        setLocalDbBusy(false);
      }
    } else {
      toast.error("Database import is available only in the Electron app.");
    }
  };

  const handleSyncLocalDatabase = async () => {
    if (typeof window !== "undefined" && (window as any).srrDesktop?.syncLocalDatabaseFromServer) {
      setLocalDbBusy(true);
      try {
        const status = await (window as any).srrDesktop.syncLocalDatabaseFromServer();
        if (status?.error) throw new Error(status.error);
        setLocalDbStatus(status);
        toast.success("SRR SQLite replica synced from Venue Server.");
      } catch (err: any) {
        toast.error(`Sync failed: ${err.message}`);
      } finally {
        setLocalDbBusy(false);
      }
    } else {
      toast.error("Venue Server replica sync is available only in the Electron app.");
    }
  };

  const handleExportDatabase = async () => {
    if (typeof window !== "undefined" && (window as any).srrDesktop?.exportLocalDatabase) {
      try {
        const status = await (window as any).srrDesktop.exportLocalDatabase();
        if (!status.canceled) {
          toast.success("Database snapshot downloaded successfully!");
        }
      } catch (err: any) {
        toast.error(`Export failed: ${err.message}`);
      }
    } else {
      toast.error("Database export is available only in the Electron app.");
    }
  };

  const handleOpenDbFolder = () => {
    if (typeof window !== "undefined" && (window as any).srrDesktop?.openDatabaseFolder) {
      (window as any).srrDesktop.openDatabaseFolder();
    } else {
      toast.error("Database folder is available only in the Electron app.");
    }
  };

  const handleResetDatabase = async () => {
    setResettingDb(true);
    try {
      if (typeof window === "undefined" || !(window as any).srrDesktop?.resetDatabase) {
        throw new Error("Database reset is available only in the Electron app.");
      }
      const status = await (window as any).srrDesktop.resetDatabase();
      if (!status?.success) throw new Error(status?.error || "Database reset failed.");
      setLocalDbStatus(status);
      setDbModalOpen(false);
      setConfirmResetOpen(false);
      toast.success("SRR Local database replica reset successfully.");
    } catch (err: any) {
      toast.error(`Reset failed: ${err.message}`);
    } finally {
      setResettingDb(false);
    }
  };

  return (
    <div className="flex h-screen max-h-screen w-screen bg-[var(--base)] text-[var(--text)] font-sans overflow-hidden transition-colors">
      {/* Left Fixed Branding Sidebar (Exact Registration UI 1:1) */}
      <div className="hidden lg:flex lg:w-5/12 h-full flex-col justify-between bg-[var(--surf)] border-r border-[var(--border)] p-8 xl:p-10 relative overflow-hidden shrink-0">
        {/* Theme-Responsive 3D Isometric Speaker Ready Room Background Art */}
        <div className="pointer-events-none absolute inset-0 -z-0 select-none overflow-hidden">
          <img
            key={theme}
            src={theme === "light" ? "/backgrounds/srr-room-light.png" : "/backgrounds/srr-room-dark.png"}
            alt={theme === "light" ? "Speaker Ready Room Light" : "Speaker Ready Room Dark"}
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
                Speaker Ready Room
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-2xl xl:text-3xl font-black text-[var(--text)] tracking-tight leading-tight drop-shadow-sm">
              Onsite Speaker Ready Room Software
            </h2>
            <p className="text-xs xl:text-sm text-[var(--muted)] font-medium mt-1.5 leading-relaxed">
              High-availability presentation staging, native PowerPoint launcher, preview studio, and real-time LAN distribution.
            </p>
          </div>

          <div className="space-y-3 pt-2.5 border-t border-[var(--border)]/70">
            <div className="flex gap-3.5 items-start bg-[var(--card)]/40 p-2.5 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)] flex items-center justify-center font-black shrink-0 shadow-md">
                <WifiOff className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-xs xl:text-sm text-[var(--text)] uppercase tracking-wider">
                  100% Local/Offline Support
                </h3>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">
                  Operates seamlessly without internet connection using local SQLite edge replicas.
                </p>
              </div>
            </div>

            <div className="flex gap-3.5 items-start bg-[var(--card)]/40 p-2.5 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-[var(--sec)] text-[var(--primary-contrast)] flex items-center justify-center font-black shrink-0 shadow-md">
                <ScanLine className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-xs xl:text-sm text-[var(--text)] uppercase tracking-wider">
                  Multi-Station Auto-Allocation
                </h3>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">
                  Entrance QR check-in assigns speakers to the lowest free workstation.
                </p>
              </div>
            </div>

            <div className="flex gap-3.5 items-start bg-[var(--card)]/40 p-2.5 rounded-2xl border border-[var(--border)]/40 backdrop-blur-sm shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-[var(--card)] border border-[var(--border)] text-[var(--text)] flex items-center justify-center font-black shrink-0 shadow-md">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-xs xl:text-sm text-[var(--text)] uppercase tracking-wider">
                  Admin Fleet Controls
                </h3>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">
                  Manage device assignments, file sync, and station health.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Left Bottom Footer */}
        <div className="relative z-10 flex items-center justify-between text-[11px] text-[var(--muted)] pt-3 border-t border-[var(--border)]/70 font-mono">
          <span>© 2026 EVENTOS OS v1.0</span>
        </div>
      </div>

      {/* Right Login Area */}
      <div className="flex-1 h-full flex flex-col justify-between p-6 sm:p-8 xl:p-10 max-w-[750px] w-full mx-auto overflow-hidden">
        {/* Top Header Controls */}
        <div className="flex justify-end items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setDbModalOpen(true)}
            className="p-2 px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--raised)] transition-all cursor-pointer flex items-center gap-2 text-xs font-bold shadow-sm"
            title="Database Configuration & Settings"
          >
            <Database className="w-4 h-4 text-[var(--pri)]" />
            <span>Database Settings</span>
          </button>

          <button
            type="button"
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
            <h2 className="text-2xl xl:text-3xl font-black tracking-tight text-[var(--text)]">
              Authenticate Terminal Access
            </h2>
            <p className="text-xs text-[var(--muted)] font-bold uppercase tracking-wider mt-1">
              Select operational terminal mode & sign in
            </p>
          </div>

          <div className="space-y-4">
            {/* 2 Operator Modes Grid (Workstation & Gate Scanning) */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                Operator Terminal Modes
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {OPERATIONAL_MODES.map((item) => {
                  const Icon = item.icon;
                  const isSelected = selectedMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedMode(item.id);
                        setMode(item.id);
                      }}
                      onDoubleClick={() => navigateToMode(item.id)}
                      className={cn(
                        "group relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer text-center outline-none",
                        isSelected
                          ? "border-[var(--pri)] bg-[var(--raised)] shadow-md shadow-[var(--pri)]/5 ring-1 ring-[var(--pri)]/20"
                          : "border-[var(--border)] bg-[var(--card)] hover:border-[color-mix(in_srgb,var(--border)_50%,var(--pri))] hover:bg-[var(--raised)]/60"
                      )}
                    >
                      {/* Top-Right Selection Indicator Badge */}
                      <div
                        className={cn(
                          "absolute top-2.5 right-2.5 size-4 rounded-full flex items-center justify-center transition-all duration-200",
                          isSelected
                            ? "bg-[var(--pri)] text-[var(--primary-contrast)] scale-100 opacity-100"
                            : "border border-[var(--border)] group-hover:border-[var(--muted)] scale-90 opacity-60"
                        )}
                      >
                        {isSelected && <Check className="size-2.5 stroke-[3.5]" />}
                      </div>

                      {/* Icon Container */}
                      <div
                        className={cn(
                          "size-10 rounded-xl flex items-center justify-center mb-2 transition-all duration-200",
                          isSelected
                            ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm"
                            : "bg-[var(--surf)] border border-[var(--border)] text-[var(--muted)] group-hover:text-[var(--text)] group-hover:border-[var(--pri)]/30"
                        )}
                      >
                        <Icon className="size-5" />
                      </div>

                      {/* Title & Description */}
                      <span
                        className={cn(
                          "font-black text-xs uppercase tracking-wider transition-colors",
                          isSelected ? "text-[var(--text)]" : "text-[var(--muted)] group-hover:text-[var(--text)]"
                        )}
                      >
                        {item.label}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] mt-1 font-semibold leading-tight line-clamp-1 transition-colors",
                          isSelected ? "text-[var(--text)]/80" : "text-[var(--muted)]/70 group-hover:text-[var(--muted)]"
                        )}
                      >
                        {item.sublabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Input Credentials */}
            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">
                  Username or Email
                </label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username or email"
                  className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl focus:ring-1 focus:ring-[var(--pri)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 bg-[var(--surf)] border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl focus:ring-1 focus:ring-[var(--pri)]"
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="button"
              disabled={loading}
              onClick={() => navigateToMode(selectedMode)}
              className="w-full h-11 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-[var(--primary-contrast)] font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Authenticating...
                </>
              ) : (
                <>
                  <span>
                    Login to {selectedMode === "workstation" ? "Workstation Mode" : "Gate Scanning Mode"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>

            {/* Dedicated Admin Login Button */}
            <div className="border-t border-[var(--border)] pt-3 text-center">
              <button
                type="button"
                onClick={() => setAdminLoginOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--text)] transition-colors hover:bg-[var(--raised)] cursor-pointer shadow-xs"
              >
                <ShieldCheck className="size-3.5 text-[var(--pri)]" />
                Login as Admin Mode
              </button>
            </div>
          </div>
        </div>

        <div className="text-center text-[10px] text-[var(--muted)] font-mono shrink-0">
          EVENTOS Venue Platform • Connected to Local Host
        </div>
      </div>

      {/* Database Management Modal */}
      <Dialog open={dbModalOpen} onOpenChange={setDbModalOpen}>
        <DialogContent className="max-w-lg p-6 space-y-5 bg-[var(--card)] border-[var(--border)] text-[var(--text)] rounded-3xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)]">
                <Database className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--text)]">Local Edge Database Configuration</h3>
                <p className="text-xs text-[var(--muted)]">Manage local SQLite replica for 100% offline resilience.</p>
              </div>
            </div>
            <button
              onClick={() => setDbModalOpen(false)}
              className="p-1 rounded-lg hover:bg-[var(--raised)] text-[var(--muted)] cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-3.5">
            {/* Status Card */}
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surf)] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--muted)] font-bold">Replica Mode:</span>
                <span className={cn("font-black uppercase", localDbStatus.exists ? "text-emerald-400" : "text-amber-400")}>
                  {localDbStatus.exists ? "SQLite replica verified" : "No valid local replica"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)] font-bold">Database Path:</span>
                <span className="font-bold text-[var(--text)] truncate max-w-[200px]">{localDbStatus.path || "Electron database path unavailable"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)] font-bold">Database Size:</span>
                <span className="font-bold text-[var(--text)]">{(localDbStatus.sizeBytes / 1024).toFixed(1)} KB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)] font-bold">Validation:</span>
                <span className={cn("font-bold", localDbStatus.isValidSqlite ? "text-emerald-400" : "text-amber-400")}>
                  {localDbStatus.validationMessage || "Not checked"}
                </span>
              </div>
            </div>

            {!confirmResetOpen ? (
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    onClick={handleSyncLocalDatabase}
                    disabled={localDbBusy}
                    className="col-span-2 h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider gap-2 rounded-xl cursor-pointer"
                  >
                    {localDbBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    Sync from Server
                  </Button>
                  <Button
                    type="button"
                    onClick={handleImportLocalDatabase}
                    disabled={localDbBusy}
                    className="h-11 bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-[var(--primary-contrast)] font-black text-xs uppercase tracking-wider gap-2 rounded-xl cursor-pointer"
                  >
                    {localDbBusy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                    Import DB File
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleExportDatabase}
                    className="h-11 border-[var(--border)] bg-[var(--surf)] font-bold text-xs uppercase tracking-wider gap-2 rounded-xl cursor-pointer"
                  >
                    <Download className="size-4 text-[var(--pri)]" />
                    Download Snapshot
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOpenDbFolder}
                  className="w-full h-11 border-[var(--border)] bg-[var(--surf)] font-bold text-xs uppercase tracking-wider gap-2 rounded-xl cursor-pointer"
                >
                  <FolderOpen className="size-4 text-amber-400" />
                  Open Database Folder
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmResetOpen(true)}
                  className="w-full h-11 border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-black text-xs uppercase tracking-wider gap-2 rounded-xl cursor-pointer"
                >
                  <RotateCcw className="size-4" />
                  Reset Database Replica
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-start gap-2.5 text-red-400">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-black text-xs uppercase tracking-wider text-red-400">Confirm SRR DB Reset</h4>
                    <p className="text-xs text-red-300/90 mt-0.5 leading-relaxed">
                      This will wipe the local SQLite replica and cached slide buffers on this station.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmResetOpen(false)}
                    disabled={resettingDb}
                    className="h-9 px-3 text-xs font-bold rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleResetDatabase}
                    disabled={resettingDb}
                    className="h-9 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    {resettingDb ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="size-3" />
                        Confirm Reset
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Direct Login Modal */}
      {adminLoginOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleAdminLogin} className="w-full max-w-md rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
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
                className="grid size-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                aria-label="Close admin login"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">Admin username or email</label>
                <Input
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="Administrator username"
                  className="h-11 rounded-xl bg-[var(--surf)] text-xs font-bold"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">Admin password</label>
                <Input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="h-11 rounded-xl bg-[var(--surf)] text-xs font-bold"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
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
                className="h-11 bg-[var(--pri)] px-6 text-xs font-black text-[var(--primary-contrast)] cursor-pointer"
              >
                {adminLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  "Login as Admin"
                )}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
