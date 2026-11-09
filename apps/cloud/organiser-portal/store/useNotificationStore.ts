import { create } from 'zustand';
import { Socket } from 'socket.io-client';
import { useAuthStore } from './use-auth-store';
import { socketService } from '@/lib/socket';
import { realtimeNotification } from '../../../../packages/utils/realtime-notification';

export interface Notification { id: string; title: string; time: string; desc: string; icon: string; color: string; }
export interface Task { id: string; label: string; done: boolean; }
interface NotificationStore {
  socket: Socket | null;
  notifications: Notification[];
  tasks: Task[];
  connect: (eventIds: string[]) => void;
  disconnect: () => void;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  addTask: (task: Omit<Task, 'id'>) => void;
  toggleTask: (id: string) => void;
}
let dispose: (() => void) | undefined;
export const useNotificationStore = create<NotificationStore>((set, get) => ({
  socket: null, notifications: [], tasks: [],
  connect: (eventIds) => {
    dispose?.();
    dispose = undefined;
    const { accessToken, isAuthenticated } = useAuthStore.getState();
    if (!accessToken || !isAuthenticated) { get().disconnect(); return; }
    socketService.connect(accessToken);
    const socket = socketService.socket;
    if (!socket) return;
    const releases = [...new Set(eventIds)].slice(0, 100).map(id => socketService.joinEvent(id));
    const onNotification = (payload: unknown) => {
      if (socketService.socket !== socket) return;
      const copy = realtimeNotification(payload);
      if (copy) get().addNotification({ ...copy, time: 'Just now', icon: 'Bell', color: 'text-[var(--pri)]' });
    };
    socket.on('notification', onNotification);
    const handlers = ['file.uploaded', 'file.approved', 'file.rejected'].map(type => {
      const handler = () => onNotification({ type });
      socket.on(type, handler);
      return { type, handler };
    });
    dispose = () => {
      releases.forEach(release => release());
      socket.off('notification', onNotification);
      handlers.forEach(({ type, handler }) => socket.off(type, handler));
    };
    set({ socket });
  },
  disconnect: () => {
    dispose?.();
    dispose = undefined;
    set({ socket: null, notifications: [], tasks: [] });
  },
  addNotification: notification => set(state => ({
    notifications: [{ ...notification, id: crypto.randomUUID() }, ...state.notifications].slice(0, 10),
  })),
  addTask: task => set(state => ({ tasks: [...state.tasks, { ...task, id: crypto.randomUUID() }].slice(-100) })),
  toggleTask: id => set(state => ({ tasks: state.tasks.map(task => task.id === id ? { ...task, done: !task.done } : task) })),
}));
useAuthStore.subscribe((state, previous) => {
  if (!state.isAuthenticated || state.accessToken !== previous.accessToken
    || state.user?.id !== previous.user?.id || state.user?.organization_id !== previous.user?.organization_id) {
    useNotificationStore.getState().disconnect();
  }
});
