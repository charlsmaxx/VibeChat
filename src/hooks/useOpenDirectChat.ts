import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import type { ChatNavParams } from '@/navigation/types';
import { navigateToChatInStack } from '@/navigation/navigationRef';
import { conversationService } from '@/services/conversationService';
import { formatSupabaseError } from '@/utils/supabaseErrors';

type ChatsNavigation = {
  navigate: (screen: 'Chat', params: ChatNavParams) => void;
};

/**
 * Creates/opens a direct conversation then navigates to Chat within the Chats stack.
 */
export function useOpenDirectChat(userId: string | undefined, navigation: ChatsNavigation) {
  const [openingPeerId, setOpeningPeerId] = useState<string | null>(null);

  const openDirectChat = useCallback(
    async (peerUserId: string, title: string) => {
      if (!userId) {
        Alert.alert('Sign in required', 'Please sign in again to start a chat.');
        return;
      }
      if (openingPeerId) return;
      if (peerUserId === userId) {
        Alert.alert('Cannot chat', 'You cannot start a chat with yourself.');
        return;
      }

      try {
        setOpeningPeerId(peerUserId);
        const { conversationId } = await conversationService.openOrCreateDirectConversation({
          userId,
          peerUserId,
          peerDisplayName: title,
        });
        navigateToChatInStack(navigation, { conversationId, title });
      } catch (e) {
        Alert.alert('Could not open chat', formatSupabaseError(e));
      } finally {
        setOpeningPeerId(null);
      }
    },
    [navigation, openingPeerId, userId],
  );

  return { openingPeerId, openDirectChat };
}
