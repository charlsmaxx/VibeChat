import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ENV } from '@/constants/env';
import { supabase } from '@/services/supabase/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const notificationService = {
  async register(userId: string) {
    if (!Device.isDevice) return;

    const current = await Notifications.getPermissionsAsync();
    let finalStatus = current.status;
    if (finalStatus !== 'granted') {
      const next = await Notifications.requestPermissionsAsync();
      finalStatus = next.status;
    }
    if (finalStatus !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'messages',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: ENV.easProjectId || undefined,
    });
    await supabase.from('push_tokens').upsert({ user_id: userId, token: token.data });
  },
};
