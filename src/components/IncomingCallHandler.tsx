import { useEffect } from 'react';
import { supabase } from '@/services/supabase/client';
import { useAuthStore } from '@/store/authStore';
import type { CallType } from '@/services/callService';
import { parseIncomingCallPayload, presentIncomingCallAlert } from '@/services/callNotificationRouter';

type IncomingRow = {
  id: string;
  caller_id: string;
  callee_id: string | null;
  channel: string;
  status: string;
  call_type: CallType;
  is_group: boolean;
  conversation_id: string | null;
};

export const IncomingCallHandler = () => {
  const userId = useAuthStore((s) => s.session?.user.id);

  useEffect(() => {
    if (!userId) return;

    const onInsert = async (row: IncomingRow) => {
      if (row.status !== 'ringing' && row.status !== 'active') return;
      if (row.caller_id === userId) return;

      if (row.is_group) {
        if (!row.conversation_id) return;
        const { data: member } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', row.conversation_id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!member) return;
      } else if (row.callee_id !== userId) {
        return;
      }

      const { data: profile } = await supabase.from('profiles').select('username').eq('id', row.caller_id).maybeSingle();
      const payload = parseIncomingCallPayload({
        type: 'incoming_call',
        callId: row.id,
        channel: row.channel,
        callType: row.call_type,
        callerId: row.caller_id,
        callerName: (profile?.username as string) ?? 'Someone',
        isGroup: row.is_group,
        conversationId: row.conversation_id ?? undefined,
      });
      if (payload) await presentIncomingCallAlert(payload);
    };

    const channel = supabase
      .channel(`incoming-calls-rt:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls' },
        (payload) => {
          onInsert(payload.new as IncomingRow);
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  return null;
};
