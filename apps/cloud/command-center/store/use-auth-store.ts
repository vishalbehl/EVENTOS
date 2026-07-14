import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserRole } from '../types/models';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  role: UserRole;
  organization_id: string;
  phone?: string;
  avatar_url?: string;
  is_2fa_enabled?: boolean;
  is_platform_admin?: boolean;
  platform_role?: string;
  org_role?: 'owner' | 'admin' | 'member' | 'billing_only';
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
  
  // Impersonation Support
  originalUser: User | null;
  originalAccessToken: string | null;
  originalRefreshToken: string | null;
  impersonatedOrgName: string | null;
  impersonatedUserName: string | null;

  setAuth: (user: User, accessToken: string, refreshToken?: string, rememberMe?: boolean) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  updateActivity: () => void;
  setHasHydrated: (state: boolean) => void;
  startImpersonation: (impersonatedUser: User, token: string, orgName: string, userName: string) => void;
  stopImpersonation: () => void;
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
      
      originalUser: null,
      originalAccessToken: null,
      originalRefreshToken: null,
      impersonatedOrgName: null,
      impersonatedUserName: null,

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
          lastActivity: null,
          originalUser: null,
          originalAccessToken: null,
          originalRefreshToken: null,
          impersonatedOrgName: null,
          impersonatedUserName: null
        }),
      updateUser: (userData) => 
        set((state) => ({
          user: state.user ? { ...state.user, ...userData as User } : null
        })),
      updateActivity: () =>
        set((state) => ({
          lastActivity: state.isAuthenticated ? Date.now() : null
        })),
      setHasHydrated: (state) => set({ hasHydrated: state }),
      
      startImpersonation: (impersonatedUser, token, orgName, userName) => {
        set((state) => ({
          originalUser: state.originalUser || state.user,
          originalAccessToken: state.originalAccessToken || state.accessToken,
          originalRefreshToken: state.originalRefreshToken || state.refreshToken,
          user: impersonatedUser,
          accessToken: token,
          refreshToken: null,
          impersonatedOrgName: orgName,
          impersonatedUserName: userName,
          isAuthenticated: true,
          lastActivity: Date.now()
        }));
      },
      stopImpersonation: () => {
        set((state) => ({
          user: state.originalUser,
          accessToken: state.originalAccessToken,
          refreshToken: state.originalRefreshToken,
          originalUser: null,
          originalAccessToken: null,
          originalRefreshToken: null,
          impersonatedOrgName: null,
          impersonatedUserName: null,
          isAuthenticated: !!state.originalAccessToken,
          lastActivity: Date.now()
        }));
      }
    }),
    {
      name: 'obsidian-auth-storage',
      partialize: (state) => {
        const { hasHydrated, ...rest } = state;
        const isImpersonating = Boolean(state.originalAccessToken);
        const safeState = {
          ...rest,
          user: isImpersonating ? state.originalUser : state.user,
          accessToken: isImpersonating ? state.originalAccessToken : state.accessToken,
          refreshToken: isImpersonating ? state.originalRefreshToken : state.refreshToken,
          originalUser: null,
          originalAccessToken: null,
          originalRefreshToken: null,
          impersonatedOrgName: null,
          impersonatedUserName: null,
        };

        if (state.rememberMe) return safeState;

        return {
          ...safeState,
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          loginTime: null,
          lastActivity: null,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      }
    }
  )
);
