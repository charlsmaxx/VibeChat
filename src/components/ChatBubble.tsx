import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Message } from '@/types';

export const ChatBubble = memo(({ message, isOwn }: { message: Message; isOwn: boolean }) => {
  const value = message.content ?? (message.type === 'audio' ? '[Voice note]' : '[Media]');
  const tick = message.status === 'read' ? '✓✓' : message.status === 'delivered' ? '✓✓' : message.status === 'sent' ? '✓' : '⏳';
  return (
    <View style={[styles.row, isOwn ? styles.end : styles.start]}>
      <View style={[styles.bubble, isOwn ? styles.outgoing : styles.incoming]}>
        <Text style={styles.content}>{value}</Text>
        <View style={styles.meta}>
          <Text style={styles.time}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          {isOwn ? <Text style={[styles.time, message.status === 'read' ? styles.readTick : undefined]}>{tick}</Text> : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: 10, marginVertical: 4 },
  start: { alignItems: 'flex-start' },
  end: { alignItems: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: 12, padding: 10 },
  incoming: { backgroundColor: colors.incoming },
  outgoing: { backgroundColor: colors.outgoing },
  content: { color: colors.text },
  meta: { marginTop: 4, alignSelf: 'flex-end', flexDirection: 'row', gap: 4 },
  time: { color: colors.muted, fontSize: 11 },
  readTick: { color: colors.accent },
});
