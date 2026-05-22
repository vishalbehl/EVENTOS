import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  role: 'super_admin' | 'organiser' | 'admin' | 'session_manager' | 'technician' | 'volunteer';
  organization_id: string;
  phone?: string;
  avatar_url?: string;
  is_2fa_enabled?: boolean;
  assignments?: any[];
  allowed_ips?: string[];
  notification_preferences?: Record<string, any>;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  rememberMe: boolean;
  loginTime: number | null;
  lastActivity: number | null;
  hasHydrated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken?: string, rememberMe?: boolean) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  updateActivity: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      rememberMe: false,
      loginTime: null,
      lastActivity: null,
      hasHydrated: false,
      setAuth: (user, accessToken, refreshToken, rememberMe = false) => 
        set({ 
          user, 
          accessToken, 
          refreshToken: refreshToken || null, 
          isAuthenticated: true,
          rememberMe,
          loginTime: Date.now(),
          lastActivity: Date.now()
        }),
      logout: () => 
        set({ 
          user: null, 
          accessToken: null, 
          refreshToken: null, 
          isAuthenticated: false,
          rememberMe: false,
          loginTime: null,
          lastActivity: null
        }),
      updateUser: (userData) => 
        set((state) => ({
          user: state.user ? { ...state.user, ...userData as User } : null
        })),
      updateActivity: () =>
        set((state) => ({
          lastActivity: state.isAuthenticated ? Date.now() : null
        })),
      setHasHydrated: (state) => set({ hasHydrated: state })
    }),
    {
      name: 'obsidian-auth-storage',
      partialize: (state) => {
        const { hasHydrated, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      }
    }
  )
);
