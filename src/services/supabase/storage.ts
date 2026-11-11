/**
 * Web / default auth storage adapter for Supabase.
 * Uses the browser's built-in `localStorage` without pulling in `expo-sqlite` WebAssembly workers.
 */
export const supabaseAuthStorage =
  typeof globalThis !== 'undefined' && 'localStorage' in globalThis
    ? globalThis.localStorage
    : undefined;

