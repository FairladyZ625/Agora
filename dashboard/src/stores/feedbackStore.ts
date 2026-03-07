import { create } from 'zustand';

export type FeedbackTone = 'info' | 'success' | 'warning';

interface FeedbackMessage {
  id: number;
  title: string;
  detail: string;
  tone: FeedbackTone;
}

interface FeedbackStore {
  message: FeedbackMessage | null;
  showMessage: (title: string, detail: string, tone?: FeedbackTone) => void;
  clearMessage: () => void;
}

export const useFeedbackStore = create<FeedbackStore>()((set) => ({
  message: null,
  showMessage: (title, detail, tone = 'info') =>
    set({
      message: {
        id: Date.now(),
        title,
        detail,
        tone,
      },
    }),
  clearMessage: () => set({ message: null }),
}));
