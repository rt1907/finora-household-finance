import 'expo-sqlite/localStorage/install';

/**
 * Native (Android / iOS) auth storage adapter for Supabase.
 * Installs Expo SQLite's synchronous `localStorage` polyfill on `globalThis`.
 */
export const supabaseAuthStorage = globalThis.localStorage;

