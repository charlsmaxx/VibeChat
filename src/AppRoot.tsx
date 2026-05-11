import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AppState, StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { supabase } from '@/services/supabase/client';
import { authService } from '@/services/authService';
import { notificationService } from '@/services/notificationService';
import { colors } from '@/constants/theme';
import { hasRequiredEnv, missingEnvKeys } from '@/constants/env';

export const AppRoot = () => {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const userId = useAuthStore((s) => s.session?.user.id);
  const flushOutbox = useChatStore((s) => s.flushOutbox);

  useEffect(() => {
    bootstrap();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        authService.ensureProfile(session.user).catch((error) => {
          console.warn('Unable to ensure profile on auth state change', error);
        });
      }
      useAuthStore.setState({ session, loading: false });
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [bootstrap]);

  useEffect(() => {
    if (!userId) return;
    notificationService.register(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const setPresence = async (isOnline: boolean) => {
      await supabase
        .from('profiles')
        .update({ is_online: isOnline, last_seen: new Date().toISOString() })
        .eq('id', userId);
    };

    setPresence(true);
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') setPresence(true);
      else setPresence(false);
    });

    const netSub = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        flushOutbox(userId);
      }
    });

    flushOutbox(userId);

    return () => {
      appStateSub.remove();
      netSub();
      setPresence(false);
    };
  }, [flushOutbox, userId]);

  if (!hasRequiredEnv) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Configuration required</Text>
          <Text style={styles.errorText}>
            This build is missing required EXPO_PUBLIC environment values. Set these in EAS project environment:
          </Text>
          <Text style={styles.errorKeys}>{missingEnvKeys.join('\n')}</Text>
        </View>
        <StatusBar style="light" />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootNavigator />
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 20,
    justifyContent: 'center',
    gap: 10,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  errorText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  errorKeys: {
    color: colors.accent,
    fontWeight: '700',
  },
});
