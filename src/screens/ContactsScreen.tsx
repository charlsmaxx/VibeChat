import React, { useCallback, useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { contactService } from '@/services/contactService';
import { useContactStore } from '@/store/contactStore';
import { colors } from '@/constants/theme';
import { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/services/supabase/client';
import { conversationService } from '@/services/conversationService';

type Props = NativeStackScreenProps<RootStackParamList, 'Contacts'>;

export const ContactsScreen = ({ navigation }: Props) => {
  const { usersOnApp, inviteContacts, loading, sync } = useContactStore();
  const userId = useAuthStore((s) => s.session?.user.id);

  useEffect(() => {
    sync();
  }, [sync]);

  const renderAppUser = useCallback(
    ({ item }: { item: { id: string; name: string; phone: string; userId: string; username: string } }) => (
      <Pressable
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${item.name}`}
        onPress={async () => {
          if (!userId) return;
          const { data: existingParticipants } = await supabase
            .from('conversation_participants')
            .select('conversation_id, user_id, conversations(id, title, is_group)')
            .in('user_id', [userId, item.userId]);

          const candidateMap = new Map<string, string[]>();
          (existingParticipants ?? []).forEach((row: any) => {
            const conversation = row.conversations;
            if (!conversation || conversation.is_group) return;
            const id = row.conversation_id;
            candidateMap.set(id, [...(candidateMap.get(id) ?? []), row.user_id]);
          });

          const matched = [...candidateMap.entries()].find(([, users]) => {
            const unique = [...new Set(users)];
            return unique.length === 2 && unique.includes(userId) && unique.includes(item.userId);
          });

          if (matched) {
            const [conversationId] = matched;
            navigation.navigate('Chat', { conversationId, title: item.name });
            return;
          }

          const created = await conversationService.createDirectConversation({
            title: item.name,
            creatorId: userId,
            peerUserId: item.userId,
          });
          navigation.navigate('Chat', { conversationId: created.id, title: item.name });
        }}
      >
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.meta}>{item.phone}</Text>
      </Pressable>
    ),
    [navigation, userId],
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
      <Text style={styles.heading}>Users on App</Text>
      <FlatList
        data={usersOnApp}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Syncing contacts...' : 'No users found on app'}</Text>}
        renderItem={renderAppUser}
      />
      <Text style={styles.heading}>Invite Contacts</Text>
      <FlatList data={inviteContacts.slice(0, 25)} keyExtractor={(item) => item.id} renderItem={renderInvite} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 14, paddingTop: 10 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  groupButton: { backgroundColor: colors.accent, padding: 12, borderRadius: 10, marginBottom: 8 },
  groupButtonText: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center' },
  row: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  name: { color: colors.text, fontWeight: '600' },
  meta: { color: colors.muted },
  invite: { color: colors.accent, fontWeight: '700' },
  empty: { color: colors.muted, marginBottom: 8 },
});
