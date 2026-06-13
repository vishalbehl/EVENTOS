"use client";

import React, { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface InlinePanelProps {
  isOpen: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
  onClose?: () => void;
}

export function InlinePanel({ isOpen, children, className, title, onClose }: InlinePanelProps) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className={cn("border-t border-border/85 pt-5 mt-5 w-full", className)}>
            {(title || onClose) && (
              <div className="flex items-center justify-between mb-4">
                {title && <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>}
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-surface-2 transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}
              </div>
            )}
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
