import { supabase } from '@/services/supabase/client';
import { withTimeout } from '@/utils/async';
import { formatSupabaseError } from '@/utils/supabaseErrors';

const OPEN_CHAT_TIMEOUT_MS = 15_000;

async function findDirectConversationBetween(userId: string, peerUserId: string): Promise<string | null> {
  const { data: myRows, error: myError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId);

  if (myError) throw myError;
  const myConversationIds = [...new Set((myRows ?? []).map((row) => row.conversation_id as string))];
  if (!myConversationIds.length) return null;

  const { data: peerRows, error: peerError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', peerUserId)
    .in('conversation_id', myConversationIds);

  if (peerError) throw peerError;
  const sharedIds = [...new Set((peerRows ?? []).map((row) => row.conversation_id as string))];
  if (!sharedIds.length) return null;

  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('id')
    .in('id', sharedIds)
    .eq('is_group', false)
    .limit(1);

  if (convError) throw convError;
  return conversations?.[0]?.id ?? null;
}

async function openViaRpc(peerUserId: string, peerDisplayName: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_direct_conversation', {
    p_peer_id: peerUserId,
    p_title: peerDisplayName,
  });

  if (error) {
    const msg = formatSupabaseError(error);
    if (/create_direct_conversation|schema cache|function.*not found/i.test(msg)) {
      throw new Error(
        'Chat setup is incomplete. Run supabase/fix_critical.sql in the Supabase SQL Editor, then try again.',
      );
    }
    throw new Error(msg);
  }

  const conversationId = typeof data === 'string' ? data.trim() : String(data ?? '').trim();
  if (!conversationId || conversationId === 'null' || conversationId === 'undefined') {
    throw new Error('Could not open chat. Run supabase/fix_critical.sql in Supabase SQL Editor.');
  }

  return conversationId;
}

export const conversationService = {
  findDirectConversationBetween,

  async openOrCreateDirectConversation(params: { userId: string; peerUserId: string; peerDisplayName: string }) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const authUserId = authData.user?.id;
    if (!authUserId) throw new Error('You are not signed in. Please log in again.');

    if (authUserId === params.peerUserId) {
      throw new Error('You cannot start a chat with yourself.');
    }

    return withTimeout(
      (async () => {
        try {
          const conversationId = await openViaRpc(params.peerUserId, params.peerDisplayName);
          return { conversationId };
        } catch (rpcErr) {
          const message = (rpcErr as Error).message;
          if (!/fix_open_chat|fix_critical|setup is incomplete/i.test(message)) {
            throw rpcErr;
          }
        }

        const existing = await findDirectConversationBetween(authUserId, params.peerUserId);
        if (existing) return { conversationId: existing };

        const conv = await conversationService.createDirectConversation({
          title: params.peerDisplayName,
          creatorId: authUserId,
          peerUserId: params.peerUserId,
        });
        return { conversationId: conv.id };
      })(),
      OPEN_CHAT_TIMEOUT_MS,
      'Opening chat timed out. Run supabase/fix_critical.sql in Supabase SQL Editor, then try again.',
    );
  },

  async createGroupConversation(params: { title: string; creatorId: string; memberUserIds: string[] }) {
    const uniqueMemberIds = [...new Set(params.memberUserIds)].filter((id) => id && id !== params.creatorId);

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        title: params.title,
        is_group: true,
        created_by: params.creatorId,
      })
      .select('id')
      .single();

    if (conversationError || !conversation) throw conversationError ?? new Error('Failed to create group');

    const participantRows = [params.creatorId, ...uniqueMemberIds].map((userId) => ({
      conversation_id: conversation.id,
      user_id: userId,
    }));

    const { error: participantError } = await supabase.from('conversation_participants').insert(participantRows);
    if (participantError) throw participantError;

    return conversation;
  },

  async createDirectConversation(params: { title: string; creatorId: string; peerUserId: string }) {
    if (params.creatorId === params.peerUserId) {
      throw new Error('You cannot start a chat with yourself.');
    }

    const { data: peerProfile, error: peerError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', params.peerUserId)
      .maybeSingle();
    if (peerError) throw peerError;
    if (!peerProfile) {
      throw new Error('That user has no profile yet. Ask them to sign in once, then try again.');
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        title: params.title,
        is_group: false,
        created_by: params.creatorId,
      })
      .select('id')
      .single();

    if (conversationError || !conversation) {
      throw new Error(
        formatSupabaseError(conversationError ?? new Error('Failed to create conversation')) +
          ' Run supabase/fix_open_chat.sql in Supabase.',
      );
    }

    const { error: selfParticipantError } = await supabase.from('conversation_participants').insert({
      conversation_id: conversation.id,
      user_id: params.creatorId,
    });
    if (selfParticipantError) throw selfParticipantError;

    const { error: peerParticipantError } = await supabase.from('conversation_participants').insert({
      conversation_id: conversation.id,
      user_id: params.peerUserId,
    });
    if (peerParticipantError) {
      throw new Error(formatSupabaseError(peerParticipantError) + ' Run supabase/fix_open_chat.sql in Supabase.');
    }

    return conversation;
  },
};
