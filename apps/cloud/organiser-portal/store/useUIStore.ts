import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OrganisationBackground =
  | 'landscape'
  | 'aurora'
  | 'mist'
  | 'celestial'
  | 'dune'
  | 'emerald'
  | 'prism'
  | 'solaris'
  | 'topo'
  | 'cyber'
  | 'glacier'
  | 'monochrome'
  | 'sakura';

interface UIState {
  organisationBackground: OrganisationBackground;
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
  setOrganisationBackground: (preset: OrganisationBackground) => void;
  resetForAccessContext: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      organisationBackground: 'landscape',
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
      setOrganisationBackground: (organisationBackground) => {
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-organisation-background', organisationBackground);
        }
        set({ organisationBackground });
      },
      resetForAccessContext: () => set({
        isMobileOpen: false,
        selectedEventService: null,
      }),
    }),
    {
      name: 'event-os-ui-storage',
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        isSecondarySidebarOpen: state.isSecondarySidebarOpen,
        organisationBackground: state.organisationBackground,
      }),
    }
  )
);
