import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/services/supabase/client';

export const mediaService = {
  async pick() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.6,
    });
    if (res.canceled) return null;
    return res.assets[0];
  },
  async upload(uri: string, filePath: string) {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const { error } = await supabase.storage.from('chat-media').upload(filePath, decode(base64), {
      contentType: 'application/octet-stream',
      upsert: true,
    });
    if (error) throw error;
    return supabase.storage.from('chat-media').getPublicUrl(filePath).data.publicUrl;
  },
};
