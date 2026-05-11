import { supabase } from '@/services/supabase/client';

function deriveFallbackUsername(user: { id: string; email?: string | null }) {
  const emailPrefix = user.email?.split('@')[0]?.trim();
  if (emailPrefix) return emailPrefix;
  return `user_${user.id.slice(0, 8)}`;
}

export const authService = {
  signInWithEmail(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },
  async ensureProfile(
    user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null },
    preferredUsername?: string,
  ) {
    const candidate =
      preferredUsername?.trim() ||
      (typeof user.user_metadata?.username === 'string' ? user.user_metadata.username : '') ||
      deriveFallbackUsername(user);
    const username = candidate.trim();

    const { error } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        username,
      },
      { onConflict: 'id' },
    );
    if (error) throw error;
  },
  async signUpWithEmail(email: string, password: string, username: string) {
    const response = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    });
    if (response.error) return response;

    // With email confirmation enabled, there may be no session yet.
    // Only write profile when the user is authenticated to satisfy RLS policies.
    if (response.data.user && response.data.session) {
      await authService.ensureProfile(response.data.user, username);
    }
    return response;
  },
  signOut() {
    return supabase.auth.signOut();
  },
  session() {
    return supabase.auth.getSession();
  },
};
