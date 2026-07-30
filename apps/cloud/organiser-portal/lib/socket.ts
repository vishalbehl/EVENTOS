import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000';

class SocketService {
  public socket: Socket | null = null;
  private currentToken: string | null = null;

  connect(token: string) {
    if (this.socket && this.currentToken === token) return;
    
    // If token changed or socket exists, clean up first
    if (this.socket) {
      this.disconnect();
    }

    this.currentToken = token;
    console.log(`[Socket.IO] Connecting to ${SOCKET_URL} (Standard Path)`);
    
    this.socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token },
      reconnectionAttempts: 5,
      transports: ['polling', 'websocket'],
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket.IO] Connected to backend:', this.socket?.id);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket.IO] Connection error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        description: (error as any).description,
        context: (error as any).context,
      });
      
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
  }
}

export const socketService = new SocketService();
export default socketService;
