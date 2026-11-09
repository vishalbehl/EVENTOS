import { io, Socket } from 'socket.io-client';
import { ScopedRealtimeClient } from '../../../../packages/utils/realtime-client';
import { useAuthStore } from '@/store/use-auth-store';
import { runtimeConfig } from '@/lib/runtime-config';
const getSocketUrl = () => runtimeConfig.wsOrigin;

export const socketService = new ScopedRealtimeClient<Socket>((token) => io(getSocketUrl(), {
  auth: { token },
  transports: ['websocket', 'polling'],
  reconnection: false,
  autoConnect: false,
  timeout: 10000,
}), () => !runtimeConfig.disableRealtime);

// Tear down synchronously, before effects can render data from an old identity.
useAuthStore.subscribe((state, previous) => {
  if (state.accessToken !== previous.accessToken || state.user?.id !== previous.user?.id
    || state.user?.organization_id !== previous.user?.organization_id || !state.isAuthenticated) {
    socketService.disconnect();
  }
});
export default socketService;
