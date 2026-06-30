import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { RootStackParamList } from '@/navigation/types';
import { mediaService } from '@/services/mediaService';
import { profileService } from '@/services/profileService';
import { useAuthStore } from '@/store/authStore';
import { useProfileStore } from '@/store/profileStore';
import { avatarDisplayUri } from '@/utils/avatarUri';
import { formatSupabaseError, formatSupabaseWriteError } from '@/utils/supabaseErrors';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export const ProfileScreen = ({ navigation }: Props) => {
  const userId = useAuthStore((s) => s.session?.user.id);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [localPreviewUri, setLocalPreviewUri] = useState<string | null>(null);
  const [avatarRevision, setAvatarRevision] = useState(0);
  const setMyAvatar = useProfileStore((s) => s.setMyAvatar);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await profileService.getMyProfile(userId);
      if (error) throw error;
      if (data) {
        setUsername(data.username ?? '');
        setPhone(data.phone_number ?? '');
        setBio(data.bio ?? '');
        setAvatarUrl(data.avatar_url);
        setMyAvatar(data.avatar_url);
      }
    } catch (e) {
      Alert.alert('Profile', formatSupabaseError(e));
    } finally {
      setLoading(false);
    }
  }, [setMyAvatar, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const leaveProfileScreen = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('MainTabs');
  }, [navigation]);

  const onSave = async () => {
    if (!userId) return;
    if (!username.trim()) {
      Alert.alert('Username required', 'Please enter a display name.');
      return;
    }
    try {
      setSaving(true);
      await profileService.updateMyProfile(userId, {
        username: username.trim(),
        phone_number: phone.trim() || null,
        bio: bio.trim() || null,
      });
      leaveProfileScreen();
    } catch (e) {
      Alert.alert('Could not save', formatSupabaseWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const applyNewAvatar = async (localUri: string) => {
    const savedUrl = await profileService.uploadAndSaveAvatar(localUri);
    setAvatarUrl(savedUrl);
    setLocalPreviewUri(null);
    setAvatarRevision((n) => n + 1);
    setMyAvatar(savedUrl);
  };

  const onChangePhoto = async () => {
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in again to change your photo.');
      return;
    }
    try {
      const asset = await mediaService.pickImage();
      if (!asset) return;
      setLocalPreviewUri(asset.uri);
      setUploading(true);
      await applyNewAvatar(asset.uri);
      const { data: refreshed } = await profileService.getMyProfile(userId);
      if (refreshed?.avatar_url) {
        setAvatarUrl(refreshed.avatar_url);
        setAvatarRevision((n) => n + 1);
        setMyAvatar(refreshed.avatar_url);
      }
    } catch (e) {
      setLocalPreviewUri(null);
      Alert.alert('Photo', formatSupabaseError(e));
    } finally {
      setUploading(false);
    }
  };

  const onRemovePhoto = () => {
    if (!userId || !avatarUrl) return;
    Alert.alert('Remove photo', 'Your profile picture will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setUploading(true);
            await profileService.removeAvatar();
            setAvatarUrl(null);
            setLocalPreviewUri(null);
            setAvatarRevision((n) => n + 1);
            setMyAvatar(null);
          } catch (e) {
            Alert.alert('Photo', formatSupabaseError(e));
          } finally {
            setUploading(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable
            style={styles.avatarWrap}
            onPress={onChangePhoto}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
          >
            {localPreviewUri || avatarUrl ? (
              <Image
                key={localPreviewUri ?? `remote-${avatarRevision}`}
                source={{
                  uri: localPreviewUri ?? avatarDisplayUri(avatarUrl, avatarRevision) ?? '',
                }}
                style={styles.avatarImg}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarLetter}>{username.slice(0, 1).toUpperCase() || '?'}</Text>
              </View>
            )}
            {uploading ? <ActivityIndicator style={styles.avatarSpinner} color={colors.accent} /> : null}
            <Text style={styles.changePhoto}>{uploading ? 'Uploading…' : 'Change photo'}</Text>
          </Pressable>
          {avatarUrl ? (
            <Pressable
              onPress={onRemovePhoto}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Remove profile photo"
            >
              <Text style={styles.removePhoto}>Remove photo</Text>
            </Pressable>
          ) : null}

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Display name"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            accessibilityLabel="Username"
          />

          <Text style={styles.label}>Phone (for contact discovery)</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+1… or local number"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            accessibilityLabel="Phone number"
          />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bio]}
            value={bio}
            onChangeText={setBio}
            placeholder="Optional"
            placeholderTextColor={colors.muted}
            multiline
            accessibilityLabel="Bio"
          />

          <Pressable
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={onSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
          >
            <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2F4B8A',
  },
  back: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  headerSpacer: { width: 56 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, paddingBottom: 40, gap: 8 },
  avatarWrap: { alignItems: 'center', marginBottom: 4 },
  avatarImg: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#2B4279' },
  avatarPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#2B4279',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: colors.text, fontSize: 40, fontWeight: '700' },
  avatarSpinner: { marginTop: 8 },
  changePhoto: { color: colors.accent, marginTop: 8, fontWeight: '600' },
  removePhoto: { color: colors.muted, textAlign: 'center', marginBottom: 12, fontWeight: '600' },
  label: { color: colors.muted, fontSize: 13, marginTop: 8 },
  input: {
    backgroundColor: '#FFFFFF',
    color: '#0D1B3D',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
  },
  bio: { minHeight: 88, textAlignVertical: 'top' },
  button: {
    marginTop: 20,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
