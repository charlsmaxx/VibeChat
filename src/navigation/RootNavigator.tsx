import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { MainTabNavigator } from '@/navigation/MainTabNavigator';
import { AuthScreen } from '@/screens/AuthScreen';
import { ChatScreen } from '@/screens/ChatScreen';
import { ContactsScreen } from '@/screens/ContactsScreen';
import { GroupCreateScreen } from '@/screens/GroupCreateScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { useAuthStore } from '@/store/authStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator = () => {
  const session = useAuthStore((s) => s.session);

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabNavigator} options={{ headerShown: false }} />
            <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params.title })} />
            <Stack.Screen name="Contacts" component={ContactsScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
            <Stack.Screen name="GroupCreate" component={GroupCreateScreen} options={{ title: 'New Group' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
