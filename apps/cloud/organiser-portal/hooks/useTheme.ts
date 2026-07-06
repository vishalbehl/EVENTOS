"use client";

import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

export const THEMES: { name: Theme; label: string }[] = [
  { name: 'light', label: 'Light' },
  { name: 'dark',  label: 'Dark' },
];

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // On mount, read from localStorage — default to light
    const saved = localStorage.getItem('eventos-theme') as Theme;
    const resolved: Theme = saved === 'dark' ? 'dark' : 'light';
    applyTheme(resolved);
    setThemeState(resolved);
    setMounted(true);
  }, []);

  const applyTheme = (t: Theme) => {
    const root = document.documentElement;
    if (t === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('eventos-theme', newTheme);
    applyTheme(newTheme);
  };

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  return { theme, setTheme, toggleTheme, themes: THEMES, mounted, isDark: theme === 'dark' };
}
