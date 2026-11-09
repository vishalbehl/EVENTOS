"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { type OrganisationBackground, useUIStore } from "@/store/useUIStore";
import { Panel } from "../OrganiserPrimitives";
import { SettingsPage } from "./shared";

const backgrounds: Array<{
  id: OrganisationBackground;
  name: string;
  description: string;
  lightImage: string;
  darkImage: string;
}> = [
  {
    id: "landscape",
    name: "Rose Horizon",
    description: "Warm blush sky by day, luminous dusk indigo mountain layers by night.",
    lightImage: "/assets/organiser-backgrounds/rose-horizon.svg",
    darkImage: "/assets/organiser-backgrounds/rose-horizon-dark.svg",
  },
  {
    id: "aurora",
    name: "Violet Lagoon",
    description: "Violet atmosphere by day, deep celestial aurora water horizon by night.",
    lightImage: "/assets/organiser-backgrounds/violet-lagoon.svg",
    darkImage: "/assets/organiser-backgrounds/violet-lagoon-dark.svg",
  },
  {
    id: "mist",
    name: "Cloud Silk",
    description: "Quiet silver-blue landscape by day, moonlit charcoal contours by night.",
    lightImage: "/assets/organiser-backgrounds/cloud-silk.svg",
    darkImage: "/assets/organiser-backgrounds/cloud-silk-dark.svg",
  },
  {
    id: "celestial",
    name: "Cosmic Stardust",
    description: "Ethereal nebula ribbons with lilac stardust by day, midnight astral violet by night.",
    lightImage: "/assets/organiser-backgrounds/celestial.svg",
    darkImage: "/assets/organiser-backgrounds/celestial-dark.svg",
  },
  {
    id: "dune",
    name: "Velvet Mirage",
    description: "Warm sculpted terracotta desert dunes by day, nocturnal copper basalt by night.",
    lightImage: "/assets/organiser-backgrounds/dune.svg",
    darkImage: "/assets/organiser-backgrounds/dune-dark.svg",
  },
  {
    id: "emerald",
    name: "Alpine Mist",
    description: "Lush sage & mint mountain mist by day, bioluminescent pine canopy by night.",
    lightImage: "/assets/organiser-backgrounds/emerald.svg",
    darkImage: "/assets/organiser-backgrounds/emerald-dark.svg",
  },
  {
    id: "prism",
    name: "Prism Spectrum",
    description: "Translucent quartz crystal dispersion by day, smoked obsidian laser refractions by night.",
    lightImage: "/assets/organiser-backgrounds/prism.svg",
    darkImage: "/assets/organiser-backgrounds/prism-dark.svg",
  },
  {
    id: "solaris",
    name: "Golden Horizon",
    description: "Radiant golden-hour ocean horizon by day, molten sunset & twilight seas by night.",
    lightImage: "/assets/organiser-backgrounds/solaris.svg",
    darkImage: "/assets/organiser-backgrounds/solaris-dark.svg",
  },
  {
    id: "topo",
    name: "Kyoto Topo",
    description: "Minimalist porcelain elevation contour lines by day, matte carbon slate by night.",
    lightImage: "/assets/organiser-backgrounds/topo.svg",
    darkImage: "/assets/organiser-backgrounds/topo-dark.svg",
  },
  {
    id: "cyber",
    name: "Neon Synth",
    description: "Vaporwave synthscape dawn by day, electric magenta & cyan laser grid by night.",
    lightImage: "/assets/organiser-backgrounds/cyber.svg",
    darkImage: "/assets/organiser-backgrounds/cyber-dark.svg",
  },
  {
    id: "glacier",
    name: "Nordic Fjord",
    description: "Crystalline arctic turquoise waters by day, abyssal oceanic fjord by night.",
    lightImage: "/assets/organiser-backgrounds/glacier.svg",
    darkImage: "/assets/organiser-backgrounds/glacier-dark.svg",
  },
  {
    id: "monochrome",
    name: "Minimal Obsidian",
    description: "Studio pure white & neutral zinc ramps by day, graphite & silver spotlights by night.",
    lightImage: "/assets/organiser-backgrounds/monochrome.svg",
    darkImage: "/assets/organiser-backgrounds/monochrome-dark.svg",
  },
  {
    id: "sakura",
    name: "Sakura Twilight",
    description: "Japanese cherry blossom ivory mist by day, nocturnal plum ripples by night.",
    lightImage: "/assets/organiser-backgrounds/sakura.svg",
    darkImage: "/assets/organiser-backgrounds/sakura-dark.svg",
  },
];

export function SettingsAppearanceTab() {
  const { theme, setTheme, mounted } = useTheme();
  const background = useUIStore(state => state.organisationBackground);
  const setBackground = useUIStore(state => state.setOrganisationBackground);
  const isDark = mounted && theme === "dark";

  return <SettingsPage>
    <Panel title="Component mode" description="Light and dark modes change cards, text, controls, tables and charts. Your portal background automatically switches to match.">
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Component colour mode">
        {(["light", "dark"] as const).map(mode => {
          const selected = mounted && theme === mode;
          return <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(mode)}
            className={`appearance-mode-card ${selected ? "is-selected" : ""}`}
          >
            <span className="appearance-mode-icon">{mode === "light" ? <Sun className="size-5" /> : <Moon className="size-5" />}</span>
            <span><strong>{mode === "light" ? "Light components" : "Dark components"}</strong><small>{mode === "light" ? "White glass cards and dark typography" : "Dark glass cards and light typography"}</small></span>
            {selected ? <Check className="ml-auto size-5" /> : null}
          </button>;
        })}
      </div>
    </Panel>

    <Panel title="Portal background" description="Choose the illustrated artwork behind the organiser workspace. Automatically adapts to light and dark modes.">
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Portal background artwork">
        {backgrounds.map(option => {
          const selected = background === option.id;
          const previewImage = isDark ? option.darkImage : option.lightImage;
          return <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setBackground(option.id)}
            className={`appearance-background-card ${selected ? "is-selected" : ""}`}
          >
            <span
              className="appearance-background-circle size-11 shrink-0 rounded-full border border-white/60 dark:border-white/20 shadow-sm bg-cover bg-center"
              style={{ backgroundImage: `url(${previewImage})` }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-left">
              <strong className="block text-sm font-semibold truncate text-[var(--org-ink)]">{option.name}</strong>
              <small className="mt-0.5 block text-xs text-[var(--org-muted)] line-clamp-1">{option.description}</small>
            </span>
            {selected ? (
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--org-purple)] text-white shadow-sm">
                <Check className="size-3.5" />
              </span>
            ) : (
              <span className="size-5 shrink-0 rounded-full border border-[var(--org-hairline)]" />
            )}
          </button>;
        })}
      </div>
    </Panel>
  </SettingsPage>;
}
