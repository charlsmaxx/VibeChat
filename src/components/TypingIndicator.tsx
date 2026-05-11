import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';

export const TypingIndicator = ({ visible }: { visible: boolean }) => {
  if (!visible) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>typing...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingBottom: 4 },
  text: { color: colors.muted, fontStyle: 'italic' },
});
