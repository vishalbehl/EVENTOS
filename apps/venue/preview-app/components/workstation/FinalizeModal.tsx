"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Server,
  Monitor,
  HardDrive,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Radio,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSRRStore } from "@/store/use-srr-store";
import { useAuthStore } from "@/store/use-auth-store";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export function FinalizeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    speaker,
    sessions,
    selectedSessionIndex,
    fileModified,
    resetSession,
    setCurrentStep,
  } = useSRRStore();
  const { stationNumber } = useAuthStore();

  const currentSession = (sessions && sessions[selectedSessionIndex]) || sessions?.[0] || null;
  const activeFile = currentSession?.presentations?.[0];

  const [syncPhase, setSyncPhase] = useState<"idle" | "uploading" | "distributing" | "done">("idle");
  const [progress, setProgress] = useState(0);

  const startFinalize = async () => {
    if (!activeFile) {
      toast.error("No presentation file is available to finalize.");
      return;
    }
    setSyncPhase("uploading");
    setProgress(30);

    try {
      await apiClient.post(`/api/v1/srr/files/${activeFile.id}/finalize`, {
        slides_count: activeFile.slides_count,
        has_video: (activeFile.videos_count || 0) > 0,
        has_animation: (activeFile.animations_count || 0) > 0,
      });
    } catch (err: any) {
      setSyncPhase("idle");
      setProgress(0);
      toast.error(err.message || "Finalize failed on Venue Server.");
      return;
    }

    setTimeout(() => {
      setSyncPhase("distributing");
      setProgress(75);

      setTimeout(() => {
        setSyncPhase("done");
        setProgress(100);
        toast.success("Presentation finalized and queued on Venue Server.");
      }, 1500);
    }, 1200);
  };

  const handleCompleteSession = () => {
    onClose();
    resetSession();
    setCurrentStep(1); // Return workstation to idle / ready state
    toast.success(`Workstation #${stationNumber} reset to idle for next speaker.`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-400">
            <ShieldCheck className="size-8" />
          </div>
          <h2 className="text-xl font-black text-white">
            Finalize & Sync Presentation
          </h2>
          <p className="text-xs text-zinc-400">
            {speaker?.full_name} • {currentSession?.title}
          </p>
        </div>

        {syncPhase === "idle" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 font-semibold">Presentation File</span>
                <span className="font-mono font-bold text-white">{activeFile?.original_filename || "No presentation selected"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 font-semibold">Session Target</span>
                <span className="font-bold text-cyan-400">{currentSession?.room_name || "No room assigned"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 font-semibold">Changes Detected</span>
                <span className="font-bold text-emerald-400">
                  {fileModified ? "Verified (Hash Updated)" : "Verified (No Change)"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 font-semibold">Distribution Scope</span>
                <span className="font-bold text-white">Venue Server ➔ Room PCs ➔ Peer SRR PCs</span>
              </div>
            </div>

            <Button
              size="lg"
              onClick={startFinalize}
              disabled={!activeFile}
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-wider text-xs gap-2"
            >
              Confirm & Synchronize All Nodes
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}

        {(syncPhase === "uploading" || syncPhase === "distributing") && (
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-cyan-400">
                  {syncPhase === "uploading" ? "1/2 Confirming file with Venue Server..." : "2/2 Recording finalized presentation status..."}
                </span>
                <span className="font-mono text-zinc-400">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
                <Server className="size-4 text-cyan-400" />
                <span className="font-semibold text-white">Venue Server Edge Repository</span>
                <span className="ml-auto text-[10px] font-bold text-emerald-400">Synced</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
                <Monitor className="size-4 text-blue-400" />
                <span className="font-semibold text-white">Room {currentSession?.room_name || "unassigned"} delivery queue</span>
                <span className="ml-auto text-[10px] font-bold text-cyan-400">
                  {syncPhase === "distributing" ? "Delivering..." : "Pending"}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
                <HardDrive className="size-4 text-purple-400" />
                <span className="font-semibold text-white">SRR audit and local cache record</span>
                <span className="ml-auto text-[10px] font-bold text-zinc-500">Queued</span>
              </div>
            </div>
          </div>
        )}

        {syncPhase === "done" && (
          <div className="space-y-4 text-center">
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-5 space-y-2">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="size-6" />
              </div>
              <h3 className="text-base font-black text-emerald-300">
                Presentation Check Complete!
              </h3>
              <p className="text-xs text-emerald-200/80 leading-relaxed">
                Your presentation has been validated by Venue Server and marked ready for the next delivery worker.
              </p>
            </div>

            <Button
              size="lg"
              onClick={handleCompleteSession}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-black font-black uppercase tracking-wider text-xs"
            >
              Finish & Release Station #{stationNumber}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
