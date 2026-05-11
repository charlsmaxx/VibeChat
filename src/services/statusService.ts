import { supabase } from '@/services/supabase/client';
import type { StatusUpdate } from '@/types';

export const statusService = {
  async listActive(): Promise<{ data: StatusUpdate[]; error: Error | null }> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('status_updates')
      .select('id, user_id, caption, media_url, media_type, created_at, expires_at')
      .gt('expires_at', now)
      .order('created_at', { ascending: false });
    if (error) return { data: [], error };
    return { data: (data ?? []) as StatusUpdate[], error: null };
  },

  async create(params: {
    userId: string;
    mediaType: StatusUpdate['media_type'];
    caption?: string | null;
    mediaUrl?: string | null;
  }) {
    return supabase.from('status_updates').insert({
      user_id: params.userId,
      media_type: params.mediaType,
      caption: params.caption ?? null,
      media_url: params.mediaUrl ?? null,
    });
  },
};
