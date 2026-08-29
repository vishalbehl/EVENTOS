import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-dm-mono)", "monospace"],
      },
      colors: {
        brand: { primary: 'var(--brand-primary)', muted: 'var(--brand-primary-muted)' },
        surface: { DEFAULT: 'var(--bg-surface)', 2: 'var(--bg-surface-2)', hover: 'var(--bg-surface-hover)' },
        border: { DEFAULT: 'var(--border-default)', subtle: 'var(--border-subtle)' },
        success: { DEFAULT: 'var(--success)', muted: 'var(--success-muted)' },
        warning: { DEFAULT: 'var(--warning)', muted: 'var(--warning-muted)' },
        danger: { DEFAULT: 'var(--danger)', muted: 'var(--danger-muted)' },
        info: { DEFAULT: 'var(--info)', muted: 'var(--info-muted)' },
        input: "var(--border)",
        ring: "var(--pri)",
        background: "var(--base)",
        foreground: "var(--text)",
        primary: {
          DEFAULT: "var(--pri)",
          foreground: "white",
        },
        secondary: {
          DEFAULT: "var(--text-secondary)",
          foreground: "var(--text)",
        },
        tertiary: {
          DEFAULT: "var(--text-tertiary)",
          foreground: "var(--text)",
        },
        destructive: {
          DEFAULT: "var(--dan)",
          foreground: "white",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted)",
        },
        accent: {
          DEFAULT: "var(--acc)",
          foreground: "var(--text)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--text)",
        },
        status: {
          pending: "var(--warn)",
          uploaded: "var(--pri)",
          approved: "var(--success)",
          rejected: "var(--dan)",
          replaced: "var(--sec)",
          locked: "var(--muted)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        blob: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(30px, -50px) scale(1.1)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.25s ease-out",
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
        blob: "blob 7s infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
