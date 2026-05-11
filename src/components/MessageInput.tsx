import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '@/constants/theme';

interface Props {
  onSend: (text: string) => void;
  onAttach: () => void;
  onVoice: () => void;
  onTypingChange: (typing: boolean) => void;
}

export const MessageInput = ({ onSend, onAttach, onVoice, onTypingChange }: Props) => {
  const [text, setText] = useState('');

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Attach media"
        hitSlop={8}
        style={styles.iconButton}
        onPress={onAttach}
      >
        <Text style={styles.iconText}>+</Text>
      </Pressable>
      <TextInput
        style={styles.input}
        placeholder="Message"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Message input"
        value={text}
        onChangeText={(value) => {
          setText(value);
          onTypingChange(value.trim().length > 0);
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Record voice note"
        hitSlop={8}
        style={styles.iconButton}
        onPress={onVoice}
      >
        <Text style={styles.iconText}>Mic</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        hitSlop={8}
        style={styles.button}
        onPress={() => {
          const value = text.trim();
          if (!value) return;
          onSend(value);
          setText('');
          onTypingChange(false);
        }}
      >
        <Text style={styles.buttonText}>Send</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: colors.surface },
  input: { flex: 1, backgroundColor: '#FFFFFF', color: '#0D1B3D', borderRadius: 20, paddingHorizontal: 14, height: 42 },
  iconButton: { borderRadius: 20, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: colors.card },
  iconText: { color: colors.text, fontWeight: '700' },
  button: { backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 14, justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
