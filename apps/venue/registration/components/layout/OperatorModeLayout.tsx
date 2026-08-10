"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronDown, LogOut, ScanLine, Settings, ShieldCheck, UserCheck, Users } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuthStore, type AppMode } from "@/store/use-auth-store";

const MODES: Array<{ mode: AppMode; href: string; label: string; icon: any; admin?: boolean }> = [
  { mode: "registration", href: "/registry", label: "Registration", icon: UserCheck },
  { mode: "scanning", href: "/scanning", label: "Scanning", icon: ScanLine },
  { mode: "self_checkin", href: "/self-checkin", label: "Self Check-in + Printing", icon: Users },
  { mode: "admin", href: "/admin", label: "Admin Console", icon: ShieldCheck, admin: true },
];

export default function OperatorModeLayout({
  children,
  activeMode,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  activeMode: AppMode;
  title: string;
  subtitle: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, setMode, logout } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (!isAuthenticated) router.push("/");
    else setMode(activeMode);
  }, [activeMode, isAuthenticated, router, setMode]);

  if (!hydrated || !isAuthenticated) return null;

  const allowed = (mode: AppMode) => {
    if (mode === "admin") return ["admin", "super_admin"].includes(user?.role || "");
    return !user?.allowed_modes || user.allowed_modes.includes(mode as any) || user.allowed_modes.includes("admin" as any);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--base)] text-[var(--text)]">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surf)] p-4">
        <div className="mb-5 flex items-center gap-3 px-2">
          <img src="/brand/eventos-emblem-metal.png" alt="Eventos" className="size-9 scale-[1.65] object-contain" />
          <div>
            <p className="text-sm font-black uppercase tracking-[0.25em]">EVENT<span className="text-[var(--acc)]">OS</span></p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted)]">Registration Software</p>
          </div>
        </div>

        <div className="relative mb-4">
          <button type="button" onClick={() => setSwitcherOpen((v) => !v)} className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 text-left">
            <span className="grid size-8 place-items-center rounded-lg bg-[var(--surf)] text-[var(--pri)]"><ChevronDown className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-black">{title}</span>
              <span className="block truncate text-[10px] font-semibold text-[var(--muted)]">Focused workspace</span>
            </span>
          </button>
          <AnimatePresence>
            {switcherOpen && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute left-0 right-0 z-50 mt-2 space-y-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-xl">
                {MODES.filter((m) => allowed(m.mode)).map((m) => {
                  const Icon = m.icon;
                  return (
                    <Link key={m.mode} href={m.href} onClick={() => { setMode(m.mode); setSwitcherOpen(false); }} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-bold", pathname.startsWith(m.href) ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "hover:bg-[var(--raised)]")}>
                      <Icon className="size-4" />
                      {m.label}
                    </Link>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="space-y-1">
          <Link href="/self-checkin" className="flex items-center gap-3 rounded-xl bg-[var(--pri)] px-3 py-2.5 text-xs font-black text-[var(--primary-contrast)]">
            <Users className="size-4" />
            {title}
          </Link>
        </nav>

        <div className="mt-auto space-y-1 border-t border-[var(--border)] pt-3">
          <Link href="/self-checkin/documentation" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold hover:bg-[var(--raised)]"><BookOpen className="size-4" /> Documentation</Link>
          <Link href="/self-checkin/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold hover:bg-[var(--raised)]"><Settings className="size-4" /> Settings</Link>
          <button onClick={() => { logout(); router.push("/"); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-red-400 hover:bg-red-500/10"><LogOut className="size-4" /> Logout</button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--pri)]">{subtitle}</p>
          <h1 className="mt-1 text-xl font-black tracking-tight">{title}</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
      </main>
    </div>
  );
}
