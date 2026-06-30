import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ENV } from '@/constants/env';
import { supabase } from '@/services/supabase/client';
import {
  handleIncomingCallFromPush,
  parseIncomingCallPayload,
  presentIncomingCallAlert,
} from '@/services/callNotificationRouter';

let handlersRegistered = false;

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const callPayload = parseIncomingCallPayload(notification.request.content.data);
    if (callPayload) {
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        priority: Notifications.AndroidNotificationPriority.MAX,
      };
    }
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
  });

  await Notifications.setNotificationChannelAsync('incoming_calls', {
    name: 'Incoming calls',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#DC2626',
    sound: 'default',
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

async function ensureCallCategories() {
  await Notifications.setNotificationCategoryAsync('incoming_call', [
    {
      identifier: 'ANSWER',
      buttonTitle: 'Answer',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'DECLINE',
      buttonTitle: 'Decline',
      options: { isDestructive: true },
    },
  ]);
}

export const notificationService = {
  async register(userId: string) {
    if (!Device.isDevice) return;

    const current = await Notifications.getPermissionsAsync();
    let finalStatus = current.status;
    if (finalStatus !== 'granted') {
      const next = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      finalStatus = next.status;
    }
    if (finalStatus !== 'granted') return;

    await ensureAndroidChannels();
    await ensureCallCategories();

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: ENV.easProjectId || undefined,
    });
    await supabase.from('push_tokens').upsert({ user_id: userId, token: token.data, updated_at: new Date().toISOString() });
  },

  setupCallPushHandlers() {
    if (handlersRegistered) return;
    handlersRegistered = true;

    Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = parseIncomingCallPayload(response.notification.request.content.data);
      if (!payload) return;
      const actionId = response.actionIdentifier;
      handleIncomingCallFromPush(payload, actionId === Notifications.DEFAULT_ACTION_IDENTIFIER ? 'ANSWER' : actionId).catch(
        () => {},
      );
    });

    Notifications.addNotificationReceivedListener((notification) => {
      const payload = parseIncomingCallPayload(notification.request.content.data);
      if (payload) {
        presentIncomingCallAlert(payload).catch(() => {});
      }
    });
  },

  async processColdStartCallNotification() {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (!last) return;
    const payload = parseIncomingCallPayload(last.notification.request.content.data);
    if (!payload) return;
    const actionId = last.actionIdentifier;
    if (actionId === 'DECLINE') {
      await handleIncomingCallFromPush(payload, 'DECLINE');
      return;
    }
    await handleIncomingCallFromPush(payload, 'ANSWER');
  },
};
