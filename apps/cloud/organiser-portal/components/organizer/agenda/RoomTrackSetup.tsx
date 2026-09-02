"use client";

import { useState } from "react";
import {
  Building2,
  Tag,
  Plus,
  ArrowLeft,
  Trash2,
  Save,
  MapPin,
  Users,
  Monitor,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { useRoomTypes } from "@/hooks/useRoomTypes";

export interface RoomItem {
  id: string;
  name: string;
  code?: string;
  room_type?: string;
  room_coordinator?: string;
  is_active?: boolean;
}

export interface TrackConfigItem {
  id: string;
  name: string;
  code: string;
  displayColor: string;
  description: string;
  sortOrder: number;
}

interface RoomTrackSetupProps {
  rooms: RoomItem[];
  tracks: TrackConfigItem[];
  onSaveRoom: (room: RoomItem) => void;
  onDeleteRoom: (roomId: string) => void;
  onSaveTrack: (track: TrackConfigItem) => void;
  onDeleteTrack: (trackId: string) => void;
  onBack: () => void;
}

export function RoomTrackSetup({
  rooms,
  tracks,
  onSaveRoom,
  onDeleteRoom,
  onSaveTrack,
  onDeleteTrack,
  onBack,
}: RoomTrackSetupProps) {
  const [activeTab, setActiveTab] = useState<"rooms" | "tracks">("rooms");
  const { data: roomTypes = [], isLoading: loadingTypes } = useRoomTypes();

  // Selected Room State
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id || "new");
  const activeRoom = rooms.find((r) => r.id === selectedRoomId) || {
    id: "new",
    name: "",
    code: "",
    room_type: roomTypes[0]?.code || "MAIN_HALL",
    room_coordinator: "",
    is_active: true,
  };
  const [roomForm, setRoomForm] = useState<RoomItem>({ ...activeRoom });

  // Selected Track State
  const [selectedTrackId, setSelectedTrackId] = useState<string>(tracks[0]?.id || "new");
  const activeTrack = tracks.find((t) => t.id === selectedTrackId) || {
    id: "new",
    name: "",
    code: "",
    displayColor: "#3b82f6",
    description: "",
    sortOrder: 1,
  };
  const [trackForm, setTrackForm] = useState<TrackConfigItem>({ ...activeTrack });

  const handleSelectRoom = (r: RoomItem) => {
    setSelectedRoomId(r.id);
    setRoomForm({ ...r });
  };

  const handleNewRoom = () => {
    const newId = `room-${Date.now()}`;
    const newR: RoomItem = {
      id: newId,
      name: "",
      code: "",
      room_type: roomTypes[0]?.code || "MAIN_HALL",
      room_coordinator: "",
      is_active: true,
    };
    setSelectedRoomId(newId);
    setRoomForm(newR);
  };

  const handleSaveRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomForm.name.trim()) {
      toast.error("Please enter a room name");
      return;
    }
    onSaveRoom(roomForm);
    toast.success(`Saved room: ${roomForm.name}`);
  };

  const handleSelectTrack = (t: TrackConfigItem) => {
    setSelectedTrackId(t.id);
    setTrackForm({ ...t });
  };

  const handleNewTrack = () => {
    const newId = `track-${Date.now()}`;
    const newT: TrackConfigItem = {
      id: newId,
      name: "",
      code: "",
      displayColor: "#3b82f6",
      description: "",
      sortOrder: tracks.length + 1,
    };
    setSelectedTrackId(newId);
    setTrackForm(newT);
  };

  const handleSaveTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackForm.name.trim()) {
      toast.error("Please enter a track name");
      return;
    }
    onSaveTrack(trackForm);
    toast.success(`Saved track: ${trackForm.name}`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">
              Rooms & Tracks Configuration
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Manage venue stages, halls, coordinators, and conference track classifications.
            </p>
          </div>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("rooms")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              activeTab === "rooms"
                ? "bg-[var(--card)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <Building2 className="size-3.5" />
            Rooms ({rooms.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tracks")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              activeTab === "tracks"
                ? "bg-[var(--card)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <Tag className="size-3.5" />
            Tracks ({tracks.length})
          </button>
        </div>
      </div>

      {/* ROOMS TAB CONTENT */}
      {activeTab === "rooms" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Rooms List (4 cols) */}
          <div className="lg:col-span-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                All Rooms & Halls ({rooms.length})
              </h3>
              <button
                type="button"
                onClick={handleNewRoom}
                className="flex items-center gap-1 text-xs font-bold text-[var(--pri)] hover:underline cursor-pointer"
              >
                <Plus className="size-3.5" /> Add Room
              </button>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {rooms.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center">
                  <Building2 className="mx-auto size-8 text-[var(--text-tertiary)]" />
                  <h4 className="mt-2 text-xs font-bold text-[var(--text-primary)]">
                    No Rooms Added
                  </h4>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    Add your main auditorium, breakout halls, or workshop spaces.
                  </p>
                  <button
                    type="button"
                    onClick={handleNewRoom}
                    className="mt-3 inline-flex items-center gap-1 rounded-md bg-[var(--pri)] px-3 py-1.5 text-xs font-bold text-[var(--primary-contrast)] shadow-xs hover:brightness-110 cursor-pointer"
                  >
                    <Plus className="size-3" /> Add First Room
                  </button>
                </div>
              ) : (
                rooms.map((room) => {
                  const isSelected = room.id === selectedRoomId;
                  const roomTypeObj = roomTypes.find((t) => (t.code === room.room_type || t.name === room.room_type));
                  return (
                    <div
                      key={room.id}
                      onClick={() => handleSelectRoom(room)}
                      className={cn(
                        "flex items-center justify-between rounded-lg border p-3.5 cursor-pointer transition-all",
                        isSelected
                          ? "border-[var(--pri)] bg-[var(--pri)]/10 shadow-xs"
                          : "border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--surface-subtle)]"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[var(--pri)] shrink-0">
                          <Building2 className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">
                            {room.name || "Untitled Room"}
                          </h4>
                          <p className="text-[11px] text-[var(--text-secondary)] truncate">
                            {roomTypeObj?.name || room.room_type || "Main Hall"} {room.code ? `• ${room.code}` : ""}
                          </p>
                          {room.room_coordinator && (
                            <p className="text-[10px] text-[var(--text-tertiary)] truncate">
                              Coord: {room.room_coordinator}
                            </p>
                          )}
                        </div>
                      </div>

                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0 ml-2">
                        Active
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Room Details Form (8 cols) */}
          <form
            onSubmit={handleSaveRoomSubmit}
            className="lg:col-span-8 space-y-4 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Room Details: {roomForm.name || "New Room"}
              </h3>
              {roomForm.id !== "new" && (
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                  ID: {roomForm.id.substring(0, 8)}
                </span>
              )}
            </div>

            {/* Room Name */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                Room Name *
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                <input
                  required
                  value={roomForm.name}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                  placeholder="e.g. Grand Ballroom A"
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 pr-3 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>
            </div>

            {/* Room Code & Room Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Room Code
                </label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                  <input
                    value={roomForm.code || ""}
                    onChange={(e) => setRoomForm({ ...roomForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. RM-01"
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 pr-3 text-xs font-mono font-bold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Room Type *
                </label>
                <select
                  value={roomForm.room_type || "MAIN_HALL"}
                  onChange={(e) => setRoomForm({ ...roomForm, room_type: e.target.value })}
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                >
                  {loadingTypes ? (
                    <option value="MAIN_HALL">Loading room types...</option>
                  ) : (
                    roomTypes.map((t) => (
                      <option key={t.id || t.code} value={t.code || t.name}>
                        {t.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Room Coordinator */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                Room Coordinator / Lead
              </label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                <input
                  value={roomForm.room_coordinator || ""}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, room_coordinator: e.target.value })
                  }
                  placeholder="Onsite room coordinator / lead"
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 pr-3 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
              {roomForm.id !== "new" ? (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteRoom(roomForm.id);
                    toast.success("Room deleted");
                  }}
                  className="text-xs font-semibold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="size-3.5" /> Delete Room
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-5 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
                >
                  <Save className="size-3.5" /> Save Room
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* TRACKS TAB CONTENT */}
      {activeTab === "tracks" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Tracks List (4 cols) */}
          <div className="lg:col-span-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Conference Tracks ({tracks.length})
              </h3>
              <button
                type="button"
                onClick={handleNewTrack}
                className="flex items-center gap-1 text-xs font-bold text-[var(--pri)] hover:underline cursor-pointer"
              >
                <Plus className="size-3.5" /> Add Track
              </button>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {tracks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center">
                  <Tag className="mx-auto size-8 text-[var(--text-tertiary)]" />
                  <h4 className="mt-2 text-xs font-bold text-[var(--text-primary)]">
                    No Tracks Added
                  </h4>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    Create conference tracks to categorize sessions with custom colors.
                  </p>
                  <button
                    type="button"
                    onClick={handleNewTrack}
                    className="mt-3 inline-flex items-center gap-1 rounded-md bg-[var(--pri)] px-3 py-1.5 text-xs font-bold text-[var(--primary-contrast)] shadow-xs hover:brightness-110 cursor-pointer"
                  >
                    <Plus className="size-3" /> Add First Track
                  </button>
                </div>
              ) : (
                tracks.map((track) => {
                  const isSelected = track.id === trackForm.id;
                  return (
                    <div
                      key={track.id}
                      onClick={() => handleSelectTrack(track)}
                      className={cn(
                        "flex items-center justify-between rounded-lg border p-3.5 cursor-pointer transition-all",
                        isSelected
                          ? "border-[var(--pri)] bg-[var(--pri)]/10 shadow-xs"
                          : "border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--surface-subtle)]"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="size-3.5 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: track.displayColor }}
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">
                            {track.name || "Untitled Track"}
                          </h4>
                          <p className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                            Code: {track.code || "N/A"}
                          </p>
                        </div>
                      </div>

                      <span className="text-xs text-[var(--text-tertiary)] shrink-0 ml-2">
                        #{track.sortOrder}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Track Details Form (8 cols) */}
          <form
            onSubmit={handleSaveTrackSubmit}
            className="lg:col-span-8 space-y-4 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Track Details: {trackForm.name || "New Track"}
              </h3>
              {trackForm.id !== "new" && (
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                  ID: {trackForm.id.substring(0, 8)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Track Name *
                </label>
                <input
                  required
                  value={trackForm.name}
                  onChange={(e) => setTrackForm({ ...trackForm, name: e.target.value })}
                  placeholder="e.g. Cardiology Track"
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Track Code *
                </label>
                <input
                  required
                  value={trackForm.code}
                  onChange={(e) => setTrackForm({ ...trackForm, code: e.target.value })}
                  placeholder="e.g. CARD"
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Track Display Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={trackForm.displayColor}
                    onChange={(e) =>
                      setTrackForm({ ...trackForm, displayColor: e.target.value })
                    }
                    className="size-9 rounded-lg border border-[var(--border-default)] p-1 bg-[var(--bg-surface-2)] cursor-pointer"
                  />
                  <input
                    value={trackForm.displayColor}
                    onChange={(e) =>
                      setTrackForm({ ...trackForm, displayColor: e.target.value })
                    }
                    placeholder="#3b82f6"
                    className="h-9 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Sort Order
                </label>
                <input
                  type="number"
                  min={1}
                  value={trackForm.sortOrder}
                  onChange={(e) =>
                    setTrackForm({ ...trackForm, sortOrder: parseInt(e.target.value) || 1 })
                  }
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                Track Description
              </label>
              <textarea
                rows={3}
                value={trackForm.description}
                onChange={(e) => setTrackForm({ ...trackForm, description: e.target.value })}
                placeholder="Comprehensive cardiovascular science and surgery track."
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
              {trackForm.id !== "new" ? (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTrack(trackForm.id);
                    toast.success("Track deleted");
                  }}
                  className="text-xs font-semibold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="size-3.5" /> Delete Track
                </button>
              ) : (
                <div />
              )}

              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-5 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
              >
                <Save className="size-3.5" /> Save Track
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
