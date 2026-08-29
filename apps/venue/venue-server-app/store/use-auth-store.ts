import { create } from "zustand";
import { UserProfile, VenueEvent } from "@/types";

interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  accessToken: string | null;
  activeEvent: VenueEvent | null;
  setAuth: (user: UserProfile, token: string) => void;
  updateUser: (user: Partial<UserProfile> | UserProfile) => void;
  setActiveEvent: (event: VenueEvent | null) => void;
  logout: () => void;
  initializeFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  accessToken: null,
  activeEvent: null,

  setAuth: (user, token) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("venue_session_active", "true");
      localStorage.setItem("venue_admin_user", JSON.stringify(user));
    }
    set({ isAuthenticated: true, user, accessToken: token });
  },

  updateUser: (updated) => {
    set((state) => {
      if (!state.user) return state;
      const nextUser = { ...state.user, ...updated };
      if (typeof window !== "undefined") {
        localStorage.setItem("venue_admin_user", JSON.stringify(nextUser));
      }
      return { user: nextUser };
    });
  },

  setActiveEvent: (event) => {
    if (typeof window !== "undefined") {
      if (event) {
        localStorage.setItem("venue_active_event", JSON.stringify(event));
      } else {
        localStorage.removeItem("venue_active_event");
      }
    }
    set({ activeEvent: event });
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("venue_admin_token");
      localStorage.removeItem("venue_session_active");
      localStorage.removeItem("venue_admin_user");
    }
    set({ isAuthenticated: false, user: null, accessToken: null });
  },

  initializeFromStorage: () => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("venue_session_active") ? "cookie-session" : null;
      const userStr = localStorage.getItem("venue_admin_user");
      const eventStr = localStorage.getItem("venue_active_event");

      let user = null;
      let event = null;
      try {
        if (userStr) user = JSON.parse(userStr);
        if (eventStr) event = JSON.parse(eventStr);
      } catch {}

      if (token && user) {
        set({ isAuthenticated: true, user, accessToken: token, activeEvent: event });
      } else {
        set({ isAuthenticated: false, user: null, accessToken: null, activeEvent: event });
      }
    }
  },
}));
