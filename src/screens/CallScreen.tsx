import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RtcSurfaceView } from 'react-native-agora';
import { colors } from '@/constants/theme';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { useCallStore } from '@/store/callStore';
import { agoraService } from '@/services/agoraService';
import { callService } from '@/services/callService';
import { agoraUidFromUserId } from '@/utils/agoraUid';
import { ensureCallPermissions } from '@/utils/callPermissions';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

export const CallScreen = ({ navigation, route }: Props) => {
  const { callId, channel, callType, title, isGroup, isOutgoing } = route.params;
  const userId = useAuthStore((s) => s.session?.user.id);
  const localUid = userId ? agoraUidFromUserId(userId) : 0;
  const muted = useCallStore((s) => s.muted);
  const cameraOff = useCallStore((s) => s.cameraOff);
  const remoteUids = useCallStore((s) => s.remoteUids);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const toggleCamera = useCallStore((s) => s.toggleCamera);
  const addRemoteUid = useCallStore((s) => s.addRemoteUid);
  const removeRemoteUid = useCallStore((s) => s.removeRemoteUid);
  const resetSession = useCallStore((s) => s.resetSession);
  const setActiveChannel = useCallStore((s) => s.setActiveChannel);

  const [joining, setJoining] = useState(true);
  const [connected, setConnected] = useState(false);
  const video = callType === 'video';

  const hangUp = useCallback(async () => {
    try {
      agoraService.endCall();
      await callService.updateCallStatus(callId, 'ended');
    } catch {
      // best effort
    }
    resetSession();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs');
  }, [callId, navigation, resetSession]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const run = async () => {
      try {
        await ensureCallPermissions(video);
        setActiveChannel(channel);

        if (isOutgoing && !isGroup) {
          await callService.updateCallStatus(callId, 'active');
        } else if (!isOutgoing && !isGroup) {
          await callService.updateCallStatus(callId, 'active');
        }

        await agoraService.startCall({
          channel,
          uid: localUid,
          video,
          isGroup,
          callbacks: {
            onJoinSuccess: () => {
              if (!cancelled) {
                setJoining(false);
                setConnected(true);
              }
            },
            onRemoteJoin: (uid) => {
              if (!cancelled) addRemoteUid(uid);
            },
            onRemoteLeave: (uid) => {
              if (!cancelled) removeRemoteUid(uid);
            },
            onError: (message) => {
              if (!cancelled) Alert.alert('Call error', message);
            },
          },
        });
      } catch (e) {
        if (!cancelled) {
          Alert.alert('Could not join call', (e as Error).message, [
            {
              text: 'OK',
              onPress: () => {
                agoraService.endCall();
                resetSession();
                if (navigation.canGoBack()) navigation.goBack();
              },
            },
          ]);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      agoraService.endCall();
      resetSession();
    };
  }, [addRemoteUid, channel, isGroup, isOutgoing, localUid, navigation, removeRemoteUid, resetSession, setActiveChannel, userId, video, callId]);

  useEffect(() => {
    agoraService.mute(muted);
  }, [muted]);

  useEffect(() => {
    if (video) agoraService.setCameraEnabled(!cameraOff);
  }, [cameraOff, video]);

  const statusText = joining
    ? 'Connecting…'
    : remoteUids.length > 0
      ? isGroup
        ? `${remoteUids.length + 1} in call`
        : 'Connected'
      : isOutgoing
        ? 'Ringing…'
        : 'Waiting for others…';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topBar}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {video ? 'Video' : 'Voice'}
          {isGroup ? ' · Group' : ''} · {statusText}
        </Text>
      </View>

      <View style={styles.stage}>
        {video ? (
          <>
            {remoteUids.length > 0 ? (
              remoteUids.map((uid) => (
                <RtcSurfaceView
                  key={uid}
                  style={styles.remoteVideo}
                  canvas={{ uid, sourceType: 0 }}
                />
              ))
            ) : (
              <View style={styles.waiting}>
                {joining ? <ActivityIndicator color={colors.accent} size="large" /> : null}
                <Text style={styles.waitingText}>{statusText}</Text>
              </View>
            )}
            {!cameraOff ? (
              <RtcSurfaceView style={styles.localVideo} canvas={{ uid: localUid, sourceType: 0 }} zOrderOnTop />
            ) : (
              <View style={styles.localVideoOff}>
                <Text style={styles.localOffText}>Camera off</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.voiceStage}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLetter}>{title.slice(0, 1).toUpperCase()}</Text>
            </View>
            {joining ? <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} /> : null}
            <Text style={styles.voiceStatus}>{statusText}</Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.controlBtn, muted && styles.controlBtnActive]}
          onPress={toggleMute}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Unmute' : 'Mute'}
        >
          <Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
        </Pressable>
        {video ? (
          <>
            <Pressable
              style={[styles.controlBtn, cameraOff && styles.controlBtnActive]}
              onPress={toggleCamera}
              accessibilityRole="button"
              accessibilityLabel={cameraOff ? 'Turn camera on' : 'Turn camera off'}
            >
              <Text style={styles.controlLabel}>{cameraOff ? 'Cam on' : 'Cam off'}</Text>
            </Pressable>
            <Pressable style={styles.controlBtn} onPress={() => agoraService.switchCamera()} accessibilityRole="button">
              <Text style={styles.controlLabel}>Flip</Text>
            </Pressable>
          </>
        ) : null}
        <Pressable style={styles.endBtn} onPress={hangUp} accessibilityRole="button" accessibilityLabel="End call">
          <Text style={styles.endLabel}>End</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A1628' },
  topBar: { paddingHorizontal: 20, paddingTop: 8, alignItems: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  subtitle: { color: colors.muted, marginTop: 4, fontSize: 14 },
  stage: { flex: 1, margin: 12, borderRadius: 16, overflow: 'hidden', backgroundColor: '#152238' },
  remoteVideo: { flex: 1, width: '100%' },
  localVideo: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 108,
    height: 152,
    borderRadius: 10,
    overflow: 'hidden',
  },
  localVideoOff: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 108,
    height: 152,
    borderRadius: 10,
    backgroundColor: '#2B4279',
    alignItems: 'center',
    justifyContent: 'center',
  },
  localOffText: { color: colors.muted, fontSize: 12 },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  waitingText: { color: colors.muted },
  voiceStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2B4279',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: colors.text, fontSize: 48, fontWeight: '700' },
  voiceStatus: { color: colors.muted, marginTop: 16, fontSize: 16 },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  controlBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#2B4279',
    minWidth: 72,
    alignItems: 'center',
  },
  controlBtnActive: { backgroundColor: colors.accent },
  controlLabel: { color: colors.text, fontWeight: '600', fontSize: 13 },
  endBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#DC2626',
    minWidth: 88,
    alignItems: 'center',
  },
  endLabel: { color: '#FFFFFF', fontWeight: '700' },
});
