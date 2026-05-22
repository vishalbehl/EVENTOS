"use client";

import { useEffect, useState } from "react";
import { Image, Orbit } from "lucide-react";
import { Button } from "@/components/ui/button";

const WALLPAPER_STORAGE_KEY = "organizer-wallpaper-style";
const WALLPAPER_ON_STORAGE_KEY = "organizer-wallpaper-enabled";

const wallpapers = [
  {
    id: "control",
    label: "Control",
    value:
      "radial-gradient(60rem 42rem at 78% -8%, color-mix(in srgb, var(--pri) 18%, transparent), transparent 60%), radial-gradient(42rem 30rem at 0% 35%, color-mix(in srgb, var(--success) 7%, transparent), transparent 62%), linear-gradient(180deg, var(--base) 0%, var(--base) 100%)",
  },
  {
    id: "network",
    label: "Network",
    value:
      "linear-gradient(120deg, color-mix(in srgb, var(--base) 96%, transparent), color-mix(in srgb, var(--base) 94%, transparent)), repeating-linear-gradient(0deg, color-mix(in srgb, var(--pri) 6%, transparent) 0 1px, transparent 1px 42px), repeating-linear-gradient(90deg, color-mix(in srgb, var(--pri) 5%, transparent) 0 1px, transparent 1px 42px)",
  },
  {
    id: "deep",
    label: "Deep",
    value:
      "radial-gradient(70rem 45rem at 82% 20%, color-mix(in srgb, var(--pri) 14%, transparent), transparent 68%), linear-gradient(180deg, var(--base) 0%, var(--base) 100%)",
  },
];

export function ThemeControls() {
  const [enabled, setEnabled] = useState(true);
  const [styleIndex, setStyleIndex] = useState(0);

  useEffect(() => {
    const storedEnabled = localStorage.getItem(WALLPAPER_ON_STORAGE_KEY);
    const storedStyle = localStorage.getItem(WALLPAPER_STORAGE_KEY);
    const foundIndex = wallpapers.findIndex((wallpaper) => wallpaper.id === storedStyle);

    const nextEnabled = storedEnabled !== "false";
    const nextStyleIndex = foundIndex >= 0 ? foundIndex : 0;

    setEnabled(nextEnabled);
    setStyleIndex(nextStyleIndex);
    document.documentElement.dataset.wallpaper = nextEnabled ? "on" : "off";
    document.documentElement.style.setProperty("--app-wallpaper", wallpapers[nextStyleIndex].value);
  }, []);

  const toggleWallpaper = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(WALLPAPER_ON_STORAGE_KEY, String(next));
    document.documentElement.dataset.wallpaper = next ? "on" : "off";
  };

  const cycleWallpaper = () => {
    const nextIndex = (styleIndex + 1) % wallpapers.length;
    setStyleIndex(nextIndex);
    localStorage.setItem(WALLPAPER_STORAGE_KEY, wallpapers[nextIndex].id);
    document.documentElement.style.setProperty("--app-wallpaper", wallpapers[nextIndex].value);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggleWallpaper}
        className="h-8 border border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-3 text-[11px] font-medium text-muted hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]"
      >
        <Image className="mr-2 h-3.5 w-3.5 text-[var(--sec)]" />
        {enabled ? "Live BG" : "Flat BG"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={cycleWallpaper}
        className="h-8 border border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-3 text-[11px] font-medium text-muted hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-[var(--text)]"
      >
        <Orbit className="mr-2 h-3.5 w-3.5 text-[var(--pri)]" />
        {wallpapers[styleIndex].label}
      </Button>
    </div>
  );
}
