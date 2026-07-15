import { useEffect } from 'react';
import { useAuthStore } from '@/store/use-auth-store';
import { socketService } from '@/lib/socket';
import { toast } from 'sonner';

export function useSocket(eventId?: string) {
  const { accessToken, isAuthenticated } = useAuthStore();

  useEffect(() => {
    // 1. Only connect if we have a valid session
    if (!isAuthenticated || !accessToken) {
      socketService.disconnect();
      return;
    }

    // 2. Establish/Update connection
    socketService.connect(accessToken);
    const socket = socketService.socket;

    if (!socket) return;

    // 3. Join the specific event room if provided
    if (eventId) {
      socketService.joinEvent(eventId);
    }

    // 4. Attach event listeners
    const handleNotification = (data: any) => {
      console.log('Real-time notification:', data);
      toast(data.title || 'System Notification', {
        description: data.message,
        duration: 5000,
      });
    };

    const handleConnect = () => console.log('Socket.IO Connected');
    const handleDisconnect = (reason: string) => console.log('Socket.IO Disconnected:', reason);

    socket.on('notification', handleNotification);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    
    // 5. Cleanup: Remove listeners on unmount or when deps change
    return () => {
      socket.off('notification', handleNotification);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socketService.disconnect();
    };
  }, [isAuthenticated, accessToken, eventId]);
}
