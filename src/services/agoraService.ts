import { createAgoraRtcEngine, IRtcEngine } from 'react-native-agora';
import { ENV } from '@/constants/env';

let engine: IRtcEngine | null = null;

export const agoraService = {
  get() {
    if (!engine) {
      engine = createAgoraRtcEngine();
      engine.initialize({ appId: ENV.agoraAppId });
    }
    return engine;
  },
  join(channel: string, uid: number, token?: string) {
    this.get().joinChannel(token ?? '', channel, uid, { clientRoleType: 1, channelProfile: 1 });
  },
  leave() {
    this.get().leaveChannel();
  },
  mute(muted: boolean) {
    this.get().muteLocalAudioStream(muted);
  },
  setCameraOff(cameraOff: boolean) {
    this.get().muteLocalVideoStream(cameraOff);
  },
};
