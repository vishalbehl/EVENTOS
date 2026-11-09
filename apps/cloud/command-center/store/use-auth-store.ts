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
  sessionRevision: number;
  beginAuthTransition: () => number;
  
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
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      rememberMe: false,
      loginTime: null,
      lastActivity: null,
      hasHydrated: false,
      sessionRevision: 0,
      beginAuthTransition: () => {
        const revision = get().sessionRevision + 1;
        set({ sessionRevision: revision });
        return revision;
      },
      
      originalUser: null,
      originalAccessToken: null,
      originalRefreshToken: null,
      impersonatedOrgName: null,
      impersonatedUserName: null,

      setAuth: (user, accessToken, refreshToken, rememberMe = false) => 
        set((state) => ({
          sessionRevision: state.sessionRevision + 1,
          user, 
          accessToken, 
          refreshToken: refreshToken || null, 
          isAuthenticated: true,
          rememberMe,
          originalUser: null,
          originalAccessToken: null,
          originalRefreshToken: null,
          impersonatedOrgName: null,
          impersonatedUserName: null,
          loginTime: Date.now(),
          lastActivity: Date.now()
        })),
      logout: () => 
        set((state) => ({
          sessionRevision: state.sessionRevision + 1,
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
        })),
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
          sessionRevision: state.sessionRevision + 1,
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
          sessionRevision: state.sessionRevision + 1,
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
        const { hasHydrated, sessionRevision, beginAuthTransition, ...rest } = state;
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

        return {
          ...safeState,
          // Authentication tokens are deliberately memory-only. The HttpOnly
          // refresh cookie is the sole authority for restoring a session.
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          loginTime: null,
          lastActivity: null,
        };
      },
      merge: (persisted, current) => {
        // Old storage must not restore credentials or rewind in-memory ordering.
        const saved = persisted && typeof persisted === 'object'
          ? persisted as Record<string, unknown> : {};
        return { ...current, rememberMe: typeof saved.rememberMe === 'boolean' ? saved.rememberMe : current.rememberMe };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      }
    }
  )
);
