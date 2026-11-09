import { io, Socket } from 'socket.io-client';
import { ScopedRealtimeClient } from '../../../../packages/utils/realtime-client';
import { useAuthStore } from '@/store/use-auth-store';
const getSocketUrl = () => {
  const configured = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') return 'http://127.0.0.1:8000';
  return 'http://localhost:8000';
};

export const socketService = new ScopedRealtimeClient<Socket>((token) => io(getSocketUrl(), {
  auth: { token },
  transports: ['websocket', 'polling'],
  reconnection: false,
  autoConnect: false,
  timeout: 10000,
}));

// Tear down synchronously, before effects can render data from an old identity.
useAuthStore.subscribe((state, previous) => {
  if (state.accessToken !== previous.accessToken || state.user?.id !== previous.user?.id
    || state.user?.organization_id !== previous.user?.organization_id || !state.isAuthenticated) {
    socketService.disconnect();
  }
});
export default socketService;
