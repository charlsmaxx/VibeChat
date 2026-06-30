import { supabase } from '@/services/supabase/client';

export type AgoraTokenResponse = {
  token: string;
  appId: string;
  channel: string;
  uid: number;
  expireAt: number;
};

export const agoraTokenService = {
  async fetchRtcToken(channel: string, uid: number): Promise<AgoraTokenResponse> {
    const { data, error } = await supabase.functions.invoke('agora-token', {
      body: { channel, uid },
    });
    if (error) throw error;
    const payload = data as AgoraTokenResponse | { error?: string };
    if (!payload || typeof payload !== 'object' || !('token' in payload) || !payload.token) {
      const message = (payload as { error?: string })?.error ?? 'Failed to fetch Agora token';
      throw new Error(message);
    }
    return payload as AgoraTokenResponse;
  },
};
