import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export interface Notification {
  id: string;
  title: string;
  time: string;
  desc: string;
  icon: string;
  color: string;
}

export interface Task {
  id: string;
  label: string;
  done: boolean;
}

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

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  socket: null,
  notifications: [],
  tasks: [
    { id: 't1', label: 'Setup API', done: true },
    { id: 't2', label: 'Assign Room Techs', done: false },
    { id: 't3', label: 'Finalize Poster Layouts', done: false },
    { id: 't4', label: 'Check Storage', done: false },
  ],
  connect: (eventIds: string[]) => {
    if (get().socket) return;
    
    // In production, you would pass an auth token here
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000', {
      path: '/socket.io',
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      eventIds.forEach(eventId => {
         socket.emit('join_event_room', { event_id: eventId });
      });
    });

    socket.on('notification', (payload) => {
      console.log('Received notification:', payload);
      get().addNotification(payload);
    });

    socket.on('file.uploaded', (payload) => {
      get().addNotification({
         title: 'File Uploaded',
         time: 'Just now',
         desc: `New presentation received (ID: ${payload.file_id?.substring(0, 8) || 'Unknown'})`,
         icon: 'FileUp',
         color: 'text-[var(--pri)]'
      });
    });

    socket.on('file.approved', (payload) => {
      get().addNotification({
         title: 'File Approved',
         time: 'Just now',
         desc: `Presentation was approved.`,
         icon: 'CheckCircle2',
         color: 'text-[var(--success)]'
      });
    });

    socket.on('file.rejected', (payload) => {
      get().addNotification({
         title: 'File Rejected',
         time: 'Just now',
         desc: `Presentation needs revision.`,
         icon: 'X',
         color: 'text-[var(--warn)]'
      });
    });

    set({ socket });
  },
  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },
  addNotification: (notification) => {
    set((state) => ({
      notifications: [
        { id: Date.now().toString(), ...notification },
        ...state.notifications,
      ].slice(0, 10),
    }));
  },
  addTask: (task) => {
    set((state) => ({
      tasks: [...state.tasks, { id: Date.now().toString(), ...task }],
    }));
  },
  toggleTask: (id) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task
      ),
    }));
  },
}));
