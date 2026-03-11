import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MotionMode = 'full' | 'lite';

interface MotionStore {
  mode: MotionMode;
  setMode: (mode: MotionMode) => void;
}

function applyMotion(mode: MotionMode) {
  document.documentElement.dataset.motion = mode;
}

export const useMotionStore = create<MotionStore>()(
  persist(
    (set) => ({
      mode: 'full',
      setMode: (mode: MotionMode) => {
        applyMotion(mode);
        set({ mode });
      },
    }),
    {
      name: 'agora-motion',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyMotion(state.mode);
        }
      },
    },
  ),
);

if (typeof window !== 'undefined') {
  applyMotion(useMotionStore.getState().mode);
}
