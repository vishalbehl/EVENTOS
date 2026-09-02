"use client";
// Quota control: max_rooms is enforced by the API before creation.

import { useState, useEffect } from "react";
import { useLimitAccess } from "@/lib/capabilities";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Plus, Box, ShieldCheck, Loader2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateRoom } from "@/hooks/useRooms";
import { useRoomTypes } from "@/hooks/useRoomTypes";
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
  const { data: roomTypes = [], isLoading: loadingTypes } = useRoomTypes();

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    room_type: "MAIN_HALL",
    room_type_id: "",
    room_coordinator: "",
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

  useEffect(() => {
    if (roomTypes.length > 0 && !formData.room_type_id) {
      setFormData((prev) => ({
        ...prev,
        room_type: roomTypes[0].code || roomTypes[0].name,
        room_type_id: roomTypes[0].id,
      }));
    }
  }, [roomTypes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createRoom.mutateAsync({
        eventId: eventId as string,
        data: {
          name: formData.name,
          code: formData.code || undefined,
          room_type: formData.room_type,
          room_type_id: formData.room_type_id || undefined,
          room_coordinator: formData.room_coordinator || undefined,
          is_active: formData.is_active,
        },
      });
      toast.success("Room registered successfully.");
      onClose();
      setFormData({
        name: "",
        code: "",
        room_type: roomTypes[0]?.code || "MAIN_HALL",
        room_type_id: roomTypes[0]?.id || "",
        room_coordinator: "",
        is_active: true,
      });
    } catch (error: any) {
      const message = formatApiError(error, "Failed to create room.");
      toast.error(message);
    }
  };

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
              className="w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--card)] shadow-2xl pointer-events-auto flex flex-col max-h-[90vh] overflow-hidden relative text-[var(--text-primary)]"
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
                      Configure conference room and stage details
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
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
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
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
                      Room Code
                    </label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                      <Input
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        placeholder="e.g. RM-01"
                        className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 text-xs font-mono font-bold text-[var(--text-primary)] focus:border-[var(--pri)]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
                      Room Type *
                    </label>
                    <select
                      value={formData.room_type_id || formData.room_type}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = roomTypes.find((t) => t.id === val || t.code === val || t.name === val);
                        setFormData({
                          ...formData,
                          room_type: matched ? (matched.code || matched.name) : val,
                          room_type_id: matched ? matched.id : "",
                        });
                      }}
                      className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                    >
                      {loadingTypes ? (
                        <option value="">Loading room types...</option>
                      ) : (
                        roomTypes.map((t) => (
                          <option key={t.id || t.code} value={t.id || t.code}>
                            {t.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
                    Room Coordinator / Lead
                  </label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                    <Input
                      value={formData.room_coordinator}
                      onChange={(e) => setFormData({ ...formData, room_coordinator: e.target.value })}
                      placeholder="e.g. John Doe (Coordinator)"
                      className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)]"
                    />
                  </div>
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
