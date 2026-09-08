"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileText,
  Video,
  Layers,
  Image as ImageIcon,
  Edit3,
  Clock,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSRRStore } from "@/store/use-srr-store";
import { toast } from "sonner";

export function PreviewStep({
  onFinalize,
}: {
  onFinalize: () => void;
}) {
  const {
    sessions,
    selectedSessionIndex,
    activeSlideIndex,
    setActiveSlideIndex,
    isPlaying,
    setPlaying,
    slideTimerSeconds,
    incrementTimer,
    resetTimer,
    setCurrentStep,
    setNativeEditing,
  } = useSRRStore();

  const currentSession = (sessions && sessions[selectedSessionIndex]) || sessions?.[0] || null;
  const activeFile = currentSession?.presentations?.[0];
  const totalSlides = activeFile?.slides_count ?? 0;
  const previewSlides = Array.from({ length: totalSlides }, (_, idx) => ({
    id: idx + 1,
    title: activeFile ? `${activeFile.original_filename} - Slide ${idx + 1}` : `Slide ${idx + 1}`,
  }));

  const [audioVolume, setVolume] = useState(80);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [jumpSlideInput, setJumpSlideInput] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);

  // Slideshow auto-advance timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && totalSlides > 0) {
      interval = setInterval(() => {
        incrementTimer();
        if (slideTimerSeconds >= 5) {
          resetTimer();
          setActiveSlideIndex((activeSlideIndex + 1) % totalSlides);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, slideTimerSeconds, activeSlideIndex, totalSlides, incrementTimer, resetTimer, setActiveSlideIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const handleNext = () => {
    if (activeSlideIndex < totalSlides - 1) {
      setActiveSlideIndex(activeSlideIndex + 1);
      resetTimer();
    }
  };

  const handlePrev = () => {
    if (activeSlideIndex > 0) {
      setActiveSlideIndex(activeSlideIndex - 1);
      resetTimer();
    }
  };

  const handleJumpSlide = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(jumpSlideInput, 10);
    if (!isNaN(num) && num >= 1 && num <= totalSlides) {
      setActiveSlideIndex(num - 1);
      resetTimer();
      setJumpSlideInput("");
    } else {
      toast.error(`Enter a slide number between 1 and ${totalSlides}`);
    }
  };

  const toggleFullscreen = () => {
    if (!viewportRef.current) return;
    if (!document.fullscreenElement) {
      viewportRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const currentSlideData = {
    title: activeFile?.original_filename || "No presentation selected",
    subtitle: currentSession?.title || "Venue Server has not provided a presentation for this station.",
    tag: activeFile?.slides_count == null ? "Analysis pending" : "Slide check",
    tagColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6 lg:p-10 max-w-[1600px] mx-auto min-h-[calc(100vh-100px)]">
      {/* Left 9 Columns: Big Slide Viewport Canvas + Bottom Carousel + Playback Toolbar */}
      <div className="lg:col-span-9 flex flex-col justify-between space-y-4">
        {/* Main 1080p Aspect Slide Viewport (Image 5 Center) */}
        <div
          ref={viewportRef}
          className="relative aspect-video w-full rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-2xl flex flex-col justify-between overflow-hidden group select-none"
        >
          {/* Subtle Ambient Background Gradient */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black/20 via-transparent to-black/40" />

          {/* Slide Header: Tag & Watermark */}
          <div className="relative z-10 flex items-center justify-between">
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-bold shadow-sm backdrop-blur-md",
                currentSlideData.tagColor
              )}
            >
              {currentSlideData.tag}
            </span>

            <span className="font-mono text-xs font-black uppercase tracking-widest text-[var(--muted)]">
              VENUE PREVIEW • 16:9 1080P
            </span>
          </div>

          {/* Slide Center Content */}
          <div className="relative z-10 my-auto max-w-2xl space-y-4">
            <motion.h2
              key={`title-${activeSlideIndex}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--text)] tracking-tight leading-tight"
            >
              {currentSlideData.title}
            </motion.h2>

            <motion.p
              key={`subtitle-${activeSlideIndex}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-sm sm:text-base font-medium text-[var(--muted)] leading-relaxed"
            >
              {currentSlideData.subtitle}
            </motion.p>
          </div>

          {/* Slide Footer */}
          <div className="relative z-10 flex items-center justify-between border-t border-[var(--border)]/60 pt-4 text-xs font-medium text-[var(--muted)]">
            <span>{currentSession?.title || "No session assigned"} • {activeFile?.upload_status || "No file"}</span>
            <span className="font-mono font-bold text-[var(--text)]">{totalSlides > 0 ? `Slide ${activeSlideIndex + 1} / ${totalSlides}` : "Slide count unavailable"}</span>
          </div>
        </div>

        {/* Bottom Slide Thumbnails Carousel (Image 5 Bottom Carousel) */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {previewSlides.map((slide, idx) => {
              const isActive = idx === activeSlideIndex;
              return (
                <button
                  key={slide.id}
                  onClick={() => {
                    setActiveSlideIndex(idx);
                    resetTimer();
                  }}
                  className={cn(
                    "flex-shrink-0 w-32 aspect-video rounded-xl border p-2 text-left transition-all relative overflow-hidden flex flex-col justify-between",
                    isActive
                      ? "border-[var(--pri)] bg-[var(--surf)] shadow-lg ring-2 ring-[var(--pri)]/40"
                      : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--raised)]"
                  )}
                >
                  <span className="text-[9px] font-black text-[var(--text)] block truncate">
                    {slide.title}
                  </span>
                  <div className="flex items-center justify-between text-[8px] font-bold text-[var(--muted)]">
                    <span>Slide {idx + 1}</span>
                    {isActive && <span className="size-1.5 rounded-full bg-[var(--pri)]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Playback Navigation Toolbar (Image 5) */}
        <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-3 text-[var(--text)] shadow-lg">
          {/* Prev / Play / Next */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={activeSlideIndex === 0}
              className="flex size-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surf)] hover:bg-[var(--raised)] disabled:opacity-40"
            >
              <ChevronLeft className="size-5 text-[var(--text)]" />
            </button>

            <button
              onClick={() => setPlaying(!isPlaying)}
              className="flex size-9 items-center justify-center rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-[var(--primary-contrast)] font-black"
            >
              {isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current ml-0.5" />}
            </button>

            <button
              onClick={handleNext}
              disabled={activeSlideIndex === totalSlides - 1}
              className="flex size-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surf)] hover:bg-[var(--raised)] disabled:opacity-40"
            >
              <ChevronRight className="size-5 text-[var(--text)]" />
            </button>

            {/* Slide Counter */}
            <div className="ml-3 font-mono text-sm font-black text-[var(--muted)]">
              <span className="text-[var(--text)]">{activeSlideIndex + 1}</span> / {totalSlides}
            </div>
          </div>

          {/* Center: Slide Timer */}
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--pri)] font-bold">
            <Clock className="size-4" />
            <span>0:{slideTimerSeconds < 10 ? `0${slideTimerSeconds}` : slideTimerSeconds}</span>
          </div>

          {/* Right: Audio Volume Slider & Fullscreen */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVolume(audioVolume === 0 ? 75 : 0)}
                className="text-[var(--muted)] hover:text-[var(--text)]"
              >
                {audioVolume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={audioVolume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="h-1.5 w-20 accent-[var(--pri)] bg-[var(--surf)] rounded-lg cursor-pointer"
              />
              <span className="text-[10px] font-mono text-[var(--muted)] w-6">{audioVolume}%</span>
            </div>

            <button
              onClick={toggleFullscreen}
              className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surf)] text-[var(--muted)] hover:text-[var(--text)]"
              title="Toggle Fullscreen Preview"
            >
              <Maximize className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right 3 Columns: File Details, Diagnostics & Actions (Image 5 Right) */}
      <div className="lg:col-span-3 flex flex-col justify-between space-y-4">
        <div className="space-y-5">
          {/* FILE DETAILS */}
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">
              FILE DETAILS
            </span>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 flex items-center gap-3 shadow-sm">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--surf)] border border-[var(--border)] text-[var(--pri)]">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-[var(--text)] truncate" title={activeFile?.original_filename}>
                  {activeFile?.original_filename || "No presentation selected"}
                </p>
                <p className="text-[10px] text-[var(--muted)] font-semibold mt-0.5">
                  {activeFile ? `${activeFile.file_format || "FILE"} • ${activeFile.file_size_mb} MB` : "No file"}
                </p>
              </div>
            </div>
          </div>

          {/* QUICK ACTIONS */}
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">
              QUICK ACTIONS
            </span>
            <div className="space-y-2">
              <button
                onClick={() => setActiveSlideIndex(0)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--raised)] p-2.5 text-xs font-bold text-[var(--text)] transition-colors shadow-sm"
              >
                <RotateCcw className="size-3.5" />
                Restart from Beginning
              </button>

              {/* Jump to Slide # */}
              <form onSubmit={handleJumpSlide} className="flex gap-2">
                <Input
                  value={jumpSlideInput}
                  onChange={(e) => setJumpSlideInput(e.target.value)}
                  placeholder="Slide #"
                  type="number"
                  min={1}
                  max={totalSlides}
                  className="h-9 text-xs bg-[var(--card)] border-[var(--border)] rounded-xl"
                />
                <button
                  type="submit"
                  className="flex size-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--raised)] text-[var(--text)] shadow-sm"
                >
                  <ArrowRight className="size-4" />
                </button>
              </form>
            </div>
          </div>

          {/* TEST FEATURES */}
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">
              TEST FEATURES
            </span>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 space-y-2 shadow-sm">
              <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--surf)]">
                <span className="text-xs font-semibold text-[var(--text)]">Test Video Playback</span>
                <span className="flex size-4 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--muted)]">
                  ○
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--surf)]">
                <span className="text-xs font-semibold text-[var(--text)]">Check Fonts & Layout</span>
                <span className="flex size-4 items-center justify-center rounded-full border border-emerald-500/60 text-emerald-400 text-xs">
                  ✓
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--surf)]">
                <span className="text-xs font-semibold text-[var(--text)]">Check Animations</span>
                <span className="flex size-4 items-center justify-center rounded-full border border-amber-500/60 text-amber-400 text-xs">
                  !
                </span>
              </div>
            </div>
          </div>

          {/* MEDIA STATISTICS */}
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">
              MEDIA STATISTICS
            </span>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-2.5 text-xs font-medium text-[var(--text)] shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Videos</span>
        <span className="font-bold text-[var(--text)] font-mono">{activeFile?.videos_count ?? "Unavailable"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Animations</span>
                <span className="font-bold text-[var(--text)] font-mono">{activeFile?.animations_count ?? "Unavailable"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Images</span>
                <span className="font-bold text-[var(--text)] font-mono">{activeFile?.images_count ?? "Unavailable"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons (Image 5 Bottom Right) */}
        <div className="space-y-2.5 pt-2">
          {/* Blue Button: Looks Good - Continue */}
          <Button
            onClick={onFinalize}
            className="w-full h-13 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-wider shadow-lg"
          >
            Looks Good — Continue
          </Button>

          {/* Dark Secondary: Open File to Edit */}
          <button
            onClick={() => {
              setCurrentStep(2);
              setNativeEditing(true);
              toast.info("Opening in PowerPoint...");
            }}
            className="w-full h-12 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--raised)] text-[var(--text)] font-bold text-xs uppercase tracking-wider transition-colors shadow-sm"
          >
            Open File to Edit
          </button>
        </div>
      </div>
    </div>
  );
}
