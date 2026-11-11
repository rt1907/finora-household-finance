import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured } from '@/config/env';
import {
  ActiveHouseholdContext,
  AuthUserSession,
  createHouseholdWithOwner,
  deleteMyUserAccount,
  fetchActiveHouseholdContext,
  getCurrentAuthUser,
  signInWithEmailPassword,
  signInWithGoogleOAuth,
  signOutCurrentUser,
  signUpWithEmailPassword,
} from '@/features/auth/services/authService';
import { getSupabaseClient } from '@/services/supabase/client';
import { acceptHouseholdInvitation } from '@/features/household/services/householdService';
import { notifyTransactionSaved } from '@/features/transactions/services/transactionService';

export type AuthMode = 'signin' | 'signup';

const MISSING_BACKEND_CONFIG_MSG =
  'Backend configuration is missing in this build. Please configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.';

export function useAuthHouseholdViewModel(
  onCompleteNavigateBack: () => void,
  initialInviteToken: string = ''
) {
  const backendReady = isSupabaseConfigured();

  const [loadingInitial, setLoadingInitial] = useState<boolean>(backendReady);
  const [authUser, setAuthUser] = useState<AuthUserSession | null>(null);
  const [householdContext, setHouseholdContext] =
    useState<ActiveHouseholdContext | null>(null);

  // Auth form state
  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  // Create or Join Household form state
  const [householdName, setHouseholdName] = useState<string>('');
  const [baseCurrency, setBaseCurrency] = useState<string>('INR');
  const [inviteTokenInput, setInviteTokenInput] =
    useState<string>(initialInviteToken);

  // Status
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    backendReady ? null : MISSING_BACKEND_CONFIG_MSG
  );
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setAuthUser(null);
      setHouseholdContext(null);
      setErrorMessage(MISSING_BACKEND_CONFIG_MSG);
      setLoadingInitial(false);
      return;
    }

    setLoadingInitial(true);
    setErrorMessage(null);
    try {
      const user = await getCurrentAuthUser();
      setAuthUser(user);
      if (user) {
        const ctx = await fetchActiveHouseholdContext();
        setHouseholdContext(ctx);
      } else {
        setHouseholdContext(null);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to check session status.'
      );
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    async function init() {
      try {
        const user = await getCurrentAuthUser();
        if (!active) return;
        setAuthUser(user);
        if (user) {
          const ctx = await fetchActiveHouseholdContext();
          if (active) setHouseholdContext(ctx);
        }
        if (!active) return;

        const supabase = getSupabaseClient();
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
          if (!active) return;
          if (session?.user) {
            setAuthUser({
              userId: session.user.id,
              email: session.user.email ?? '',
            });
            try {
              const ctx = await fetchActiveHouseholdContext();
              if (active) setHouseholdContext(ctx);
            } catch {
              // Handled elsewhere
            }
          } else {
            setAuthUser(null);
            setHouseholdContext(null);
          }
        });
        if (!active) {
          subscription.unsubscribe();
          return;
        }
        unsubscribe = () => subscription.unsubscribe();
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Unable to load session.'
          );
        }
      } finally {
        if (active) setLoadingInitial(false);
      }
    }
    void init();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const handleAuthSubmit = useCallback(async () => {
    setErrorMessage(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const user = await signInWithEmailPassword(trimmedEmail, password);
        setAuthUser(user);
        const ctx = await fetchActiveHouseholdContext();
        setHouseholdContext(ctx);
        notifyTransactionSaved();
        if (ctx) {
          onCompleteNavigateBack();
        }
      } else {
        const result = await signUpWithEmailPassword(
          trimmedEmail,
          password,
          fullName
        );
        if (result.requiresEmailConfirmation) {
          setInfoMessage(
            'Account created! Please check your email inbox to confirm your email, then sign in.'
          );
          setMode('signin');
        } else if (result.user) {
          setAuthUser(result.user);
          const ctx = await fetchActiveHouseholdContext();
          setHouseholdContext(ctx);
          notifyTransactionSaved();
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Authentication failed.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [email, fullName, mode, onCompleteNavigateBack, password]);

  const handleCreateHousehold = useCallback(async () => {
    setErrorMessage(null);
    setInfoMessage(null);

    const trimmedName = householdName.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter a household name (e.g., Home, Our Family).');
      return;
    }

    setSubmitting(true);
    try {
      await createHouseholdWithOwner(trimmedName, baseCurrency);
      const ctx = await fetchActiveHouseholdContext();
      setHouseholdContext(ctx);
      notifyTransactionSaved();
      onCompleteNavigateBack();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to create household.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [baseCurrency, householdName, onCompleteNavigateBack]);

  const handleJoinHouseholdByToken = useCallback(async () => {
    setErrorMessage(null);
    setInfoMessage(null);

    if (!inviteTokenInput.trim()) {
      setErrorMessage('Please paste an invitation token or link.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await acceptHouseholdInvitation(inviteTokenInput);
      if (!result.success) {
        setErrorMessage(result.message || 'Could not accept invitation.');
        return;
      }

      const ctx = await fetchActiveHouseholdContext();
      setHouseholdContext(ctx);
      notifyTransactionSaved();
      onCompleteNavigateBack();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to join household.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [inviteTokenInput, onCompleteNavigateBack]);

  const handleGoogleSignIn = useCallback(async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      const signedInUser = await signInWithGoogleOAuth();
      if (signedInUser) {
        setAuthUser(signedInUser);
        const ctx = await fetchActiveHouseholdContext();
        setHouseholdContext(ctx);
        notifyTransactionSaved();
        if (ctx) {
          onCompleteNavigateBack();
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to complete Google Sign-In.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [onCompleteNavigateBack]);

  const handleSignOut = useCallback(async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await signOutCurrentUser();
      setAuthUser(null);
      setHouseholdContext(null);
      notifyTransactionSaved();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to sign out.'
      );
    } finally {
      setSubmitting(false);
    }
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await deleteMyUserAccount();
      setAuthUser(null);
      setHouseholdContext(null);
      notifyTransactionSaved();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to delete account.'
      );
    } finally {
      setSubmitting(false);
    }
  }, []);

  return {
    loadingInitial,
    authUser,
    householdContext,
    mode,
    setMode: (nextMode: AuthMode) => {
      setMode(nextMode);
      setErrorMessage(null);
      setInfoMessage(null);
    },
    fullName,
    setFullName,
    email,
    setEmail,
    password,
    setPassword,
    householdName,
    setHouseholdName,
    baseCurrency,
    setBaseCurrency,
    inviteTokenInput,
    setInviteTokenInput,
    submitting,
    errorMessage,
    infoMessage,
    handleAuthSubmit,
    handleGoogleSignIn,
    handleCreateHousehold,
    handleJoinHouseholdByToken,
    handleSignOut,
    handleDeleteAccount,
    refreshState,
  };
}

