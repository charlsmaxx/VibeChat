import { create } from 'zustand';

interface CallState {
  activeChannel: string | null;
  muted: boolean;
  cameraOff: boolean;
  setActiveChannel: (channel: string | null) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  activeChannel: null,
  muted: false,
  cameraOff: false,
  setActiveChannel: (activeChannel) => set({ activeChannel }),
  toggleMute: () => set((state) => ({ muted: !state.muted })),
  toggleCamera: () => set((state) => ({ cameraOff: !state.cameraOff })),
}));
