"use client";

import { create } from "zustand";
import { formatLocalDate } from "@/lib/utils";

export type ViewMode = "kanban" | "timeline" | "list" | "calendar";

export interface BuilderSpeaker {
  id: string;
  session_speaker_id?: string;
  full_name: string;
  email: string;
  role?: string;
  avatar_url?: string;
  upload_status: string;
  talk_order?: number;
  presentation_title?: string;
  start_time?: string;
  end_time?: string;
}

export interface BuilderTalk {
  id: string;
  title: string;
  duration_minutes?: number;
  speaker_names?: string[];
}

export interface BuilderSession {
  id: string;
  event_id: string;
  session_code: string;
  name: string;
  session_type: string;
  status: string;
  start_time: string;
  end_time: string;
  room_id: string | null;
  room_name?: string | null;
  moderator_name?: string | null;
  description?: string | null;
  event_timezone?: string;
  speaker_count?: number;
  readiness_pct?: number;
  speakers?: BuilderSpeaker[];
  talks?: BuilderTalk[];
  registered_attendees?: number;
  track_id?: string | null;
  track_name?: string | null;
  display_color?: string | null;
  cme_credits?: number | null;
  cme_eligible?: boolean;
  operations_notes?: string | null;
  seating_layout?: string | null;
  live_stream_url?: string | null;
  sort_order?: number;
  is_published?: boolean;
}

export interface BuilderRoom {
  id: string;
  event_id: string;
  name: string;
  capacity?: number;
  screen_count: number;
  room_type: string;
  room_coordinator?: string;
  av_technician?: string;
  location_notes?: string;
  is_active: boolean;
  sort_order?: number;
  sessions_count?: number;
}

export interface BuilderTrack {
  id: string;
  event_id: string;
  name: string;
  description?: string | null;
  display_color?: string | null;
  sort_order?: number;
}

export interface SchedulingConflict {
  type: "room_overlap" | "speaker_conflict" | "out_of_bounds" | "capacity_mismatch" | "travel_time" | "session_overflow" | "unassigned_moderator";
  session_ids: string[];
  speaker_id?: string | null;
  room_id?: string | null;
  description: string;
  severity: "error" | "warning";
}

interface SnapshotState {
  sessions: BuilderSession[];
}

interface SessionBuilderState {
  // Data
  sessions: BuilderSession[];
  rooms: BuilderRoom[];
  tracks: BuilderTrack[];
  unscheduledSpeakers: BuilderSpeaker[];
  conflicts: SchedulingConflict[];
  eventTimezone: string;
  eventStartDate: string | null;
  eventEndDate: string | null;

  // UI State
  viewMode: ViewMode;
  selectedDate: string; // ISO date string YYYY-MM-DD
  selectedSessionId: string | null;
  searchQuery: string;
  trackFilter: string | null;
  isConflictPanelOpen: boolean;
  isQuickEditOpen: boolean;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  zoomLevel: number; // 1 = 120px/hr, 0.5 = 60px/hr, 2 = 240px/hr

  // Undo / Redo history stacks (max 50)
  history: SnapshotState[];
  future: SnapshotState[];

  // Actions
  setSnapshot: (data: {
    sessions: BuilderSession[];
    rooms: BuilderRoom[];
    tracks: BuilderTrack[];
    unscheduled_speakers: BuilderSpeaker[];
    conflicts: SchedulingConflict[];
    event_timezone: string;
    event_start_date?: string | null;
    event_end_date?: string | null;
  }) => void;

  setViewMode: (mode: ViewMode) => void;
  setSelectedDate: (date: string) => void;
  setSelectedSessionId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setTrackFilter: (trackId: string | null) => void;
  toggleConflictPanel: () => void;
  toggleQuickEdit: (open?: boolean) => void;

  // Builder DnD Operations
  moveSession: (sessionId: string, targetRoomId: string | null, newStartTime: string, newEndTime: string) => void;
  updateSession: (sessionId: string, patch: Partial<BuilderSession>) => void;
  assignSpeakerToSession: (sessionId: string, speaker: BuilderSpeaker) => void;
  removeSpeakerFromSession: (sessionId: string, speakerId: string) => void;
  deleteSession: (sessionId: string) => void;
  addSession: (session: BuilderSession) => void;
  updateSpeaker: (speakerId: string, patch: Partial<BuilderSpeaker>) => void;
  deleteSpeaker: (speakerId: string) => void;
  addRoom: (room: BuilderRoom) => void;
  updateRoom: (roomId: string, patch: Partial<BuilderRoom>) => void;
  deleteRoom: (roomId: string) => void;

  // History & Save
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  setIsSaving: (saving: boolean) => void;
  recomputeConflicts: () => void;
  setZoomLevel: (zoom: number) => void;
}

const MAX_HISTORY = 50;

export const useSessionBuilderStore = create<SessionBuilderState>((set, get) => ({
  sessions: [],
  rooms: [],
  tracks: [],
  unscheduledSpeakers: [],
  conflicts: [],
  eventTimezone: "UTC",
  eventStartDate: null,
  eventEndDate: null,

  viewMode: "kanban",
  selectedDate: formatLocalDate(new Date()),
  selectedSessionId: null,
  searchQuery: "",
  trackFilter: null,
  isConflictPanelOpen: false,
  isQuickEditOpen: false,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  zoomLevel: 1,

  history: [],
  future: [],

  setSnapshot: (data) => {
    const dates = data.sessions
      .filter((s) => s.start_time)
      .map((s) => s.start_time.split("T")[0].split(" ")[0])
      .sort();
    const defaultDate = dates[0] || data.event_start_date?.split("T")[0]?.split(" ")[0] || formatLocalDate(new Date());

    set({
      sessions: data.sessions,
      rooms: data.rooms,
      tracks: data.tracks,
      unscheduledSpeakers: data.unscheduled_speakers,
      conflicts: data.conflicts,
      eventTimezone: data.event_timezone || "UTC",
      eventStartDate: data.event_start_date || null,
      eventEndDate: data.event_end_date || null,
      selectedDate: defaultDate,
      history: [],
      future: [],
      isDirty: false,
    });
  },

  setViewMode: (viewMode) => set({ viewMode }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setSelectedSessionId: (selectedSessionId) =>
    set({
      selectedSessionId,
      isQuickEditOpen: !!selectedSessionId,
    }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setTrackFilter: (trackFilter) => set({ trackFilter }),
  toggleConflictPanel: () => set((s) => ({ isConflictPanelOpen: !s.isConflictPanelOpen })),
  toggleQuickEdit: (open) =>
    set((s) => ({
      isQuickEditOpen: open !== undefined ? open : !s.isQuickEditOpen,
      selectedSessionId: open === false ? null : s.selectedSessionId,
    })),

  pushHistory: () => {
    const { sessions, history } = get();
    const snapshot: SnapshotState = { sessions: JSON.parse(JSON.stringify(sessions)) };
    const newHistory = [...history, snapshot].slice(-MAX_HISTORY);
    set({ history: newHistory, future: [], isDirty: true });
  },

  undo: () => {
    const { history, sessions, future } = get();
    if (history.length === 0) return;

    const currentSnapshot: SnapshotState = { sessions: JSON.parse(JSON.stringify(sessions)) };
    const previous = history[history.length - 1];

    set({
      sessions: previous.sessions,
      history: history.slice(0, -1),
      future: [currentSnapshot, ...future],
      isDirty: true,
    });

    get().recomputeConflicts();
  },

  redo: () => {
    const { future, sessions, history } = get();
    if (future.length === 0) return;

    const currentSnapshot: SnapshotState = { sessions: JSON.parse(JSON.stringify(sessions)) };
    const next = future[0];

    set({
      sessions: next.sessions,
      future: future.slice(1),
      history: [...history, currentSnapshot],
      isDirty: true,
    });

    get().recomputeConflicts();
  },

  moveSession: (sessionId, targetRoomId, newStartTime, newEndTime) => {
    get().pushHistory();

    const rooms = get().rooms;
    const roomName = targetRoomId ? rooms.find((r) => r.id === targetRoomId)?.name || null : null;

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              room_id: targetRoomId,
              room_name: roomName,
              start_time: newStartTime,
              end_time: newEndTime,
            }
          : s
      ),
    }));

    get().recomputeConflicts();
  },

  updateSession: (sessionId, patch) => {
    get().pushHistory();
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
    }));
    get().recomputeConflicts();
  },

  assignSpeakerToSession: (sessionId, speaker) => {
    get().pushHistory();
    set((state) => {
      const updatedSessions = state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const currentSpeakers = s.speakers || [];
        if (currentSpeakers.some((sp) => sp.id === speaker.id)) return s;
        const newSpeakers = [
          ...currentSpeakers,
          {
            ...speaker,
            talk_order: currentSpeakers.length,
          },
        ];
        return {
          ...s,
          speakers: newSpeakers,
          speaker_count: newSpeakers.length,
        };
      });

      const updatedUnscheduled = state.unscheduledSpeakers.filter((sp) => sp.id !== speaker.id);

      return {
        sessions: updatedSessions,
        unscheduledSpeakers: updatedUnscheduled,
      };
    });
    get().recomputeConflicts();
  },

  removeSpeakerFromSession: (sessionId, speakerId) => {
    get().pushHistory();
    set((state) => {
      let removedSpeaker: BuilderSpeaker | null = null;

      const updatedSessions = state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const currentSpeakers = s.speakers || [];
        removedSpeaker = currentSpeakers.find((sp) => sp.id === speakerId) || null;
        const newSpeakers = currentSpeakers.filter((sp) => sp.id !== speakerId);
        return {
          ...s,
          speakers: newSpeakers,
          speaker_count: newSpeakers.length,
        };
      });

      const updatedUnscheduled = removedSpeaker
        ? [...state.unscheduledSpeakers, removedSpeaker]
        : state.unscheduledSpeakers;

      return {
        sessions: updatedSessions,
        unscheduledSpeakers: updatedUnscheduled,
      };
    });
    get().recomputeConflicts();
  },

  deleteSession: (sessionId) => {
    get().pushHistory();
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      selectedSessionId: state.selectedSessionId === sessionId ? null : state.selectedSessionId,
    }));
    get().recomputeConflicts();
  },

  addSession: (session) => {
    get().pushHistory();
    set((state) => ({
      sessions: [session, ...state.sessions],
    }));
    get().recomputeConflicts();
  },

  addRoom: (room) => {
    set((state) => ({
      rooms: [...state.rooms, room],
    }));
  },

  updateRoom: (roomId, patch) => {
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, ...patch } : r
      ),
    }));
  },

  updateSpeaker: (speakerId, patch) => {
    set((state) => ({
      unscheduledSpeakers: state.unscheduledSpeakers.map((sp) =>
        sp.id === speakerId ? { ...sp, ...patch } : sp
      ),
      sessions: state.sessions.map(s => ({
        ...s,
        speakers: (s.speakers || []).map(sp => sp.id === speakerId ? { ...sp, ...patch } : sp)
      }))
    }));
  },

  deleteSpeaker: (speakerId) => {
    set((state) => ({
      unscheduledSpeakers: state.unscheduledSpeakers.filter((sp) => sp.id !== speakerId),
      sessions: state.sessions.map(s => ({
        ...s,
        speakers: (s.speakers || []).filter(sp => sp.id !== speakerId),
        speaker_count: (s.speakers || []).filter(sp => sp.id !== speakerId).length
      }))
    }));
  },

  deleteRoom: (roomId) => {
    set((state) => ({
      rooms: state.rooms.filter((r) => r.id !== roomId),
      sessions: state.sessions.map(s => s.room_id === roomId ? { ...s, room_id: null, room_name: null } : s)
    }));
  },

  markSaved: () =>
    set({
      isDirty: false,
      isSaving: false,
      lastSavedAt: new Date(),
    }),

  setIsSaving: (isSaving) => set({ isSaving }),
  
  setZoomLevel: (zoom) => set({ zoomLevel: zoom }),

  recomputeConflicts: () => {
    const { sessions } = get();
    const conflicts: SchedulingConflict[] = [];

    // Client-side quick conflict check
    const roomSessionsMap: Record<string, BuilderSession[]> = {};
    sessions.forEach((s) => {
      if (s.room_id) {
        if (!roomSessionsMap[s.room_id]) roomSessionsMap[s.room_id] = [];
        roomSessionsMap[s.room_id].push(s);
      }
    });

    Object.entries(roomSessionsMap).forEach(([roomId, roomSess]) => {
      for (let i = 0; i < roomSess.length; i++) {
        for (let j = i + 1; j < roomSess.length; j++) {
          const a = roomSess[i];
          const b = roomSess[j];
          const startA = new Date(a.start_time).getTime();
          const endA = new Date(a.end_time).getTime();
          const startB = new Date(b.start_time).getTime();
          const endB = new Date(b.end_time).getTime();

          if (startA < endB && endA > startB) {
            conflicts.push({
              type: "room_overlap",
              session_ids: [a.id, b.id],
              room_id: roomId,
              description: `Room conflict: '${a.name}' overlaps with '${b.name}'`,
              severity: "error",
            });
          }
        }
      }
    });

    // Speaker double booking check & Travel Time
    const speakerSessionsMap: Record<string, BuilderSession[]> = {};
    sessions.forEach((s) => {
      (s.speakers || []).forEach((spk) => {
        if (!speakerSessionsMap[spk.id]) speakerSessionsMap[spk.id] = [];
        speakerSessionsMap[spk.id].push(s);
      });
    });

    Object.entries(speakerSessionsMap).forEach(([speakerId, spkSess]) => {
      // Sort sessions by start time
      spkSess.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      for (let i = 0; i < spkSess.length; i++) {
        for (let j = i + 1; j < spkSess.length; j++) {
          const a = spkSess[i];
          const b = spkSess[j];
          const startA = new Date(a.start_time).getTime();
          const endA = new Date(a.end_time).getTime();
          const startB = new Date(b.start_time).getTime();
          const endB = new Date(b.end_time).getTime();

          const speakerName = a.speakers?.find((sp) => sp.id === speakerId)?.full_name || 'Speaker';

          if (startA < endB && endA > startB) {
            conflicts.push({
              type: 'speaker_conflict',
              session_ids: [a.id, b.id],
              speaker_id: speakerId,
              description: `${speakerName} is double-booked between '${a.name}' and '${b.name}'`,
              severity: 'error',
            });
          } else if (a.room_id !== b.room_id && startB - endA < 15 * 60000 && startB >= endA) {
            // Less than 15 mins travel time between different rooms
            conflicts.push({
              type: 'travel_time',
              session_ids: [a.id, b.id],
              speaker_id: speakerId,
              description: `${speakerName} has less than 15m to travel between '${a.name}' and '${b.name}'`,
              severity: 'warning',
            });
          }
        }
      }
    });

    // Session overflow & Capacity & Moderator
    const rooms = get().rooms;
    sessions.forEach(s => {
       // Session overflow
       const start = new Date(s.start_time).getTime();
       const end = new Date(s.end_time).getTime();
       const totalTalkMins = (s.talks || []).reduce((acc, t) => acc + (t.duration_minutes || 0), 0);
       const sessionMins = (end - start) / 60000;
       
       if (totalTalkMins > sessionMins) {
          conflicts.push({
             type: 'session_overflow',
             session_ids: [s.id],
             description: `Total talk time (${totalTalkMins}m) exceeds session duration (${sessionMins}m)`,
             severity: 'warning'
          });
       }

       // Capacity mismatch
       if (s.room_id) {
          const room = rooms.find(r => r.id === s.room_id);
          if (room && room.capacity && s.registered_attendees && s.registered_attendees > room.capacity) {
             conflicts.push({
                type: 'capacity_mismatch',
                session_ids: [s.id],
                room_id: s.room_id,
                description: `Registered attendees (${s.registered_attendees}) exceeds room capacity (${room.capacity})`,
                severity: 'warning'
             });
          }
       }

       // Unassigned moderator
       if (s.session_type === 'PANEL' && (!s.speakers || s.speakers.length === 0)) {
           conflicts.push({
               type: 'unassigned_moderator',
               session_ids: [s.id],
               description: `Panel session '${s.name}' requires at least one speaker/moderator`,
               severity: 'warning'
           });
       }
    });

    set({ conflicts });
  },
}));
