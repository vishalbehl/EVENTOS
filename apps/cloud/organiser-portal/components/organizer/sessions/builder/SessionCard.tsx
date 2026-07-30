"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { Clock, MapPin, Users, AlertTriangle, GripVertical, MoreVertical, Copy, Trash2, Edit3, CheckCircle2 } from "lucide-react";
import { cn, formatTimeRangeInTZ } from "@/lib/utils";
import { BuilderSession, useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { useAssignSpeakerToSession } from "@/hooks/useSessionBuilder";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SessionCardProps {
  session: BuilderSession;
  isDragging?: boolean;
  onEdit?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; solid: string }> = {
  KEYNOTE: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", solid: "#f59e0b" },
  SYMPOSIUM: { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400", solid: "#6366f1" },
  WORKSHOP: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", solid: "#10b981" },
  PANEL: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", solid: "#8b5cf6" },
  POSTER: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-400", solid: "#ec4899" },
  regular: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", solid: "#3b82f6" },
};

export function SessionCard({ session, isDragging, onEdit, onDuplicate, onDelete }: SessionCardProps) {
  const conflicts = useSessionBuilderStore((s) => s.conflicts);
  const selectedSessionId = useSessionBuilderStore((s) => s.selectedSessionId);
  const setSelectedSessionId = useSessionBuilderStore((s) => s.setSelectedSessionId);
  
  const { eventId } = useParams();
  const { mutate: assignSpeaker } = useAssignSpeakerToSession(eventId as string);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isDndKitDragging } = useSortable({
    id: session.id,
    data: { type: "session", session },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isSelected = selectedSessionId === session.id;
  const hasConflict = conflicts.some((c) => c.session_ids.includes(session.id));
  const typeStyle = TYPE_COLORS[session.session_type] || TYPE_COLORS.regular;
  const timezone = session.event_timezone || "UTC";

  return (
    <div
      ref={setNodeRef}
      style={style}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/json")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        try {
          const dataStr = e.dataTransfer.getData("application/json");
          if (dataStr) {
            const payload = JSON.parse(dataStr);
            if (payload.type === "speaker") {
              e.preventDefault();
              e.stopPropagation();
              assignSpeaker({ sessionId: session.id, speaker: payload.data });
            }
          }
        } catch (err) {}
      }}
      className={cn(
        "group relative rounded-xl border p-4 transition-all duration-200 cursor-pointer select-none",
        typeStyle.bg,
        typeStyle.border,
        isSelected && "ring-2 ring-[var(--pri)] shadow-lg shadow-[var(--pri)]/20 scale-[1.01]",
        hasConflict && "border-red-500/60 bg-red-500/10 ring-1 ring-red-500/50",
        (isDragging || isDndKitDragging) && "opacity-40 shadow-2xl scale-[1.02] border-[var(--pri)] z-50",
        "hover:border-[var(--pri)]/50 hover:shadow-md"
      )}
      onClick={() => setSelectedSessionId(session.id)}
    >
      {/* Top Bar: Code + Type + Drag Handle */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--pri)] bg-[var(--pri)]/10 px-2 py-0.5 rounded-md">
            {session.session_code?.toUpperCase()}
          </span>
          <Badge
            variant="outline"
            className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-0", typeStyle.border, typeStyle.text)}
          >
            {session.session_type}
          </Badge>
          {hasConflict && (
            <Badge variant="destructive" className="text-[9px] font-bold px-1.5 py-0 flex items-center gap-1 animate-pulse">
              <AlertTriangle className="h-3 w-3" /> Conflict
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded text-muted hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] cursor-grab active:cursor-grabbing"
            title="Drag to reorder/reschedule"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Title */}
      <h4 className="font-bold text-[14px] text-[var(--text)] line-clamp-2 leading-tight mb-2 group-hover:text-[var(--pri)] transition-colors">
        {session.name}
      </h4>

      {/* Time */}
      <div className="flex flex-col gap-1 text-[11px] text-muted mb-3 font-medium">
        <div className="flex items-center gap-1.5 text-[var(--pri)] font-semibold">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{formatTimeRangeInTZ(session.start_time, session.end_time, timezone)}</span>
        </div>
      </div>

      {/* Speakers & Readiness Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-default/50 text-[11px]">
        {/* Speaker Avatars */}
        <div className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-muted mr-1" />
          {session.speakers && session.speakers.length > 0 ? (
            <div className="flex -space-x-1.5 overflow-hidden">
              {session.speakers.slice(0, 3).map((spk, idx) => (
                <div
                  key={spk.id || idx}
                  className="h-5 w-5 rounded-full bg-[var(--pri)]/30 border border-background flex items-center justify-center text-[9px] font-black text-[var(--text)] uppercase"
                  title={spk.full_name}
                >
                  {spk.full_name.charAt(0)}
                </div>
              ))}
              {session.speakers.length > 3 && (
                <div className="h-5 w-5 rounded-full bg-muted/40 border border-background flex items-center justify-center text-[8px] font-bold text-muted">
                  +{session.speakers.length - 3}
                </div>
              )}
            </div>
          ) : (
            <span className="text-muted italic text-[10px]">No speakers</span>
          )}
        </div>

        {/* Readiness % */}
        <div className="flex items-center gap-1 font-bold text-[10px]">
          {(session.readiness_pct || 0) >= 100 ? (
            <span className="text-[var(--success)] flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Ready
            </span>
          ) : (
            <span className="text-[var(--warn)]">
              {Math.round(session.readiness_pct || 0)}% ready
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
