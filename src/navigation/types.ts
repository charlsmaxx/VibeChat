import type { NavigatorScreenParams } from '@react-navigation/native';

export type ChatsStackParamList = {
  Conversations: undefined;
  Chat: { conversationId: string; title: string };
};

export type MainTabParamList = {
  Chats: NavigatorScreenParams<ChatsStackParamList> | undefined;
  Status: undefined;
  Communities: undefined;
  Calls: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Contacts: undefined;
  GroupCreate: undefined;
  Profile: undefined;
  Call: {
    callId: string;
    channel: string;
    callType: 'audio' | 'video';
    title: string;
    isGroup: boolean;
    conversationId?: string;
    isOutgoing?: boolean;
  };
};

export type ChatNavParams = { conversationId: string; title: string };
