"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Calendar, Users, MapPin, Copy, ChevronLeft, ChevronRight, Plus, Edit, Trash, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { useAssignSpeakerToSession } from "@/hooks/useSessionBuilder";

import { useDeleteRoom } from "@/hooks/useRooms";
import { useUpdateSpeaker, useDeleteSpeaker } from "@/hooks/useSpeakers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BuilderCreateRoomDialog } from "./BuilderCreateRoomDialog";
import { RegisterSpeakerDialog } from "../../speakers/RegisterSpeakerDialog";
import { CreateSessionDialog } from "../CreateSessionDialog";
import { SessionDetailDialog } from "../SessionDetailDialog";
import { useDeleteSession } from "@/hooks/useSessions";

export function LeftPalette() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"rooms" | "unscheduled" | "speakers" | "templates">("rooms");
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [roomToEdit, setRoomToEdit] = useState<any | null>(null);
  const [isCreateSpeakerOpen, setIsCreateSpeakerOpen] = useState(false);
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [sessionToEditId, setSessionToEditId] = useState<string | null>(null);

  const { eventId } = useParams() || {};
  const eventIdStr = eventId as string;
  const deleteRoom = useDeleteRoom();
  const updateSpeaker = useUpdateSpeaker(eventIdStr);
  const deleteSpeaker = useDeleteSpeaker(eventIdStr);
  const deleteSession = useDeleteSession(eventIdStr);
  const updateSpeakerInStore = useSessionBuilderStore((s) => s.updateSpeaker);
  const deleteSpeakerInStore = useSessionBuilderStore((s) => s.deleteSpeaker);
  const deleteRoomInStore = useSessionBuilderStore((s) => s.deleteRoom);
  const deleteSessionInStore = useSessionBuilderStore((s) => s.deleteSession);

  const unscheduledSpeakers = useSessionBuilderStore((s) => s.unscheduledSpeakers);
  const sessions = useSessionBuilderStore((s) => s.sessions);
  const rooms = useSessionBuilderStore((s) => s.rooms);
  const { mutate: assignSpeaker } = useAssignSpeakerToSession(eventIdStr);
  const selectedSessionId = useSessionBuilderStore((s) => s.selectedSessionId);
  const addRoom = useSessionBuilderStore((s) => s.addRoom);

  const unscheduledSessions = sessions.filter((s) => !s.room_id);

  const handleDragStart = (e: React.DragEvent, sessionId: string) => {
    e.dataTransfer.setData("text/plain", sessionId);
    e.dataTransfer.effectAllowed = "move";
  };

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-4 px-2 border-r border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] w-14 transition-all z-50 relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="h-8 w-8 rounded-full mb-4 text-muted hover:text-[var(--text)]"
          title="Expand Palette"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="flex flex-col gap-4 text-muted">
          <button onClick={() => { setIsCollapsed(false); setActiveTab("unscheduled"); }} className="p-2 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl relative">
            <Calendar className="h-5 w-5" />
            {unscheduledSessions.length > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[var(--pri)] text-[9px] font-black text-black flex items-center justify-center">{unscheduledSessions.length}</span>}
          </button>
          <button onClick={() => { setIsCollapsed(false); setActiveTab("speakers"); }} className="p-2 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl relative">
            <Users className="h-5 w-5" />
            {unscheduledSpeakers.length > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[var(--sec)] text-[9px] font-black text-black flex items-center justify-center">{unscheduledSpeakers.length}</span>}
          </button>
          <button onClick={() => { setIsCollapsed(false); setActiveTab("rooms"); }} className="p-2 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl">
            <MapPin className="h-5 w-5" />
          </button>
          <button onClick={() => { setIsCollapsed(false); setActiveTab("templates"); }} className="p-2 hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl">
            <Copy className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside className="w-80 flex flex-col border-r border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] h-[calc(100vh-140px)] transition-all z-50 relative">
      {/* Header */}
      <div className="p-4 border-b border-default flex items-center justify-between">
        <h3 className="font-black text-[14px] text-[var(--text)] tracking-tight uppercase">
          Builder <span className="text-[var(--pri)]">Palette</span>
        </h3>
        <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(true)} className="h-7 w-7 rounded-full text-muted hover:text-[var(--text)]">
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 p-2 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] gap-1 border-b border-default text-[10px] font-bold">
        <button onClick={() => setActiveTab("rooms")} className={cn("py-2 rounded-xl text-center flex flex-col items-center gap-1 transition-all", activeTab === "rooms" ? "bg-background text-[var(--pri)] shadow-sm font-black" : "text-muted hover:text-[var(--text)]")}>
          <MapPin className="h-4 w-4" />
          <span>Rooms</span>
        </button>
        <button onClick={() => setActiveTab("unscheduled")} className={cn("py-2 rounded-xl text-center flex flex-col items-center gap-1 transition-all", activeTab === "unscheduled" ? "bg-background text-[var(--pri)] shadow-sm font-black" : "text-muted hover:text-[var(--text)]")}>
          <Calendar className="h-4 w-4" />
          <span>Sessions</span>
        </button>
        <button onClick={() => setActiveTab("speakers")} className={cn("py-2 rounded-xl text-center flex flex-col items-center gap-1 transition-all", activeTab === "speakers" ? "bg-background text-[var(--pri)] shadow-sm font-black" : "text-muted hover:text-[var(--text)]")}>
          <Users className="h-4 w-4" />
          <span>Speakers</span>
        </button>
        <button onClick={() => setActiveTab("templates")} className={cn("py-2 rounded-xl text-center flex flex-col items-center gap-1 transition-all", activeTab === "templates" ? "bg-background text-[var(--pri)] shadow-sm font-black" : "text-muted hover:text-[var(--text)]")}>
          <Copy className="h-4 w-4" />
          <span>Templates</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {activeTab === "unscheduled" && (
          <>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] text-muted font-medium">
                Drag sessions onto the grid to schedule:
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                className="h-6 text-[10px] px-2 rounded-lg font-bold"
                onClick={() => setIsCreateSessionOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {unscheduledSessions.length > 0 ? (
              unscheduledSessions.map((session) => (
                <div
                  key={session.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, session.id)}
                  className="p-3 rounded-2xl border border-default bg-background hover:border-[var(--pri)] transition-all flex flex-col gap-1 cursor-grab active:cursor-grabbing group shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2 items-center">
                      <span className="text-[9px] font-black uppercase tracking-wider text-[var(--pri)] bg-[var(--pri)]/10 px-2 py-0.5 rounded">
                        {session.session_code?.toUpperCase()}
                      </span>
                      <Badge variant="outline" className="text-[9px] font-bold uppercase">
                        {session.session_type}
                      </Badge>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setSessionToEditId(session.id)}
                        className="text-muted hover:text-[var(--pri)] p-1"
                      >
                        <Edit className="w-3 h-3"/>
                      </button>
                      <button 
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this session?")) {
                            deleteSession.mutate(session.id);
                            deleteSessionInStore(session.id);
                          }
                        }} 
                        className="text-muted hover:text-[var(--dan)] p-1"
                      >
                        <Trash className="w-3 h-3"/>
                      </button>
                    </div>
                  </div>
                  <h5 className="font-bold text-[13px] text-[var(--text)] line-clamp-1 group-hover:text-[var(--pri)] transition-colors">
                    {session.name}
                  </h5>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-muted text-[12px] italic">
                All sessions have room allocations! 🎉
              </div>
            )}
          </>
        )}

        {activeTab === "speakers" && (
          <>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] text-muted font-medium">
                Unassigned speakers:
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                className="h-6 text-[10px] px-2 rounded-lg font-bold"
                onClick={() => setIsCreateSpeakerOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {unscheduledSpeakers.length > 0 ? (
              unscheduledSpeakers.map((spk) => (
                <div
                  key={spk.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/json", JSON.stringify({ type: "speaker", data: spk }));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => {
                    if (selectedSessionId) assignSpeaker({ sessionId: selectedSessionId, speaker: spk });
                  }}
                  className={cn(
                    "p-3 rounded-2xl border border-default bg-background hover:border-[var(--pri)] transition-all flex flex-col gap-2 cursor-pointer group shadow-sm",
                    !selectedSessionId && "opacity-80"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="h-8 w-8 rounded-full bg-[var(--pri)]/20 text-[var(--pri)] font-black flex items-center justify-center text-[12px]">
                      {spk.full_name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-[12px] text-[var(--text)] group-hover:text-[var(--pri)] transition-colors">
                        {spk.full_name}
                      </div>
                      <div className="text-[10px] text-muted truncate max-w-[150px]">
                        {spk.email}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const newName = window.prompt("Enter new name for speaker", spk.full_name);
                          if (newName && newName.trim()) {
                            const parts = newName.trim().split(" ");
                            const fn = parts[0];
                            const ln = parts.slice(1).join(" ");
                            updateSpeaker.mutate({ speakerId: spk.id, data: { first_name: fn, last_name: ln }});
                            updateSpeakerInStore(spk.id, { full_name: newName.trim() });
                          }
                        }} 
                        className="text-muted hover:text-[var(--pri)] p-1"
                      >
                        <Edit className="w-3 h-3"/>
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Are you sure you want to delete this speaker?")) {
                            deleteSpeaker.mutate(spk.id);
                            deleteSpeakerInStore(spk.id);
                          }
                        }} 
                        className="text-muted hover:text-[var(--dan)] p-1"
                      >
                        <Trash className="w-3 h-3"/>
                      </button>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={!selectedSessionId} className="h-7 text-[10px] font-bold rounded-lg px-2 w-full mt-1">
                    Assign to Session
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-muted text-[12px] italic">
                No unassigned speakers remaining.
              </div>
            )}
          </>
        )}

        {activeTab === "rooms" && (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] text-muted font-medium">
                Available Rooms:
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                className="h-6 text-[10px] px-2 rounded-lg font-bold"
                onClick={() => setIsCreateRoomOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Room
              </Button>
            </div>
            {rooms.map((room) => (
              <div key={room.id} className="p-3 rounded-2xl border border-default bg-background transition-all flex flex-col gap-1 shadow-sm group">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[13px] text-[var(--text)]">{room.name}</div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          setRoomToEdit(room);
                          setIsCreateRoomOpen(true);
                        }} 
                        className="text-muted hover:text-[var(--pri)] p-1"
                      >
                        <Edit className="w-3 h-3"/>
                      </button>
                      <button 
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this room?")) {
                            deleteRoom.mutate({ eventId: eventIdStr, roomId: room.id });
                            deleteRoomInStore(room.id);
                          }
                        }} 
                        className="text-muted hover:text-[var(--dan)] p-1"
                      >
                        <Trash className="w-3 h-3"/>
                      </button>
                    </div>
                </div>
                <div className="text-[10px] text-muted flex justify-between">
                  <span>{room.room_type}</span>
                  {room.capacity && <span className="font-bold">{room.capacity} seats</span>}
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === "templates" && (
          <>
            <div className="text-[11px] text-muted font-medium mb-2 mt-4 border-t border-default pt-4 first:mt-0 first:border-0 first:pt-0">
              Drag snippets to schedule:
            </div>
            {[
              { id: 'TEMPLATE_BREAK', name: 'Coffee Break', type: 'BREAK', mins: 30 },
              { id: 'TEMPLATE_REGISTRATION', name: 'Registration', type: 'REGISTRATION', mins: 60 },
              { id: 'TEMPLATE_LUNCH', name: 'Lunch Break', type: 'MEAL', mins: 60 },
              { id: 'TEMPLATE_NETWORKING', name: 'Networking Session', type: 'NETWORKING', mins: 45 },
            ].map((t) => (
              <div 
                key={t.id} 
                draggable
                onDragStart={(e) => handleDragStart(e, t.id)}
                className="w-full text-left p-3 rounded-2xl border border-default bg-background hover:border-[var(--pri)] hover:text-[var(--pri)] transition-all flex items-center justify-between group shadow-sm mb-2 cursor-grab active:cursor-grabbing"
              >
                <span className="font-bold text-[12px]">{t.name}</span>
                <span className="text-[10px] text-muted">{t.mins}m</span>
              </div>
            ))}

          </>
        )}

      </div>

      <BuilderCreateRoomDialog 
        isOpen={isCreateRoomOpen} 
        onClose={() => { setIsCreateRoomOpen(false); setRoomToEdit(null); }} 
        roomToEdit={roomToEdit}
      />
      
      <RegisterSpeakerDialog
        isOpen={isCreateSpeakerOpen}
        onClose={() => setIsCreateSpeakerOpen(false)}
        eventId={eventIdStr}
      />

      <CreateSessionDialog
        isOpen={isCreateSessionOpen}
        onClose={() => setIsCreateSessionOpen(false)}
        eventId={eventIdStr}
        preloadedRooms={rooms}
      />

      {sessionToEditId && (
        <SessionDetailDialog
          isOpen={!!sessionToEditId}
          onClose={() => setSessionToEditId(null)}
          sessionId={sessionToEditId}
          eventId={eventIdStr}
        />
      )}
    </aside>
  );
}
