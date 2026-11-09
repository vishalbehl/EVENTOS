import { create } from "zustand";
import { persist } from "zustand/middleware";

interface EventState {
  selectedEventId: string | null;
  setSelectedEventId: (id: string | null) => void;
  resetForAccessContext: () => void;
}

export const useEventStore = create<EventState>()(
  persist(
    (set) => ({
      selectedEventId: null,
      setSelectedEventId: (id) => set({ selectedEventId: id }),
      resetForAccessContext: () => set({ selectedEventId: null }),
    }),
    {
      name: "conf_event_storage",
    }
  )
);
