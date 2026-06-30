import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  type IRtcEngine,
  type IRtcEngineEventHandler,
  type RtcConnection,
} from 'react-native-agora';
import { ENV } from '@/constants/env';
import { agoraTokenService } from '@/services/agoraTokenService';

let engine: IRtcEngine | null = null;
let handlerRegistered = false;
let activeCallbacks: AgoraCallCallbacks = {};

export type AgoraCallCallbacks = {
  onJoinSuccess?: () => void;
  onRemoteJoin?: (uid: number) => void;
  onRemoteLeave?: (uid: number) => void;
  onError?: (message: string) => void;
};

function ensureEngine(): IRtcEngine {
  if (!ENV.agoraAppId) {
    throw new Error('EXPO_PUBLIC_AGORA_APP_ID is not configured.');
  }
  if (!engine) {
    engine = createAgoraRtcEngine();
    engine.initialize({ appId: ENV.agoraAppId });
    engine.enableAudio();
  }
  return engine;
}

function registerHandlers() {
  const rtc = ensureEngine();
  if (handlerRegistered) return;
  const handler: IRtcEngineEventHandler = {
    onJoinChannelSuccess: () => {
      activeCallbacks.onJoinSuccess?.();
    },
    onUserJoined: (_connection: RtcConnection, remoteUid: number) => {
      activeCallbacks.onRemoteJoin?.(remoteUid);
    },
    onUserOffline: (_connection: RtcConnection, remoteUid: number) => {
      activeCallbacks.onRemoteLeave?.(remoteUid);
    },
    onError: (err) => {
      activeCallbacks.onError?.(`Agora error ${err}`);
    },
  };
  rtc.registerEventHandler(handler);
  handlerRegistered = true;
}

export const agoraService = {
  async startCall(params: {
    channel: string;
    uid: number;
    video: boolean;
    isGroup: boolean;
    callbacks: AgoraCallCallbacks;
  }) {
    const rtc = ensureEngine();
    activeCallbacks = params.callbacks;
    registerHandlers();

    let token = '';
    try {
      const tokenResponse = await agoraTokenService.fetchRtcToken(params.channel, params.uid);
      token = tokenResponse.token;
    } catch (e) {
      const message = (e as Error).message;
      if (/AGORA_APP_CERTIFICATE|certificate/i.test(message)) {
        throw new Error(
          'Agora token server is not configured. Add AGORA_APP_CERTIFICATE to Supabase Edge Function secrets and deploy agora-token.',
        );
      }
      throw e;
    }

    rtc.setDefaultAudioRouteToSpeakerphone(true);

    if (params.video) {
      rtc.enableVideo();
      await rtc.startPreview();
    } else {
      rtc.disableVideo();
    }

    const channelProfile = params.isGroup
      ? ChannelProfileType.ChannelProfileCommunication
      : ChannelProfileType.ChannelProfileCommunication1v1;

    rtc.joinChannel(token, params.channel, params.uid, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      channelProfile,
      publishMicrophoneTrack: true,
      publishCameraTrack: params.video,
      autoSubscribeAudio: true,
      autoSubscribeVideo: params.video,
    });
  },

  mute(muted: boolean) {
    ensureEngine().muteLocalAudioStream(muted);
  },

  setCameraEnabled(enabled: boolean) {
    const rtc = ensureEngine();
    rtc.muteLocalVideoStream(!enabled);
    if (enabled) {
      rtc.enableVideo();
    }
  },

  switchCamera() {
    ensureEngine().switchCamera();
  },

  endCall() {
    if (!engine) return;
    try {
      engine.stopPreview();
      engine.leaveChannel();
      engine.disableVideo();
    } catch {
      // ignore teardown races
    }
  },

  getEngine() {
    return engine;
  },
};
