"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { MonitorPlay, ArrowLeft, Sparkles, LayoutGrid, Palette, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PortalDesignerMockup() {
  const { eventId } = useParams();
  const router = useRouter();

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-[14px] overflow-hidden relative shadow-2xl p-8 justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <MonitorPlay className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.25em] text-zinc-100">Portal Studio</h1>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Registration portal designer</p>
          </div>
        </div>

        <Button
          onClick={() => router.push(`/events/${eventId}/dashboard`)}
          variant="outline"
          className="h-8 gap-2 border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider rounded-xl"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Button>
      </div>

      {/* Main Preview */}
      <div className="flex-grow flex flex-col items-center justify-center py-12 text-center max-w-xl mx-auto">
        <div className="relative mb-6">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-emerald-600 to-indigo-600 opacity-20 blur-xl animate-pulse"></div>
          <div className="relative p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl flex items-center justify-center">
            <Sparkles className="h-10 w-10 text-emerald-400 animate-spin-slow" />
          </div>
        </div>

        <h2 className="text-lg font-bold uppercase tracking-widest text-zinc-100 mb-2">Portal Designer Coming Soon</h2>
        <p className="text-xs text-zinc-400 leading-relaxed mb-8">
          Design high-conversion, branded event registration portals and speaker upload portals with a canvas website layout editor. Full drag-and-drop customization of panels, steps, and registration flow elements.
        </p>

        {/* Mockup Preview Boxes */}
        <div className="grid grid-cols-3 gap-4 w-full text-left">
          <div className="p-4 bg-zinc-900/30 border border-zinc-850 rounded-xl">
            <LayoutGrid className="h-5 w-5 text-emerald-400 mb-2" />
            <h3 className="text-[10px] font-bold uppercase tracking-wider mb-1">Layout Panels</h3>
            <p className="text-[9px] text-zinc-500">Pick from modern layouts, multi-step wizards, or hero layouts.</p>
          </div>
          <div className="p-4 bg-zinc-900/30 border border-zinc-850 rounded-xl">
            <Palette className="h-5 w-5 text-emerald-400 mb-2" />
            <h3 className="text-[10px] font-bold uppercase tracking-wider mb-1">Theme Styles</h3>
            <p className="text-[9px] text-zinc-500">Apply brand colors, custom stylesheets, and typography.</p>
          </div>
          <div className="p-4 bg-zinc-900/30 border border-zinc-850 rounded-xl">
            <Sliders className="h-5 w-5 text-emerald-400 mb-2" />
            <h3 className="text-[10px] font-bold uppercase tracking-wider mb-1">Upload Forms</h3>
            <p className="text-[9px] text-zinc-500">Integrate dynamic custom registration and speaker upload fields.</p>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-t border-zinc-900/80 pt-6 flex justify-between text-[9px] font-semibold text-zinc-500 uppercase tracking-widest">
        <span>© Eventos portal delivery systems</span>
        <span>Version 2.0 (Premium Upgrade Preview)</span>
      </div>
    </div>
  );
}
