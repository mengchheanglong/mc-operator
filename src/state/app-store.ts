import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  activeProject: string;
  setActiveProject: (id: string) => void;
  backendConnected: boolean;
  setBackendConnected: (connected: boolean) => void;
}

export const useAppState = create<AppState>()(
  persist(
    (set) => ({
      activeProject: 'mc-operator',
      setActiveProject: (id: string) => set({ activeProject: id }),
      backendConnected: true,
      setBackendConnected: (connected: boolean) => set({ backendConnected: connected }),
    }),
    {
      name: 'mc-operator-storage',
      partialize: (state) => ({ activeProject: state.activeProject }),
    },
  ),
);
