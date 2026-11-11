/**
 * Runtime environment configuration accessor.
 * Uses Expo's built-in EXPO_PUBLIC_ prefix support.
 * Normalizes `supabaseUrl` so accidentally pasting `/rest/v1/` or `/auth/v1/`
 * in `.env` never breaks Supabase Auth or PostgREST requests.
 */
function normalizeSupabaseUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/\/+(rest|auth|storage|functions)\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

export const Env = {
  supabaseUrl: normalizeSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''),
  supabaseAnonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
  posthogApiKey: (process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '').trim(),
  posthogHost: (
    process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
  )
    .trim()
    .replace(/\/+$/, ''),
} as const;

export function isSupabaseConfigured(): boolean {
  return (
    Boolean(Env.supabaseUrl) &&
    Boolean(Env.supabaseAnonKey) &&
    !Env.supabaseUrl.includes('your-project-id')
  );
}

export function isPostHogConfigured(): boolean {
  return (
    Boolean(Env.posthogApiKey) &&
    Env.posthogApiKey.startsWith('phc_')
  );
}

