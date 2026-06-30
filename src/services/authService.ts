import { supabase } from '@/services/supabase/client';
import { normalizeToE164 } from '@/utils/phone';

function deriveFallbackUsername(user: { id: string; email?: string | null }) {
  const emailPrefix = user.email?.split('@')[0]?.trim();
  if (emailPrefix) return emailPrefix;
  return `user_${user.id.slice(0, 8)}`;
}

function phoneFromUserMetadata(user: { user_metadata?: Record<string, unknown> | null }) {
  const raw = user.user_metadata?.phone;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return normalizeToE164(trimmed);
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
    const phone_number = phoneFromUserMetadata(user);

    const { error } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        username,
        ...(phone_number ? { phone_number } : {}),
      },
      { onConflict: 'id' },
    );
    if (error) throw error;
  },
  async signUpWithEmail(email: string, password: string, username: string, phone?: string) {
    const trimmedPhone = phone?.trim();
    const phoneE164 = trimmedPhone ? normalizeToE164(trimmedPhone) : null;
    const response = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.trim(),
          ...(phoneE164 ? { phone: phoneE164 } : {}),
        },
      },
    });
    if (response.error) return response;

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
