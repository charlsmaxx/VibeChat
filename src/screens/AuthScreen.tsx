import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { formatSupabaseWriteError } from '@/utils/supabaseErrors';
import { normalizeToE164 } from '@/utils/phone';

export const AuthScreen = () => {
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');

  const onSubmit = async () => {
    try {
      if (isSignUp) {
        if (!username.trim()) {
          Alert.alert('Username required', 'Please enter a username to create your account.');
          return;
        }
        if (phone.trim()) {
          const e164 = normalizeToE164(phone.trim());
          if (!e164) {
            Alert.alert('Invalid phone', 'Enter a valid number with country code, or leave phone empty for now.');
            return;
          }
        }
        const { needsEmailVerification } = await signUp(
          email.trim(),
          password,
          username.trim(),
          phone.trim() || undefined,
        );
        if (needsEmailVerification) {
          Alert.alert('Verify your email', 'Registration succeeded. Check your inbox and verify your email before signing in.');
        }
      } else {
        await signIn(email.trim(), password);
      }
    } catch (error) {
      Alert.alert('Authentication failed', formatSupabaseWriteError(error));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <View style={styles.form}>
          <Text style={styles.title}>VibeChat</Text>
          {isSignUp ? (
            <>
              <TextInput
                placeholder="Username"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                accessibilityLabel="Username"
              />
              <TextInput
                placeholder="Phone (optional, for finding friends)"
                placeholderTextColor={colors.muted}
                style={styles.input}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                accessibilityLabel="Phone number optional"
              />
            </>
          ) : null}
          <TextInput
            placeholder="Email"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            accessibilityLabel="Email address"
          />
          <TextInput
            placeholder="Password"
            placeholderTextColor={colors.muted}
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Password"
          />
          <Pressable accessibilityRole="button" accessibilityLabel={isSignUp ? 'Create account' : 'Sign in'} style={styles.button} onPress={onSubmit}>
            <Text style={styles.buttonText}>{isSignUp ? 'Create account' : 'Sign in'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={isSignUp ? 'Switch to sign in' : 'Switch to sign up'} onPress={() => setIsSignUp((v) => !v)}>
            <Text style={styles.link}>{isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  form: { flex: 1, justifyContent: 'center', padding: 20, gap: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  input: { backgroundColor: '#FFFFFF', color: '#0D1B3D', borderRadius: 10, paddingHorizontal: 12, height: 48 },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14 },
  buttonText: { textAlign: 'center', color: '#FFFFFF', fontWeight: '700' },
  link: { color: colors.muted, textAlign: 'center' },
});
