import { useState, useEffect } from 'react';
import { socketService } from '@/lib/socket';
import { useAuthStore } from '@/store/use-auth-store';

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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [isAuthenticated, accessToken, eventId]);

  return { socket: socketService.socket, isConnected };
}

