import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter Variable", "Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px", letterSpacing: "0.05em" }],
        xs:   ["11px", { lineHeight: "16px", letterSpacing: "0.02em" }],
        sm:   ["12px", { lineHeight: "18px", letterSpacing: "0.01em" }],
        base: ["13px", { lineHeight: "20px", letterSpacing: "0" }],
        md:   ["14px", { lineHeight: "22px", letterSpacing: "-0.01em" }],
        lg:   ["15px", { lineHeight: "24px", letterSpacing: "-0.015em" }],
        xl:   ["18px", { lineHeight: "28px", letterSpacing: "-0.025em" }],
        "2xl": ["22px", { lineHeight: "32px", letterSpacing: "-0.03em" }],
        "3xl": ["28px", { lineHeight: "36px", letterSpacing: "-0.035em" }],
        "4xl": ["36px", { lineHeight: "44px", letterSpacing: "-0.04em" }],
      },
      fontWeight: {
        thin:       "300",
        normal:     "400",
        medium:     "500",
        semibold:   "600",
        bold:       "700",
        extrabold:  "800",
        black:      "900",
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter:  "-0.03em",
        tight:    "-0.02em",
        snug:     "-0.01em",
        normal:   "0",
        wide:     "0.02em",
        wider:    "0.06em",
        widest:   "0.12em",
        caps:     "0.15em",
      },
      colors: {
        /* ── Eventos Design Tokens ── */
        "ev-bg":       "var(--color-bg)",
        "ev-s1":       "var(--color-surface-1)",
        "ev-s2":       "var(--color-surface-2)",
        "ev-s3":       "var(--color-surface-3)",
        "ev-s4":       "var(--color-surface-4)",
        "ev-border":   "var(--color-border)",
        "ev-border-s": "var(--color-border-subtle)",
        "ev-primary":  "var(--color-primary-start)",
        "ev-primary-m":"var(--color-primary-mid)",
        "ev-primary-e":"var(--color-primary-end)",
        "ev-glow":     "var(--color-primary-glow)",
        "ev-cyan":     "var(--color-accent-cyan)",
        "ev-green":    "var(--color-accent-green)",
        "ev-pink":     "var(--color-accent-pink)",
        "ev-amber":    "var(--color-accent-amber)",
        "ev-text":     "var(--color-text-primary)",
        "ev-sub":      "var(--color-text-secondary)",
        "ev-muted":    "var(--color-text-muted)",
        "ev-dim":      "var(--color-text-placeholder)",

        /* ── Legacy / shadcn compat ── */
        background:    "var(--color-bg)",
        foreground:    "var(--color-text-primary)",
        border:        { DEFAULT: "var(--color-border)", subtle: "var(--color-border-subtle)" },
        input:         "var(--color-border)",
        ring:          "var(--color-primary-start)",
        primary: {
          DEFAULT:     "var(--color-primary-start)",
          foreground:  "#FFFFFF",
        },
        secondary: {
          DEFAULT:     "var(--color-surface-3)",
          foreground:  "var(--color-text-primary)",
        },
        destructive: {
          DEFAULT:     "var(--color-danger)",
          foreground:  "#FFFFFF",
        },
        muted: {
          DEFAULT:     "var(--color-surface-3)",
          foreground:  "var(--color-text-muted)",
        },
        accent: {
          DEFAULT:     "var(--color-surface-3)",
          foreground:  "var(--color-text-primary)",
        },
        card: {
          DEFAULT:     "var(--color-surface-2)",
          foreground:  "var(--color-text-primary)",
        },
        popover: {
          DEFAULT:     "var(--color-surface-1)",
          foreground:  "var(--color-text-primary)",
        },

        /* ── Semantic ── */
        success: {
          DEFAULT: "var(--color-success)",
          muted:   "var(--color-success-muted)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          muted:   "var(--color-warning-muted)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          muted:   "var(--color-danger-muted)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          muted:   "var(--color-info-muted)",
        },

        /* ── Legacy short-hand (keeps existing JSX happy) ── */
        brand:   { primary: "var(--color-primary-start)", muted: "var(--color-primary-glow)" },
        surface: {
          DEFAULT: "var(--color-surface-1)",
          "2":     "var(--color-surface-2)",
          hover:   "var(--color-surface-3)",
        },
        status: {
          pending:    "var(--color-warning)",
          uploaded:   "var(--color-primary-start)",
          approved:   "var(--color-success)",
          rejected:   "var(--color-danger)",
          replaced:   "var(--color-primary-end)",
          locked:     "var(--color-text-muted)",
        },
      },
      borderRadius: {
        sm:   "var(--radius-sm)",
        md:   "var(--radius-md)",
        lg:   "var(--radius-lg)",
        xl:   "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        card:          "var(--shadow-card)",
        "card-hover":  "var(--shadow-card-hover)",
        modal:         "var(--shadow-modal)",
        dropdown:      "var(--shadow-dropdown)",
        "glow-primary":"var(--shadow-glow-primary)",
        "glow-cyan":   "var(--shadow-glow-cyan)",
      },
      keyframes: {
        "slide-up-fade": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to:   { transform: "translateX(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.3" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to:   { backgroundPosition: "200% 0" },
        },
        blob: {
          "0%":   { transform: "translate(0px, 0px) scale(1)" },
          "33%":  { transform: "translate(30px, -50px) scale(1.1)" },
          "66%":  { transform: "translate(-20px, 20px) scale(0.9)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" },
        },
      },
      animation: {
        "slide-up-fade":  "slide-up-fade 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "fade-in":        "fade-in 0.2s cubic-bezier(0.4, 0, 0.2, 1) both",
        "scale-in":       "scale-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "slide-in-right": "slide-in-right 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        "pulse-dot":      "pulse-dot 1.4s ease-in-out infinite",
        shimmer:          "shimmer 2s linear infinite",
        blob:             "blob 7s infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
