import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

/**
 * Metro / Expo only inline `EXPO_PUBLIC_*` when referenced as static
 * `process.env.EXPO_PUBLIC_*` — dynamic `process.env[name]` stays empty in release.
 * Fall back to `expo.extra` populated at build time in app.config.js (EAS / local CLI).
 */
function readPublicEnv(staticMetro: string | undefined, extraKey: string): string {
  if (typeof staticMetro === 'string' && staticMetro.trim().length > 0) {
    return staticMetro.trim();
  }
  const raw = extra[extraKey];
  const s = raw != null ? String(raw).trim() : '';
  if (/^\$\{[A-Z0-9_]+\}$/i.test(s)) {
    return '';
  }
  return s;
}

export const ENV = {
  supabaseUrl: readPublicEnv(process.env.EXPO_PUBLIC_SUPABASE_URL, 'supabaseUrl'),
  supabaseAnonKey: readPublicEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, 'supabaseAnonKey'),
  agoraAppId: readPublicEnv(process.env.EXPO_PUBLIC_AGORA_APP_ID, 'agoraAppId'),
  usePhoneOtpAuth: readPublicEnv(process.env.EXPO_PUBLIC_USE_PHONE_OTP_AUTH, 'usePhoneOtpAuth') === 'true',
  easProjectId: readPublicEnv(process.env.EXPO_PUBLIC_EAS_PROJECT_ID, 'easProjectId'),
};

export const missingEnvKeys = [
  !ENV.supabaseUrl ? 'EXPO_PUBLIC_SUPABASE_URL' : null,
  !ENV.supabaseAnonKey ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY' : null,
  !ENV.agoraAppId ? 'EXPO_PUBLIC_AGORA_APP_ID' : null,
].filter(Boolean) as string[];

export const hasRequiredEnv = missingEnvKeys.length === 0;
