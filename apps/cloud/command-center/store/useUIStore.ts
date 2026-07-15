import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  density: 'comfortable' | 'compact';
  isSidebarCollapsed: boolean;
  isMobileSidebarOpen: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  setDensity: (density: 'comfortable' | 'compact') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      density: 'comfortable',
      isSidebarCollapsed: false,
      isMobileSidebarOpen: false,
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      setMobileSidebarOpen: (open) => set({ isMobileSidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      toggleMobileSidebar: () => set((state) => ({ isMobileSidebarOpen: !state.isMobileSidebarOpen })),
      setDensity: (density) => set({ density }),
    }),
    {
      name: 'event-os-ui-storage',
      partialize: (state) => ({ isSidebarCollapsed: state.isSidebarCollapsed, density: state.density }),
    }
  )
);
