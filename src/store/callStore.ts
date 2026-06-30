import { create } from 'zustand';

interface CallState {
  activeChannel: string | null;
  muted: boolean;
  cameraOff: boolean;
  remoteUids: number[];
  setActiveChannel: (channel: string | null) => void;
  setRemoteUids: (uids: number[]) => void;
  addRemoteUid: (uid: number) => void;
  removeRemoteUid: (uid: number) => void;
  resetSession: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  activeChannel: null,
  muted: false,
  cameraOff: false,
  remoteUids: [],
  setActiveChannel: (activeChannel) => set({ activeChannel }),
  setRemoteUids: (remoteUids) => set({ remoteUids }),
  addRemoteUid: (uid) =>
    set((s) => ({
      remoteUids: s.remoteUids.includes(uid) ? s.remoteUids : [...s.remoteUids, uid],
    })),
  removeRemoteUid: (uid) => set((s) => ({ remoteUids: s.remoteUids.filter((x) => x !== uid) })),
  resetSession: () => set({ activeChannel: null, muted: false, cameraOff: false, remoteUids: [] }),
  toggleMute: () => set((state) => ({ muted: !state.muted })),
  toggleCamera: () => set((state) => ({ cameraOff: !state.cameraOff })),
}));
