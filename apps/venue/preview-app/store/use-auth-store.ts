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
  stationNumber: number;
  accessToken: string | null;
  deviceKey: string | null;
  setAuth: (user: User, token?: string | null) => void;
  setDeviceKey: (key: string | null) => void;
  setMode: (mode: AppMode) => void;
  setStationNumber: (num: number) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      mode: "workstation",
      stationNumber: 1,
      accessToken: null,
      deviceKey: null,
      setAuth: (user, token = null) => set({ isAuthenticated: true, user, accessToken: token }),
      setDeviceKey: (deviceKey) => set({ deviceKey }),
      setMode: (mode) => set({ mode }),
      setStationNumber: (stationNumber) => set({ stationNumber }),
      logout: () => set({ isAuthenticated: false, user: null, accessToken: null }),
    }),
    {
      name: "eventos-srr-auth-storage",
    }
  )
);
