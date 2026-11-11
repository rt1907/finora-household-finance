import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Env, isSupabaseConfigured } from '@/config/env';
import { supabaseAuthStorage } from '@/services/supabase/storage';
import { Database } from '@/types/database';

/**
 * Singleton typed Supabase client for React Native & Web (Expo SDK 58+).
 * Uses `storage.native.ts` (`expo-sqlite/localStorage/install`) on iOS/Android
 * and native browser `localStorage` (`storage.ts`) on Web.
 */
let supabaseInstance: SupabaseClient<Database> | null = null;
let appStateListenerRegistered = false;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
    );
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient<Database>(
      Env.supabaseUrl,
      Env.supabaseAnonKey,
      {
        auth: {
          storage: supabaseAuthStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
        },
      }
    );

    if (!appStateListenerRegistered) {
      appStateListenerRegistered = true;
      AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'active') {
          supabaseInstance?.auth.startAutoRefresh();
        } else {
          supabaseInstance?.auth.stopAutoRefresh();
        }
      });
    }
  }

  return supabaseInstance;
}

