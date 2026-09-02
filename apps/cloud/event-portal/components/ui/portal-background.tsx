"use client";

import React from "react";

export type SvgPatternType =
  | "glow-wave"
  | "tech-grid"
  | "cyber-matrix"
  | "prism-mesh"
  | "minimal-dots"
  | "triangle-halftone"
  | "dash-matrix"
  | "hex-hatch"
  | "isometric-cubes"
  | "curved-mesh"
  | "waves"
  | "dots"
  | "circuit"
  | "diagonal-lines"
  | "geometric-shapes"
  | "none";

export type BackgroundModeType = "pattern" | "solid" | "image" | "none";

interface PortalBackgroundProps {
  mode?: BackgroundModeType | string;
  pattern?: SvgPatternType | string;
  imageUrl?: string;
  blur?: number; // 0 to 30px
  overlayOpacity?: number; // 0 to 0.9
  solidColor?: string;
  className?: string;
}

export function PortalBackground({
  mode = "pattern",
  pattern = "glow-wave",
  imageUrl = "",
  blur = 0,
  overlayOpacity = 0.4,
  solidColor = "#000000",
  className = "",
}: PortalBackgroundProps) {
  // Mode: NONE
  if (mode === "none" || (mode === "pattern" && pattern === "none")) {
    return null;
  }

  // Mode: SOLID COLOR
  if (mode === "solid") {
    const finalSolid = solidColor || "#000000";
    return (
      <div
        className={`fixed inset-0 pointer-events-none z-0 transition-colors duration-300 ${className}`}
        style={{ backgroundColor: finalSolid }}
      />
    );
  }

  // Mode: CUSTOM STRETCHED IMAGE WITH REAL-TIME BLUR & OVERLAY CONTRAST
  if (mode === "image" && imageUrl) {
    const blurPx = Math.max(0, Math.min(30, blur ?? 0));
    const opacityVal = Math.max(0, Math.min(0.95, overlayOpacity ?? 0.4));

    return (
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 z-0 overflow-hidden select-none transition-all duration-500 ${className}`}
      >
        {/* Stretched Background Image */}
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat transition-all duration-500 scale-105"
          style={{
            backgroundImage: `url(${imageUrl})`,
            filter: blurPx > 0 ? `blur(${blurPx}px)` : "none",
          }}
        />

        {/* Ambient Dark/Light Contrast Overlay */}
        <div
          className="absolute inset-0 w-full h-full transition-opacity duration-300"
          style={{
            backgroundColor: "var(--bg-base, #080912)",
            opacity: opacityVal,
          }}
        />

        {/* Subtle Edge Vignette */}
        <div
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            background: "radial-gradient(circle at 50% 50%, transparent 40%, rgba(0,0,0,0.6) 100%)",
          }}
        />
      </div>
    );
  }

  // Mode: SVG PATTERN
  const p = (pattern || "glow-wave").toLowerCase();

  return (
    <div
      aria-hidden="true"
      data-portal-bg-pattern="true"
      className={`portal-bg-pattern pointer-events-none fixed inset-0 z-0 overflow-hidden select-none transition-opacity duration-700 opacity-90 dark:opacity-95 ${className}`}
    >
      {/* ── 1. ORIGINAL: LUMINOUS GLOW WAVE / WAVES ─────────────────────────── */}
      {(p === "glow-wave" || p === "waves") && (
        <svg
          className="absolute inset-0 h-full w-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <radialGradient id="origWaveGlow1" cx="25%" cy="20%" r="65%">
              <stop offset="0%" stopColor="var(--pri, #6366F1)" stopOpacity="0.45" />
              <stop offset="45%" stopColor="var(--sec, #A855F7)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="origWaveGlow2" cx="80%" cy="75%" r="65%">
              <stop offset="0%" stopColor="var(--sec, #A855F7)" stopOpacity="0.40" />
              <stop offset="50%" stopColor="var(--pri, #6366F1)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="origWaveStroke1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--pri, #6366F1)" stopOpacity="0.6" />
              <stop offset="50%" stopColor="var(--sec, #A855F7)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--pri, #6366F1)" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="origWaveStroke2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--sec, #A855F7)" stopOpacity="0.5" />
              <stop offset="50%" stopColor="var(--pri, #6366F1)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="var(--sec, #A855F7)" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <rect width="1440" height="900" fill="url(#origWaveGlow1)" />
          <rect width="1440" height="900" fill="url(#origWaveGlow2)" />
          <path
            d="M-100 220 C 280 80, 580 420, 980 240 C 1180 160, 1380 340, 1600 260"
            stroke="url(#origWaveStroke1)"
            strokeWidth="2.5"
            strokeDasharray="8 10"
            fill="none"
          />
          <path
            d="M-50 460 C 320 280, 680 660, 1080 460 C 1280 370, 1450 560, 1650 480"
            stroke="url(#origWaveStroke2)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M-80 720 C 260 580, 740 880, 1160 690 C 1360 610, 1520 790, 1680 720"
            stroke="url(#origWaveStroke1)"
            strokeWidth="2.5"
            strokeDasharray="6 8"
            fill="none"
          />
          <circle cx="450" cy="280" r="140" stroke="var(--pri, #6366F1)" strokeOpacity="0.08" strokeWidth="1" />
          <circle cx="1080" cy="520" r="180" stroke="var(--sec, #A855F7)" strokeOpacity="0.07" strokeWidth="1" />
        </svg>
      )}

      {/* ── 2. ORIGINAL: CYBER BEAM GRID / DIAGONAL LINES ───────────────────── */}
      {(p === "tech-grid" || p === "diagonal-lines" || p === "grid") && (
        <svg
          className="absolute inset-0 h-full w-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <pattern id="origGridPattern" width="56" height="56" patternUnits="userSpaceOnUse">
              <path
                d="M 56 0 L 0 0 0 56"
                fill="none"
                stroke="var(--pri, #6366F1)"
                strokeWidth="1"
                strokeOpacity="0.18"
              />
              <circle cx="0" cy="0" r="2" fill="var(--sec, #A855F7)" fillOpacity="0.4" />
            </pattern>
            <radialGradient id="origGridVignette" cx="50%" cy="40%" r="55%">
              <stop offset="0%" stopColor="var(--pri, #6366F1)" stopOpacity="0.30" />
              <stop offset="60%" stopColor="var(--sec, #A855F7)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="1440" height="900" fill="url(#origGridVignette)" />
          <rect width="1440" height="900" fill="url(#origGridPattern)" />
          <line
            x1="0"
            y1="0"
            x2="1440"
            y2="900"
            stroke="var(--pri, #6366F1)"
            strokeWidth="1.75"
            strokeOpacity="0.3"
            strokeDasharray="10 14"
          />
          <line
            x1="1440"
            y1="0"
            x2="0"
            y2="900"
            stroke="var(--sec, #A855F7)"
            strokeWidth="1.5"
            strokeOpacity="0.25"
            strokeDasharray="14 18"
          />
          <circle cx="720" cy="450" r="280" stroke="var(--pri, #6366F1)" strokeOpacity="0.15" strokeWidth="1.5" strokeDasharray="6 8" />
        </svg>
      )}

      {/* ── 3. ORIGINAL: RADIAL CYBER MATRIX / CIRCUIT ──────────────────────── */}
      {(p === "cyber-matrix" || p === "circuit") && (
        <svg
          className="absolute inset-0 h-full w-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <radialGradient id="origMatrixCore" cx="50%" cy="42%" r="50%">
              <stop offset="0%" stopColor="var(--pri, #6366F1)" stopOpacity="0.38" />
              <stop offset="50%" stopColor="var(--sec, #A855F7)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="1440" height="900" fill="url(#origMatrixCore)" />
          <circle
            cx="720"
            cy="450"
            r="160"
            stroke="var(--pri, #6366F1)"
            strokeWidth="1.5"
            strokeOpacity="0.35"
            strokeDasharray="6 8"
          />
          <circle
            cx="720"
            cy="450"
            r="320"
            stroke="var(--sec, #A855F7)"
            strokeWidth="1.2"
            strokeOpacity="0.25"
            strokeDasharray="4 10"
          />
          <circle
            cx="720"
            cy="450"
            r="480"
            stroke="var(--pri, #6366F1)"
            strokeWidth="1"
            strokeOpacity="0.18"
          />
          <circle cx="580" cy="360" r="5" fill="var(--pri, #6366F1)" fillOpacity="0.8" />
          <circle cx="860" cy="540" r="4.5" fill="var(--sec, #A855F7)" fillOpacity="0.85" />
          <circle cx="940" cy="340" r="6" fill="var(--pri, #6366F1)" fillOpacity="0.75" />
          <circle cx="500" cy="560" r="4.5" fill="var(--sec, #A855F7)" fillOpacity="0.8" />
          <line
            x1="580"
            y1="360"
            x2="940"
            y2="340"
            stroke="var(--pri, #6366F1)"
            strokeWidth="1.5"
            strokeOpacity="0.4"
          />
          <line
            x1="860"
            y1="540"
            x2="500"
            y2="560"
            stroke="var(--sec, #A855F7)"
            strokeWidth="1.5"
            strokeOpacity="0.35"
          />
          <line
            x1="580"
            y1="360"
            x2="860"
            y2="540"
            stroke="var(--pri, #6366F1)"
            strokeWidth="1"
            strokeOpacity="0.25"
          />
        </svg>
      )}

      {/* ── 4. ORIGINAL: GEOMETRIC PRISM MESH ───────────────────────────────── */}
      {(p === "prism-mesh" || p === "geometric-shapes") && (
        <svg
          className="absolute inset-0 h-full w-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <linearGradient id="origPrismGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--pri, #6366F1)" stopOpacity="0.30" />
              <stop offset="60%" stopColor="var(--sec, #A855F7)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="origPrismGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--sec, #A855F7)" stopOpacity="0.28" />
              <stop offset="60%" stopColor="var(--pri, #6366F1)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points="80,40 420,210 180,640"
            stroke="var(--pri, #6366F1)"
            strokeWidth="1.5"
            strokeOpacity="0.4"
            fill="url(#origPrismGrad1)"
          />
          <polygon
            points="420,210 840,90 680,480"
            stroke="var(--sec, #A855F7)"
            strokeWidth="1.5"
            strokeOpacity="0.35"
            fill="url(#origPrismGrad2)"
          />
          <polygon
            points="680,480 1140,280 980,780"
            stroke="var(--pri, #6366F1)"
            strokeWidth="1.5"
            strokeOpacity="0.4"
            fill="url(#origPrismGrad1)"
          />
          <polygon
            points="1140,280 1380,120 1420,680"
            stroke="var(--sec, #A855F7)"
            strokeWidth="1.2"
            strokeOpacity="0.3"
            fill="url(#origPrismGrad2)"
          />
        </svg>
      )}

      {/* ── 5. ORIGINAL: MINIMALIST DOT MATRIX ──────────────────────────────── */}
      {(p === "minimal-dots" || p === "dots") && (
        <svg
          className="absolute inset-0 h-full w-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <pattern id="origDotMatrix" width="48" height="48" patternUnits="userSpaceOnUse">
              <circle cx="12" cy="12" r="2" fill="var(--pri, #6366F1)" fillOpacity="0.35" />
              <circle cx="36" cy="12" r="2" fill="var(--sec, #A855F7)" fillOpacity="0.35" />
              <circle cx="12" cy="36" r="2" fill="var(--sec, #A855F7)" fillOpacity="0.35" />
              <circle cx="36" cy="36" r="2" fill="var(--pri, #6366F1)" fillOpacity="0.35" />
            </pattern>
            <radialGradient id="origDotsVignette1" cx="20%" cy="30%" r="55%">
              <stop offset="0%" stopColor="var(--pri, #6366F1)" stopOpacity="0.35" />
              <stop offset="50%" stopColor="var(--sec, #A855F7)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="origDotsVignette2" cx="80%" cy="70%" r="55%">
              <stop offset="0%" stopColor="var(--sec, #A855F7)" stopOpacity="0.35" />
              <stop offset="50%" stopColor="var(--pri, #6366F1)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="1440" height="900" fill="url(#origDotsVignette1)" />
          <rect width="1440" height="900" fill="url(#origDotsVignette2)" />
          <rect width="1440" height="900" fill="url(#origDotMatrix)" />
        </svg>
      )}

      {/* ── 6. GEOMETRIC: TRIANGLE HALFTONE DISPERSION ───────────────────────── */}
      {p === "triangle-halftone" && (
        <svg
          className="absolute inset-0 h-full w-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <pattern id="triIsoGrid" width="60" height="103.92" patternUnits="userSpaceOnUse">
              <path
                d="M 30 0 L 60 51.96 L 30 103.92 L 0 51.96 Z M 0 0 L 60 103.92 M 60 0 L 0 103.92 M 0 51.96 L 60 51.96"
                stroke="var(--pri, #6366F1)"
                strokeWidth="0.75"
                strokeOpacity="0.12"
                fill="none"
              />
            </pattern>
            <pattern id="triHalftoneTop" width="120" height="207.84" patternUnits="userSpaceOnUse">
              <polygon points="30,12 50,44 10,44" fill="var(--pri, #6366F1)" fillOpacity="0.7" />
              <polygon points="90,12 110,44 70,44" fill="var(--sec, #A855F7)" fillOpacity="0.65" />
              <polygon points="30,48 50,16 10,16" fill="var(--pri, #6366F1)" fillOpacity="0.6" />
              <polygon points="90,48 110,16 70,16" fill="var(--sec, #A855F7)" fillOpacity="0.6" />
              <polygon points="30,70 45,95 15,95" fill="var(--pri, #6366F1)" fillOpacity="0.45" />
              <polygon points="90,70 105,95 75,95" fill="var(--sec, #A855F7)" fillOpacity="0.4" />
              <polygon points="30,125 40,142 20,142" fill="var(--pri, #6366F1)" fillOpacity="0.25" />
              <polygon points="90,125 100,142 80,142" fill="var(--sec, #A855F7)" fillOpacity="0.22" />
            </pattern>
            <pattern id="triHalftoneBottom" width="120" height="207.84" patternUnits="userSpaceOnUse">
              <polygon points="30,80 40,63 20,63" fill="var(--pri, #6366F1)" fillOpacity="0.25" />
              <polygon points="90,80 100,63 80,63" fill="var(--sec, #A855F7)" fillOpacity="0.22" />
              <polygon points="30,135 45,110 15,110" fill="var(--pri, #6366F1)" fillOpacity="0.45" />
              <polygon points="90,135 105,110 75,110" fill="var(--sec, #A855F7)" fillOpacity="0.4" />
              <polygon points="30,195 50,163 10,163" fill="var(--pri, #6366F1)" fillOpacity="0.7" />
              <polygon points="90,195 110,163 70,163" fill="var(--sec, #A855F7)" fillOpacity="0.65" />
            </pattern>
          </defs>
          <rect width="1440" height="900" fill="url(#triIsoGrid)" />
          <rect x="0" y="0" width="1440" height="300" fill="url(#triHalftoneTop)" />
          <rect x="0" y="600" width="1440" height="300" fill="url(#triHalftoneBottom)" />
        </svg>
      )}

      {/* ── 7. GEOMETRIC: ROTATIONAL DASH MATRIX ─────────────────────────────── */}
      {p === "dash-matrix" && (
        <svg
          className="absolute inset-0 h-full w-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <pattern id="rotationalDashPattern" width="96" height="144" patternUnits="userSpaceOnUse">
              <rect x="12" y="6" width="3" height="6" rx="1.5" fill="var(--pri, #6366F1)" fillOpacity="0.25" />
              <rect x="36" y="6" width="3" height="6" rx="1.5" fill="var(--sec, #A855F7)" fillOpacity="0.25" />
              <rect x="24" y="24" width="4" height="10" rx="2" fill="var(--pri, #6366F1)" fillOpacity="0.4" transform="rotate(15 26 29)" />
              <rect x="48" y="24" width="4" height="10" rx="2" fill="var(--sec, #A855F7)" fillOpacity="0.4" transform="rotate(-15 50 29)" />
              <rect x="12" y="48" width="6" height="16" rx="3" fill="var(--pri, #6366F1)" fillOpacity="0.6" transform="rotate(45 15 56)" />
              <rect x="36" y="48" width="6" height="16" rx="3" fill="var(--sec, #A855F7)" fillOpacity="0.6" transform="rotate(-45 39 56)" />
              <rect x="24" y="72" width="7" height="22" rx="3.5" fill="var(--sec, #A855F7)" fillOpacity="0.8" transform="rotate(65 27.5 83)" />
              <rect x="48" y="72" width="7" height="22" rx="3.5" fill="var(--pri, #6366F1)" fillOpacity="0.8" transform="rotate(-65 51.5 83)" />
              <rect x="12" y="100" width="6" height="16" rx="3" fill="var(--pri, #6366F1)" fillOpacity="0.6" transform="rotate(-45 15 108)" />
              <rect x="36" y="100" width="6" height="16" rx="3" fill="var(--sec, #A855F7)" fillOpacity="0.6" transform="rotate(45 39 108)" />
            </pattern>
          </defs>
          <rect width="1440" height="900" fill="url(#rotationalDashPattern)" />
        </svg>
      )}

      {/* ── 8. GEOMETRIC: HEXAGONAL LINEAR HATCH ─────────────────────────────── */}
      {p === "hex-hatch" && (
        <svg
          className="absolute inset-0 h-full w-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <pattern id="hexHatchUnit" width="96" height="166.28" patternUnits="userSpaceOnUse">
              <g transform="translate(48, 48)">
                <polygon points="0,-40 34.64,-20 34.64,20 0,40 -34.64,20 -34.64,-20" stroke="var(--pri, #6366F1)" strokeWidth="0.8" strokeOpacity="0.2" fill="none" />
                <line x1="-28" y1="-16" x2="28" y2="-16" stroke="var(--pri, #6366F1)" strokeWidth="1.5" strokeOpacity="0.75" />
                <line x1="-32" y1="-8" x2="32" y2="-8" stroke="var(--pri, #6366F1)" strokeWidth="1.5" strokeOpacity="0.75" />
                <line x1="-34" y1="0" x2="34" y2="0" stroke="var(--pri, #6366F1)" strokeWidth="1.5" strokeOpacity="0.75" />
                <line x1="-32" y1="8" x2="32" y2="8" stroke="var(--pri, #6366F1)" strokeWidth="1.5" strokeOpacity="0.75" />
                <line x1="-28" y1="16" x2="28" y2="16" stroke="var(--pri, #6366F1)" strokeWidth="1.5" strokeOpacity="0.75" />
              </g>
              <g transform="translate(96, 131.14)">
                <polygon points="0,-40 34.64,-20 34.64,20 0,40 -34.64,20 -34.64,-20" stroke="var(--sec, #A855F7)" strokeWidth="0.8" strokeOpacity="0.2" fill="none" />
                <line x1="-24" y1="-28" x2="16" y2="34" stroke="var(--sec, #A855F7)" strokeWidth="1.5" strokeOpacity="0.75" />
                <line x1="-16" y1="-32" x2="24" y2="30" stroke="var(--sec, #A855F7)" strokeWidth="1.5" strokeOpacity="0.75" />
                <line x1="-8" y1="-34" x2="30" y2="22" stroke="var(--sec, #A855F7)" strokeWidth="1.5" strokeOpacity="0.75" />
              </g>
            </pattern>
          </defs>
          <rect width="1440" height="900" fill="url(#hexHatchUnit)" />
        </svg>
      )}

      {/* ── 9. GEOMETRIC: ISOMETRIC STRIPED OP-ART CUBES ─────────────────────── */}
      {p === "isometric-cubes" && (
        <svg
          className="absolute inset-0 h-full w-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <pattern id="isoOpCubes" width="120" height="207.84" patternUnits="userSpaceOnUse">
              <g transform="translate(60, 60)">
                <polygon points="0,-40 34.64,-20 0,0 -34.64,-20" stroke="var(--pri, #6366F1)" strokeWidth="1" strokeOpacity="0.4" fill="var(--pri, #6366F1)" fillOpacity="0.06" />
                <polygon points="-34.64,-20 0,0 0,40 -34.64,20" stroke="var(--pri, #6366F1)" strokeWidth="1" strokeOpacity="0.4" fill="var(--pri, #6366F1)" fillOpacity="0.04" />
                <polygon points="0,0 34.64,-20 34.64,20 0,40" stroke="var(--sec, #A855F7)" strokeWidth="1" strokeOpacity="0.4" fill="var(--sec, #A855F7)" fillOpacity="0.08" />
                <line x1="-24" y1="-14" x2="6" y2="4" stroke="var(--pri, #6366F1)" strokeWidth="1.5" strokeOpacity="0.7" />
                <line x1="-16" y1="-20" x2="16" y2="-2" stroke="var(--pri, #6366F1)" strokeWidth="1.5" strokeOpacity="0.7" />
                <line x1="-26" y1="-10" x2="-26" y2="24" stroke="var(--pri, #6366F1)" strokeWidth="1.75" strokeOpacity="0.7" />
                <line x1="-18" y1="-6" x2="-18" y2="30" stroke="var(--pri, #6366F1)" strokeWidth="1.75" strokeOpacity="0.7" />
                <line x1="6" y1="4" x2="30" y2="-10" stroke="var(--sec, #A855F7)" strokeWidth="1.75" strokeOpacity="0.75" />
                <line x1="6" y1="14" x2="30" y2="0" stroke="var(--sec, #A855F7)" strokeWidth="1.75" strokeOpacity="0.75" />
              </g>
            </pattern>
          </defs>
          <rect width="1440" height="900" fill="url(#isoOpCubes)" />
        </svg>
      )}

      {/* ── 10. GEOMETRIC: PERSPECTIVE WARPED TRIANGLES ──────────────────────── */}
      {p === "curved-mesh" && (
        <svg
          className="absolute inset-0 h-full w-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <path d="M 0 850 Q 720 700 1440 850" stroke="var(--pri, #6366F1)" strokeWidth="1.5" strokeOpacity="0.6" fill="none" />
          <path d="M 0 750 Q 720 620 1440 750" stroke="var(--sec, #A855F7)" strokeWidth="1.5" strokeOpacity="0.5" fill="none" />
          <path d="M 0 650 Q 720 540 1440 650" stroke="var(--pri, #6366F1)" strokeWidth="1.2" strokeOpacity="0.4" fill="none" />
          <line x1="720" y1="900" x2="100" y2="100" stroke="var(--pri, #6366F1)" strokeWidth="1.2" strokeOpacity="0.35" />
          <line x1="720" y1="900" x2="520" y2="100" stroke="var(--pri, #6366F1)" strokeWidth="1.2" strokeOpacity="0.4" />
          <line x1="720" y1="900" x2="720" y2="100" stroke="var(--sec, #A855F7)" strokeWidth="1.5" strokeOpacity="0.5" />
          <line x1="720" y1="900" x2="920" y2="100" stroke="var(--pri, #6366F1)" strokeWidth="1.2" strokeOpacity="0.4" />
          <line x1="720" y1="900" x2="1340" y2="100" stroke="var(--pri, #6366F1)" strokeWidth="1.2" strokeOpacity="0.35" />
          <polygon points="680,780 720,730 760,780" fill="var(--pri, #6366F1)" fillOpacity="0.7" />
          <polygon points="580,790 620,740 660,790" fill="var(--sec, #A855F7)" fillOpacity="0.65" />
          <polygon points="780,790 820,740 860,790" fill="var(--sec, #A855F7)" fillOpacity="0.65" />
          <polygon points="700,600 720,570 740,600" fill="var(--pri, #6366F1)" fillOpacity="0.4" />
          <polygon points="620,610 640,580 660,610" fill="var(--sec, #A855F7)" fillOpacity="0.35" />
        </svg>
      )}
    </div>
  );
}
