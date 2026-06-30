export type CallPushPayload = {
  type: 'incoming_call';
  callId: string;
  channel: string;
  callType: 'audio' | 'video';
  callerId: string;
  callerName: string;
  isGroup: boolean;
  conversationId?: string;
};

export async function sendExpoPush(
  tokens: string[],
  params: {
    title: string;
    body: string;
    data: CallPushPayload;
  },
) {
  if (!tokens.length) return { sent: 0 };

  const messages = tokens.map((to) => ({
    to,
    title: params.title,
    body: params.body,
    sound: 'default',
    priority: 'high',
    channelId: 'incoming_calls',
    categoryId: 'incoming_call',
    data: params.data,
  }));

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Expo push failed: ${res.status} ${text}`);
  }

  return { sent: tokens.length };
}
