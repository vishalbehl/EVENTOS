"use client";

import { useModalStore } from "@/store/useModalStore";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Users,
  Globe,
  FileText,
  ArrowRight,
  MapPin,
  Settings,
  Monitor,
  Trash2,
  Calendar,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatTimeInTZ } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useUpdateRoom, useDeleteRoom } from "@/hooks/useRooms";
import { useSessions } from "@/hooks/useSessions";
import { useEvent } from "@/hooks/useEvents";

export function GlobalModal() {
  const { isOpen, type, data, closeModal } = useModalStore();
  const { eventId } = useParams();
  const updateRoom = useUpdateRoom();
  const deleteRoom = useDeleteRoom();

  const [roomData, setRoomData] = useState<any>(null);

  useEffect(() => {
    if (type === "ROOM_SETTINGS" && data) {
      setRoomData(data);
    }
  }, [type, data]);

  const { data: event } = useEvent(eventId as string);
  const { data: sessions } = useSessions(eventId as string, { room_id: data?.id });

  useEffect(() => {
    if (typeof document !== "undefined") {
      if (isOpen) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "unset";
      }
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "unset";
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFieldChange = async (field: string, value: any) => {
    const updated = { ...roomData, [field]: value };
    setRoomData(updated);

    try {
      await updateRoom.mutateAsync({
        eventId: eventId as string,
        roomId: data.id,
        data: { [field]: value },
      });
    } catch (error) {
      console.error(`Failed to update ${field}:`, error);
    }
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this room? This action cannot be undone.")) {
      try {
        await deleteRoom.mutateAsync({
          eventId: eventId as string,
          roomId: data.id,
        });
        closeModal();
      } catch (error) {
        console.error("Failed to delete room:", error);
      }
    }
  };

  const ROOM_TYPES = [
    { value: "presentation", label: "Presentation Hall" },
    { value: "workshop", label: "Workshop Room" },
    { value: "poster", label: "Poster Session" },
    { value: "plenary", label: "Plenary Hall" },
    { value: "open_area", label: "Open Area / Foyer" },
    { value: "dining", label: "Dining Area" },
    { value: "registration", label: "Registration Desk" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
            className="fixed inset-0 bg-black/60 z-[9998]"
          />

          {/* Modal Container */}
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-8 pointer-events-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-5xl rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto relative text-[var(--text-primary)]"
            >
              {/* Close Button */}
              <button
                onClick={closeModal}
                className="absolute top-4 right-4 size-8 rounded-md border border-[var(--border-default)] bg-[var(--card)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors z-20 cursor-pointer shadow-sm"
              >
                <X className="size-4" />
              </button>

              {type === "EMAIL_CAMPAIGN" && data && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 p-8 relative z-10 overflow-y-auto">
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[var(--pri)]/10 text-[var(--pri)]">
                          Campaign Analytics
                        </span>
                        <span className="text-xs font-mono text-[var(--text-tertiary)]">NODE_COMM_W1</span>
                      </div>
                      <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                        {data.name}
                      </h2>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: "Dispatch Health", val: "99.8%", color: "text-emerald-500" },
                        { label: "Engagement Index", val: "14.2", color: "text-[var(--pri)]" },
                        { label: "Link Velocity", val: "1.2s", color: "text-blue-500" },
                      ].map((metric, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4 space-y-1.5"
                        >
                          <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                            {metric.label}
                          </p>
                          <p className={cn("text-2xl font-bold tracking-tight", metric.color)}>
                            {metric.val}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
                      <h4 className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                        Transmission Insights
                      </h4>
                      <div className="h-48 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4 flex items-end justify-between gap-2">
                        {[40, 70, 45, 90, 65, 85, 55, 95, 60, 80].map((h, i) => (
                          <div
                            key={i}
                            style={{ height: `${h}%` }}
                            className="flex-1 bg-[var(--pri)]/40 hover:bg-[var(--pri)] rounded-t-md transition-colors cursor-pointer relative group"
                          >
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--card)] border border-[var(--border-default)] px-1.5 py-0.5 rounded text-[9px] font-bold text-[var(--text-primary)] shadow-sm">
                              {h}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col h-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-6 space-y-6">
                    <h4 className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                      Campaign Protocol
                    </h4>
                    <div className="space-y-4">
                      {[
                        { label: "Target Segment", val: "All Confirmed Speakers", icon: Users },
                        { label: "Transmission Node", val: "Global Cluster S1", icon: Globe },
                        { label: "Template Architecture", val: "Standard Clean v2", icon: FileText },
                      ].map((meta, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="size-8 rounded-lg bg-[var(--card)] border border-[var(--border-default)] flex items-center justify-center shrink-0">
                            <meta.icon className="size-4 text-[var(--text-secondary)]" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                              {meta.label}
                            </p>
                            <p className="text-xs font-semibold text-[var(--text-primary)]">{meta.val}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-auto space-y-2 pt-4">
                      <Button className="w-full h-9 bg-[var(--pri)] hover:opacity-90 text-[var(--primary-contrast)] font-bold text-xs rounded-lg shadow-sm border-0 cursor-pointer">
                        Relaunch Campaign <ArrowRight className="ml-1.5 size-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full h-9 border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Technical Logs
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {type === "ROOM_SETTINGS" && roomData && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] relative z-10 flex-1 overflow-hidden min-h-0">
                  {/* Left Panel */}
                  <div className="flex flex-col overflow-hidden min-h-0 p-6 md:p-8 space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-[var(--pri)]/10 flex items-center justify-center border border-[var(--pri)]/20 text-[var(--pri)]">
                          <Building2 className="size-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                              {roomData.name}
                            </h2>
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                                roomData.is_active
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-[var(--bg-surface-2)] text-[var(--text-tertiary)]"
                              )}
                            >
                              {roomData.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mt-0.5">
                            <MapPin className="size-3 text-[var(--pri)]" />
                            {event?.venue_name || "Main Convention Center"}{" "}
                            {roomData.location_notes ? `— ${roomData.location_notes}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-semibold">
                        <Calendar className="size-3.5 text-[var(--pri)]" />
                        <span>{sessions?.length || 0} Sessions Mapped</span>
                      </div>
                    </div>

                    {/* Sessions Table */}
                    <div className="flex-1 overflow-hidden min-h-0 flex flex-col space-y-2">
                      <h4 className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                        Operational Schedule
                      </h4>

                      <div className="border border-[var(--border-default)] rounded-lg overflow-hidden flex-1 flex flex-col min-h-0 bg-[var(--card)]">
                        <div className="flex-1 overflow-y-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="sticky top-0 bg-[var(--bg-surface-2)] border-b border-[var(--border-default)]">
                              <tr>
                                <th className="p-3 font-bold text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider">
                                  Session / Code
                                </th>
                                <th className="p-3 font-bold text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider text-center">
                                  Timing
                                </th>
                                <th className="p-3 font-bold text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider text-center">
                                  Readiness
                                </th>
                                <th className="p-3 font-bold text-[var(--text-tertiary)] uppercase text-[10px] tracking-wider text-right">
                                  Status
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-subtle)]">
                              {sessions?.length ? (
                                sessions.map((session, i) => (
                                  <tr
                                    key={session.id}
                                    className="hover:bg-[var(--bg-surface-hover)] transition-colors"
                                  >
                                    <td className="p-3">
                                      <div className="flex items-center gap-2.5">
                                        <div className="size-7 rounded-md bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center shrink-0 border border-[var(--pri)]/20">
                                          <Monitor className="size-3.5" />
                                        </div>
                                        <div>
                                          <p className="font-bold text-[var(--text-primary)] truncate max-w-[200px]">
                                            {session.name}
                                          </p>
                                          <p className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase">
                                            {session.session_code}
                                          </p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="p-3 text-center">
                                      <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                                        {formatTimeInTZ(session.start_time, (session as any).event_timezone)} –{" "}
                                        {formatTimeInTZ(session.end_time, (session as any).event_timezone)}
                                      </span>
                                    </td>
                                    <td className="p-3 text-center">
                                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                        {Math.round(session.readiness_pct || 100)}%
                                      </span>
                                    </td>
                                    <td className="p-3 text-right">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-[var(--bg-surface-2)] text-[var(--text-secondary)] border border-[var(--border-default)]">
                                        {session.status.toUpperCase()}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={4} className="p-12 text-center text-xs text-[var(--text-secondary)]">
                                    <AlertTriangle className="size-6 text-[var(--text-tertiary)] mx-auto mb-2" />
                                    <p className="font-semibold text-[var(--text-primary)]">
                                      No sessions scheduled in this room.
                                    </p>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Settings Panel */}
                  <div className="flex flex-col h-full bg-[var(--bg-surface-2)] border-l border-[var(--border-default)] p-6 space-y-5">
                    <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                      <div className="flex items-center gap-2">
                        <Settings className="size-4 text-[var(--pri)]" />
                        <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                          Room Settings
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-[10px] font-bold uppercase",
                            roomData.is_active ? "text-emerald-600" : "text-rose-600"
                          )}
                        >
                          {roomData.is_active ? "Active" : "Inactive"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleFieldChange("is_active", !roomData.is_active)}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                            roomData.is_active ? "bg-emerald-500" : "bg-[var(--border-default)]"
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                              roomData.is_active ? "translate-x-4" : "translate-x-0"
                            )}
                          />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4 overflow-y-auto pr-1">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] tracking-wider">
                          Room Name
                        </Label>
                        <Input
                          value={roomData.name ?? ""}
                          onChange={(e) => handleFieldChange("name", e.target.value)}
                          className="h-9 bg-[var(--card)] border-[var(--border-default)] rounded-lg text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] tracking-wider">
                            Capacity (Pax)
                          </Label>
                          <Input
                            type="number"
                            value={roomData.capacity ?? ""}
                            onChange={(e) =>
                              handleFieldChange(
                                "capacity",
                                e.target.value === "" ? 0 : parseInt(e.target.value)
                              )
                            }
                            className="h-9 bg-[var(--card)] border-[var(--border-default)] rounded-lg text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)]"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] tracking-wider">
                            Screens
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            value={roomData.screen_count ?? 1}
                            onChange={(e) =>
                              handleFieldChange(
                                "screen_count",
                                e.target.value === "" ? 1 : parseInt(e.target.value)
                              )
                            }
                            className="h-9 bg-[var(--card)] border-[var(--border-default)] rounded-lg text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)]"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] tracking-wider">
                          Location Notes
                        </Label>
                        <textarea
                          value={roomData.location_notes ?? ""}
                          onChange={(e) => handleFieldChange("location_notes", e.target.value)}
                          placeholder="e.g. Floor 2, North Wing"
                          className="w-full min-h-[70px] bg-[var(--card)] border border-[var(--border-default)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] font-medium outline-none resize-none focus:border-[var(--pri)] transition-colors shadow-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] tracking-wider">
                          Room Type
                        </Label>
                        <select
                          value={roomData.room_type}
                          onChange={(e) => handleFieldChange("room_type", e.target.value)}
                          className="w-full h-9 bg-[var(--card)] border border-[var(--border-default)] rounded-lg px-3 text-xs font-semibold text-[var(--text-primary)] outline-none cursor-pointer focus:border-[var(--pri)] shadow-sm"
                        >
                          {ROOM_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-auto pt-4 border-t border-[var(--border-subtle)] space-y-2">
                      <Button
                        onClick={closeModal}
                        className="w-full h-9 bg-[var(--pri)] hover:opacity-90 text-[var(--primary-contrast)] font-bold text-xs rounded-lg shadow-sm border-0 cursor-pointer"
                      >
                        Done
                      </Button>
                      <Button
                        onClick={handleDelete}
                        variant="ghost"
                        className="w-full h-9 text-rose-600 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Delete Room <Trash2 className="ml-1.5 size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
