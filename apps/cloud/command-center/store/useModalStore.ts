import { create } from 'zustand';

interface ModalState {
  isOpen: boolean;
  type: string | null;
  data: any;
  openModal: (type: string, data?: any) => void;
  closeModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isOpen: false,
  type: null,
  data: null,
  openModal: (type, data = null) => set({ isOpen: true, type, data }),
  closeModal: () => set({ isOpen: false, type: null, data: null }),
}));
