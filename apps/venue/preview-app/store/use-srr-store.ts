import { create } from "zustand";

export interface PresentationItem {
  id: string;
  original_filename: string;
  file_format: string;
  file_size_bytes: number;
  file_size_mb: number;
  slides_count: number | null;
  videos_count: number | null;
  animations_count: number | null;
  images_count: number | null;
  version: number;
  upload_status: string;
  is_current: boolean;
  storage_path?: string | null;
  local_cache_path?: string | null;
  download_url?: string | null;
  content_sha256?: string | null;
  last_modified?: string;
  thumbnails?: string[];
}

export interface SessionItem {
  session_id: string;
  session_speaker_id: string;
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  starts_in_minutes: number | null;
  status: "selected" | "not_uploaded" | "ready" | "pending";
  presentations: PresentationItem[];
}

export interface SpeakerProfile {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  organization: string;
  designation: string;
}

interface SRRState {
  currentStep: number; // 1: Idle / Check-in, 2: Setup, 3: Preview & Test, 4: Finalize
  speaker: SpeakerProfile | null;
  sessions: SessionItem[];
  selectedSessionIndex: number;
  selectedPresentationId: string | null;
  
  // Preview Player State
  activeSlideIndex: number;
  totalSlides: number;
  isPlaying: boolean;
  isFullscreen: boolean;
  audioVolume: number;
  slideTimerSeconds: number;
  
  // Native Editor & Watcher State
  isNativeEditing: boolean;
  isSaving: boolean;
  lastSavedSecondsAgo: number;
  fileModified: boolean;
  
  // Actions
  setCurrentStep: (step: number) => void;
  setSpeaker: (speaker: SpeakerProfile | null) => void;
  setSessions: (sessions: SessionItem[]) => void;
  selectSession: (index: number) => void;
  selectPresentation: (id: string) => void;
  setActiveSlideIndex: (index: number) => void;
  setPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
  incrementTimer: () => void;
  resetTimer: () => void;
  setNativeEditing: (editing: boolean) => void;
  markFileModified: () => void;
  resetSession: () => void;
  updatePresentationFile: (sessionIndex: number, newFile: Partial<PresentationItem>) => void;
}

export const useSRRStore = create<SRRState>((set, get) => ({
  currentStep: 1,
  speaker: null,
  sessions: [],
  selectedSessionIndex: 0,
  selectedPresentationId: null,
  
  activeSlideIndex: 0,
  totalSlides: 0,
  isPlaying: false,
  isFullscreen: false,
  audioVolume: 75,
  slideTimerSeconds: 0,
  
  isNativeEditing: false,
  isSaving: false,
  lastSavedSecondsAgo: 0,
  fileModified: false,
  
  setCurrentStep: (step) => set({ currentStep: step }),
  setSpeaker: (speaker) => set({ speaker }),
  setSessions: (sessions) => set({ sessions }),
  selectSession: (index) => {
    const sessions = get().sessions;
    const session = sessions[index];
    const firstPresId = session?.presentations?.[0]?.id || null;
    set({
      selectedSessionIndex: index,
      selectedPresentationId: firstPresId,
      totalSlides: session?.presentations?.[0]?.slides_count || 0,
      activeSlideIndex: 0,
    });
  },
  selectPresentation: (id) => {
    const sessions = get().sessions;
    const currentSession = sessions[get().selectedSessionIndex];
    const pres = currentSession?.presentations?.find((p) => p.id === id);
    set({
      selectedPresentationId: id,
      totalSlides: pres?.slides_count || 0,
      activeSlideIndex: 0,
    });
  },
  setActiveSlideIndex: (index) => set({ activeSlideIndex: index }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setVolume: (audioVolume) => set({ audioVolume }),
  incrementTimer: () => set((state) => ({ slideTimerSeconds: state.slideTimerSeconds + 1 })),
  resetTimer: () => set({ slideTimerSeconds: 0 }),
  setNativeEditing: (isNativeEditing) => set({ isNativeEditing }),
  markFileModified: () => set({ fileModified: true, lastSavedSecondsAgo: 0 }),
  resetSession: () =>
    set({
      currentStep: 1,
      speaker: null,
      sessions: [],
      selectedSessionIndex: 0,
      selectedPresentationId: null,
      activeSlideIndex: 0,
      isNativeEditing: false,
      fileModified: false,
    }),
  updatePresentationFile: (sessionIndex, newFile) => {
    const sessions = [...get().sessions];
    if (sessions[sessionIndex]) {
      const presList = sessions[sessionIndex].presentations;
      if (presList.length > 0) {
        presList[0] = { ...presList[0], ...newFile } as PresentationItem;
      } else {
        presList.push({
          id: newFile.id || "",
          original_filename: newFile.original_filename || "Presentation.pptx",
          file_format: newFile.file_format || "",
          file_size_bytes: newFile.file_size_bytes || 0,
          file_size_mb: newFile.file_size_mb || 0,
          slides_count: newFile.slides_count ?? null,
          videos_count: newFile.videos_count ?? null,
          animations_count: newFile.animations_count ?? null,
          images_count: newFile.images_count ?? null,
          version: newFile.version || 1,
          upload_status: newFile.upload_status || "pending",
          is_current: true,
        });
      }
      sessions[sessionIndex].status = "selected";
      set({ sessions, selectedSessionIndex: sessionIndex });
    }
  },
}));
