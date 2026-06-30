import { supabase } from '@/services/supabase/client';
import { normalizeToE164 } from '@/utils/phone';
import { mediaService } from '@/services/mediaService';
import { formatSupabaseError } from '@/utils/supabaseErrors';

export type MyProfile = {
  id: string;
  username: string;
  phone_number: string | null;
  avatar_url: string | null;
  bio: string | null;
};

const AVATAR_MIME = 'image/jpeg';

async function getAuthUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user?.id) throw new Error('You are not signed in. Please log in again.');
  return data.user.id;
}

function isStorageSchemaError(err: unknown): boolean {
  const msg = formatSupabaseError(err).toLowerCase();
  return /schema|incompatible|bucket not found|nosuchbucket|storage/i.test(msg);
}

function isRpcMissing(err: unknown): boolean {
  const msg = formatSupabaseError(err).toLowerCase();
  return /set_my_avatar_url|schema cache|function.*not found/i.test(msg);
}

export const profileService = {
  getAuthUserId,

  async ensureMyProfileRow(): Promise<string> {
    const authUserId = await getAuthUserId();
    const { data, error } = await supabase.from('profiles').select('id').eq('id', authUserId).maybeSingle();
    if (error) throw error;
    if (data?.id) return authUserId;

    const { data: userData } = await supabase.auth.getUser();
    const emailPrefix = userData.user?.email?.split('@')[0]?.trim();
    const baseUsername = emailPrefix || `user_${authUserId.slice(0, 8)}`;
    const { error: insertError } = await supabase.from('profiles').insert({
      id: authUserId,
      username: baseUsername,
    });
    if (insertError && !/duplicate|23505/i.test(insertError.message)) {
      throw insertError;
    }
    return authUserId;
  },

  async getMyProfile(userId: string): Promise<{ data: MyProfile | null; error: Error | null }> {
    const authUserId = await getAuthUserId();
    const profileId = authUserId === userId ? userId : authUserId;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, phone_number, avatar_url, bio')
      .eq('id', profileId)
      .maybeSingle();
    if (error) return { data: null, error };
    return { data: data as MyProfile | null, error: null };
  },

  async updateMyProfile(
    userId: string,
    patch: { username?: string; phone_number?: string | null; bio?: string | null; avatar_url?: string | null },
  ) {
    const authUserId = await getAuthUserId();
    if (authUserId !== userId) {
      throw new Error('Session does not match this profile. Sign out and sign in again.');
    }

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

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', authUserId)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data?.id) {
      throw new Error('Profile could not be updated. Run supabase/fix_critical.sql in Supabase SQL Editor.');
    }
  },

  async setAvatarUrl(avatarUrl: string | null): Promise<string | null> {
    const url = avatarUrl?.trim() || null;

    const { data: rpcRows, error: rpcError } = await supabase.rpc('set_my_avatar_url', {
      p_avatar_url: url ?? '',
    });

    if (!rpcError && rpcRows) {
      const row = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as { avatar_url?: string | null } | undefined;
      if (row) return row.avatar_url ?? null;
    }

    if (rpcError && !isRpcMissing(rpcError)) {
      throw rpcError;
    }

    const authUserId = await profileService.ensureMyProfileRow();
    await profileService.updateMyProfile(authUserId, { avatar_url: url });
    return url;
  },

  async searchByUsername(query: string, excludeUserId?: string) {
    const term = query.trim();
    if (term.length < 2) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${term}%`)
      .limit(20);
    if (error) throw error;
    return (data ?? []).filter((row) => row.id !== excludeUserId) as Array<{
      id: string;
      username: string;
      avatar_url: string | null;
    }>;
  },

  async uploadAvatar(_userId: string, localUri: string, _mimeType?: string | null): Promise<string> {
    const authUserId = await profileService.ensureMyProfileRow();
    const uniquePath = `avatar/${authUserId}/${Date.now()}.jpg`;

    try {
      return await mediaService.uploadToBucket(localUri, 'chat-media', uniquePath, AVATAR_MIME, {
        upsert: true,
      });
    } catch (primaryErr) {
      if (!isStorageSchemaError(primaryErr)) throw primaryErr;
      const legacyPath = `${authUserId}/${Date.now()}.jpg`;
      return await mediaService.uploadToBucket(localUri, 'avatars', legacyPath, AVATAR_MIME, {
        upsert: true,
      });
    }
  },

  async uploadAndSaveAvatar(localUri: string): Promise<string | null> {
    const publicUrl = await profileService.uploadAvatar('', localUri, null);
    return profileService.setAvatarUrl(publicUrl);
  },

  async removeAvatar() {
    await profileService.setAvatarUrl(null);
  },
};
