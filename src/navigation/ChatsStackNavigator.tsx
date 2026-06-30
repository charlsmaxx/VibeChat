import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '@/navigation/types';
import { ConversationsScreen } from '@/screens/ConversationsScreen';
import { ChatScreen } from '@/screens/ChatScreen';

const Stack = createNativeStackNavigator<ChatsStackParamList>();

export const ChatsStackNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Conversations" component={ConversationsScreen} />
    <Stack.Screen name="Chat" component={ChatScreen} />
  </Stack.Navigator>
);
