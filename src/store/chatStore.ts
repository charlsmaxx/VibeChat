import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { Message, OutboxMessage } from '@/types';
import { supabase } from '@/services/supabase/client';

const OUTBOX_KEY = 'pending_messages';

/** In-memory fallback when MMKV native module is unavailable. */
let memoryOutbox: OutboxMessage[] = [];
let mmkvAvailable = true;

type OutboxStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
};

let outboxStorage: OutboxStorage | null = null;

function getOutboxStorage(): OutboxStorage {
  if (outboxStorage) return outboxStorage;

  if (mmkvAvailable) {
    try {
      // Lazy require so a missing/broken native module does not crash at import time.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
      outboxStorage = new MMKV({ id: 'vibechat-outbox' });
      return outboxStorage;
    } catch (err) {
      mmkvAvailable = false;
      console.warn('MMKV unavailable — using in-memory outbox', err);
    }
  }

  outboxStorage = {
    getString: (key) => (key === OUTBOX_KEY ? JSON.stringify(memoryOutbox) : undefined),
    set: (key, value) => {
      if (key === OUTBOX_KEY) {
        try {
          memoryOutbox = JSON.parse(value) as OutboxMessage[];
        } catch {
          memoryOutbox = [];
        }
      }
    },
  };
  return outboxStorage;
}

function isPersistedMessageId(id: string): boolean {
  return Boolean(id) && !id.startsWith('local-');
}

interface ChatState {
  byConversation: Record<string, Message[]>;
  pageByConversation: Record<string, number>;
  loadInitial: (conversationId: string) => Promise<void>;
  loadMore: (conversationId: string) => Promise<void>;
  send: (message: OutboxMessage, senderId: string) => Promise<void>;
  flushOutbox: (senderId: string) => Promise<void>;
  markConversationRead: (conversationId: string, userId: string) => Promise<void>;
  markDelivered: (conversationId: string, userId: string) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: string, userId: string) => Promise<void>;
  onIncoming: (message: Message) => void;
  onMessageUpdate: (message: Message) => void;
  onMessageDelete: (conversationId: string, messageId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  byConversation: {},
  pageByConversation: {},
  loadInitial: async (conversationId) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(0, 19);
    if (error) throw error;
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
      const items = JSON.parse(getOutboxStorage().getString(OUTBOX_KEY) ?? '[]') as OutboxMessage[];
      getOutboxStorage().set(OUTBOX_KEY, JSON.stringify([payload, ...items]));
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
      const items = JSON.parse(getOutboxStorage().getString(OUTBOX_KEY) ?? '[]') as OutboxMessage[];
      getOutboxStorage().set(OUTBOX_KEY, JSON.stringify([payload, ...items]));
      throw error ?? new Error('Failed to send message');
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
    const queued = JSON.parse(getOutboxStorage().getString(OUTBOX_KEY) ?? '[]') as OutboxMessage[];
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
    getOutboxStorage().set(OUTBOX_KEY, JSON.stringify(remaining));
  },
  markConversationRead: async (conversationId, userId) => {
    const unread = (get().byConversation[conversationId] ?? []).filter(
      (message) => message.sender_id !== userId && message.status !== 'read',
    );
    if (!unread.length) return;
    const ids = unread.map((m) => m.id).filter(isPersistedMessageId);
    if (!ids.length) return;
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
    const ids = pending.map((m) => m.id).filter(isPersistedMessageId);
    if (!ids.length) return;
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
  deleteMessage: async (conversationId, messageId, userId) => {
    const previous = get().byConversation[conversationId] ?? [];

    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: (state.byConversation[conversationId] ?? []).filter((m) => m.id !== messageId),
      },
    }));

    if (!isPersistedMessageId(messageId)) return;

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', userId);

    if (error) {
      set((state) => ({
        byConversation: { ...state.byConversation, [conversationId]: previous },
      }));
      throw error;
    }
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
  onMessageDelete: (conversationId, messageId) => {
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: (state.byConversation[conversationId] ?? []).filter((m) => m.id !== messageId),
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
