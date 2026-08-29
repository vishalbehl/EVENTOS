"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

export type IllustrationName =
  | "conference-amico"
  | "conference-speaker"
  | "forms"
  | "id-card"
  | "upload";

const ILLUSTRATION_MAP: Record<IllustrationName, string> = {
  "conference-amico": "/illustrations/login/Conference-amico.svg",
  "conference-speaker": "/illustrations/login/Conference speaker-cuate.svg",
  "forms": "/illustrations/login/Forms-cuate.svg",
  "id-card": "/illustrations/login/ID Card-cuate.svg",
  "upload": "/illustrations/login/Upload-pana.svg",
};

// Global in-memory cache to prevent re-fetching SVGs
const svgCache: Record<string, string> = {};

interface ThemedIllustrationProps {
  name: IllustrationName;
  className?: string;
  glow?: boolean;
  animate?: boolean;
  badge?: string;
  style?: React.CSSProperties;
}

/**
 * Transforms raw SVG strings by replacing fixed vendor palette colors
 * with CSS theme variables (`var(--pri)` and `var(--sec)` in an equal 50/50 balance)
 */
function recolorSvg(rawSvg: string): string {
  let modified = rawSvg;
  let accentCount = 0;

  // 1. Primary & Secondary Balanced Alternating Accents
  // Alternates between var(--pri) and var(--sec) on every match so audience, stage props, cards, lanyards, etc. are 50/50 balanced
  const primaryRegex = /(#BA68C8|#ba68c8|#FF725E|#ff725e|#FFC727|#ffc727|#6c63ff|#6C63FF)/gi;
  modified = modified.replace(primaryRegex, () => {
    accentCount++;
    return accentCount % 2 === 0 ? "var(--sec, #a855f7)" : "var(--pri, #6366f1)";
  });

  // 2. Secondary Highlight & Warm Accents
  const secondaryRegex = /(#ffa8a7|#FFA8A7|#f28f8f|#F28F8F|#ff9192|#FF9192|#ff9abb|#FF9ABB|rgb\(\s*247\s*,\s*169\s*,\s*160\s*\))/gi;
  modified = modified.replace(secondaryRegex, "var(--sec, #a855f7)");

  // 3. Ensure SVGs expand to 100% of wrapper
  modified = modified.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    let clean = attrs.replace(/\bwidth="[^"]*"/gi, "").replace(/\bheight="[^"]*"/gi, "");
    return `<svg ${clean} width="100%" height="100%" style="overflow:visible;">`;
  });

  return modified;
}

export function ThemedIllustration({
  name,
  className = "w-full h-auto max-w-[420px]",
  glow = true,
  animate = true,
  badge,
  style,
}: ThemedIllustrationProps) {
  const [svgContent, setSvgContent] = useState<string | null>(() => svgCache[name] || null);
  const [loaded, setLoaded] = useState<boolean>(Boolean(svgCache[name]));

  useEffect(() => {
    if (svgCache[name]) {
      setSvgContent(svgCache[name]);
      setLoaded(true);
      return;
    }

    const filePath = ILLUSTRATION_MAP[name];
    if (!filePath) return;

    let isMounted = true;
    fetch(filePath)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load SVG: ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        if (!isMounted) return;
        const themed = recolorSvg(text);
        svgCache[name] = themed;
        setSvgContent(themed);
        setLoaded(true);
      })
      .catch((err) => {
        console.error("Error loading themed SVG illustration:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [name]);

  const animationProps = animate
    ? {
        animate: {
          y: [0, -6, 0],
        },
        transition: {
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut" as const,
        },
      }
    : {};

  return (
    <motion.div
      {...animationProps}
      className={`relative select-none pointer-events-none flex items-center justify-center ${className}`}
      style={style}
    >
      {/* Optional Ambient Glow Halo behind the illustration */}
      {glow && (
        <div className="absolute -inset-4 bg-gradient-to-tr from-[var(--pri)]/20 via-[var(--sec)]/15 to-transparent rounded-full blur-2xl pointer-events-none -z-10 opacity-75" />
      )}

      {/* Floating Badge */}
      {badge && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="absolute -top-3 right-4 z-20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-[var(--card)]/90 backdrop-blur-md border border-[var(--pri)]/30 text-[var(--pri)] shadow-md"
        >
          {badge}
        </motion.div>
      )}

      {/* Inline SVG rendering */}
      {svgContent ? (
        <div
          className="w-full h-full flex items-center justify-center text-[var(--text)] transition-all duration-300 [&_path]:transition-colors [&_path]:duration-300 [&_polygon]:transition-colors [&_polygon]:duration-300 [&_rect]:transition-colors [&_rect]:duration-300"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      ) : (
        <div className="w-full aspect-square max-h-[300px] rounded-3xl bg-[var(--border-default)]/20 animate-pulse flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--pri)]/30 border-t-[var(--pri)] animate-spin" />
        </div>
      )}
    </motion.div>
  );
}

export default ThemedIllustration;
