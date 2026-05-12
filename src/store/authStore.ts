import { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { authService } from '@/services/authService';

interface AuthState {
  session: Session | null;
  loading: boolean;
  bootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username: string,
    phone?: string,
  ) => Promise<{ needsEmailVerification: boolean }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  loading: true,
  bootstrap: async () => {
    const { data } = await authService.session();
    if (data.session?.user) {
      try {
        await authService.ensureProfile(data.session.user);
      } catch (error) {
        console.warn('Unable to ensure profile during bootstrap', error);
      }
    }
    set({ session: data.session, loading: false });
  },
  signIn: async (email, password) => {
    const { data, error } = await authService.signInWithEmail(email, password);
    if (error) throw error;
    if (data.user) {
      try {
        await authService.ensureProfile(data.user);
      } catch (profileError) {
        console.warn('Unable to ensure profile after sign-in', profileError);
      }
    }
    set({ session: data.session });
  },
  signUp: async (email, password, username, phone) => {
    const { data, error } = await authService.signUpWithEmail(email, password, username, phone);
    if (error) throw error;
    set({ session: data.session });
    return { needsEmailVerification: !data.session };
  },
  signOut: async () => {
    await authService.signOut();
    set({ session: null });
  },
}));
