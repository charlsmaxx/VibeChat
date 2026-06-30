import { InteractionManager } from 'react-native';
import { createNavigationContainerRef } from '@react-navigation/native';
import type { ChatNavParams, RootStackParamList } from '@/navigation/types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export type { ChatNavParams };

function normalizeChatParams(params: ChatNavParams): ChatNavParams {
  const conversationId = params?.conversationId?.trim();
  if (!conversationId) {
    throw new Error('Invalid conversation. Please try again.');
  }
  return {
    conversationId,
    title: params.title?.trim() || 'Chat',
  };
}

/**
 * Open Chat inside the Chats tab stack (MainTabs → Chats → Chat).
 * Works from any screen via navigationRef — avoids Android crashes from
 * pushing a root-stack Chat screen over the tab navigator.
 */
export function navigateToChat(params: ChatNavParams, options?: { defer?: boolean }): void {
  const safeParams = normalizeChatParams(params);

  const go = () => {
    if (!navigationRef.isReady()) {
      throw new Error('Unable to open chat right now. Try again.');
    }
    navigationRef.navigate('MainTabs', {
      screen: 'Chats',
      params: {
        screen: 'Chat',
        params: safeParams,
      },
    });
  };

  if (options?.defer) {
    InteractionManager.runAfterInteractions(go);
    return;
  }

  go();
}

/** Open chat when already inside the Chats stack (Conversations list). */
export function navigateToChatInStack(
  navigation: { navigate: (screen: 'Chat', params: ChatNavParams) => void },
  params: ChatNavParams,
  options?: { defer?: boolean },
): void {
  const safeParams = normalizeChatParams(params);
  const go = () => navigation.navigate('Chat', safeParams);
  if (options?.defer) {
    InteractionManager.runAfterInteractions(go);
    return;
  }
  go();
}

export function navigateToChatFromRef(params: ChatNavParams): void {
  navigateToChat(params);
}
