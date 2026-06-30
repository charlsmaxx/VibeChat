import React, { useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '@/navigation/types';
import { useContactStore } from '@/store/contactStore';
import { useAuthStore } from '@/store/authStore';
import { conversationService } from '@/services/conversationService';
import { navigateToChat } from '@/navigation/navigationRef';
import { colors } from '@/constants/theme';
import { AvatarThumb } from '@/components/AvatarThumb';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupCreate'>;

export const GroupCreateScreen = ({ navigation }: Props) => {
  const creatorId = useAuthStore((s) => s.session?.user.id);
  const usersOnApp = useContactStore((s) => s.usersOnApp);
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const selectedIds = useMemo(
    () => usersOnApp.filter((u) => selected[u.userId]).map((u) => u.userId),
    [selected, usersOnApp],
  );

  const createGroup = async () => {
    if (!creatorId) return;
    if (!groupName.trim()) {
      Alert.alert('Group name required', 'Please provide a group name.');
      return;
    }
    if (selectedIds.length < 1) {
      Alert.alert('Members required', 'Select at least one member.');
      return;
    }

    try {
      setSaving(true);
      const conversation = await conversationService.createGroupConversation({
        title: groupName.trim(),
        creatorId,
        memberUserIds: selectedIds,
      });
      navigateToChat({ conversationId: conversation.id, title: groupName.trim() });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Group creation failed', (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <Text style={styles.label}>Group name</Text>
        <TextInput
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Friends"
          placeholderTextColor={colors.muted}
          style={styles.input}
          accessibilityLabel="Group name"
        />
        <Text style={styles.label}>Select members</Text>
        <FlatList
          data={usersOnApp}
          keyExtractor={(item) => item.userId}
          ListEmptyComponent={<Text style={styles.meta}>No contacts on app yet.</Text>}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const active = Boolean(selected[item.userId]);
            return (
              <Pressable
                style={[styles.row, active ? styles.rowActive : undefined]}
                accessibilityRole="button"
                accessibilityLabel={`${active ? 'Remove' : 'Add'} ${item.name}`}
                onPress={() => setSelected((prev) => ({ ...prev, [item.userId]: !prev[item.userId] }))}
              >
                <View style={styles.rowLeft}>
                  <AvatarThumb uri={item.avatarUrl} label={item.name} size={40} />
                  <View style={styles.rowText}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta}>{active ? 'Selected' : item.phone}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Create group chat" style={styles.button} onPress={createGroup} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Creating...' : `Create group (${selectedIds.length})`}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 14 },
  label: { color: colors.text, marginBottom: 8, fontWeight: '700' },
  input: {
    backgroundColor: '#FFFFFF',
    color: '#0D1B3D',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  row: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowText: { flex: 1, minWidth: 0 },
  rowActive: { borderWidth: 1, borderColor: colors.accent },
  name: { color: colors.text, fontWeight: '600' },
  meta: { color: colors.muted },
  button: { marginTop: 10, backgroundColor: colors.accent, borderRadius: 10, padding: 14 },
  buttonText: { textAlign: 'center', color: '#FFFFFF', fontWeight: '700' },
});
