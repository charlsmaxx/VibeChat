import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { contactService } from '@/services/contactService';
import { useContactStore } from '@/store/contactStore';
import { colors } from '@/constants/theme';
import { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { navigateToChat } from '@/navigation/navigationRef';
import { useOpenDirectChat } from '@/hooks/useOpenDirectChat';
import { profileService } from '@/services/profileService';
import { AvatarThumb } from '@/components/AvatarThumb';
import { formatSupabaseError, formatSupabaseWriteError } from '@/utils/supabaseErrors';

type Props = NativeStackScreenProps<RootStackParamList, 'Contacts'>;

type SearchHit = { id: string; username: string; avatar_url: string | null };

export const ContactsScreen = ({ navigation }: Props) => {
  const { usersOnApp, inviteContacts, loading, sync } = useContactStore();
  const userId = useAuthStore((s) => s.session?.user.id);
  const [usernameQuery, setUsernameQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const { openingPeerId, openDirectChat } = useOpenDirectChat(userId, {
    navigate: (screen, params) => navigateToChat(params),
  });

  useEffect(() => {
    if (userId) sync(userId, { force: true });
  }, [sync, userId]);

  const openChat = useCallback(
    (peerUserId: string, title: string) => {
      void openDirectChat(peerUserId, title);
    },
    [openDirectChat],
  );

  const runUsernameSearch = useCallback(async () => {
    if (!userId) return;
    const q = usernameQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      setSearching(true);
      const hits = await profileService.searchByUsername(q, userId);
      setSearchResults(hits);
    } catch (e) {
      Alert.alert('Search failed', formatSupabaseWriteError(e));
    } finally {
      setSearching(false);
    }
  }, [userId, usernameQuery]);

  const renderAppUser = useCallback(
    ({ item }: { item: (typeof usersOnApp)[number] }) => (
      <Pressable
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${item.name}`}
        onPress={() => openChat(item.userId, item.name)}
        disabled={openingPeerId === item.userId}
      >
        <View style={styles.rowLeft}>
          <AvatarThumb uri={item.avatarUrl} label={item.name} size={44} />
          <View style={styles.rowText}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>
              {openingPeerId === item.userId ? 'Opening chat…' : `@${item.username} · ${item.phone}`}
            </Text>
          </View>
        </View>
      </Pressable>
    ),
    [openChat],
  );

  const renderSearchHit = useCallback(
    ({ item }: { item: SearchHit }) => (
      <Pressable
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${item.username}`}
        onPress={() => openChat(item.id, item.username)}
        disabled={openingPeerId === item.id}
      >
        <View style={styles.rowLeft}>
          <AvatarThumb uri={item.avatar_url} label={item.username} size={44} />
          <View style={styles.rowText}>
            <Text style={styles.name}>{item.username}</Text>
            <Text style={styles.meta}>{openingPeerId === item.id ? 'Opening chat…' : 'Tap to message'}</Text>
          </View>
        </View>
      </Pressable>
    ),
    [openChat],
  );

  const renderInvite = useCallback(
    ({ item }: { item: { id: string; name: string; phone: string } }) => (
      <Pressable
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={`Invite ${item.name} via SMS`}
        onPress={() => contactService.inviteBySms(item.phone)}
      >
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.invite}>Invite</Text>
      </Pressable>
    ),
    [],
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create new group"
        style={styles.groupButton}
        onPress={() => navigation.navigate('GroupCreate')}
      >
        <Text style={styles.groupButtonText}>+ New group</Text>
      </Pressable>

      <Text style={styles.heading}>Find by username</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search username (min 2 chars)"
          placeholderTextColor={colors.muted}
          value={usernameQuery}
          onChangeText={setUsernameQuery}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search username"
          onSubmitEditing={runUsernameSearch}
        />
        <Pressable style={styles.searchBtn} onPress={runUsernameSearch} accessibilityRole="button" accessibilityLabel="Search">
          <Text style={styles.searchBtnText}>{searching ? '…' : 'Go'}</Text>
        </Pressable>
      </View>
      {searchResults.length > 0 ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderSearchHit}
          style={styles.searchList}
        />
      ) : usernameQuery.trim().length >= 2 && !searching ? (
        <Text style={styles.hint}>No users found for that username.</Text>
      ) : null}

      <Text style={styles.heading}>From your contacts</Text>
      <Text style={styles.hint}>
        Other VibeChat users appear here when their phone is in your contacts and saved on their profile (E.164).
      </Text>
      <FlatList
        data={usersOnApp}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => userId && sync(userId, { force: true })}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{loading ? 'Syncing contacts...' : 'No contacts on VibeChat yet. Try username search above.'}</Text>
        }
        renderItem={renderAppUser}
      />
      <Text style={styles.heading}>Invite Contacts</Text>
      <FlatList data={inviteContacts.slice(0, 25)} keyExtractor={(item) => item.id} renderItem={renderInvite} />
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
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 14, paddingTop: 10 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  hint: { color: colors.muted, fontSize: 13, marginBottom: 8 },
  groupButton: { backgroundColor: colors.accent, padding: 12, borderRadius: 10, marginBottom: 8 },
  groupButtonText: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center' },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    color: '#0D1B3D',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchBtnText: { color: '#FFFFFF', fontWeight: '700' },
  searchList: { maxHeight: 160, marginBottom: 8 },
  row: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowText: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13 },
  invite: { color: colors.accent, fontWeight: '700' },
  empty: { color: colors.muted, marginBottom: 8 },
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
