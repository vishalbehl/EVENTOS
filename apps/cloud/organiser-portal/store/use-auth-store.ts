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
  onboarding_completed?: boolean;
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

export interface ActiveAccessContext {
  organization_id: string;
  acting_organization_id: string;
  workspace_id: string | null;
  event_id: string | null;
  relationship_id: string | null;
  access_mode: 'DIRECT' | 'DELEGATED';
  role: string;
  actions: string[];
  policy_revisions: number[];
  correlation_id?: string;
}

export function accessContextCacheKey(
  context: ActiveAccessContext | null,
  fallbackOrganizationId?: string | null,
): string {
  if (!context) return `direct:${fallbackOrganizationId ?? 'none'}:unselected`;
  return [
    context.access_mode,
    context.acting_organization_id,
    context.organization_id,
    context.workspace_id ?? 'all-workspaces',
    context.event_id ?? 'all-events',
    context.relationship_id ?? 'no-relationship',
    context.policy_revisions.join('.'),
  ].join(':');
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
  activeContext: ActiveAccessContext | null;
  isContextSwitching: boolean;
  
  // Impersonation Support
  originalUser: User | null;
  originalAccessToken: string | null;
  originalRefreshToken: string | null;
  impersonatedOrgName: string | null;
  impersonatedUserName: string | null;
  impersonationSessionId: string | null;

  setAuth: (user: User, accessToken: string, refreshToken?: string, rememberMe?: boolean) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  updateActivity: () => void;
  setHasHydrated: (state: boolean) => void;
  setAccessContext: (context: ActiveAccessContext, accessToken: string) => void;
  setContextSwitching: (switching: boolean) => void;
  startImpersonation: (impersonatedUser: User, token: string, orgName: string, userName: string, sessionId: string) => void;
  stopImpersonation: () => void;
}

// UI routing only: server permissions remain authoritative. A selected customer
// context or support session must continue through the customer admission path.
export function isPlatformSelfSession(state: Pick<AuthState, 'user' | 'activeContext' | 'impersonationSessionId'>): boolean {
  return Boolean(state.user?.is_platform_admin && !state.impersonationSessionId &&
    (!state.activeContext || (
      state.activeContext.access_mode === 'DIRECT' &&
      state.activeContext.organization_id === state.user.organization_id
    )));
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
      activeContext: null,
      isContextSwitching: false,
      
      originalUser: null,
      originalAccessToken: null,
      originalRefreshToken: null,
      impersonatedOrgName: null,
      impersonatedUserName: null,
      impersonationSessionId: null,

      setAuth: (user, accessToken, refreshToken, rememberMe = false) => 
        set({ 
          user, 
          accessToken, 
          refreshToken: refreshToken || null, 
          isAuthenticated: true,
          rememberMe,
          loginTime: Date.now(),
          lastActivity: Date.now(),
          activeContext: {
            organization_id: user.organization_id,
            acting_organization_id: user.organization_id,
            workspace_id: null,
            event_id: null,
            relationship_id: null,
            access_mode: 'DIRECT',
            role: user.org_role || user.role,
            actions: [],
            policy_revisions: [],
          },
          isContextSwitching: false,
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
          impersonatedUserName: null,
          impersonationSessionId: null,
          activeContext: null,
          isContextSwitching: false,
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
      setAccessContext: (activeContext, accessToken) => set({
        activeContext,
        accessToken,
        lastActivity: Date.now(),
        isContextSwitching: false,
      }),
      setContextSwitching: (isContextSwitching) => set({ isContextSwitching }),
      
      startImpersonation: (impersonatedUser, token, orgName, userName, sessionId) => {
        set((state) => ({
          originalUser: state.originalUser || state.user,
          originalAccessToken: state.originalAccessToken || state.accessToken,
          originalRefreshToken: state.originalRefreshToken || state.refreshToken,
          user: impersonatedUser,
          accessToken: token,
          refreshToken: null,
          impersonatedOrgName: orgName,
          impersonatedUserName: userName,
          impersonationSessionId: sessionId,
          isAuthenticated: true,
          lastActivity: Date.now(),
          activeContext: {
            organization_id: impersonatedUser.organization_id,
            acting_organization_id: impersonatedUser.organization_id,
            workspace_id: null,
            event_id: null,
            relationship_id: null,
            access_mode: 'DIRECT',
            role: impersonatedUser.org_role || impersonatedUser.role,
            actions: [],
            policy_revisions: [],
          },
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
          impersonationSessionId: null,
          isAuthenticated: !!state.originalAccessToken,
          lastActivity: Date.now(),
          activeContext: state.originalUser ? {
            organization_id: state.originalUser.organization_id,
            acting_organization_id: state.originalUser.organization_id,
            workspace_id: null,
            event_id: null,
            relationship_id: null,
            access_mode: 'DIRECT',
            role: state.originalUser.org_role || state.originalUser.role,
            actions: [],
            policy_revisions: [],
          } : null,
          isContextSwitching: false,
        }));
      }
    }),
    {
      name: 'obsidian-auth-storage',
      partialize: (state) => {
        const { hasHydrated, isContextSwitching, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      }
    }
  )
);
