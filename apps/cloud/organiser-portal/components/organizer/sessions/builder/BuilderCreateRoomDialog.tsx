"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Users, Plus, Box, Monitor, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { useCreateRoom, useUpdateRoom } from "@/hooks/useRooms";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { formatApiError } from "@/lib/utils";

interface BuilderCreateRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  roomToEdit?: any | null;
}

export function BuilderCreateRoomDialog({ isOpen, onClose, roomToEdit }: BuilderCreateRoomDialogProps) {
  const { eventId } = useParams();
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();
  const addRoom = useSessionBuilderStore((s) => s.addRoom);
  const updateRoomInStore = useSessionBuilderStore((s) => s.updateRoom);

  const [formData, setFormData] = useState({
    name: "",
    capacity: 100,
    screen_count: 1,
    room_type: "presentation",
    room_coordinator: "",
    location_notes: "",
    is_active: true
  });

  useEffect(() => {
    if (roomToEdit) {
      setFormData({
        name: roomToEdit.name || "",
        capacity: roomToEdit.capacity || 100,
        screen_count: roomToEdit.screen_count || 1,
        room_type: roomToEdit.room_type || "presentation",
        room_coordinator: roomToEdit.room_coordinator || roomToEdit.av_technician || "",
        location_notes: roomToEdit.location_notes || "",
        is_active: roomToEdit.is_active ?? true
      });
    } else {
      setFormData({
        name: "",
        capacity: 100,
        screen_count: 1,
        room_type: "presentation",
        room_coordinator: "",
        location_notes: "",
        is_active: true
      });
    }
  }, [roomToEdit, isOpen]);

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
      if (roomToEdit) {
        await updateRoom.mutateAsync({
          eventId: eventId as string,
          roomId: roomToEdit.id,
          data: payload
        });
        updateRoomInStore(roomToEdit.id, payload);
        toast.success("Room updated successfully!");
      } else {
        const response = await createRoom.mutateAsync({
          eventId: eventId as string,
          data: payload
        });

        if (response && (response as any).id) {
          addRoom(response as any);
        } else if (response && (response as any).data) {
          addRoom((response as any).data);
        } else {
          addRoom({
            id: `temp_room_${Date.now()}`,
            event_id: eventId as string,
            ...payload,
          });
        }
        toast.success("Room created successfully!");
      }

      onClose();
    } catch (error: any) {
      const message = formatApiError(error, roomToEdit ? "Failed to update room." : "Failed to create room.");
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
        <motion.div
          key="builder-create-room-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 z-[200]"
        />
      )}
      {isOpen && (
        <div key="builder-create-room-wrapper" className="fixed inset-0 flex items-center justify-center z-[210] pointer-events-none p-4">
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            className="w-full max-w-lg rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-lg pointer-events-auto flex flex-col max-h-[85vh] overflow-hidden relative"
          >
            {/* Header */}
            <div className="p-4 border-b border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-[var(--brand-primary-muted)] text-[var(--brand-primary)] flex items-center justify-center">
                  <Box className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-wide">
                    {roomToEdit ? "Edit Room" : "Create Room"}
                  </h2>
                  <p className="text-[11px] text-[var(--text-secondary)]">Define an event space for scheduling</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-7 w-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Scrollable Body */}
            <form onSubmit={handleSubmit} id="builder-create-room-form" className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">Room Name *</label>
                <div className="relative group">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)] group-focus-within:text-[var(--pri)] transition-colors" />
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Grand Ballroom A"
                    className="h-9 border-[var(--border-default)] bg-[var(--card)] pl-9 text-xs font-medium text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">Room Type</label>
                  <select
                    value={formData.room_type}
                    onChange={(e) => setFormData({ ...formData, room_type: e.target.value })}
                    className="w-full h-9 border border-[var(--border-default)] rounded-md px-3 text-xs font-medium text-[var(--text-primary)] bg-[var(--card)] focus:outline-none cursor-pointer"
                  >
                    {ROOM_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">Max Capacity *</label>
                  <div className="relative group">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)] group-focus-within:text-[var(--pri)] transition-colors" />
                    <Input
                      required
                      type="number"
                      value={isNaN(formData.capacity) ? "" : formData.capacity}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, capacity: val === "" ? NaN : parseInt(val) });
                      }}
                      className="h-9 border-[var(--border-default)] bg-[var(--card)] pl-9 text-xs font-medium text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">Screen Count *</label>
                  <div className="relative group">
                    <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)] group-focus-within:text-[var(--pri)] transition-colors" />
                    <Input
                      required
                      type="number"
                      min="1"
                      value={isNaN(formData.screen_count) ? "" : formData.screen_count}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, screen_count: val === "" ? NaN : parseInt(val) });
                      }}
                      className="h-9 border-[var(--border-default)] bg-[var(--card)] pl-9 text-xs font-medium text-[var(--text-primary)]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">Room Coordinator</label>
                  <div className="relative group">
                    <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)] group-focus-within:text-[var(--pri)] transition-colors" />
                    <Input
                      value={formData.room_coordinator}
                      onChange={(e) => setFormData({ ...formData, room_coordinator: e.target.value })}
                      placeholder="Onsite room coordinator / lead"
                      className="h-9 border-[var(--border-default)] bg-[var(--card)] pl-9 text-xs font-medium text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">Location Notes</label>
                <textarea
                  value={formData.location_notes}
                  onChange={(e) => setFormData({ ...formData, location_notes: e.target.value })}
                  placeholder="e.g. Floor 2, North Wing, near elevator"
                  className="w-full min-h-[80px] bg-[var(--card)] border border-[var(--border-default)] rounded-md p-2.5 text-xs text-[var(--text-primary)] focus:outline-none resize-none"
                />
              </div>
            </form>

            {/* Footer */}
            <div className="p-3.5 border-t border-[var(--border-default)] bg-[var(--surface-subtle)] flex items-center justify-end gap-2">
              <Button
                onClick={onClose}
                variant="outline"
                className="h-8 px-3 rounded-md text-xs font-medium border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </Button>
              <Button
                disabled={createRoom.isPending || updateRoom.isPending}
                form="builder-create-room-form"
                type="submit"
                className="h-8 px-4 rounded-md bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-black font-semibold text-xs tracking-wide shadow-xs border-0 flex items-center gap-1.5"
              >
                {createRoom.isPending || updateRoom.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {roomToEdit ? "Update Room" : "Add Room"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
