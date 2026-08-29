import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  isSidebarCollapsed: boolean;
  isMobileOpen: boolean;
  isSecondarySidebarOpen: boolean;
  selectedEventService: string | null;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setMobileOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  setSecondarySidebarOpen: (open: boolean) => void;
  toggleSecondarySidebar: () => void;
  setSelectedEventService: (service: string | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      isMobileOpen: false,
      isSecondarySidebarOpen: false,
      selectedEventService: null,
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setMobileOpen: (open) => set({ isMobileOpen: open }),
      toggleMobileSidebar: () => set((state) => ({ isMobileOpen: !state.isMobileOpen })),
      setSecondarySidebarOpen: (open) => set({ isSecondarySidebarOpen: open }),
      toggleSecondarySidebar: () => set((state) => ({ isSecondarySidebarOpen: !state.isSecondarySidebarOpen })),
      setSelectedEventService: (service) => set({ selectedEventService: service }),
    }),
    {
      name: 'event-os-ui-storage',
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        isSecondarySidebarOpen: state.isSecondarySidebarOpen,
      }),
    }
  )
);
