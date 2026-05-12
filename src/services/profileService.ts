import { supabase } from '@/services/supabase/client';
import { normalizeToE164 } from '@/utils/phone';
import { mediaService } from '@/services/mediaService';

export type MyProfile = {
  id: string;
  username: string;
  phone_number: string | null;
  avatar_url: string | null;
  bio: string | null;
};

export const profileService = {
  async getMyProfile(userId: string): Promise<{ data: MyProfile | null; error: Error | null }> {
    const { data, error } = await supabase.from('profiles').select('id, username, phone_number, avatar_url, bio').eq('id', userId).maybeSingle();
    if (error) return { data: null, error };
    return { data: data as MyProfile | null, error: null };
  },

  async updateMyProfile(
    userId: string,
    patch: { username?: string; phone_number?: string | null; bio?: string | null; avatar_url?: string | null },
  ) {
    const payload: Record<string, unknown> = {};
    if (patch.username !== undefined) payload.username = patch.username.trim();
    if (patch.phone_number !== undefined) {
      const raw = patch.phone_number;
      if (raw === null || raw.trim() === '') payload.phone_number = null;
      else {
        const e164 = normalizeToE164(raw);
        if (!e164) throw new Error('Invalid phone number. Use international format or include country code.');
        payload.phone_number = e164;
      }
    }
    if (patch.bio !== undefined) payload.bio = patch.bio?.trim() || null;
    if (patch.avatar_url !== undefined) payload.avatar_url = patch.avatar_url;

    const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
    if (error) throw error;
  },

  async uploadAvatar(userId: string, localUri: string, mimeType?: string | null): Promise<string> {
    const isPng =
      (mimeType ?? '').toLowerCase().includes('png') || localUri.toLowerCase().includes('.png');
    const path = `${userId}/avatar.${isPng ? 'png' : 'jpg'}`;
    const ct = isPng ? 'image/png' : 'image/jpeg';
    return mediaService.uploadToBucket(localUri, 'avatars', path, ct, { upsert: true });
  },
};
