import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { Message, OutboxMessage } from '@/types';
import { supabase } from '@/services/supabase/client';
import { MMKV } from 'react-native-mmkv';

const outboxStorage = new MMKV({ id: 'vibechat-outbox' });
const OUTBOX_KEY = 'pending_messages';

interface ChatState {
  byConversation: Record<string, Message[]>;
  pageByConversation: Record<string, number>;
  loadInitial: (conversationId: string) => Promise<void>;
  loadMore: (conversationId: string) => Promise<void>;
  send: (message: OutboxMessage, senderId: string) => Promise<void>;
  flushOutbox: (senderId: string) => Promise<void>;
  markConversationRead: (conversationId: string, userId: string) => Promise<void>;
  markDelivered: (conversationId: string, userId: string) => Promise<void>;
  onIncoming: (message: Message) => void;
  onMessageUpdate: (message: Message) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  byConversation: {},
  pageByConversation: {},
  loadInitial: async (conversationId) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(0, 19);
    set((state) => ({
      byConversation: { ...state.byConversation, [conversationId]: (data ?? []).reverse() as Message[] },
      pageByConversation: { ...state.pageByConversation, [conversationId]: 0 },
    }));
  },
  loadMore: async (conversationId) => {
    const page = (get().pageByConversation[conversationId] ?? 0) + 1;
    const from = page * 20;
    const to = from + 19;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(from, to);
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: [...((data ?? []).reverse() as Message[]), ...(state.byConversation[conversationId] ?? [])],
      },
      pageByConversation: { ...state.pageByConversation, [conversationId]: page },
    }));
  },
  send: async (payload, senderId) => {
    const optimistic: Message = {
      id: payload.local_id,
      local_id: payload.local_id,
      conversation_id: payload.conversation_id,
      sender_id: senderId,
      receiver_id: payload.receiver_id,
      group_id: payload.group_id,
      content: payload.content,
      media_url: payload.media_url,
      type: payload.type,
      status: 'queued',
      created_at: payload.created_at,
    };

    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [payload.conversation_id]: [...(state.byConversation[payload.conversation_id] ?? []), optimistic],
      },
    }));

    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      const items = JSON.parse(outboxStorage.getString(OUTBOX_KEY) ?? '[]') as OutboxMessage[];
      outboxStorage.set(OUTBOX_KEY, JSON.stringify([payload, ...items]));
      return;
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: payload.conversation_id,
        sender_id: senderId,
        receiver_id: payload.receiver_id,
        group_id: payload.group_id,
        content: payload.content,
        media_url: payload.media_url,
        type: payload.type,
        status: 'sent',
      })
      .select('*')
      .single();

    if (error || !data) {
      const items = JSON.parse(outboxStorage.getString(OUTBOX_KEY) ?? '[]') as OutboxMessage[];
      outboxStorage.set(OUTBOX_KEY, JSON.stringify([payload, ...items]));
      return;
    }

    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [payload.conversation_id]: (state.byConversation[payload.conversation_id] ?? []).map((m) =>
          m.id === payload.local_id ? (data as Message) : m,
        ),
      },
    }));
  },
  flushOutbox: async (senderId) => {
    const queued = JSON.parse(outboxStorage.getString(OUTBOX_KEY) ?? '[]') as OutboxMessage[];
    if (!queued.length) return;

    const remaining: OutboxMessage[] = [];
    for (const payload of queued.reverse()) {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: payload.conversation_id,
          sender_id: senderId,
          receiver_id: payload.receiver_id,
          group_id: payload.group_id,
          content: payload.content,
          media_url: payload.media_url,
          type: payload.type,
          status: 'sent',
          created_at: payload.created_at,
        })
        .select('*')
        .single();

      if (error || !data) {
        remaining.push(payload);
      } else {
        set((state) => ({
          byConversation: {
            ...state.byConversation,
            [payload.conversation_id]: (state.byConversation[payload.conversation_id] ?? []).map((m) =>
              m.id === payload.local_id ? (data as Message) : m,
            ),
          },
        }));
      }
    }
    outboxStorage.set(OUTBOX_KEY, JSON.stringify(remaining));
  },
  markConversationRead: async (conversationId, userId) => {
    const unread = (get().byConversation[conversationId] ?? []).filter(
      (message) => message.sender_id !== userId && message.status !== 'read',
    );
    if (!unread.length) return;
    const ids = unread.map((m) => m.id);
    await supabase.from('messages').update({ status: 'read' }).in('id', ids);

    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: (state.byConversation[conversationId] ?? []).map((m) =>
          ids.includes(m.id) ? { ...m, status: 'read' } : m,
        ),
      },
    }));
  },
  markDelivered: async (conversationId, userId) => {
    const pending = (get().byConversation[conversationId] ?? []).filter(
      (message) => message.sender_id !== userId && message.status === 'sent',
    );
    if (!pending.length) return;
    const ids = pending.map((m) => m.id);
    await supabase.from('messages').update({ status: 'delivered' }).in('id', ids);

    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: (state.byConversation[conversationId] ?? []).map((m) =>
          ids.includes(m.id) ? { ...m, status: 'delivered' } : m,
        ),
      },
    }));
  },
  onIncoming: (message) => {
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [message.conversation_id]: (() => {
          const current = state.byConversation[message.conversation_id] ?? [];
          if (current.some((m) => m.id === message.id)) {
            return current.map((m) => (m.id === message.id ? message : m));
          }
          return [...current, message];
        })(),
      },
    }));
  },
  onMessageUpdate: (message) => {
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [message.conversation_id]: (state.byConversation[message.conversation_id] ?? []).map((m) =>
          m.id === message.id ? { ...m, ...message } : m,
        ),
      },
    }));
  },
}));
