"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Globe2, Palette } from "lucide-react";
import PortalTab from "@/components/organizer/registration/settings/PortalTab";
import ThemeTab from "@/components/organizer/registration/settings/ThemeTab";

type StudioTab = "delivery" | "appearance";

export default function PortalStudioPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = String(params.eventId);
  const [tab, setTab] = useState<StudioTab>("delivery");

  return (
    <main className="min-h-full space-y-5 p-4 sm:p-6">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Design Studio
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
          Registration portal
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Manage the live registration endpoint, support details, edit window,
          program material, portal copy, and entitled visual branding from one
          production-backed workspace.
        </p>
      </header>

      <nav
        aria-label="Portal studio sections"
        className="flex w-fit gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1"
      >
        <button
          type="button"
          onClick={() => setTab("delivery")}
          aria-current={tab === "delivery" ? "page" : undefined}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "delivery"
              ? "bg-[var(--pri)] text-white"
              : "text-[var(--muted)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          }`}
        >
          <Globe2 className="h-4 w-4" />
          Delivery &amp; settings
        </button>
        <button
          type="button"
          onClick={() => setTab("appearance")}
          aria-current={tab === "appearance" ? "page" : undefined}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "appearance"
              ? "bg-[var(--pri)] text-white"
              : "text-[var(--muted)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          }`}
        >
          <Palette className="h-4 w-4" />
          Appearance &amp; content
        </button>
      </nav>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6">
        {tab === "delivery" ? <PortalTab eventId={eventId} /> : <ThemeTab eventId={eventId} />}
      </section>
    </main>
  );
}
