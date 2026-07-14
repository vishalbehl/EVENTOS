import { apiClient } from '@/lib/api-client';
import { useAuthStore, User } from '@/store/use-auth-store';

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
  mfa_code: string;
}

function isPlatformAdministrator(user: User): boolean {
  return user.platform_role === 'SUPER_ADMIN' || user.is_platform_admin === true || user.role === 'super_admin';
}

export const authService = {
  /**
   * Authenticate with email and password
   */
  login: async (credentials: LoginCredentials, rememberMe = false): Promise<LoginResponse> => {
    const data = await apiClient.post<LoginResponse>('/auth/login', credentials);

    if (!isPlatformAdministrator(data.user)) {
      try {
        await apiClient.post('/auth/logout', undefined, {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
      } catch {
        // Local denial remains fail-closed even if server-side revocation is temporarily unavailable.
      } finally {
        useAuthStore.getState().logout();
      }
      throw new Error('Administrator privileges are required for Command Center.');
    }

    useAuthStore.getState().setAuth(
      data.user,
      data.access_token,
      data.refresh_token,
      rememberMe
    );
    
    return data;
  },

  /**
   * Fetch current user profile
   */
  getMe: async (): Promise<User> => {
    const data = await apiClient.get<User>('/auth/me');
    useAuthStore.getState().updateUser(data);
    return data;
  },

  /**
   * Clear local session and notify backend
   */
  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout request failed', error);
    } finally {
      useAuthStore.getState().logout();
    }
  },

  /**
   * Refresh JWT tokens
   */
  refresh: async (refreshToken: string): Promise<{ access_token: string }> => {
    const data = await apiClient.post<{ access_token: string }>('/auth/refresh', { refresh_token: refreshToken });
    return data;
  }
};
