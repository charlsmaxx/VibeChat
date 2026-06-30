import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { PermissionsAndroid, Platform } from 'react-native';

export async function ensureCallPermissions(video: boolean): Promise<void> {
  if (Platform.OS === 'android') {
    const toRequest: (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS][] = [
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ];
    if (video) toRequest.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    const result = await PermissionsAndroid.requestMultiple(toRequest);
    const mic = result[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (mic === PermissionsAndroid.RESULTS.DENIED || mic === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      throw new Error('Microphone permission is required for calls.');
    }
    if (video) {
      const cam = result[PermissionsAndroid.PERMISSIONS.CAMERA];
      if (cam === PermissionsAndroid.RESULTS.DENIED || cam === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        throw new Error('Camera permission is required for video calls.');
      }
    }
    return;
  }

  const mic = await Audio.requestPermissionsAsync();
  if (!mic.granted) throw new Error('Microphone permission is required for calls.');
  if (video) {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) throw new Error('Camera permission is required for video calls.');
  }
}
