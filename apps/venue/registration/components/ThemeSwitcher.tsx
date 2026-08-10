"use client";

import React from 'react';
import { useTheme } from '@/hooks/useTheme';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme, themes, mounted } = useTheme();

  if (!mounted) return null;

  return (
    <div className={cn("space-y-4 rounded-[2rem] border-default bg-[var(--card)] p-4", className)}>
      <div className="flex flex-col gap-1 px-1">
        <h4 className="text-[11px] font-black text-muted uppercase tracking-[0.2em]">Appearance</h4>
        <p className="text-[13px] font-bold text-[var(--text)] tracking-tight">
          {themes.find(t => t.name === theme)?.label || 'Select Theme'}
        </p>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {themes.map((t) => (
          <button
            key={t.name}
            onClick={() => setTheme(t.name)}
            className="group relative flex flex-col items-center gap-2 outline-none"
            aria-label={`Switch to ${t.label}`}
            aria-pressed={theme === t.name}
            title={t.label}
          >
            <div 
              className={cn(
                "theme-swatch relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-default transition-all duration-300",
                theme === t.name ? "scale-110 border-[var(--pri)] shadow-[0_0_15px_var(--pri)]" : "hover:border-muted"
              )}
              style={{ 
                background: t.name === 'dark' ? '#050505' :
                            t.name === 'light' ? '#f0f1f3' :
                            t.name === 'void-indigo' ? '#6366F1' : 
                            t.name === 'obsidian-rose' ? '#C084FC' : 
                            t.name === 'carbon-teal' ? '#14B8A6' : 
                            t.name === 'amber-noir' ? '#F59E0B' : 
                            t.name === 'slate-aurora' ? '#38BDF8' : 
                            t.name === 'forest-ink' ? '#22C55E' : 
                            t.name === 'copper-oxide' ? '#D97706' : 
                            t.name === 'plasma-violet' ? '#8B5CF6' : 
                            '#050505' 
              }}
            >
              {theme === t.name && (
                <motion.div
                  layoutId="theme-check"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Check className="h-3 w-3 text-[var(--text)] mix-blend-difference" />
                </motion.div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
