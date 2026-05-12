import { supabase } from '@/services/supabase/client';

async function findDirectConversationBetween(userId: string, peerUserId: string): Promise<string | null> {
  const { data: existingParticipants } = await supabase
    .from('conversation_participants')
    .select('conversation_id, user_id, conversations(id, title, is_group)')
    .in('user_id', [userId, peerUserId]);

  const candidateMap = new Map<string, string[]>();
  (existingParticipants ?? []).forEach((row: {
    conversation_id: string;
    user_id: string;
    conversations: { is_group?: boolean } | { is_group?: boolean }[] | null;
  }) => {
    const raw = row.conversations;
    const conversation = Array.isArray(raw) ? raw[0] : raw;
    if (!conversation || conversation.is_group) return;
    const id = row.conversation_id;
    candidateMap.set(id, [...(candidateMap.get(id) ?? []), row.user_id]);
  });

  const matched = [...candidateMap.entries()].find(([, users]) => {
    const unique = [...new Set(users)];
    return unique.length === 2 && unique.includes(userId) && unique.includes(peerUserId);
  });
  return matched ? matched[0] : null;
}

export const conversationService = {
  findDirectConversationBetween,

  async openOrCreateDirectConversation(params: { userId: string; peerUserId: string; peerDisplayName: string }) {
    const existing = await findDirectConversationBetween(params.userId, params.peerUserId);
    if (existing) return { conversationId: existing };
    const conv = await conversationService.createDirectConversation({
      title: params.peerDisplayName,
      creatorId: params.userId,
      peerUserId: params.peerUserId,
    });
    return { conversationId: conv.id };
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
      .select('*')
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
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        title: params.title,
        is_group: false,
        created_by: params.creatorId,
      })
      .select('*')
      .single();

    if (conversationError || !conversation) throw conversationError ?? new Error('Failed to create direct conversation');

    const { error: participantError } = await supabase.from('conversation_participants').insert([
      { conversation_id: conversation.id, user_id: params.creatorId },
      { conversation_id: conversation.id, user_id: params.peerUserId },
    ]);

    if (participantError) throw participantError;
    return conversation;
  },
};
