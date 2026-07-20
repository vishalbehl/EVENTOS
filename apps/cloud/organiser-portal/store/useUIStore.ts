import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  isSidebarCollapsed: boolean;
  isMobileOpen: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setMobileOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      isMobileOpen: false,
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setMobileOpen: (open) => set({ isMobileOpen: open }),
      toggleMobileSidebar: () => set((state) => ({ isMobileOpen: !state.isMobileOpen })),
    }),
    {
      name: 'event-os-ui-storage',
      partialize: (state) => ({ isSidebarCollapsed: state.isSidebarCollapsed }),
    }
  )
);
