import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppMode = "scanning" | "workstation" | "admin";

export interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  allowed_modes?: AppMode[];
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  mode: AppMode;
  stationNumber: number | null;
  accessToken: string | null;
  setAuth: (user: User, token?: string | null) => void;
  setMode: (mode: AppMode) => void;
  setStationNumber: (num: number | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      mode: "workstation",
      stationNumber: null,
      accessToken: null,
      setAuth: (user, token = null) => set({ isAuthenticated: true, user, accessToken: token }),
      setMode: (mode) => set({ mode }),
      setStationNumber: (stationNumber) => set({ stationNumber }),
      logout: () => set({ isAuthenticated: false, user: null, accessToken: null }),
    }),
    {
      name: "eventos-srr-auth-storage",
    }
  )
);
