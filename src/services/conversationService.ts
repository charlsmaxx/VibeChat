import { supabase } from '@/services/supabase/client';

export const conversationService = {
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
