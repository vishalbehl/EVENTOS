import { useEffect, useSyncExternalStore } from 'react';
import { isPlatformSelfSession, useAuthStore } from '@/store/use-auth-store';
import { socketService } from '@/lib/socket';
import { toast } from 'sonner';
import { realtimeNotification } from '../../../../packages/utils/realtime-notification';

export function useSocket(eventId?: string) {
  const { accessToken, isAuthenticated } = useAuthStore();
  const platformSelf = useAuthStore(isPlatformSelfSession);
  const status = useSyncExternalStore(socketService.subscribe, socketService.getStatus, socketService.getStatus);

  useEffect(() => {
    if (status.state === 'throttled' || status.state === 'unavailable' || status.state === 'denied') {
      const seconds = status.retryAt ? Math.max(1, Math.ceil((status.retryAt - Date.now()) / 1000)) : null;
      toast(status.state === 'denied' ? 'Live updates access denied'
        : status.state === 'throttled' ? 'Live updates are throttled' : 'Live updates are unavailable', {
        id: 'realtime-connection-status',
        description: seconds ? `Reconnecting in at least ${seconds} seconds. Saved forms are unchanged.`
          : status.state === 'denied' ? 'Review your access or sign in again. No actions were retried.'
          : 'Reconnect attempts have stopped. Refresh when the service is available.',
        duration: 8000,
      });
    } else if (status.state === 'connected' || status.state === 'idle') {
      toast.dismiss('realtime-connection-status');
    }
  }, [status]);

  useEffect(() => {
    // 1. Only connect if we have a valid session
    if (!isAuthenticated || !accessToken || platformSelf) {
      socketService.disconnect();
      return;
    }

    // 2. Establish/Update connection
    socketService.connect(accessToken);
    const socket = socketService.socket;

    if (!socket) return;

    // 3. Join the specific event room if provided
    const releaseEvent = eventId ? socketService.joinEvent(eventId) : undefined;

    // 4. Attach event listeners
    const handleNotification = (data: unknown) => {
      const copy = realtimeNotification(data);
      if (!copy || socketService.socket !== socket) return;
      toast(copy.title, {
        description: copy.desc,
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
      releaseEvent?.();
      socket.off('notification', handleNotification);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [isAuthenticated, accessToken, eventId, platformSelf]);
}
