"use client";

import { create } from "zustand";
import { formatLocalDate } from "@/lib/utils";

export type ViewMode = "kanban" | "timeline" | "list" | "calendar";

export interface BuilderSpeaker {
  id: string;
  session_speaker_id?: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  upload_status: string;
  talk_order?: number;
  presentation_title?: string;
  start_time?: string;
  end_time?: string;
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
  track_id?: string | null;
  display_color?: string | null;
  sort_order?: number;
}

export interface BuilderRoom {
  id: string;
  event_id: string;
  name: string;
  capacity?: number;
  screen_count: number;
  room_type: string;
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
  type: "room_overlap" | "speaker_conflict" | "out_of_bounds";
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

  // History & Save
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  setIsSaving: (saving: boolean) => void;
  recomputeConflicts: () => void;
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

  history: [],
  future: [],

  setSnapshot: (data) => {
    const dates = data.sessions.map((s) => s.start_time.split("T")[0]).sort();
    const defaultDate = dates[0] || data.event_start_date?.split("T")[0] || formatLocalDate(new Date());

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

  markSaved: () =>
    set({
      isDirty: false,
      isSaving: false,
      lastSavedAt: new Date(),
    }),

  setIsSaving: (isSaving) => set({ isSaving }),

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

    // Speaker double booking check
    const speakerSessionsMap: Record<string, BuilderSession[]> = {};
    sessions.forEach((s) => {
      (s.speakers || []).forEach((spk) => {
        if (!speakerSessionsMap[spk.id]) speakerSessionsMap[spk.id] = [];
        speakerSessionsMap[spk.id].push(s);
      });
    });

    Object.entries(speakerSessionsMap).forEach(([speakerId, spkSess]) => {
      for (let i = 0; i < spkSess.length; i++) {
        for (let j = i + 1; j < spkSess.length; j++) {
          const a = spkSess[i];
          const b = spkSess[j];
          const startA = new Date(a.start_time).getTime();
          const endA = new Date(a.end_time).getTime();
          const startB = new Date(b.start_time).getTime();
          const endB = new Date(b.end_time).getTime();

          if (startA < endB && endA > startB) {
            const speakerName = a.speakers?.find((sp) => sp.id === speakerId)?.full_name || "Speaker";
            conflicts.push({
              type: "speaker_conflict",
              session_ids: [a.id, b.id],
              speaker_id: speakerId,
              description: `${speakerName} double-booked between '${a.name}' and '${b.name}'`,
              severity: "error",
            });
          }
        }
      }
    });

    set({ conflicts });
  },
}));
