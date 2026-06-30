import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatBubble } from '@/components/ChatBubble';
import { MediaViewerModal, type MediaViewerItem } from '@/components/MediaViewerModal';
import { MessageInput } from '@/components/MessageInput';
import { TypingIndicator } from '@/components/TypingIndicator';
import { ChatsStackParamList } from '@/navigation/types';
import { navigationRef } from '@/navigation/navigationRef';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import type { Message } from '@/types';
import { colors } from '@/constants/theme';
import { supabase } from '@/services/supabase/client';
import { mediaService } from '@/services/mediaService';
import { callService, type CallType } from '@/services/callService';
import { ENV, hasRequiredEnv } from '@/constants/env';
import { isPeerOnline, formatLastSeen } from '@/utils/presence';
import type { ActiveCallRow } from '@/services/callService';

type Props = NativeStackScreenProps<ChatsStackParamList, 'Chat'>;

type ChatBodyProps = {
  conversationId: string;
  title: string;
  navigation: Props['navigation'];
};

type VoiceRecording = {
  stopAndUnloadAsync: () => Promise<void>;
  getURI: () => string | null;
};

/** Stable reference — `?? []` in a zustand selector creates a new array every render → infinite loop → crash. */
const EMPTY_MESSAGES: Message[] = [];

function ChatScreenBody({ conversationId, title, navigation }: ChatBodyProps) {
  const userId = useAuthStore((s) => s.session?.user.id);
  const messages = useChatStore((s) => s.byConversation[conversationId] ?? EMPTY_MESSAGES);
  const loadInitial = useChatStore((s) => s.loadInitial);
  const loadMore = useChatStore((s) => s.loadMore);
  const send = useChatStore((s) => s.send);
  const markDelivered = useChatStore((s) => s.markDelivered);
  const markConversationRead = useChatStore((s) => s.markConversationRead);
  const onIncoming = useChatStore((s) => s.onIncoming);
  const onMessageUpdate = useChatStore((s) => s.onMessageUpdate);
  const onMessageDelete = useChatStore((s) => s.onMessageDelete);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const [typingRemote, setTypingRemote] = useState(false);
  const [peerPresence, setPeerPresence] = useState<{ username: string; is_online: boolean; last_seen: string | null } | null>(null);
  const [pendingMediaUri, setPendingMediaUri] = useState<string | null>(null);
  const [pendingMediaType, setPendingMediaType] = useState<'image' | 'video'>('image');
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [viewerMedia, setViewerMedia] = useState<MediaViewerItem | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGroup, setIsGroup] = useState(false);
  const [peerUserId, setPeerUserId] = useState<string | null>(null);
  const [activeGroupCall, setActiveGroupCall] = useState<ActiveCallRow | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const startVoipCall = async (callType: CallType) => {
    if (!userId || !hasRequiredEnv || !ENV.agoraAppId) {
      Alert.alert('Calls unavailable', 'Agora is not configured for this build.');
      return;
    }
    try {
      if (isGroup) {
        const { callId, channel } = await callService.startGroupCall({
          callerId: userId,
          conversationId,
          callType,
        });
        navigationRef.navigate('Call', {
          callId,
          channel,
          callType,
          title,
          isGroup: true,
          conversationId,
          isOutgoing: true,
        });
        return;
      }
      if (!peerUserId) {
        Alert.alert('Cannot call', 'No other participant found in this chat.');
        return;
      }
      const { callId, channel } = await callService.startDirectCall({
        callerId: userId,
        calleeId: peerUserId,
        callType,
      });
      navigationRef.navigate('Call', {
        callId,
        channel,
        callType,
        title: title,
        isGroup: false,
        isOutgoing: true,
      });
    } catch (e) {
      Alert.alert('Could not start call', (e as Error).message);
    }
  };

  const joinGroupCall = () => {
    if (!activeGroupCall) return;
    navigationRef.navigate('Call', {
      callId: activeGroupCall.id,
      channel: activeGroupCall.channel,
      callType: activeGroupCall.call_type,
      title: title,
      isGroup: true,
      conversationId,
      isOutgoing: false,
    });
  };

  useEffect(() => {
    const loadMeta = async () => {
      if (!userId) return;
      const { data: conv } = await supabase.from('conversations').select('is_group').eq('id', conversationId).maybeSingle();
      setIsGroup(Boolean(conv?.is_group));

      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', userId);
      const peerId = participants?.[0]?.user_id ?? null;
      setPeerUserId(peerId);

      if (conv?.is_group) {
        const active = await callService.getActiveGroupCall(conversationId);
        setActiveGroupCall(active);
      } else if (peerId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, is_online, last_seen')
          .eq('id', peerId)
          .single();
        if (profile) setPeerPresence(profile as { username: string; is_online: boolean; last_seen: string | null });
      }
    };
    loadMeta();
  }, [conversationId, userId]);

  useEffect(() => {
    if (!isGroup || !userId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const active = await callService.getActiveGroupCall(conversationId);
        if (!cancelled) setActiveGroupCall(active);
      } catch {
        if (!cancelled) setActiveGroupCall(null);
      }
    };
    refresh();
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch = supabase
        .channel(`group-call:${conversationId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'calls', filter: `conversation_id=eq.${conversationId}` },
          () => refresh(),
        )
        .subscribe();
    } catch {
      // calls table may lack conversation_id on older DBs — ignore
    }
    return () => {
      cancelled = true;
      ch?.unsubscribe();
    };
  }, [conversationId, isGroup, userId]);

  useEffect(() => {
    const loadPeer = async () => {
      if (!userId || isGroup || !peerUserId) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, is_online, last_seen')
        .eq('id', peerUserId)
        .single();
      if (profile) setPeerPresence(profile as { username: string; is_online: boolean; last_seen: string | null });

      const profileChannel = supabase
        .channel(`profile:${peerUserId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${peerUserId}` },
          (payload) => {
            setPeerPresence(payload.new as any);
          },
        )
        .subscribe();

      return () => {
        profileChannel.unsubscribe();
      };
    };

    const cleanupPromise = loadPeer();
    return () => {
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [conversationId, isGroup, peerUserId, userId]);

  useEffect(() => {
    const initialize = async () => {
      try {
        setLoadingInitial(true);
        setLoadError(null);
        await loadInitial(conversationId);
      } catch (error) {
        setLoadError((error as Error).message);
      } finally {
        setLoadingInitial(false);
      }
    };
    initialize();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => onIncoming(payload.new as any),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => onMessageUpdate(payload.new as any),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const removed = payload.old as { id?: string };
          if (removed?.id) onMessageDelete(conversationId, removed.id);
        },
      )
      .subscribe();

    const typingChannel = supabase.channel(`typing:${conversationId}`);
    typingChannel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== userId) setTypingRemote(Boolean(payload.typing));
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    return () => {
      channel.unsubscribe();
      typingChannel.unsubscribe();
      typingChannelRef.current = null;
    };
  }, [conversationId, loadInitial, onIncoming, onMessageUpdate, onMessageDelete, userId]);

  const confirmDeleteMessage = useCallback(
    (message: Message) => {
      if (!userId || message.sender_id !== userId) return;
      Alert.alert('Delete message', 'Delete this message for everyone?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMessage(conversationId, message.id, userId).catch((e) =>
              Alert.alert('Could not delete', (e as Error).message),
            );
          },
        },
      ]);
    },
    [conversationId, deleteMessage, userId],
  );

  const syncReadReceipts = useCallback(() => {
    if (!userId) return;
    markDelivered(conversationId, userId).catch(() => {});
    markConversationRead(conversationId, userId).catch(() => {});
  }, [conversationId, markConversationRead, markDelivered, userId]);

  useFocusEffect(
    useCallback(() => {
      syncReadReceipts();
    }, [syncReadReceipts]),
  );

  useEffect(() => {
    if (!userId || messages.length === 0) return;
    syncReadReceipts();
  }, [messages.length, syncReadReceipts, userId]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [messages],
  );

  const sendPayload = async (payload: { content: string | null; mediaUrl: string | null; type: 'text' | 'image' | 'video' | 'audio' }) => {
    if (!userId) return;
    try {
      await send(
        {
          local_id: `local-${Date.now()}`,
          conversation_id: conversationId,
          receiver_id: isGroup ? null : peerUserId,
          group_id: isGroup ? conversationId : null,
          content: payload.content,
          media_url: payload.mediaUrl,
          type: payload.type,
          created_at: new Date().toISOString(),
        },
        userId,
      );
    } catch (e) {
      Alert.alert('Message not sent', (e as Error).message);
    }
  };

  const toggleVoiceRecording = async () => {
    try {
      if (!recording) {
        const { Audio } = await import('expo-av');
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) return;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await rec.startAsync();
        setRecording(rec as unknown as VoiceRecording);
        return;
      }

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) return;
      const mediaUrl = await mediaService.upload(uri, `${conversationId}/${Date.now()}-voice.m4a`);
      await sendPayload({ content: null, mediaUrl, type: 'audio' });
    } catch (e) {
      Alert.alert('Voice note error', (e as Error).message);
      setRecording(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.chatHeader}>
          <View style={styles.chatHeaderTop}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
              <Text style={styles.backText}>‹</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.chatTitle}>{title}</Text>
              <Text style={styles.chatSubtitle}>
                {isGroup
                  ? 'Group chat'
                  : isPeerOnline(peerPresence?.is_online, peerPresence?.last_seen)
                    ? 'Online'
                    : formatLastSeen(peerPresence?.last_seen)}
              </Text>
            </View>
            <View style={styles.callActions}>
              <Pressable
                style={styles.callIconBtn}
                accessibilityLabel="Voice call"
                onPress={() => startVoipCall('audio')}
              >
                <Text style={styles.callIcon}>📞</Text>
              </Pressable>
              <Pressable
                style={styles.callIconBtn}
                accessibilityLabel="Video call"
                onPress={() => startVoipCall('video')}
              >
                <Text style={styles.callIcon}>📹</Text>
              </Pressable>
            </View>
          </View>
          {isGroup && activeGroupCall ? (
            <Pressable style={styles.groupCallBanner} onPress={joinGroupCall} accessibilityRole="button">
              <Text style={styles.groupCallText}>
                {activeGroupCall.caller_id === userId ? 'Rejoin your ' : 'Join '}
                {activeGroupCall.call_type === 'video' ? 'video' : 'voice'} group call
              </Text>
            </Pressable>
          ) : null}
        </View>
        {loadError ? (
          <View style={styles.stateWrap}>
            <Text style={styles.stateText}>Failed to load messages: {loadError}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading messages"
              style={styles.retryBtn}
              onPress={() => loadInitial(conversationId)}
            >
              <Text style={styles.previewText}>Retry</Text>
            </Pressable>
          </View>
        ) : loadingInitial ? (
          <View style={styles.stateWrap}>
            <Text style={styles.stateText}>Loading messages...</Text>
          </View>
        ) : (
          <FlatList
            data={sortedMessages}
            keyExtractor={(item) => item.id}
            onEndReached={() => loadMore(conversationId)}
            onEndReachedThreshold={0.2}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <ChatBubble
                message={item}
                isOwn={item.sender_id === userId}
                onLongPress={confirmDeleteMessage}
                onOpenMedia={setViewerMedia}
              />
            )}
          />
        )}
        <TypingIndicator visible={typingRemote} />
        {pendingMediaUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: pendingMediaUri }} style={styles.previewImage} />
            <View style={styles.previewActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel media preview"
                style={styles.cancelBtn}
                onPress={() => setPendingMediaUri(null)}
              >
                <Text style={styles.previewText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send selected media"
                style={styles.sendBtn}
                onPress={async () => {
                  try {
                    const rawExt = pendingMediaUri.split('?')[0].split('.').pop()?.toLowerCase();
                    const ext = rawExt && rawExt.length >= 2 && rawExt.length <= 4 ? rawExt : pendingMediaType === 'video' ? 'mp4' : 'jpg';
                    const mediaUrl = await mediaService.upload(pendingMediaUri, `${conversationId}/${Date.now()}-media.${ext}`);
                    await sendPayload({ content: null, mediaUrl, type: pendingMediaType });
                    setPendingMediaUri(null);
                  } catch (e) {
                    Alert.alert('Upload failed', (e as Error).message);
                  }
                }}
              >
                <Text style={styles.previewText}>Send media</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <MessageInput
          onSend={(text) => sendPayload({ content: text, mediaUrl: null, type: 'text' })}
          onAttach={async () => {
            const asset = await mediaService.pick();
            if (!asset) return;
            setPendingMediaUri(asset.uri);
            setPendingMediaType(asset.type === 'video' ? 'video' : 'image');
          }}
          onVoice={toggleVoiceRecording}
          recording={Boolean(recording)}
          onTypingChange={(typing) => {
            typingChannelRef.current?.send({
              type: 'broadcast',
              event: 'typing',
              payload: { userId, typing },
            });
          }}
        />
      </KeyboardAvoidingView>
      <MediaViewerModal item={viewerMedia} onClose={() => setViewerMedia(null)} />
    </SafeAreaView>
  );
}

export const ChatScreen = ({ route, navigation }: Props) => {
  const conversationId = route.params?.conversationId?.trim() ?? '';
  const title = route.params?.title?.trim() || 'Chat';

  if (!conversationId) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>This chat link is invalid.</Text>
          <Pressable style={styles.retryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.previewText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary label="ChatScreen">
      <ChatScreenBody
        key={conversationId}
        conversationId={conversationId}
        title={title}
        navigation={navigation}
      />
    </ScreenErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  chatHeader: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, backgroundColor: colors.surface },
  chatHeaderTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.accent, fontSize: 28, fontWeight: '600', lineHeight: 32 },
  chatTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  chatSubtitle: { color: colors.muted, marginTop: 2, fontSize: 12 },
  callActions: { flexDirection: 'row', gap: 6 },
  callIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callIcon: { fontSize: 18 },
  groupCallBanner: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  groupCallText: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center' },
  previewWrap: { padding: 10, backgroundColor: colors.card },
  previewImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 8 },
  previewActions: { flexDirection: 'row', gap: 10 },
  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  stateText: { color: colors.muted, textAlign: 'center', marginBottom: 10 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.accent },
  cancelBtn: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#304579' },
  sendBtn: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: colors.accent },
  previewText: { color: colors.text, textAlign: 'center', fontWeight: '600' },
});
