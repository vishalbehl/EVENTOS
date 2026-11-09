/** Shared browser transport lifecycle. Server scope checks remain authoritative. */
export interface RealtimeTransport {
  connected: boolean;
  connect(): unknown;
  disconnect(): unknown;
  on(event: string, listener: (...args: any[]) => void): unknown;
  removeAllListeners(): unknown;
  emit(event: string, data: Record<string, string>): unknown;
}

export interface RealtimeStatus {
  state: 'idle' | 'connecting' | 'connected' | 'throttled' | 'unavailable' | 'denied';
  retryAt: number | null;
  code: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};

export class ScopedRealtimeClient<T extends RealtimeTransport> {
  socket: T | null = null;
  private token: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingJoins = new Set<string>();
  private attempts = 0;
  private stopped = false;
  private rooms = new Map<string, number>();
  private listeners = new Set<() => void>();
  private status: RealtimeStatus = { state: 'idle', retryAt: null, code: null };

  constructor(private create: (token: string) => T, private enabled = () => true) {}

  getStatus = (): RealtimeStatus => this.status;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(status: RealtimeStatus) {
    this.status = status;
    this.listeners.forEach(listener => listener());
  }
  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  connect(token: string) {
    if (!this.enabled() || !token || token.length > 16384) return;
    // Re-rendering with rejected credentials must not restart admission attempts.
    if (this.socket && this.token === token) return;
    this.disconnect();
    this.token = token;
    this.stopped = false;
    const socket = this.create(token);
    this.socket = socket;
    socket.on('connect', () => {
      if (this.socket !== socket || this.stopped) return;
      this.clearTimer();
      this.attempts = 0;
      this.update({ state: 'connected', retryAt: null, code: null });
      this.rooms.forEach((_, key) => this.join(key));
    });
    socket.on('connect_error', (error: unknown) => {
      if (this.socket === socket) this.failed(record(error).data ?? error);
    });
    socket.on('error', (error: unknown) => {
      if (this.socket === socket) this.failed(error);
    });
    socket.on('disconnect', () => {
      if (this.socket === socket && !this.stopped && this.timer === null) {
        this.failed({ code: 'REALTIME_UNAVAILABLE' });
      }
    });
    this.update({ state: 'connecting', retryAt: null, code: null });
    socket.connect();
  }

  private failed(value: unknown) {
    if (this.stopped || this.timer !== null) return;
    const data = record(value);
    const code = typeof data.code === 'string' ? data.code : 'REALTIME_UNAVAILABLE';
    const denied = code === 'PERMISSION_DENIED' || code === 'AUTHENTICATION_REQUIRED'
      || code === 'REALTIME_MESSAGE_TOO_LARGE' || code === 'INVALID_ACCESS_TOKEN';
    this.stopped = true; // suppress disconnect recursion
    this.clearJoins();
    this.socket?.disconnect();
    if (denied || this.attempts >= 5) {
      this.update({ state: denied ? 'denied' : 'unavailable', retryAt: null, code });
      return;
    }
    const raw = data.retry_after;
    // A valid server delay is a lower bound, never shortened by the retry cap.
    const serverDelay = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
      ? raw * 1000 : 0;
    if (serverDelay > 3600000) {
      this.update({ state: 'throttled', retryAt: null, code });
      return;
    }
    const delay = Math.max(serverDelay, Math.min(30000, 2000 * 2 ** this.attempts))
      + Math.floor(Math.random() * 1000);
    this.attempts += 1;
    this.update({ state: code === 'REALTIME_RATE_LIMITED' ? 'throttled' : 'unavailable',
      retryAt: Date.now() + delay, code });
    const socket = this.socket;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.socket !== socket || !socket) return;
      this.stopped = false;
      this.update({ state: 'connecting', retryAt: null, code: null });
      socket.connect();
    }, delay);
  }

  private join(key: string) {
    if (!this.socket?.connected || this.stopped) return;
    this.pendingJoins.add(key);
    if (this.joinTimer !== null) return;
    // Rejoining a large directory must not instantly consume its control budget.
    const drain = () => {
      if (!this.socket?.connected || this.stopped) { this.clearJoins(); return; }
      const next = this.pendingJoins.values().next();
      if (next.done) { this.joinTimer = null; return; }
      const item = next.value;
      this.pendingJoins.delete(item);
      if (this.rooms.has(item)) {
        const [family, event_id] = item.split(':');
        this.socket.emit(family === 'event' ? 'join_event_room' : 'join_venue_ops_room', { event_id });
      }
      this.joinTimer = setTimeout(drain, 1100 + Math.floor(Math.random() * 100));
    };
    this.joinTimer = setTimeout(drain, 0);
  }
  private clearJoins() {
    if (this.joinTimer !== null) clearTimeout(this.joinTimer);
    this.joinTimer = null;
    this.pendingJoins.clear();
  }
  /** Reference-count read subscriptions; never queue/replay business mutations. */
  private retain(family: 'event' | 'venueops', eventId: string): () => void {
    if (!UUID.test(eventId)) return () => {};
    const key = `${family}:${eventId.toLowerCase()}`;
    const count = this.rooms.get(key) ?? 0;
    if (!count && this.rooms.size >= 100) return () => {};
    this.rooms.set(key, count + 1);
    if (!count) this.join(key);
    const owner = this.socket;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.socket !== owner) return;
      const remaining = this.rooms.get(key);
      if (!remaining) return;
      if (remaining > 1) this.rooms.set(key, remaining - 1);
      else {
        this.rooms.delete(key);
        const wasPending = this.pendingJoins.delete(key);
        if (!wasPending && this.socket?.connected && !this.stopped) {
          this.socket.emit('leave_resource_room', { room: key });
        }
      }
    };
  }
  joinEvent(eventId: string) { return this.retain('event', eventId); }
  joinVenueOps(eventId: string) { return this.retain('venueops', eventId); }

  disconnect() {
    this.stopped = true;
    this.clearTimer();
    this.clearJoins();
    const socket = this.socket;
    this.socket = null;
    socket?.removeAllListeners();
    socket?.disconnect();
    this.token = null;
    this.rooms.clear();
    this.attempts = 0;
    this.update({ state: 'idle', retryAt: null, code: null });
  }
}
