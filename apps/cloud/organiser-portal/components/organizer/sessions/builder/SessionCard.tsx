"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, Users, AlertTriangle, GripVertical, CheckCircle2 } from "lucide-react";
import { cn, formatTimeRangeInTZ } from "@/lib/utils";
import { BuilderSession, useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { useAssignSpeakerToSession } from "@/hooks/useSessionBuilder";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface SessionCardProps {
  session: BuilderSession;
  isDragging?: boolean;
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  KEYNOTE: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
  SYMPOSIUM: { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400" },
  WORKSHOP: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  PANEL: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400" },
  POSTER: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-400" },
  regular: { bg: "bg-[var(--surface-subtle)]", border: "border-[var(--border-default)]", text: "text-[var(--text-secondary)]" },
};

export function SessionCard({ session, isDragging }: SessionCardProps) {
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
        "group relative rounded-lg border p-3 transition-all duration-150 cursor-pointer select-none text-xs",
        typeStyle.bg,
        typeStyle.border,
        isSelected && "ring-2 ring-[var(--pri)] border-[var(--pri)] shadow-xs",
        hasConflict && "border-rose-500/50 bg-rose-500/10 ring-1 ring-rose-500/30",
        (isDragging || isDndKitDragging) && "opacity-50 border-[var(--pri)] z-50",
        "hover:border-[var(--pri)]/60 hover:shadow-xs"
      )}
      onClick={() => setSelectedSessionId(session.id)}
    >
      {/* Top Bar: Code + Type + Drag Handle */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--pri)] bg-[var(--pri)]/10 px-1.5 py-0.5 rounded">
            {session.session_code?.toUpperCase()}
          </span>
          <Badge
            variant="outline"
            className={cn("text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0", typeStyle.border, typeStyle.text)}
          >
            {session.session_type}
          </Badge>
          {!session.is_published && (
            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Draft
            </span>
          )}
          {hasConflict && (
            <Badge variant="destructive" className="text-[9px] font-bold px-1.5 py-0 flex items-center gap-1 bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <AlertTriangle className="h-2.5 w-2.5" /> Conflict
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-grab active:cursor-grabbing"
            title="Drag to reorder/reschedule"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Title */}
      <h4 className="font-semibold text-xs text-[var(--text-primary)] line-clamp-2 leading-snug mb-2 group-hover:text-[var(--pri)] transition-colors">
        {session.name}
      </h4>

      {/* Time */}
      <div className="flex items-center gap-1.5 text-[var(--pri)] font-medium text-[11px] mb-2">
        <Clock className="h-3 w-3 flex-shrink-0" />
        <span>{formatTimeRangeInTZ(session.start_time, session.end_time, timezone)}</span>
      </div>

      {/* Speakers & Readiness Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-[11px]">
        {/* Speaker Avatars */}
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3 text-[var(--text-secondary)] mr-0.5" />
          {session.speakers && session.speakers.length > 0 ? (
            <div className="flex -space-x-1.5 overflow-hidden">
              {session.speakers.slice(0, 3).map((spk, idx) => (
                <div
                  key={spk.id || idx}
                  className="h-5 w-5 rounded-full bg-[var(--brand-primary-muted)] border border-[var(--card)] flex items-center justify-center text-[9px] font-bold text-[var(--brand-primary)] uppercase"
                  title={spk.full_name}
                >
                  {spk.full_name.charAt(0)}
                </div>
              ))}
              {session.speakers.length > 3 && (
                <div className="h-5 w-5 rounded-full bg-[var(--surface-subtle)] border border-[var(--card)] flex items-center justify-center text-[8px] font-semibold text-[var(--text-secondary)]">
                  +{session.speakers.length - 3}
                </div>
              )}
            </div>
          ) : (
            <span className="text-[var(--text-tertiary)] italic text-[10px]">No speakers</span>
          )}
        </div>

        {/* Readiness % */}
        <div className="flex items-center gap-1 font-semibold text-[10px]">
          {(session.readiness_pct || 0) >= 100 ? (
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> Ready
            </span>
          ) : (
            <span className="text-amber-400">
              {Math.round(session.readiness_pct || 0)}% ready
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
