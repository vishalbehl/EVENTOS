"use client";

import { useEffect, useState } from "react";

export type Theme = 
  | "dark"
  | "light"
  | "void-indigo" 
  | "obsidian-rose" 
  | "carbon-teal" 
  | "amber-noir" 
  | "slate-aurora" 
  | "forest-ink" 
  | "copper-oxide" 
  | "plasma-violet";

export const THEMES: { name: Theme; label: string }[] = [
  { name: "dark", label: "Monochrome Dark" },
  { name: "light", label: "Monochrome Light" },
  { name: "void-indigo", label: "Void indigo" },
  { name: "obsidian-rose", label: "Obsidian rose" },
  { name: "carbon-teal", label: "Carbon teal" },
  { name: "amber-noir", label: "Amber noir" },
  { name: "slate-aurora", label: "Slate aurora" },
  { name: "forest-ink", label: "Forest ink" },
  { name: "copper-oxide", label: "Copper oxide" },
  { name: "plasma-violet", label: "Plasma violet" },
];

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("eventos-theme") as Theme;
    if (savedTheme && THEMES.some((t) => t.name === savedTheme)) {
      setThemeState(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
      if (savedTheme === "light") {
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.add("dark");
      }
    }
    setMounted(true);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("eventos-theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    
    if (newTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return { theme, setTheme, toggleTheme, mounted };
}
