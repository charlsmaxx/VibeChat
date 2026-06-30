import { create } from 'zustand';

interface ProfileState {
  /** Logged-in user's avatar URL from DB (no cache-bust param). */
  myAvatarUrl: string | null;
  /** Bumped on every successful upload so Image reloads locally. */
  myAvatarRevision: number;
  setMyAvatar: (url: string | null) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  myAvatarUrl: null,
  myAvatarRevision: 0,
  setMyAvatar: (url) =>
    set((state) => ({
      myAvatarUrl: url,
      myAvatarRevision: state.myAvatarRevision + 1,
    })),
}));
