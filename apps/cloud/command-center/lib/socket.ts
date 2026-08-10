import { io, Socket } from 'socket.io-client';

import { runtimeConfig } from "@/lib/runtime-config";

const SOCKET_URL = runtimeConfig.wsOrigin;

class SocketService {
  public socket: Socket | null = null;
  private currentToken: string | null = null;

  connect(token: string) {
    if (runtimeConfig.disableRealtime) return;
    if (this.socket && this.currentToken === token) return;
    
    // If token changed or socket exists, clean up first
    if (this.socket) {
      this.disconnect();
    }

    this.currentToken = token;
    console.log(`[Socket.IO] Connecting to ${SOCKET_URL} (Standard Path)`);
    
    this.socket = io(SOCKET_URL, {
      auth: { token },
      reconnectionAttempts: 5,
      transports: ['websocket'],
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket.IO] Connected to backend:', this.socket?.id);
    });

    this.socket.on('connect_error', (error) => {
      const authenticationFailed = /invalid|expired|authentication|access token/i.test(error.message);
      const details = {
        message: error.message,
        name: error.name,
        stack: error.stack,
        description: (error as any).description,
        context: (error as any).context,
      };

      if (authenticationFailed) {
        // An access token cannot become valid through Socket.IO retries. Stop
        // the retry loop and let the auth hook refresh the HTTP-only session.
        console.warn('[Socket.IO] Authentication expired; refreshing session.');
        this.disconnect();
      } else {
        console.error('[Socket.IO] Connection error details:', details);
      }
      
      if (error.message === 'xhr poll error' || error.message === 'websocket error') {
        console.warn('[Socket.IO] Falling back to polling/websocket mixed mode');
      }
    });
  }

  joinEvent(eventId: string) {
    if (!this.socket) return;
    this.socket.emit('join_event_room', { event_id: eventId });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentToken = null;
  }
}

export const socketService = new SocketService();
export default socketService;
