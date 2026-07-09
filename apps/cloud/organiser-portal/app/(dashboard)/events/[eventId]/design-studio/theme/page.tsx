"use client";

import { use, useState } from "react";
import ThemeTab from "@/components/organizer/registration/settings/ThemeTab";
import SpeakerThemeTab from "@/components/organizer/speaker/SpeakerThemeTab";

type ThemePortalType = "registration" | "speaker";

export default function UnifiedThemePage({ params: paramsPromise }: { params: Promise<{ eventId: string }> }) {
  const params = use(paramsPromise);
  const { eventId } = params;

  const [activeTab, setActiveTab] = useState<ThemePortalType>("registration");

  return (
    <div className="relative w-full max-w-full overflow-x-hidden p-6">
      {/* Background Aesthetics */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[var(--pri)] rounded-full blur-[120px] opacity-10 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-[var(--sec)] rounded-full blur-[120px] opacity-10" />
      </div>

      <div className="relative z-10 w-full">
        {/* Header and Filter Navbar */}
        <header className="flex flex-col gap-4 border-b border-white/5 pb-4 mb-6 sm:flex-row sm:items-center sm:justify-between shrink-0">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[var(--color-text-primary)] to-[var(--color-text-secondary)] bg-clip-text text-transparent">
              Theme Designer
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Customize colors, branding guidelines, and visual settings across your portals.
            </p>
          </div>

          {/* Theme Portal Selector Tabs */}
          <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/5 backdrop-blur-md">
            {(["registration", "speaker"] as ThemePortalType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-350
                  ${activeTab === tab
                    ? "bg-[var(--color-primary-mid)] text-[var(--color-text-inverse)] shadow-lg"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5"
                  }
                `}
              >
                {tab === "registration" ? "Registration Theme" : "Speaker Theme"}
              </button>
            ))}
          </nav>
        </header>

        {/* Main Content Area */}
        <main className="perspective-1000">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
            {activeTab === "registration" ? (
              <ThemeTab eventId={eventId} />
            ) : (
              <SpeakerThemeTab eventId={eventId} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
