import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';

type Props = {
  uri?: string | null;
  label: string;
  size?: number;
};

export const AvatarThumb = ({ uri, label, size = 40 }: Props) => {
  const s = size;
  const letter = (label?.trim()?.slice(0, 1) || '?').toUpperCase();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, { width: s, height: s, borderRadius: s / 2 }]}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[styles.fallback, { width: s, height: s, borderRadius: s / 2 }]}>
      <Text style={[styles.letter, { fontSize: Math.max(12, s * 0.42) }]}>{letter}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: { backgroundColor: '#2B4279' },
  fallback: {
    backgroundColor: '#2B4279',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: { color: colors.text, fontWeight: '700' },
});
