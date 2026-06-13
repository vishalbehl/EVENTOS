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

      <div className="grid grid-cols-2 gap-3">
        {themes.map((t) => (
          <button
            key={t.name}
            onClick={() => setTheme(t.name)}
            className={cn(
              "h-10 flex items-center justify-center gap-2 px-3 rounded-2xl border text-[13px] font-bold transition-all outline-none",
              theme === t.name 
                ? "bg-[var(--pri)]/10 text-[var(--pri)] border-[var(--pri)]/30 scale-105 shadow-[0_0_15px_rgba(139,92,246,0.1)]" 
                : "border-default text-muted hover:text-[var(--text)] hover:border-muted"
            )}
            aria-label={`Switch to ${t.label}`}
            aria-pressed={theme === t.name}
            title={t.label}
          >
            <div 
              className="h-4.5 w-4.5 rounded-full border border-black/10 shrink-0 flex items-center justify-center"
              style={{ 
                background: t.name === 'plasma-violet' ? '#8B5CF6' : '#FFFFFF'
              }}
            >
              {theme === t.name && (
                <motion.div
                  layoutId="theme-check-swatch"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center"
                >
                  <Check className="h-2.5 w-2.5 text-white mix-blend-difference" />
                </motion.div>
              )}
            </div>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
