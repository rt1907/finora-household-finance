import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import {
  identifyAnalyticsUser,
  resetAnalyticsUser,
  trackAnalyticsEvent,
} from '@/services/analytics/posthog';
import { getSupabaseClient } from '@/services/supabase/client';
import {
  createHouseholdWithOwner,
  fetchActiveHouseholdContext,
} from '@/features/transactions/services/transactionService';
import { ActiveHouseholdContext } from '@/features/transactions/types/transaction.types';

export interface AuthUserSession {
  userId: string;
  email: string;
}

/**
 * Ensures the authenticated user has a corresponding row in `public.profiles`.
 * Protects against foreign-key errors if an auth user was created before triggers
 * were installed or via external providers.
 */
export async function ensureUserProfileExists(
  userId: string,
  fullName?: string | null
): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (!existing) {
    await supabase.from('profiles').insert({
      id: userId,
      full_name: fullName?.trim() || null,
    });
  }
}

export async function getCurrentAuthUser(): Promise<AuthUserSession | null> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? '',
  };
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<AuthUserSession> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.user) {
    const rawMsg = error?.message ?? 'Invalid email or password.';
    if (rawMsg.toLowerCase().includes('invalid login credentials')) {
      throw new Error(
        'Incorrect email or password. New here? Tap the "Sign Up" tab above to create your account first.'
      );
    }
    if (rawMsg.toLowerCase().includes('email not confirmed')) {
      throw new Error(
        'Please confirm your email first (check your inbox/spam), or disable "Confirm email" in Supabase Dashboard → Authentication → Providers → Email.'
      );
    }
    throw new Error(rawMsg);
  }

  await ensureUserProfileExists(
    data.user.id,
    (data.user.user_metadata?.full_name as string | undefined) ?? null
  );

  identifyAnalyticsUser(data.user.id);
  trackAnalyticsEvent('auth_signed_in', { method: 'email_password' });

  return {
    userId: data.user.id,
    email: data.user.email ?? email.trim().toLowerCase(),
  };
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  fullName?: string
): Promise<{
  user: AuthUserSession | null;
  requiresEmailConfirmation: boolean;
}> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        full_name: fullName?.trim() || null,
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error('Sign up could not be completed.');
  }

  const requiresEmailConfirmation = !data.session;

  if (data.session) {
    await ensureUserProfileExists(data.user.id, fullName?.trim() || null);
  }

  identifyAnalyticsUser(data.user.id);
  trackAnalyticsEvent('auth_signed_up', {
    method: 'email_password',
    requires_email_confirmation: requiresEmailConfirmation,
  });

  return {
    user: {
      userId: data.user.id,
      email: data.user.email ?? email.trim().toLowerCase(),
    },
    requiresEmailConfirmation,
  };
}

export async function signInWithGoogleOAuth(): Promise<AuthUserSession | null> {
  const supabase = getSupabaseClient();

  // Dynamically resolve redirect URI:
  // - In standalone native builds: household-finance://auth
  // - In Expo Go: exp://<host>:8081/--/auth
  // - On web: current window origin
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'household-finance',
    path: 'auth',
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: Platform.OS !== 'web',
    },
  });

  if (error) {
    if (
      error.message.toLowerCase().includes('provider is not enabled') ||
      error.message.toLowerCase().includes('unsupported provider')
    ) {
      throw new Error(
        'Google Sign-In is not enabled in your Supabase project yet. In Supabase Dashboard → Authentication → Providers → Google, enable Google and paste your Google Client ID and Secret.'
      );
    }
    throw new Error(error.message);
  }

  if (Platform.OS === 'web') {
    return null;
  }

  if (!data?.url) {
    throw new Error('Unable to start Google Sign-In flow.');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

  if (result.type === 'success' && result.url) {
    // 1. Check for PKCE exchange code
    const parsedUrl = new URL(result.url);
    const code = parsedUrl.searchParams.get('code');

    if (code) {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (sessionError) {
        throw new Error(`Authentication failed: ${sessionError.message}`);
      }
      if (sessionData.user) {
        await ensureUserProfileExists(
          sessionData.user.id,
          (sessionData.user.user_metadata?.full_name as string | undefined) ?? null
        );
        identifyAnalyticsUser(sessionData.user.id);
        trackAnalyticsEvent('auth_signed_in', { method: 'google_oauth' });
        return {
          userId: sessionData.user.id,
          email: sessionData.user.email ?? '',
        };
      }
    }

    // 2. Fallback: Parse implicit tokens from URL hash or query params
    const hash = parsedUrl.hash ? parsedUrl.hash.replace(/^#/, '') : '';
    const hashParams = new URLSearchParams(hash);
    const accessToken =
      hashParams.get('access_token') ?? parsedUrl.searchParams.get('access_token');
    const refreshToken =
      hashParams.get('refresh_token') ?? parsedUrl.searchParams.get('refresh_token');

    if (accessToken && refreshToken) {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      if (sessionError) {
        throw new Error(`Authentication failed: ${sessionError.message}`);
      }
      if (sessionData.user) {
        await ensureUserProfileExists(
          sessionData.user.id,
          (sessionData.user.user_metadata?.full_name as string | undefined) ?? null
        );
        identifyAnalyticsUser(sessionData.user.id);
        trackAnalyticsEvent('auth_signed_in', { method: 'google_oauth' });
        return {
          userId: sessionData.user.id,
          email: sessionData.user.email ?? '',
        };
      }
    }
  }

  return null;
}

export async function signOutCurrentUser(): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
  trackAnalyticsEvent('auth_signed_out');
  resetAnalyticsUser();
}

/**
 * Permanently deletes the currently authenticated user account and any
 * single-member households they own via `public.delete_my_account()`.
 */
export async function deleteMyUserAccount(): Promise<void> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to delete your account.');
  }

  const { error: rpcError } = await supabase.rpc('delete_my_account');

  if (rpcError) {
    // Fallback if `20261110000000_add_delete_user_account_rpc.sql` has not yet been executed:
    // Delete owned households and memberships first, then sign out.
    if (
      rpcError.code === 'PGRST202' ||
      rpcError.message?.includes('delete_my_account')
    ) {
      await supabase.from('households').delete().eq('created_by', user.id);
      await supabase.from('household_members').delete().eq('user_id', user.id);
      await supabase.auth.signOut();
      resetAnalyticsUser();
      return;
    }
    throw new Error(rpcError.message || 'Failed to delete account.');
  }

  await supabase.auth.signOut({ scope: 'local' }).catch(() => {
    // Ignore sign-out network errors since the auth user was already deleted
  });
  trackAnalyticsEvent('auth_account_deleted');
  resetAnalyticsUser();
}

export { createHouseholdWithOwner, fetchActiveHouseholdContext };
export type { ActiveHouseholdContext };
