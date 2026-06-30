import React, { memo } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import { colors } from '@/constants/theme';
import { Message } from '@/types';
import type { MediaViewerItem } from '@/components/MediaViewerModal';

type Props = {
  message: Message;
  isOwn: boolean;
  onLongPress?: (message: Message) => void;
  onOpenMedia?: (item: MediaViewerItem) => void;
};

function AudioMessage({ uri, tint }: { uri: string; tint: string }) {
  const [playing, setPlaying] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const soundRef = React.useRef<import('expo-av').Audio.Sound | null>(null);

  React.useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  const toggle = async () => {
    try {
      const { Audio } = await import('expo-av');
      if (soundRef.current) {
        if (playing) {
          await soundRef.current.pauseAsync();
          setPlaying(false);
        } else {
          await soundRef.current.playAsync();
          setPlaying(true);
        }
        return;
      }
      setLoading(true);
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      soundRef.current = sound;
      setPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlaying(false);
          sound.setPositionAsync(0).catch(() => {});
        }
      });
    } catch {
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable style={styles.audioRow} onPress={toggle} accessibilityRole="button" accessibilityLabel="Play voice note">
      {loading ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Text style={[styles.audioIcon, { color: tint }]}>{playing ? '⏸' : '▶'}</Text>
      )}
      <View style={styles.audioBar}>
        <View style={[styles.audioBarFill, { backgroundColor: tint }]} />
      </View>
      <Text style={[styles.audioLabel, { color: tint }]}>Voice note</Text>
    </Pressable>
  );
}

function ImagePreview({ uri, onPress }: { uri: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View full size image"
      style={styles.mediaPressable}
    >
      <Image source={{ uri }} style={styles.media} resizeMode="cover" />
    </Pressable>
  );
}

function VideoPreview({ uri, onPress }: { uri: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Play video full screen"
      style={styles.mediaPressable}
    >
      <Video
        source={{ uri }}
        style={styles.media}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isMuted
        useNativeControls={false}
      />
      <View style={styles.playOverlay}>
        <Text style={styles.playIcon}>▶</Text>
      </View>
    </Pressable>
  );
}

export const ChatBubble = memo(({ message, isOwn, onLongPress, onOpenMedia }: Props) => {
  const tick =
    message.status === 'read'
      ? '✓✓'
      : message.status === 'delivered'
        ? '✓✓'
        : message.status === 'sent'
          ? '✓'
          : message.status === 'failed'
            ? '!'
            : '⏳';

  const timeLabel = (() => {
    try {
      const d = new Date(message.created_at);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  })();

  const tint = isOwn ? '#FFFFFF' : colors.text;

  const openMedia = (type: 'image' | 'video', uri: string) => {
    onOpenMedia?.({ type, uri });
  };

  const renderBody = () => {
    if (message.type === 'image' && message.media_url) {
      return <ImagePreview uri={message.media_url} onPress={() => openMedia('image', message.media_url!)} />;
    }
    if (message.type === 'video' && message.media_url) {
      return <VideoPreview uri={message.media_url} onPress={() => openMedia('video', message.media_url!)} />;
    }
    if (message.type === 'audio' && message.media_url) {
      return <AudioMessage uri={message.media_url} tint={tint} />;
    }
    if (message.content) {
      return <Text style={styles.content}>{message.content}</Text>;
    }
    return <Text style={styles.content}>{message.type === 'audio' ? 'Voice note' : 'Media'}</Text>;
  };

  return (
    <Pressable
      onLongPress={() => onLongPress?.(message)}
      delayLongPress={350}
      style={[styles.row, isOwn ? styles.end : styles.start]}
    >
      <View style={[styles.bubble, isOwn ? styles.outgoing : styles.incoming]}>
        {renderBody()}
        <View style={styles.meta}>
          <Text style={styles.time}>{timeLabel}</Text>
          {isOwn ? (
            <Text style={[styles.time, message.status === 'read' ? styles.readTick : undefined]}>{tick}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
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
  mediaPressable: { position: 'relative' },
  media: { width: 220, height: 220, borderRadius: 10, backgroundColor: '#000000' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
  },
  playIcon: { color: '#FFFFFF', fontSize: 36, fontWeight: '700' },
  meta: { marginTop: 4, alignSelf: 'flex-end', flexDirection: 'row', gap: 4 },
  time: { color: colors.muted, fontSize: 11 },
  readTick: { color: colors.accent },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160 },
  audioIcon: { fontSize: 18, width: 20, textAlign: 'center' },
  audioBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  audioBarFill: { width: '40%', height: '100%' },
  audioLabel: { fontSize: 12 },
});
