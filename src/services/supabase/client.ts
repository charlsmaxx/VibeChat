import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { ENV, hasRequiredEnv } from '@/constants/env';

// Avoid startup hard-crash in release builds when EXPO_PUBLIC_* vars are missing on EAS.
// AppRoot will show a setup screen if env is incomplete.
const supabaseUrl = hasRequiredEnv ? ENV.supabaseUrl : 'https://placeholder.supabase.co';
const supabaseAnonKey = hasRequiredEnv ? ENV.supabaseAnonKey : 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
