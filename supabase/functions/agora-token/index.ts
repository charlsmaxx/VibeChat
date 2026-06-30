// Supabase Edge Function: mint Agora RTC tokens (requires App Certificate in project secrets).
// Secrets: AGORA_APP_ID, AGORA_APP_CERTIFICATE, SUPABASE_URL, SUPABASE_ANON_KEY

import { RtcRole, RtcTokenBuilder } from 'npm:agora-access-token@2.0.4';
import { createUserClient } from '../_shared/supabase-admin.ts';
import { corsHeaders, handleOptions, jsonResponse } from '../_shared/cors.ts';

const TOKEN_TTL_SEC = 3600;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabase = createUserClient(authHeader);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const appId = Deno.env.get('AGORA_APP_ID')?.trim();
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')?.trim();
    if (!appId || !appCertificate) {
      return jsonResponse(
        {
          error:
            'Server missing AGORA_APP_ID or AGORA_APP_CERTIFICATE. Add them in Supabase → Edge Functions → Secrets.',
        },
        500,
      );
    }

    const body = await req.json();
    const channel = String(body.channel ?? '').trim();
    const uid = Number(body.uid);
    if (!channel || !Number.isFinite(uid) || uid <= 0) {
      return jsonResponse({ error: 'channel and positive uid are required' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    const expireAt = now + TOKEN_TTL_SEC;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channel,
      uid,
      RtcRole.PUBLISHER,
      expireAt,
    );

    return jsonResponse({
      token,
      appId,
      channel,
      uid,
      expireAt,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
