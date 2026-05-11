/**
 * Dynamic Expo config: dev-client plugin only for local/dev EAS builds — preview/production stay standard release binaries.
 * @param {{ config: import('@expo/config-types').ExpoConfig }} param0
 */
module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE ?? '';
  // EAS sets EAS_BUILD_PROFILE during cloud builds. Omit dev-client native bits from preview/production (fewer Gradle edge cases).
  const includeDevClient = !['preview', 'production'].includes(profile);

  const trim = (key) => {
    const v = process.env[key];
    return typeof v === 'string' ? v.trim() : '';
  };

  const easBlock = config.extra?.eas;
  const easProjectIdFromConfig =
    easBlock && typeof easBlock === 'object' && 'projectId' in easBlock
      ? String(easBlock.projectId).trim()
      : '';

  return {
    ...config,
    scheme: config.scheme ?? 'vibechat',
    newArchEnabled: true,
    android: {
      ...config.android,
      package: 'com.modulardevs.vibechat',
      permissions: [
        ...new Set([
          ...(config.android?.permissions ?? []),
          'android.permission.CAMERA',
          'android.permission.INTERNET',
          'android.permission.ACCESS_NETWORK_STATE',
        ]),
      ],
    },
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.modulardevs.vibechat',
      infoPlist: {
        NSCameraUsageDescription: 'VibeChat uses your camera for video calls.',
        NSMicrophoneUsageDescription: 'VibeChat uses your microphone for voice and video calls.',
        ...(config.ios?.infoPlist ?? {}),
      },
    },
    extra: {
      ...(config.extra ?? {}),
      supabaseUrl: trim('EXPO_PUBLIC_SUPABASE_URL'),
      supabaseAnonKey: trim('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
      agoraAppId: trim('EXPO_PUBLIC_AGORA_APP_ID'),
      usePhoneOtpAuth: trim('EXPO_PUBLIC_USE_PHONE_OTP_AUTH'),
      easProjectId: trim('EXPO_PUBLIC_EAS_PROJECT_ID') || easProjectIdFromConfig,
    },
    plugins: [
      ...(includeDevClient ? ['expo-dev-client'] : []),
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 24,
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            buildArchs: ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'],
            // Has caused Gradle failures on some RN/AGP combos; keep off for reliable EAS builds.
            enableBundleCompression: false,
          },
          ios: {
            deploymentTarget: '15.1',
          },
        },
      ],
      'expo-font',
      ...(config.plugins ?? []),
    ],
  };
};
