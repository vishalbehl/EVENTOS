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
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const saved = normalizeStoredTheme(localStorage.getItem(STORAGE_KEY));
    if (localStorage.getItem(STORAGE_KEY) !== saved) localStorage.setItem(STORAGE_KEY, saved);
    setThemeState(saved);
    setResolvedTheme(resolveTheme(saved, media.matches));
    applyTheme(saved, media.matches);
    const onChange = (event: MediaQueryListEvent) => {
      if (normalizeStoredTheme(localStorage.getItem(STORAGE_KEY)) === "system") {
        setResolvedTheme(resolveTheme("system", event.matches));
        applyTheme("system", event.matches);
      }
    };
    media.addEventListener("change", onChange);
    setMounted(true);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setResolvedTheme(resolveTheme(nextTheme, prefersDark));
    applyTheme(nextTheme, prefersDark);
  }, []);

  return { theme, resolvedTheme, setTheme, themes: THEMES, mounted };
}
