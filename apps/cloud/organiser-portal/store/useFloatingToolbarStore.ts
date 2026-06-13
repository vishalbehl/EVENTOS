import { create } from "zustand";

interface ToolbarAction {
  label: string;
  icon: any;
  onClick: () => void;
  color?: string;
}

interface FloatingToolbarStore {
  actions: ToolbarAction[];
  setActions: (actions: ToolbarAction[]) => void;
  clearActions: () => void;
}

export const useFloatingToolbarStore = create<FloatingToolbarStore>((set) => ({
  actions: [],
  setActions: (actions) => set({ actions }),
  clearActions: () => set({ actions: [] }),
}));
