"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ShieldAlert, Send, Radio, AlertTriangle, CheckCircle2,
  Tv, DoorOpen, Monitor, Users, Layers
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function EmergencyBroadcastPage() {
  const [scope, setScope] = useState("all_venue");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("urgent");

  const broadcastMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/venue/admin/control/broadcast", {
        target_scope: scope,
        target_ids: [],
        message: message.trim(),
        priority: priority,
      }),
    onSuccess: () => {
      toast.success("Emergency broadcast dispatched to venue endpoints!");
      setMessage("");
    },
    onError: (err: any) => {
      toast.error(`Broadcast failed: ${err.message || "Error"}`);
    }
  });

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-rose-500 animate-pulse" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-rose-400">
              COMMUNICATION · EMERGENCY BROADCAST
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Venue Emergency Broadcast
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Instant on-screen overlay banners across all Stage PCs, Tech PCs, Signage Displays, and Staff devices
          </p>
        </div>
      </div>

      {/* Broadcast Composer */}
      <div className="rounded-2xl border border-rose-500/40 bg-rose-950/10 p-6 shadow-md space-y-6">
        <div>
          <label className="block font-mono text-[10px] font-black uppercase text-[var(--muted)] mb-2">
            TARGET SCOPE
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { id: "all_venue", label: "All Venue Endpoints" },
              { id: "all_rooms", label: "All Room Stage Apps" },
              { id: "srr", label: "SRR Stations & Master" },
              { id: "signage", label: "Digital Signage Displays" },
            ].map((sc) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => setScope(sc.id)}
                className={cn(
                  "rounded-xl p-3 text-left text-xs font-bold transition-all border",
                  scope === sc.id
                    ? "border-rose-500 bg-rose-600 text-white shadow font-black"
                    : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                )}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block font-mono text-[10px] font-black uppercase text-[var(--muted)] mb-2">
            BROADCAST MESSAGE CONTENT
          </label>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Keynote session concluding in 5 minutes. Breakout tracks in Halls 2–6 commence at 10:30 AM."
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-4 text-xs font-medium text-[var(--text)] focus:border-rose-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col justify-between gap-4 border-t border-rose-500/20 pt-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase text-[var(--muted)]">PRIORITY:</span>
            <button
              type="button"
              onClick={() => setPriority("emergency")}
              className={cn(
                "rounded-lg px-3 py-1 font-mono text-[10px] font-bold uppercase transition-all",
                priority === "emergency" ? "bg-rose-500 text-white font-black" : "bg-[var(--card)] text-[var(--muted)]"
              )}
            >
              EMERGENCY
            </button>
            <button
              type="button"
              onClick={() => setPriority("urgent")}
              className={cn(
                "rounded-lg px-3 py-1 font-mono text-[10px] font-bold uppercase transition-all",
                priority === "urgent" ? "bg-amber-500 text-black font-black" : "bg-[var(--card)] text-[var(--muted)]"
              )}
            >
              URGENT
            </button>
          </div>

          <button
            type="button"
            disabled={broadcastMutation.isPending || !message.trim()}
            onClick={() => broadcastMutation.mutate()}
            className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 py-2.5 text-xs font-black text-white hover:bg-rose-500 shadow-md disabled:opacity-50"
          >
            <Send className="size-4" />
            <span>DISPATCH BROADCAST NOW</span>
          </button>
        </div>
      </div>
    </div>
  );
}
