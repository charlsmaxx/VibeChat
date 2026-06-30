import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import type { MainTabParamList, RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { statusService } from '@/services/statusService';
import { mediaService } from '@/services/mediaService';
import type { StatusUpdate } from '@/types';
import { supabase } from '@/services/supabase/client';
import { formatSupabaseError } from '@/utils/supabaseErrors';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Status'>,
  NativeStackScreenProps<RootStackParamList>
>;

type Row = StatusUpdate & { username?: string };

export const StatusScreen = (_props: Props) => {
  const userId = useAuthStore((s) => s.session?.user.id);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [textModal, setTextModal] = useState(false);
  const [draftCaption, setDraftCaption] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      const { data, error: listError } = await statusService.listActive();
      if (listError) throw listError;
      const ids = [...new Set(data.map((s) => s.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', ids);
      const nameMap = new Map((profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username]));
      setRows(data.map((s) => ({ ...s, username: nameMap.get(s.user_id) ?? 'User' })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('status_updates_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'status_updates' }, () => load())
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [load]);

  const postTextStatus = async () => {
    if (!userId) return;
    const caption = draftCaption.trim();
    if (!caption) {
      Alert.alert('Empty status', 'Please enter text for your update.');
      return;
    }
    try {
      setPosting(true);
      const { error } = await statusService.create({ userId, mediaType: 'text', caption });
      if (error) throw error;
      setDraftCaption('');
      setTextModal(false);
      await load();
    } catch (e) {
      Alert.alert('Could not post status', formatSupabaseError(e));
    } finally {
      setPosting(false);
    }
  };

  const postMediaStatus = async () => {
    if (!userId) return;
    try {
      const asset = await mediaService.pick();
      if (!asset) return;
      const ext = asset.type === 'video' ? 'mp4' : 'jpg';
      const url = await mediaService.uploadStatusMedia(asset.uri, userId, ext);
      const { error } = await statusService.create({
        userId,
        mediaType: asset.type === 'video' ? 'video' : 'image',
        mediaUrl: url,
        caption: null,
      });
      if (error) throw error;
      await load();
    } catch (e) {
      Alert.alert('Could not post media status', formatSupabaseError(e));
    }
  };

  const openComposer = () => {
    Alert.alert('New status', 'Choose how to share your update.', [
      { text: 'Text', onPress: () => setTextModal(true) },
      { text: 'Photo or video', onPress: () => postMediaStatus() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Updates</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add new status update"
        style={styles.myRow}
        onPress={openComposer}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>+</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>My status</Text>
          <Text style={styles.meta}>Tap to post an update</Text>
        </View>
      </Pressable>

      <Text style={styles.section}>Recent updates</Text>

      {error ? (
        <Text style={styles.state}>{error}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshing={loading}
          onRefresh={load}
          ListEmptyComponent={<Text style={styles.state}>{loading ? 'Loading…' : 'No updates yet.'}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatarSmall}>
                <Text style={styles.avatarTextSmall}>{(item.username ?? 'U').slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.username}</Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {item.media_type === 'text'
                    ? item.caption ?? 'Text update'
                    : item.media_type === 'video'
                      ? 'Video'
                      : 'Photo'}
                </Text>
                <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              {item.media_url && item.media_type !== 'video' ? (
                <Image source={{ uri: item.media_url }} style={styles.thumb} accessibilityIgnoresInvertColors />
              ) : null}
            </View>
          )}
        />
      )}

      <Modal visible={textModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Text status</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.muted}
              value={draftCaption}
              onChangeText={setDraftCaption}
              multiline
              accessibilityLabel="Status text"
            />
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel status composer"
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setTextModal(false)}
              >
                <Text style={styles.modalBtnTextGhost}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Post text status"
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                disabled={posting}
                onPress={postTextStatus}
              >
                <Text style={styles.modalBtnText}>{posting ? 'Posting…' : 'Post'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  section: { color: colors.muted, paddingHorizontal: 16, paddingVertical: 8, fontWeight: '600' },
  myRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2F4B8A',
  },
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2B4279',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  avatarTextSmall: { color: colors.text, fontWeight: '700' },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.muted, marginTop: 2 },
  time: { color: colors.muted, fontSize: 11, marginTop: 4 },
  thumb: { width: 44, height: 44, borderRadius: 8 },
  state: { color: colors.muted, padding: 16 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  modalInput: {
    minHeight: 100,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.card,
    color: colors.text,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: colors.card },
  modalBtnPrimary: { backgroundColor: colors.accent },
  modalBtnText: { color: '#FFFFFF', fontWeight: '700' },
  modalBtnTextGhost: { color: colors.text, fontWeight: '700' },
});
