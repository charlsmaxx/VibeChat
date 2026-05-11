import { create } from 'zustand';
import { contactService } from '@/services/contactService';

interface ContactState {
  usersOnApp: Array<{ id: string; name: string; phone: string; userId: string; username: string }>;
  inviteContacts: Array<{ id: string; name: string; phone: string }>;
  loading: boolean;
  sync: () => Promise<void>;
}

export const useContactStore = create<ContactState>((set) => ({
  usersOnApp: [],
  inviteContacts: [],
  loading: false,
  sync: async () => {
    set({ loading: true });
    const result = await contactService.syncContacts();
    set({ usersOnApp: result.usersOnApp, inviteContacts: result.inviteContacts, loading: false });
  },
}));
