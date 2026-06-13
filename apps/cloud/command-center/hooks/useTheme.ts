"use client";

import { useEffect, useState } from 'react';

export type Theme = 
  | 'plasma-violet' 
  | 'light';

export const THEMES: { name: Theme; label: string }[] = [
  { name: 'plasma-violet', label: 'Dark' },
  { name: 'light', label: 'Light' },
];

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('plasma-violet');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // On mount, read from localStorage
    const savedTheme = localStorage.getItem('eventos-theme') as Theme;
    if (savedTheme && THEMES.some(t => t.name === savedTheme)) {
      setThemeState(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
      // Also update 'dark' class for tailwind compat if needed
      if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }
    } else {
      // Fallback or old theme migration
      setThemeState('plasma-violet');
      localStorage.setItem('eventos-theme', 'plasma-violet');
      document.documentElement.setAttribute('data-theme', 'plasma-violet');
      document.documentElement.classList.add('dark');
    }
    setMounted(true);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('eventos-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Toggle dark class for Tailwind
    if (newTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  };

  return { theme, setTheme, themes: THEMES, mounted };
}
