import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/services/supabase/client';

function contentTypeForPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'application/octet-stream';
}

export const mediaService = {
  async pick() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.6,
    });
    if (res.canceled) return null;
    return res.assets[0];
  },

  async pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: Platform.OS === 'ios',
      aspect: Platform.OS === 'ios' ? [1, 1] : undefined,
    });
    if (res.canceled) return null;
    return res.assets[0];
  },

  async uploadToBucket(
    uri: string,
    bucket: string,
    filePath: string,
    contentType?: string,
    options?: { upsert?: boolean },
  ) {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const ct = contentType ?? contentTypeForPath(filePath);
    const { error } = await supabase.storage.from(bucket).upload(filePath, decode(base64), {
      contentType: ct,
      upsert: options?.upsert ?? true,
    });
    if (error) throw error;
    return supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
  },

  async uploadStatusMedia(uri: string, userId: string, ext: 'jpg' | 'mp4') {
    const path = `${userId}/${Date.now()}.${ext}`;
    const contentType = ext === 'mp4' ? 'video/mp4' : 'image/jpeg';
    return mediaService.uploadToBucket(uri, 'status-media', path, contentType, { upsert: true });
  },

  async upload(uri: string, filePath: string) {
    return mediaService.uploadToBucket(uri, 'chat-media', filePath, contentTypeForPath(filePath), { upsert: true });
  },
};
