import { io, Socket } from 'socket.io-client';

const getSocketUrl = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost') return 'http://localhost:8000';
    if (host === '127.0.0.1') return 'http://127.0.0.1:8000';
  }
  return process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000';
};

class SocketService {
  public socket: Socket | null = null;
  private currentToken: string | null = null;

  connect(token: string) {
    if (!token) return;
    if (this.socket && this.currentToken === token) {
      if (this.socket.connected) return;
      if (!this.socket.disconnected) return;
    }
    
    // If token changed or old socket was disconnected, clean up first
    if (this.socket) {
      this.disconnect();
    }

    this.currentToken = token;
    const socketUrl = getSocketUrl();
    
    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      autoConnect: true,
    });

    let hasLoggedError = false;

    this.socket.on('connect', () => {
      hasLoggedError = false;
      console.log('[Socket.IO] Connected to backend:', this.socket?.id);
    });

    this.socket.on('connect_error', (error) => {
      const isAuthError = /invalid|expired|authentication|access token|refused/i.test(error.message);
      
      if (isAuthError) {
        console.warn('[Socket.IO] Authentication rejected or expired. Disconnecting socket.');
        this.disconnect();
      } else if (!hasLoggedError) {
        hasLoggedError = true;
        console.debug(`[Socket.IO] Connecting to real-time service (${error.message})...`);
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
