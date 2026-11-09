import { useEffect, useSyncExternalStore } from 'react';
import { socketService } from '@/lib/socket';
import { isPlatformSelfSession, useAuthStore } from '@/store/use-auth-store';

export function useWebSocket(eventId?: string) {
  const { accessToken, isAuthenticated } = useAuthStore();
  const platformSelf = useAuthStore(isPlatformSelfSession);
  const status = useSyncExternalStore(socketService.subscribe, socketService.getStatus, socketService.getStatus);
  useEffect(() => {
    if (!isAuthenticated || !accessToken || platformSelf) {
      socketService.disconnect();
      return;
    }
    socketService.connect(accessToken);
    const release = eventId ? socketService.joinEvent(eventId) : undefined;
    return () => release?.();
  }, [isAuthenticated, accessToken, eventId, platformSelf]);
  return { socket: socketService.socket, isConnected: status.state === 'connected',
    connectionStatus: status, retryAt: status.retryAt };
}

