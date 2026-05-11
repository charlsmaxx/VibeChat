import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/constants/theme';
import { MainTabParamList } from '@/navigation/types';
import { ConversationsScreen } from '@/screens/ConversationsScreen';
import { StatusScreen } from '@/screens/StatusScreen';
import { CommunitiesScreen } from '@/screens/CommunitiesScreen';
import { CallsScreen } from '@/screens/CallsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: '#2F4B8A' },
        tabBarIcon: ({ color, size }) => {
          const map: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
            Chats: 'chatbubbles',
            Status: 'albums-outline',
            Communities: 'people',
            Calls: 'call',
          };
          return <Ionicons name={map[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Chats" component={ConversationsScreen} options={{ title: 'Chats' }} />
      <Tab.Screen name="Status" component={StatusScreen} options={{ title: 'Updates' }} />
      <Tab.Screen name="Communities" component={CommunitiesScreen} options={{ title: 'Communities' }} />
      <Tab.Screen name="Calls" component={CallsScreen} options={{ title: 'Calls' }} />
    </Tab.Navigator>
  );
};
