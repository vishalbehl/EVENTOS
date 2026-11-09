import { apiClient, sessionChangedError } from '@/lib/api-client';
import { useAuthStore, User } from '@/store/use-auth-store';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
  expires_in: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  mfa_code: string;
}

function isPlatformAdministrator(user: User): boolean {
  return user.platform_role === 'SUPER_ADMIN' || user.is_platform_admin === true || user.role === 'super_admin';
}

let restorePromise: { revision: number; promise: Promise<boolean> } | null = null;

export const authService = {
  /**
   * Authenticate with email and password
   */
  login: async (credentials: LoginCredentials, rememberMe = false): Promise<LoginResponse> => {
    const revision = useAuthStore.getState().beginAuthTransition();
    const data = await apiClient.post<LoginResponse>('/auth/command-center/login', {
      email: credentials.email,
      password: credentials.password,
      totp_code: credentials.mfa_code,
      remember_me: rememberMe,
    }, { withCredentials: true });
    if (useAuthStore.getState().sessionRevision !== revision) throw sessionChangedError();

    if (!isPlatformAdministrator(data.user)) {
      try {
        await apiClient.post('/auth/command-center/logout', undefined, {
          withCredentials: true,
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
      } catch {
        // Local denial remains fail-closed even if server-side revocation is temporarily unavailable.
      } finally {
        if (useAuthStore.getState().sessionRevision === revision) useAuthStore.getState().logout();
      }
      throw new Error('Administrator privileges are required for Command Center.');
    }

    useAuthStore.getState().setAuth(
      data.user,
      data.access_token,
      undefined,
      rememberMe
    );
    
    return data;
  },

  /**
   * Fetch current user profile
   */
  getMe: async (): Promise<User> => {
    const revision = useAuthStore.getState().sessionRevision;
    const data = await apiClient.get<User>('/auth/me');
    if (useAuthStore.getState().sessionRevision !== revision) throw sessionChangedError();
    useAuthStore.getState().updateUser(data);
    return data;
  },

  /**
   * Clear local session and notify backend
   */
  logout: async () => {
    const token = useAuthStore.getState().accessToken;
    useAuthStore.getState().logout();
    try {
      await apiClient.post('/auth/command-center/logout', undefined, { withCredentials: true,
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) });
    } catch {
      // Do not log credentials/headers or clear a newer session on late failure.
    }
  },

  /**
   * Refresh JWT tokens
   */
  refresh: async (): Promise<LoginResponse> => {
    return apiClient.refreshSession();
  },

  restore: async (): Promise<boolean> => {
    const current = useAuthStore.getState();
    if (current.isAuthenticated && current.accessToken && current.user) return true;
    const revision = current.sessionRevision;
    if (restorePromise && restorePromise.revision === revision) return restorePromise.promise;

    const work = (async () => {
      try {
        await authService.refresh();
        const latest = useAuthStore.getState();
        return Boolean(latest.isAuthenticated && latest.accessToken && latest.user);
      } catch {
        if (useAuthStore.getState().sessionRevision === revision) useAuthStore.getState().logout();
        const latest = useAuthStore.getState();
        return Boolean(latest.isAuthenticated && latest.accessToken && latest.user);
      }
    })();
    const promise: Promise<boolean> = work.finally(() => {
      if (restorePromise?.promise === promise) restorePromise = null;
    });
    restorePromise = { revision, promise };
    return promise;
  },
};
