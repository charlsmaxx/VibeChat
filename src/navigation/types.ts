export type MainTabParamList = {
  Chats: undefined;
  Status: undefined;
  Communities: undefined;
  Calls: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  MainTabs: undefined;
  Chat: { conversationId: string; title: string };
  Contacts: undefined;
  GroupCreate: undefined;
};
