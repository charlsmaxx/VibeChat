import { create } from 'zustand';
import { contactService } from '@/services/contactService';

const THROTTLE_MS = 35_000;

export type ContactOnApp = {
  id: string;
  name: string;
  phone: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
};

interface ContactState {
  usersOnApp: ContactOnApp[];
  inviteContacts: Array<{ id: string; name: string; phone: string }>;
  loading: boolean;
  lastSyncedAt: number;
  sync: (opts?: { force?: boolean }) => Promise<void>;
}

export const useContactStore = create<ContactState>((set, get) => ({
  usersOnApp: [],
  inviteContacts: [],
  loading: false,
  lastSyncedAt: 0,
  sync: async (opts) => {
    const force = opts?.force === true;
    const { lastSyncedAt, loading } = get();
    if (!force && lastSyncedAt > 0 && Date.now() - lastSyncedAt < THROTTLE_MS) return;
    if (loading && !force) return;
    set({ loading: true });
    try {
      const result = await contactService.syncContacts();
      set({
        usersOnApp: result.usersOnApp,
        inviteContacts: result.inviteContacts,
        loading: false,
        lastSyncedAt: Date.now(),
      });
    } catch {
      set({ loading: false });
    }
  },
}));
