import { apiClient } from '@/lib/api-client';
import { useAuthStore, User } from '@/store/use-auth-store';

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export const authService = {
  /**
   * Authenticate with email and password
   */
  login: async (credentials: any, rememberMe = false): Promise<LoginResponse> => {
    const data = await apiClient.post<LoginResponse>('/auth/login', credentials);
    
    // Update store
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
