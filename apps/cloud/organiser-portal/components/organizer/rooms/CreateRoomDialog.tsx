"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Users, Plus, Box, Monitor, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateRoom } from "@/hooks/useRooms";
import { formatApiError } from "@/lib/utils";
import { toast } from "sonner";
import { CapabilityAction } from "@/lib/capabilities";

interface CreateRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateRoomDialog({ isOpen, onClose }: CreateRoomDialogProps) {
  const { eventId } = useParams();
  const createRoom = useCreateRoom();
  const [formData, setFormData] = useState({
    name: "",
    capacity: 100,
    screen_count: 1,
    room_type: "presentation",
    room_coordinator: "",
    location_notes: "",
    is_active: true,
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      ...formData,
      capacity: isNaN(formData.capacity) ? 0 : formData.capacity,
      screen_count: isNaN(formData.screen_count) ? 1 : formData.screen_count,
    };

    try {
      await createRoom.mutateAsync({
        eventId: eventId as string,
        data: payload,
      });
      toast.success("Room registered successfully.");
      onClose();
      setFormData({
        name: "",
        capacity: 100,
        screen_count: 1,
        room_type: "presentation",
        room_coordinator: "",
        location_notes: "",
        is_active: true,
      });
    } catch (error: any) {
      const message = formatApiError(error, "Failed to create room.");
      toast.error(message);
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
    { value: "virtual", label: "Virtual / No Physical Room" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="create-room-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[200]"
          />

          <div
            key="create-room-wrapper"
            className="fixed inset-0 flex items-center justify-center z-[210] pointer-events-none p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-lg rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-2xl pointer-events-auto flex flex-col max-h-[90vh] overflow-hidden relative text-[var(--text-primary)]"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center border border-[var(--pri)]/20">
                    <Box className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                      Add New Room
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Configure stage capacity and location details
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="size-8 rounded-md border border-[var(--border-default)] bg-[var(--card)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer shadow-sm"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Form Body */}
              <form
                onSubmit={handleSubmit}
                id="create-room-form"
                className="flex-1 overflow-y-auto p-5 space-y-4 text-xs"
              >
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                    Room Name *
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                    <Input
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Grand Ballroom A"
                      className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Room Type
                    </label>
                    <select
                      value={formData.room_type}
                      onChange={(e) => setFormData({ ...formData, room_type: e.target.value })}
                      className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                    >
                      {ROOM_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Max Capacity *
                    </label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                      <Input
                        required
                        type="number"
                        value={isNaN(formData.capacity) ? "" : formData.capacity}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({ ...formData, capacity: val === "" ? NaN : parseInt(val) });
                        }}
                        className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Screens Count *
                    </label>
                    <div className="relative">
                      <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                      <Input
                        required
                        type="number"
                        min="1"
                        value={isNaN(formData.screen_count) ? "" : formData.screen_count}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({ ...formData, screen_count: val === "" ? NaN : parseInt(val) });
                        }}
                        className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Room Coordinator
                    </label>
                    <div className="relative">
                      <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                      <Input
                        value={formData.room_coordinator}
                        onChange={(e) => setFormData({ ...formData, room_coordinator: e.target.value })}
                        placeholder="Onsite room coordinator / lead"
                        className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                    Location Notes
                  </label>
                  <textarea
                    value={formData.location_notes}
                    onChange={(e) => setFormData({ ...formData, location_notes: e.target.value })}
                    placeholder="e.g. Level 2, North Wing, beside main auditorium"
                    className="w-full min-h-[70px] rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2.5 text-xs text-[var(--text-primary)] font-medium outline-none resize-none focus:border-[var(--pri)] shadow-sm"
                  />
                </div>
              </form>

              {/* Footer */}
              <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-2)] flex items-center justify-end gap-2.5">
                <Button
                  onClick={onClose}
                  type="button"
                  variant="outline"
                  className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-4 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                >
                  Cancel
                </Button>
                <CapabilityAction operation="venue.rooms.manage" limitKey="max_rooms">
                  <Button
                    disabled={createRoom.isPending}
                    form="create-room-form"
                    type="submit"
                    className="h-9 rounded-lg bg-[var(--pri)] hover:opacity-90 text-[var(--primary-contrast)] font-bold text-xs px-4 shadow-sm border-0 cursor-pointer"
                  >
                    {createRoom.isPending ? (
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Plus className="size-3.5 mr-1.5" />
                    )}
                    Register Room
                  </Button>
                </CapabilityAction>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
