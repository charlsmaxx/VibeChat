import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import type { MainTabParamList, RootStackParamList } from '@/navigation/types';
import { supabase } from '@/services/supabase/client';
import type { Conversation } from '@/types';
import { useAuthStore } from '@/store/authStore';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Communities'>,
  NativeStackScreenProps<RootStackParamList>
>;

export const CommunitiesScreen = ({ navigation }: Props) => {
  const session = useAuthStore((s) => s.session);
  const [groups, setGroups] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGroups = async () => {
      if (!session?.user.id) return;
      try {
        setLoading(true);
        setError(null);
        const { data, error: qErr } = await supabase
          .from('conversation_participants')
          .select('conversations(*)')
          .eq('user_id', session.user.id);
        if (qErr) throw qErr;
        const list = (data ?? []).map((row: any) => row.conversations).filter(Boolean) as Conversation[];
        setGroups(list.filter((c) => c.is_group));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();

    const channel = supabase
      .channel(`communities:${session?.user.id ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => fetchGroups())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_participants' }, () => fetchGroups())
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [session?.user.id]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Communities</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create new community group"
          onPress={() => navigation.navigate('GroupCreate')}
        >
          <Text style={styles.link}>New</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.state}>{error}</Text> : null}

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.state}>{loading ? 'Loading communities…' : 'No groups yet. Create one with New.'}</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`Open group ${item.title}`}
            onPress={() => navigation.navigate('Chat', { conversationId: item.id, title: item.title })}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.title.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.title}</Text>
              <Text style={styles.preview} numberOfLines={1}>
                {item.last_message ?? 'No messages yet'}
              </Text>
            </View>
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
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  link: { color: colors.accent, fontWeight: '700', fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2F4B8A',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2B4279',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontWeight: '700', fontSize: 18 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  preview: { color: colors.muted, marginTop: 4 },
  state: { color: colors.muted, padding: 16 },
});
