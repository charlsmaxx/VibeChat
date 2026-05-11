import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MainTabParamList, RootStackParamList } from '@/navigation/types';
import { colors } from '@/constants/theme';
import { supabase } from '@/services/supabase/client';
import { Conversation } from '@/types';
import { useAuthStore } from '@/store/authStore';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Chats'>,
  NativeStackScreenProps<RootStackParamList>
>;

export const ConversationsScreen = ({ navigation }: Props) => {
  const session = useAuthStore((s) => s.session);
  const [items, setItems] = useState<Conversation[]>([]);
  const [unreadByConversation, setUnreadByConversation] = useState<Record<string, number>>({});
  const [directTitleByConversation, setDirectTitleByConversation] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!session?.user.id) return;
      try {
        setLoading(true);
        setError(null);
        const { data, error: listError } = await supabase
          .from('conversation_participants')
          .select('conversations(*)')
          .eq('user_id', session.user.id);
        if (listError) throw listError;
        const all = (data ?? []).map((row: any) => row.conversations).filter(Boolean) as Conversation[];
        const directs = all.filter((c) => !c.is_group);
        setItems(directs);

        const conversationIds = directs.map((c) => c.id).filter(Boolean);
        if (!conversationIds.length) {
          setUnreadByConversation({});
          return;
        }

        const { data: unreadRows } = await supabase
          .from('messages')
          .select('conversation_id, status, sender_id')
          .in('conversation_id', conversationIds)
          .neq('sender_id', session.user.id)
          .neq('status', 'read');

        const map: Record<string, number> = {};
        (unreadRows ?? []).forEach((row: any) => {
          map[row.conversation_id] = (map[row.conversation_id] ?? 0) + 1;
        });
        setUnreadByConversation(map);

        const { data: participantRows } = await supabase
          .from('conversation_participants')
          .select('conversation_id, user_id')
          .in('conversation_id', conversationIds);

        const participantMap = new Map<string, string[]>();
        (participantRows ?? []).forEach((row: any) => {
          participantMap.set(row.conversation_id, [...(participantMap.get(row.conversation_id) ?? []), row.user_id]);
        });

        const peerIds = [...new Set((participantRows ?? []).map((r: any) => r.user_id).filter((id: string) => id !== session.user.id))];
        const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', peerIds);
        const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.username as string]));

        const titleMap: Record<string, string> = {};
        (data ?? []).forEach((row: any) => {
          const conversation = row.conversations as Conversation | null;
          if (!conversation || conversation.is_group) return;
          const peerId = (participantMap.get(conversation.id) ?? []).find((id) => id !== session.user.id);
          if (peerId) titleMap[conversation.id] = profileMap.get(peerId) ?? conversation.title;
        });
        setDirectTitleByConversation(titleMap);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    const channel = supabase
      .channel(`conversations:${session?.user.id ?? 'anon'}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => fetchData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchData())
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [session?.user.id]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Open contacts" onPress={() => navigation.navigate('Contacts')}>
          <Text style={styles.contactsBtn}>Contacts</Text>
        </Pressable>
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
        ListEmptyComponent={
          <Text style={styles.stateText}>{loading ? 'Loading conversations...' : 'No conversations yet. Start one from Contacts.'}</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`Open chat with ${directTitleByConversation[item.id] ?? item.title}`}
            onPress={() => navigation.navigate('Chat', { conversationId: item.id, title: directTitleByConversation[item.id] ?? item.title })}
          >
            <View style={styles.rowTop}>
              <View style={styles.identityWrap}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(directTitleByConversation[item.id] ?? item.title).slice(0, 1).toUpperCase()}</Text>
                </View>
                <Text style={styles.name}>{directTitleByConversation[item.id] ?? item.title}</Text>
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
        )}
      />
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
  contactsBtn: { color: colors.accent, fontWeight: '700' },
  stateWrap: { paddingHorizontal: 16, paddingVertical: 10 },
  stateText: { color: colors.muted, paddingHorizontal: 16, paddingVertical: 12 },
  row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomColor: '#2F4B8A', borderBottomWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  identityWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2B4279',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontWeight: '700' },
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
});
