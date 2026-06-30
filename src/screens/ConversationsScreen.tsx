import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChatsStackParamList, MainTabParamList, RootStackParamList } from '@/navigation/types';
import { colors } from '@/constants/theme';
import { supabase } from '@/services/supabase/client';
import { Conversation } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useContactStore } from '@/store/contactStore';
import { navigateToChatInStack } from '@/navigation/navigationRef';
import { useOpenDirectChat } from '@/hooks/useOpenDirectChat';
import { conversationService } from '@/services/conversationService';
import { AvatarThumb } from '@/components/AvatarThumb';
import { formatSupabaseError } from '@/utils/supabaseErrors';

type Props = CompositeScreenProps<
  NativeStackScreenProps<ChatsStackParamList, 'Conversations'>,
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList>,
    NativeStackScreenProps<RootStackParamList>
  >
>;

export const ConversationsScreen = ({ navigation }: Props) => {
  const session = useAuthStore((s) => s.session);
  const usersOnApp = useContactStore((s) => s.usersOnApp);
  const syncContacts = useContactStore((s) => s.sync);
  const [items, setItems] = useState<Conversation[]>([]);
  const [unreadByConversation, setUnreadByConversation] = useState<Record<string, number>>({});
  const [directTitleByConversation, setDirectTitleByConversation] = useState<Record<string, string>>({});
  const [peerUserIdByConversation, setPeerUserIdByConversation] = useState<Record<string, string>>({});
  const [peerAvatarByConversation, setPeerAvatarByConversation] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { openingPeerId, openDirectChat } = useOpenDirectChat(session?.user.id, navigation);

  const loadConversations = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const uid = session?.user.id;
      if (!uid) return;
      const showLoading = options?.showLoading !== false;
      try {
        if (showLoading) setLoading(true);
        setError(null);
        const { data, error: listError } = await supabase
          .from('conversation_participants')
          .select('conversations(*)')
          .eq('user_id', uid);
        if (listError) throw listError;
        const all = (data ?? [])
          .map((row: { conversations: Conversation | Conversation[] | null }) => {
            const c = row.conversations;
            return Array.isArray(c) ? c[0] : c;
          })
          .filter(Boolean) as Conversation[];
        const directs = all.filter((c) => !c.is_group);

        const conversationIds = directs.map((c) => c.id).filter(Boolean);
        if (!conversationIds.length) {
          setItems([]);
          setUnreadByConversation({});
          setDirectTitleByConversation({});
          setPeerUserIdByConversation({});
          setPeerAvatarByConversation({});
          return;
        }

        const { data: unreadRows } = await supabase
          .from('messages')
          .select('conversation_id, status, sender_id')
          .in('conversation_id', conversationIds)
          .neq('sender_id', uid)
          .neq('status', 'read');

        const map: Record<string, number> = {};
        (unreadRows ?? []).forEach((row: { conversation_id: string }) => {
          map[row.conversation_id] = (map[row.conversation_id] ?? 0) + 1;
        });
        setUnreadByConversation(map);

        const { data: participantRows } = await supabase
          .from('conversation_participants')
          .select('conversation_id, user_id')
          .in('conversation_id', conversationIds);

        const participantMap = new Map<string, string[]>();
        (participantRows ?? []).forEach((row: { conversation_id: string; user_id: string }) => {
          participantMap.set(row.conversation_id, [...(participantMap.get(row.conversation_id) ?? []), row.user_id]);
        });

        const peerIds = [
          ...new Set(
            (participantRows ?? []).map((r: { user_id: string }) => r.user_id).filter((id: string) => id !== uid),
          ),
        ];
        const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', peerIds);
        const profileMap = new Map(
          (profiles ?? []).map((profile: { id: string; username: string }) => [profile.id, profile.username]),
        );
        const avatarMap = new Map(
          (profiles ?? []).map((profile: { id: string; avatar_url: string | null }) => [profile.id, profile.avatar_url ?? null]),
        );

        const titleMap: Record<string, string> = {};
        const peerMap: Record<string, string> = {};
        const peerAvMap: Record<string, string | null> = {};
        (data ?? []).forEach((row: { conversations: Conversation | Conversation[] | null }) => {
          const conversation = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations;
          if (!conversation || conversation.is_group) return;
          const peerId = (participantMap.get(conversation.id) ?? []).find((id) => id !== uid);
          if (peerId && peerId !== uid) {
            peerMap[conversation.id] = peerId;
            titleMap[conversation.id] = profileMap.get(peerId) ?? conversation.title;
            peerAvMap[conversation.id] = avatarMap.get(peerId) ?? null;
          }
        });
        setDirectTitleByConversation(titleMap);
        setPeerUserIdByConversation(peerMap);
        setPeerAvatarByConversation(peerAvMap);
        setItems(directs.filter((c) => Boolean(peerMap[c.id])));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [session?.user.id],
  );

  useFocusEffect(
    useCallback(() => {
      if (session?.user.id) {
        syncContacts(session.user.id);
        loadConversations({ showLoading: false });
      }
    }, [loadConversations, session?.user.id, syncContacts]),
  );

  useEffect(() => {
    loadConversations({ showLoading: true });
    const channel = supabase
      .channel(`conversations:${session?.user.id ?? 'anon'}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () =>
        loadConversations({ showLoading: false }),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () =>
        loadConversations({ showLoading: false }),
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [loadConversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (session?.user.id) await syncContacts(session.user.id, { force: true });
      await loadConversations({ showLoading: false });
    } finally {
      setRefreshing(false);
    }
  }, [loadConversations, session?.user.id, syncContacts]);

  const peerIdsInChats = new Set(Object.values(peerUserIdByConversation));
  const suggestions = usersOnApp.filter(
    (u) => session?.user.id && u.userId !== session.user.id && !peerIdsInChats.has(u.userId),
  );

  const openSuggestion = useCallback(
    async (peerUserId: string, title: string) => {
      setError(null);
      await openDirectChat(peerUserId, title);
    },
    [openDirectChat],
  );

  const openExistingChat = useCallback(
    (conversationId: string, title: string) => {
      try {
        navigateToChatInStack(navigation, { conversationId, title });
      } catch (err) {
        Alert.alert('Could not open chat', (err as Error).message);
      }
    },
    [navigation],
  );

  const listHeader =
    suggestions.length === 0 ? null : (
      <View style={styles.suggestBlock}>
        <Text style={styles.suggestHeading}>People on VibeChat</Text>
        <Text style={styles.suggestSub}>From your contacts — tap to start chatting</Text>
        {suggestions.map((u) => (
          <Pressable
            key={u.userId}
            style={styles.suggestRow}
            accessibilityRole="button"
            accessibilityLabel={`Start chat with ${u.name}`}
            onPress={() => {
              if (!session?.user.id) {
                Alert.alert('Sign in required', 'Please sign in again to start a chat.');
                return;
              }
              void openSuggestion(u.userId, u.name);
            }}
            disabled={openingPeerId === u.userId}
          >
            <View style={styles.suggestIdentity}>
              <AvatarThumb uri={u.avatarUrl} label={u.name} size={40} />
              <Text style={styles.suggestName}>{u.name}</Text>
            </View>
            <Text style={styles.suggestAction}>{openingPeerId === u.userId ? '…' : 'Chat'}</Text>
          </Pressable>
        ))}
      </View>
    );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="My profile" onPress={() => navigation.navigate('Profile')}>
            <Text style={styles.contactsBtn}>Profile</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open contacts" onPress={() => navigation.navigate('Contacts')}>
            <Text style={styles.contactsBtn}>Contacts</Text>
          </Pressable>
        </View>
      </View>
      {error ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>Unable to load conversations: {error}</Text>
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        initialNumToRender={12}
        windowSize={8}
        ListHeaderComponent={listHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <Text style={styles.stateText}>
            {loading
              ? 'Loading conversations...'
              : suggestions.length > 0
                ? 'No chats yet. Tap someone in “People on VibeChat” above or open Contacts.'
                : 'No conversations yet. Start one from Contacts.'}
          </Text>
        }
        renderItem={({ item }) => {
          const title = directTitleByConversation[item.id] ?? item.title;
          return (
            <Pressable
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`Open chat with ${title}`}
              onPress={() => openExistingChat(item.id, title)}
            >
              <View style={styles.rowTop}>
                <View style={styles.identityWrap}>
                  <AvatarThumb uri={peerAvatarByConversation[item.id]} label={title} size={34} />
                  <Text style={styles.name}>{title}</Text>
                </View>
                {unreadByConversation[item.id] ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{unreadByConversation[item.id]}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.preview} numberOfLines={1}>
                {item.last_message ?? 'No messages yet'}
              </Text>
            </Pressable>
          );
        }}
      />
      {openingPeerId ? (
        <View style={styles.openingOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.openingText}>Opening chat…</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  headerTitle: { color: colors.text, fontSize: 24, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: 16 },
  contactsBtn: { color: colors.accent, fontWeight: '700' },
  suggestBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2F4B8A',
    backgroundColor: colors.bg,
  },
  suggestHeading: { color: colors.text, fontSize: 16, fontWeight: '700' },
  suggestSub: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 10 },
  suggestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
    marginBottom: 8,
  },
  suggestIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  suggestName: { color: colors.text, fontWeight: '600', flexShrink: 1 },
  suggestAction: { color: colors.accent, fontWeight: '700' },
  stateWrap: { paddingHorizontal: 16, paddingVertical: 10 },
  stateText: { color: colors.muted, paddingHorizontal: 16, paddingVertical: 12 },
  row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomColor: '#2F4B8A', borderBottomWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  identityWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  preview: { color: colors.muted, marginTop: 3 },
  unreadBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  openingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 20,
    elevation: 20,
  },
  openingText: { color: colors.text, fontWeight: '600' },
});
