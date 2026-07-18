"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";
type ResolvedTheme = Exclude<Theme, "system">;

export const THEMES: { name: Theme; label: string }[] = [
  { name: "system", label: "System" },
  { name: "light", label: "Light" },
  { name: "dark", label: "Dark" },
];

const STORAGE_KEY = "eventos-theme";

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}

function normalizeStoredTheme(value: string | null): Theme {
  if (value === "light" || value === "dark" || value === "system") return value;
  if (value) return "dark";
  return "system";
}

function applyTheme(theme: Theme, prefersDark: boolean) {
  const resolved = resolveTheme(theme, prefersDark);
  document.documentElement.dataset.themePreference = theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const saved = normalizeStoredTheme(localStorage.getItem(STORAGE_KEY));
    if (localStorage.getItem(STORAGE_KEY) !== saved) localStorage.setItem(STORAGE_KEY, saved);
    setThemeState(saved);
    applyTheme(saved, media.matches);
    const onChange = (event: MediaQueryListEvent) => {
      if (normalizeStoredTheme(localStorage.getItem(STORAGE_KEY)) === "system") applyTheme("system", event.matches);
    };
    media.addEventListener("change", onChange);
    setMounted(true);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme, window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  return { theme, setTheme, themes: THEMES, mounted };
}
