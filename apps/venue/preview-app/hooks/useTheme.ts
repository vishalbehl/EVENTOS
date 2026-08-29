"use client";

import { useEffect, useState } from "react";

export function useTheme() {
  const [theme, setThemeState] = useState<string>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("eventos-theme") || localStorage.getItem("theme") || "dark";
    setThemeState(saved);
    document.documentElement.setAttribute("data-theme", saved);
    if (saved !== "light") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setThemeState(customEvent.detail);
      }
    };

    window.addEventListener("eventos-theme-change", handleThemeChange);
    return () => window.removeEventListener("eventos-theme-change", handleThemeChange);
  }, []);

  const setTheme = (newTheme: string) => {
    setThemeState(newTheme);
    localStorage.setItem("eventos-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    if (newTheme !== "light") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    window.dispatchEvent(new CustomEvent("eventos-theme-change", { detail: newTheme }));
  };

  return { theme, setTheme };
}
