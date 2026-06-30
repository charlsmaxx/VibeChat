import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '@/constants/theme';

interface Props {
  onSend: (text: string) => void;
  onAttach: () => void;
  onVoice: () => void;
  onTypingChange: (typing: boolean) => void;
  recording?: boolean;
}

export const MessageInput = ({ onSend, onAttach, onVoice, onTypingChange, recording = false }: Props) => {
  const [text, setText] = useState('');
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!recording) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, recording]);

  if (recording) {
    return (
      <View style={styles.container}>
        <View style={styles.recordingInfo}>
          <Animated.View style={[styles.recDot, { opacity: pulse }]} />
          <Text style={styles.recText}>Recording… tap mic to stop & send</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stop and send voice note"
          hitSlop={8}
          style={[styles.iconButton, styles.recStopBtn]}
          onPress={onVoice}
        >
          <Text style={styles.iconText}>■</Text>
        </Pressable>
      </View>
    );
  }

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
        multiline
        onChangeText={(value) => {
          setText(value);
          onTypingChange(value.trim().length > 0);
        }}
      />
      {text.trim().length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record voice note"
          hitSlop={8}
          style={styles.iconButton}
          onPress={onVoice}
        >
          <Text style={styles.iconText}>🎤</Text>
        </Pressable>
      ) : (
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
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: colors.surface, alignItems: 'flex-end' },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    color: '#0D1B3D',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 42,
    maxHeight: 120,
  },
  iconButton: {
    borderRadius: 20,
    paddingHorizontal: 10,
    height: 42,
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  iconText: { color: colors.text, fontWeight: '700', fontSize: 16 },
  button: { backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 14, height: 42, justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  recordingInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444' },
  recText: { color: colors.text, fontWeight: '600' },
  recStopBtn: { backgroundColor: '#EF4444' },
});
