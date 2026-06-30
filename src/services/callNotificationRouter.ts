import { Alert } from 'react-native';
import { supabase } from '@/services/supabase/client';
import { navigationRef } from '@/navigation/navigationRef';
import type { CallType } from '@/services/callService';

export type IncomingCallPayload = {
  type: 'incoming_call';
  callId: string;
  channel: string;
  callType: CallType;
  callerId: string;
  callerName: string;
  isGroup: boolean;
  conversationId?: string;
};

const handledCallIds = new Set<string>();

export function parseIncomingCallPayload(data: unknown): IncomingCallPayload | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (row.type !== 'incoming_call') return null;
  if (typeof row.callId !== 'string' || typeof row.channel !== 'string') return null;
  const callType = row.callType === 'video' ? 'video' : 'audio';
  return {
    type: 'incoming_call',
    callId: row.callId,
    channel: row.channel,
    callType,
    callerId: String(row.callerId ?? ''),
    callerName: String(row.callerName ?? 'Someone'),
    isGroup: row.isGroup === true || row.isGroup === 'true',
    conversationId: typeof row.conversationId === 'string' ? row.conversationId : undefined,
  };
}

export async function navigateToIncomingCall(payload: IncomingCallPayload, isOutgoing = false) {
  if (!navigationRef.isReady()) return false;
  navigationRef.navigate('Call', {
    callId: payload.callId,
    channel: payload.channel,
    callType: payload.callType,
    title: payload.isGroup ? 'Group call' : payload.callerName,
    isGroup: payload.isGroup,
    conversationId: payload.conversationId,
    isOutgoing,
  });
  return true;
}

export async function declineIncomingCall(callId: string) {
  await supabase.from('calls').update({ status: 'declined' }).eq('id', callId);
  handledCallIds.delete(callId);
}

export async function presentIncomingCallAlert(payload: IncomingCallPayload) {
  if (handledCallIds.has(payload.callId)) return;
  handledCallIds.add(payload.callId);

  const kind = payload.callType === 'video' ? 'Video' : 'Voice';
  const title = payload.isGroup ? `Group ${kind} call` : `Incoming ${kind} call`;
  const message = payload.isGroup
    ? `${payload.callerName} started a group call`
    : `${payload.callerName} is calling you`;

  Alert.alert(
    title,
    message,
    [
      {
        text: 'Decline',
        style: 'cancel',
        onPress: () => {
          declineIncomingCall(payload.callId).catch(() => {});
        },
      },
      {
        text: 'Answer',
        onPress: () => {
          navigateToIncomingCall(payload, false).catch(() => {});
        },
      },
    ],
    { cancelable: false },
  );
}

export async function handleIncomingCallFromPush(payload: IncomingCallPayload, actionId?: string) {
  const normalized = actionId?.toUpperCase() ?? '';
  if (normalized === 'DECLINE') {
    await declineIncomingCall(payload.callId);
    return;
  }
  await navigateToIncomingCall(payload, false);
}
