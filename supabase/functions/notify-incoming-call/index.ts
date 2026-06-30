// Supabase Edge Function: send high-priority Expo push for incoming calls.
// Invoke from app after creating a call, or bind as Database Webhook on public.calls INSERT.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (optional), CALL_WEBHOOK_SECRET (optional)

import { createAdminClient, createUserClient } from '../_shared/supabase-admin.ts';
import { sendExpoPush, type CallPushPayload } from '../_shared/expo-push.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string | null;
  channel: string;
  status: string;
  call_type: 'audio' | 'video';
  is_group: boolean;
  conversation_id: string | null;
};

async function resolveCallId(body: Record<string, unknown>): Promise<string | null> {
  if (typeof body.callId === 'string' && body.callId) return body.callId;
  const record = body.record as CallRow | undefined;
  if (record?.id) return record.id;
  return null;
}

async function pushTokensForUsers(admin: ReturnType<typeof createAdminClient>, userIds: string[]) {
  if (!userIds.length) return [];
  const { data, error } = await admin.from('push_tokens').select('token, user_id').in('user_id', userIds);
  if (error) throw error;
  const tokens = (data ?? []).map((r: { token: string }) => String(r.token)).filter((t) => t.length > 0);
  return [...new Set(tokens)];
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const body = await req.json();
    const callId = await resolveCallId(body);
    if (!callId) {
      return jsonResponse({ error: 'callId or record.id required' }, 400);
    }

    const webhookSecret = Deno.env.get('CALL_WEBHOOK_SECRET')?.trim();
    const providedSecret = req.headers.get('x-webhook-secret');
    const authHeader = req.headers.get('Authorization');
    const fromWebhook = Boolean(webhookSecret && providedSecret === webhookSecret);

    const admin = createAdminClient();

    if (!fromWebhook) {
      if (!authHeader) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      const userClient = createUserClient(authHeader);
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData.user) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      const { data: callAuth } = await admin.from('calls').select('caller_id, callee_id, is_group, conversation_id').eq('id', callId).maybeSingle();
      if (!callAuth) return jsonResponse({ error: 'Call not found' }, 404);
      const uid = userData.user.id;
      let isGroupMember = false;
      if (callAuth.is_group && callAuth.conversation_id) {
        const { data: participant } = await admin
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', callAuth.conversation_id)
          .eq('user_id', uid)
          .maybeSingle();
        isGroupMember = Boolean(participant);
      }
      const allowed = callAuth.caller_id === uid || callAuth.callee_id === uid || isGroupMember;
      if (!allowed) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
    }
    const { data: call, error: callError } = await admin
      .from('calls')
      .select('id, caller_id, callee_id, channel, status, call_type, is_group, conversation_id')
      .eq('id', callId)
      .maybeSingle();

    if (callError) throw callError;
    if (!call) return jsonResponse({ error: 'Call not found' }, 404);

    const row = call as CallRow;
    if (!['ringing', 'active'].includes(row.status)) {
      return jsonResponse({ skipped: true, reason: `status=${row.status}` });
    }

    const { data: callerProfile } = await admin.from('profiles').select('username').eq('id', row.caller_id).maybeSingle();
    const callerName = (callerProfile?.username as string) ?? 'Someone';
    const kind = row.call_type === 'video' ? 'Video' : 'Voice';

    let recipientIds: string[] = [];
    if (row.is_group && row.conversation_id) {
      const { data: members, error: memErr } = await admin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', row.conversation_id);
      if (memErr) throw memErr;
      recipientIds = (members ?? [])
        .map((m: { user_id: string }) => m.user_id)
        .filter((id: string) => id && id !== row.caller_id);
    } else if (row.callee_id) {
      recipientIds = [row.callee_id];
    }

    const tokens = await pushTokensForUsers(admin, recipientIds);
    if (!tokens.length) {
      return jsonResponse({ sent: 0, warning: 'No push tokens for recipients' });
    }

    const title = row.is_group ? `Incoming group ${kind.toLowerCase()} call` : `Incoming ${kind.toLowerCase()} call`;
    const pushBody = row.is_group ? `${callerName} started a group call` : `${callerName} is calling you`;

    const data: CallPushPayload = {
      type: 'incoming_call',
      callId: row.id,
      channel: row.channel,
      callType: row.call_type,
      callerId: row.caller_id,
      callerName,
      isGroup: row.is_group,
      ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
    };

    const result = await sendExpoPush(tokens, { title, body: pushBody, data });
    return jsonResponse({ ...result, callId: row.id, recipients: recipientIds.length });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
