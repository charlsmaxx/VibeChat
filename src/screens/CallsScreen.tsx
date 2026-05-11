import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import type { MainTabParamList, RootStackParamList } from '@/navigation/types';
import { supabase } from '@/services/supabase/client';
import type { CallLogRow } from '@/types';
import { useAuthStore } from '@/store/authStore';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Calls'>,
  NativeStackScreenProps<RootStackParamList>
>;

type EnrichedCall = CallLogRow & { peerName: string; directionLabel: string; summaryLabel: string };

export const CallsScreen = (_props: Props) => {
  const userId = useAuthStore((s) => s.session?.user.id);
  const [rows, setRows] = useState<EnrichedCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      const { data, error: qErr } = await supabase
        .from('calls')
        .select('id, caller_id, callee_id, channel, status, created_at')
        .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(80);
      if (qErr) throw qErr;
      const list = (data ?? []) as CallLogRow[];
      const peerIds = [...new Set(list.flatMap((c) => [c.caller_id, c.callee_id]))];
      let map = new Map<string, string>();
      if (peerIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', peerIds);
        map = new Map((profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username]));
      }
      const enriched: EnrichedCall[] = list.map((c) => {
        const isOutgoing = c.caller_id === userId;
        const peerId = isOutgoing ? c.callee_id : c.caller_id;
        const peerName = map.get(peerId) ?? 'Unknown';
        const directionLabel = isOutgoing ? 'Outgoing' : 'Incoming';
        const missed = !isOutgoing && (c.status === 'missed' || c.status === 'ringing' || c.status === 'declined');
        const summaryLabel = missed ? 'Missed' : c.status;
        return { ...c, peerName, directionLabel, summaryLabel };
      });
      setRows(enriched);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`calls:${userId ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => load())
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [load, userId]);

  const missed = rows.filter((r) => r.summaryLabel === 'Missed');
  const past = rows.filter((r) => r.summaryLabel !== 'Missed');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calls</Text>
      </View>

      {error ? <Text style={styles.state}>{error}</Text> : null}

      {loading && !rows.length ? <Text style={styles.state}>Loading calls…</Text> : null}

      {!loading && !rows.length ? <Text style={styles.state}>No calls yet. History appears here after VoIP events are logged.</Text> : null}

      <FlatList
        data={[{ key: 'missed', title: 'Missed', data: missed }, { key: 'past', title: 'Recent', data: past }]}
        keyExtractor={(s) => s.key}
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.section}>{section.title}</Text>
            {section.data.length === 0 ? (
              <Text style={styles.emptySection}>None</Text>
            ) : (
              section.data.map((c) => (
                <View key={c.id} style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{c.peerName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{c.peerName}</Text>
                    <Text style={[styles.meta, c.summaryLabel === 'Missed' ? styles.missed : undefined]}>
                      {c.directionLabel} · {c.summaryLabel}
                    </Text>
                    <Text style={styles.time}>{new Date(c.created_at).toLocaleString()}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  section: { color: colors.muted, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, fontWeight: '700' },
  emptySection: { color: colors.muted, paddingHorizontal: 24, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2F4B8A',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2B4279',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontWeight: '700' },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.muted, marginTop: 2 },
  missed: { color: '#F97373', fontWeight: '600' },
  time: { color: colors.muted, fontSize: 11, marginTop: 4 },
  state: { color: colors.muted, padding: 16 },
});
