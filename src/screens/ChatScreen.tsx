import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Audio } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatBubble } from '@/components/ChatBubble';
import { MessageInput } from '@/components/MessageInput';
import { TypingIndicator } from '@/components/TypingIndicator';
import { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { colors } from '@/constants/theme';
import { supabase } from '@/services/supabase/client';
import { mediaService } from '@/services/mediaService';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export const ChatScreen = ({ route }: Props) => {
  const { conversationId } = route.params;
  const userId = useAuthStore((s) => s.session?.user.id);
  const messages = useChatStore((s) => s.byConversation[conversationId] ?? []);
  const loadInitial = useChatStore((s) => s.loadInitial);
  const loadMore = useChatStore((s) => s.loadMore);
  const send = useChatStore((s) => s.send);
  const markDelivered = useChatStore((s) => s.markDelivered);
  const markConversationRead = useChatStore((s) => s.markConversationRead);
  const onIncoming = useChatStore((s) => s.onIncoming);
  const onMessageUpdate = useChatStore((s) => s.onMessageUpdate);
  const [typingRemote, setTypingRemote] = useState(false);
  const [peerPresence, setPeerPresence] = useState<{ username: string; is_online: boolean; last_seen: string | null } | null>(null);
  const [pendingMediaUri, setPendingMediaUri] = useState<string | null>(null);
  const [pendingMediaType, setPendingMediaType] = useState<'image' | 'video'>('image');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const loadPeer = async () => {
      if (!userId) return;
      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', userId);
      const peerId = participants?.[0]?.user_id;
      if (!peerId) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, is_online, last_seen')
        .eq('id', peerId)
        .single();
      if (profile) setPeerPresence(profile as any);

      const profileChannel = supabase
        .channel(`profile:${peerId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${peerId}` },
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
  }, [conversationId, userId]);

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
  }, [conversationId, loadInitial, onIncoming, onMessageUpdate, userId]);

  useEffect(() => {
    if (!userId) return;
    markDelivered(conversationId, userId);
    markConversationRead(conversationId, userId);
  }, [conversationId, markConversationRead, markDelivered, messages, userId]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [messages],
  );

  const sendPayload = async (payload: { content: string | null; mediaUrl: string | null; type: 'text' | 'image' | 'video' | 'audio' }) => {
    if (!userId) return;
    await send(
      {
        local_id: `local-${Date.now()}`,
        conversation_id: conversationId,
        receiver_id: null,
        group_id: null,
        content: payload.content,
        media_url: payload.mediaUrl,
        type: payload.type,
        created_at: new Date().toISOString(),
      },
      userId,
    );
  };

  const toggleVoiceRecording = async () => {
    try {
      if (!recording) {
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) return;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await rec.startAsync();
        setRecording(rec);
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle}>{route.params.title}</Text>
          <Text style={styles.chatSubtitle}>
            {peerPresence?.is_online
              ? 'Online'
              : peerPresence?.last_seen
                ? `Last seen ${new Date(peerPresence.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Offline'}
          </Text>
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
            renderItem={({ item }) => <ChatBubble message={item} isOwn={item.sender_id === userId} />}
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
                  const mediaUrl = await mediaService.upload(pendingMediaUri, `${conversationId}/${Date.now()}-media`);
                  await sendPayload({ content: null, mediaUrl, type: pendingMediaType });
                  setPendingMediaUri(null);
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
          onTypingChange={(typing) => {
            typingChannelRef.current?.send({
              type: 'broadcast',
              event: 'typing',
              payload: { userId, typing },
            });
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  chatHeader: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, backgroundColor: colors.surface },
  chatTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  chatSubtitle: { color: colors.muted, marginTop: 2, fontSize: 12 },
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
