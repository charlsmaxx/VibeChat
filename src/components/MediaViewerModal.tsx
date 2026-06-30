import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ResizeMode, Video } from 'expo-av';
import { colors } from '@/constants/theme';

export type MediaViewerItem = {
  type: 'image' | 'video';
  uri: string;
};

type Props = {
  item: MediaViewerItem | null;
  onClose: () => void;
};

function ZoomableImage({ uri, width, height }: { uri: string; width: number; height: number }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), 4);
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.imageStage, { width, height }]}>
        <Animated.Image source={{ uri }} style={[styles.fullImage, animatedStyle]} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

export function MediaViewerModal({ item, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    if (!item) {
      videoRef.current?.stopAsync().catch(() => {});
      videoRef.current?.unloadAsync().catch(() => {});
    }
  }, [item]);

  const handleClose = () => {
    videoRef.current?.stopAsync().catch(() => {});
    videoRef.current?.unloadAsync().catch(() => {});
    onClose();
  };

  return (
    <Modal visible={Boolean(item)} transparent animationType="fade" onRequestClose={handleClose}>
      <SafeAreaView style={styles.backdrop}>
        <Pressable style={styles.closeBtn} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {item?.type === 'image' ? (
          <ZoomableImage uri={item.uri} width={width} height={height - 80} />
        ) : null}

        {item?.type === 'video' ? (
          <Video
            ref={videoRef}
            source={{ uri: item.uri }}
            style={{ width, height: height - 80 }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
          />
        ) : null}

        {item?.type === 'image' ? (
          <Text style={styles.hint}>Pinch to zoom · double-tap to toggle zoom</Text>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  imageStage: { justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '100%' },
  hint: { position: 'absolute', bottom: 24, color: colors.muted, fontSize: 12 },
});
