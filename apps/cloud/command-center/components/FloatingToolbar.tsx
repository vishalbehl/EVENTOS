"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronRight, ChevronLeft, Plus, Mail, 
  CheckSquare, LayoutGrid, MessageSquare, 
  Settings, HelpCircle
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";

export function FloatingToolbar() {
  const { actions } = useFloatingToolbarStore();
  const [isExpanded, setIsExpanded] = useState(false);

  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-8 right-8 z-[100] flex items-center gap-3">
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className="flex items-center gap-3 p-2 rounded-full glass-3d border-[var(--pri)]/30 shadow-[0_20px_50px_color-mix(in_srgb,var(--pri)_30%,transparent)] bg-[var(--base)]/80 backdrop-blur-3xl"
          >
            {actions.map((action, i) => (
              <Button
                key={action.label}
                onClick={action.onClick}
                variant="ghost"
                className={cn(
                  "h-12 px-6 text-muted hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] font-black uppercase tracking-widest text-[10px] rounded-full flex items-center gap-2",
                  action.color
                )}
              >
                <action.icon className="h-4 w-4" />
                <span className="hidden lg:inline">{action.label}</span>
              </Button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "h-14 w-14 rounded-full glass-3d flex items-center justify-center shadow-2xl transition-all duration-500",
          isExpanded 
            ? "bg-[var(--pri)] border-[var(--pri)]/50 text-[var(--text)] rotate-0" 
            : "bg-[var(--surf)]/80 border-default text-[var(--pri)] hover:border-[var(--pri)]/30"
        )}
      >
        {isExpanded ? <ChevronRight className="h-6 w-6" /> : <LayoutGrid className="h-6 w-6" />}
      </motion.button>
    </div>
  );
}
