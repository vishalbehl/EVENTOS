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
    av_technician: "",
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
        av_technician: roomToEdit.av_technician || "",
        location_notes: roomToEdit.location_notes || "",
        is_active: roomToEdit.is_active ?? true
      });
    } else {
      setFormData({
        name: "",
        capacity: 100,
        screen_count: 1,
        room_type: "presentation",
        av_technician: "",
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
    
    // Ensure numeric fields are valid
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
          className="fixed inset-0 bg-[var(--base)]/80 backdrop-blur-md z-[200]"
        />
      )}
      {isOpen && (
        <div key="builder-create-room-wrapper" className="fixed inset-0 flex items-center justify-center z-[210] pointer-events-none p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="w-full max-w-2xl glass-3d rounded-[2.5rem] border-default shadow-2xl pointer-events-auto flex flex-col max-h-[90vh] overflow-hidden relative"
          >
            <button 
              onClick={onClose} 
              className="absolute top-8 right-8 h-10 w-10 rounded-full border border-default flex items-center justify-center text-muted hover:text-[var(--text)] transition-all z-10"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Scrollable Body */}
            <form onSubmit={handleSubmit} id="builder-create-room-form" className="flex-1 overflow-y-auto p-8 pt-20 space-y-8 no-scrollbar bg-background">
              {/* Header Integrated in Body */}
              <div className="flex items-center gap-4 mb-2">
                <div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/10 flex items-center justify-center">
                  <Box className="h-6 w-6 text-[var(--pri)]" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-[var(--text)] uppercase tracking-tight">
                    {roomToEdit ? "Edit Room" : "Create Room"}
                  </h2>
                  <p className="text-[11px] font-bold text-muted uppercase tracking-widest mt-0.5">Define a new event space in builder</p>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Room Name *</label>
                <div className="relative group">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted group-focus-within:text-[var(--pri)] transition-colors" />
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Grand Ballroom A"
                    className="h-12 border-default pl-12 text-[13px] font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Room Type</label>
                  <select
                    value={formData.room_type}
                    onChange={(e) => setFormData({ ...formData, room_type: e.target.value })}
                    className="w-full h-12 border-default rounded-xl px-4 text-[13px] font-bold text-[var(--text)] bg-background appearance-none focus:outline-none cursor-pointer border"
                  >
                    {ROOM_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Max Capacity *</label>
                  <div className="relative group">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted group-focus-within:text-[var(--pri)] transition-colors" />
                    <Input
                      required
                      type="number"
                      value={isNaN(formData.capacity) ? "" : formData.capacity}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, capacity: val === "" ? NaN : parseInt(val) });
                      }}
                      className="h-12 border-default pl-12 text-[13px] font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Screen Count *</label>
                  <div className="relative group">
                    <Monitor className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted group-focus-within:text-[var(--pri)] transition-colors" />
                    <Input
                      required
                      type="number"
                      min="1"
                      value={isNaN(formData.screen_count) ? "" : formData.screen_count}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, screen_count: val === "" ? NaN : parseInt(val) });
                      }}
                      className="h-12 border-default pl-12 text-[13px] font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">AV Technician</label>
                  <div className="relative group">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted group-focus-within:text-[var(--pri)] transition-colors" />
                    <Input
                      value={formData.av_technician}
                      onChange={(e) => setFormData({ ...formData, av_technician: e.target.value })}
                      placeholder="Name of onsite tech"
                      className="h-12 border-default pl-12 text-[13px] font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Location Notes</label>
                <textarea
                  value={formData.location_notes}
                  onChange={(e) => setFormData({ ...formData, location_notes: e.target.value })}
                  placeholder="e.g. Floor 2, North Wing, near elevator"
                  className="w-full min-h-[100px] bg-background border border-default rounded-2xl p-4 text-[13px] font-bold text-[var(--text)] focus:outline-none transition-all resize-none"
                />
              </div>
            </form>

            {/* Footer */}
            <div className="p-8 border-t border-default bg-[color-mix(in_srgb,var(--base)_50%,transparent)] backdrop-blur-sm flex gap-4">
              <Button onClick={onClose} variant="ghost" className="flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted hover:bg-background">
                Cancel
              </Button>
              <Button
                disabled={createRoom.isPending}
                form="builder-create-room-form"
                type="submit"
                className="flex-[2] h-14 rounded-2xl bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] shadow-lg border-0"
              >
                {createRoom.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Add Room to Builder
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
