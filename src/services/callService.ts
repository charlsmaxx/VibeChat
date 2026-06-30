import { supabase } from '@/services/supabase/client';
import type { CallLogRow } from '@/types';

export type CallType = 'audio' | 'video';

export type ActiveCallRow = CallLogRow & {
  conversation_id: string | null;
  call_type: CallType;
  is_group: boolean;
};

function dmChannel(userA: string, userB: string) {
  const [a, b] = [userA, userB].sort();
  return `dm-${a}-${b}`;
}

function groupChannel(conversationId: string) {
  return `grp-${conversationId}`;
}

export const callService = {
  channelForDm: dmChannel,
  channelForGroup: groupChannel,

  async startDirectCall(params: {
    callerId: string;
    calleeId: string;
    callType: CallType;
  }): Promise<{ callId: string; channel: string }> {
    const channel = dmChannel(params.callerId, params.calleeId);
    const { data, error } = await supabase
      .from('calls')
      .insert({
        caller_id: params.callerId,
        callee_id: params.calleeId,
        channel,
        status: 'ringing',
        call_type: params.callType,
        is_group: false,
      })
      .select('id, channel')
      .single();
    if (error || !data) throw error ?? new Error('Could not start call');
    const result = { callId: data.id as string, channel: data.channel as string };
    await callService.notifyIncomingCall(result.callId);
    return result;
  },

  async startGroupCall(params: {
    callerId: string;
    conversationId: string;
    callType: CallType;
  }): Promise<{ callId: string; channel: string }> {
    const channel = groupChannel(params.conversationId);
    const { data, error } = await supabase
      .from('calls')
      .insert({
        caller_id: params.callerId,
        callee_id: null,
        conversation_id: params.conversationId,
        channel,
        status: 'active',
        call_type: params.callType,
        is_group: true,
      })
      .select('id, channel')
      .single();
    if (error || !data) throw error ?? new Error('Could not start group call');
    const result = { callId: data.id as string, channel: data.channel as string };
    await callService.notifyIncomingCall(result.callId);
    return result;
  },

  async notifyIncomingCall(callId: string) {
    const { error } = await supabase.functions.invoke('notify-incoming-call', {
      body: { callId },
    });
    if (error) {
      console.warn('notify-incoming-call failed', error.message);
    }
  },

  async updateCallStatus(callId: string, status: string) {
    const { error } = await supabase.from('calls').update({ status }).eq('id', callId);
    if (error) throw error;
  },

  async getCall(callId: string): Promise<ActiveCallRow | null> {
    const { data, error } = await supabase
      .from('calls')
      .select('id, caller_id, callee_id, channel, status, created_at, conversation_id, call_type, is_group')
      .eq('id', callId)
      .maybeSingle();
    if (error) throw error;
    return (data as ActiveCallRow) ?? null;
  },

  async getActiveGroupCall(conversationId: string): Promise<ActiveCallRow | null> {
    const { data, error } = await supabase
      .from('calls')
      .select('id, caller_id, callee_id, channel, status, created_at, conversation_id, call_type, is_group')
      .eq('conversation_id', conversationId)
      .eq('is_group', true)
      .in('status', ['ringing', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as ActiveCallRow) ?? null;
  },
};
