import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000';

class SocketService {
  public socket: Socket | null = null;
  private currentToken: string | null = null;

  connect(token: string) {
    if (!token) return;
    if (this.socket && this.currentToken === token) return;
    
    // If token changed or socket exists, clean up first
    if (this.socket) {
      this.disconnect();
    }

    this.currentToken = token;
    
    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 15000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket.IO] Connected to backend:', this.socket?.id);
    });

    this.socket.on('connect_error', (error) => {
      const isAuthError = /invalid|expired|authentication|access token|refused/i.test(error.message);
      
      if (isAuthError) {
        console.warn('[Socket.IO] Authentication rejected or expired. Disconnecting socket.');
        this.disconnect();
      } else {
        console.warn(`[Socket.IO] Connection issue (${error.message}). Retrying...`);
      }
    });
  }

  joinEvent(eventId: string) {
    if (!this.socket || !this.socket.connected) return;
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
