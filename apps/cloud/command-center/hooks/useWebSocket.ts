import { useState, useEffect } from 'react';
import { socketService } from '@/lib/socket';
import { useAuthStore } from '@/store/use-auth-store';
import { authService } from '@/services/auth-service';

export function useWebSocket(eventId?: string) {
  const { accessToken, isAuthenticated } = useAuthStore();
  const [isConnected, setIsConnected] = useState(socketService.socket?.connected || false);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      setIsConnected(false);
      socketService.disconnect();
      return;
    }

    socketService.connect(accessToken);
    const socket = socketService.socket;
    if (!socket) return;

    if (eventId) {
      socketService.joinEvent(eventId);
    }

    setIsConnected(socket.connected);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    let refreshingSession = false;
    const onConnectError = (error: Error) => {
      if (refreshingSession || !/invalid|expired|authentication|access token/i.test(error.message)) return;
      refreshingSession = true;
      void authService.refresh()
        .catch(() => authService.logout())
        .finally(() => { refreshingSession = false; });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [isAuthenticated, accessToken, eventId]);

  return { socket: socketService.socket, isConnected };
}

