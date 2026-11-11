import { useCallback, useEffect, useState } from 'react';
import { Share } from 'react-native';
import { isSupabaseConfigured } from '@/config/env';
import {
  acceptHouseholdInvitation,
  createHouseholdInvitation,
  fetchHouseholdInvitations,
  fetchHouseholdMembers,
  HouseholdMemberWithProfile,
  revokeHouseholdInvitation,
} from '@/features/household/services/householdService';
import { fetchActiveHouseholdContext } from '@/features/transactions/services/transactionService';
import { ActiveHouseholdContext } from '@/features/transactions/types/transaction.types';
import { CreatedInvitationResult, InvitationRow } from '@/types/database';

export function useHouseholdViewModel() {
  const backendConfigured = isSupabaseConfigured();

  const [householdContext, setHouseholdContext] =
    useState<ActiveHouseholdContext | null>(null);
  const [members, setMembers] = useState<HouseholdMemberWithProfile[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState<boolean>(backendConfigured);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Create Invitation state (Owner only)
  const [inviteeEmail, setInviteeEmail] = useState<string>('');
  const [creatingInvite, setCreatingInvite] = useState<boolean>(false);
  const [latestCreatedInvite, setLatestCreatedInvite] =
    useState<CreatedInvitationResult | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Accept Invitation state (for users joining a household)
  const [joinTokenInput, setJoinTokenInput] = useState<string>('');
  const [acceptingInvite, setAcceptingInvite] = useState<boolean>(false);
  const [joinFeedback, setJoinFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const reloadHouseholdData = useCallback(async () => {
    if (!backendConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const ctx = await fetchActiveHouseholdContext();
      setHouseholdContext(ctx);

      if (ctx) {
        const loadedMembers = await fetchHouseholdMembers(ctx.household.id);
        setMembers(loadedMembers);

        if (ctx.role === 'owner') {
          const loadedInvites = await fetchHouseholdInvitations(
            ctx.household.id
          );
          setInvitations(loadedInvites);
        } else {
          setInvitations([]);
        }
      } else {
        setMembers([]);
        setInvitations([]);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to load household details.'
      );
    } finally {
      setLoading(false);
    }
  }, [backendConfigured]);

  useEffect(() => {
    if (!backendConfigured) {
      return;
    }
    let active = true;

    async function init() {
      try {
        const ctx = await fetchActiveHouseholdContext();
        if (!active) return;
        setHouseholdContext(ctx);

        if (ctx) {
          const loadedMembers = await fetchHouseholdMembers(ctx.household.id);
          if (active) setMembers(loadedMembers);

          if (ctx.role === 'owner') {
            const loadedInvites = await fetchHouseholdInvitations(
              ctx.household.id
            );
            if (active) setInvitations(loadedInvites);
          }
        }
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Unable to load household details.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, [backendConfigured]);

  const handleGenerateInvite = useCallback(async () => {
    if (!householdContext || householdContext.role !== 'owner') {
      setErrorMessage('Only household owners can create invitations.');
      return;
    }

    const trimmedEmail = inviteeEmail.trim();
    if (trimmedEmail && !trimmedEmail.includes('@')) {
      setErrorMessage(
        'Please enter a valid email address or leave it blank for an open link.'
      );
      return;
    }

    setCreatingInvite(true);
    setErrorMessage(null);

    try {
      const created = await createHouseholdInvitation({
        householdId: householdContext.household.id,
        inviteeEmail: trimmedEmail || null,
        role: 'member',
        expiresInDays: 7,
      });

      setLatestCreatedInvite(created);
      setInviteeEmail('');

      const updatedInvites = await fetchHouseholdInvitations(
        householdContext.household.id
      );
      setInvitations(updatedInvites);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate invitation.'
      );
    } finally {
      setCreatingInvite(false);
    }
  }, [householdContext, inviteeEmail]);

  const handleShareInvite = useCallback(async () => {
    if (!latestCreatedInvite || !householdContext) {
      return;
    }

    const deepLink = `household-finance://join?token=${latestCreatedInvite.raw_token}`;
    const shareMessage = `Join our "${householdContext.household.name}" household on Finora!\n\nCopy & paste this Invitation Token in the app:\n${latestCreatedInvite.raw_token}\n\n(App Link once APK is installed: ${deepLink})`;

    try {
      await Share.share({
        message: shareMessage,
      });
    } catch {
      // Ignore user share sheet cancellation
    }
  }, [householdContext, latestCreatedInvite]);

  const handleShareTokenOnly = useCallback(async () => {
    if (!latestCreatedInvite) {
      return;
    }

    try {
      await Share.share({
        message: latestCreatedInvite.raw_token,
      });
    } catch {
      // Ignore user share sheet cancellation
    }
  }, [latestCreatedInvite]);

  const handleRevokeInvite = useCallback(
    async (invitationId: string) => {
      if (!householdContext) {
        return;
      }

      setRevokingId(invitationId);
      setErrorMessage(null);

      try {
        await revokeHouseholdInvitation(invitationId);
        const updatedInvites = await fetchHouseholdInvitations(
          householdContext.household.id
        );
        setInvitations(updatedInvites);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to revoke invitation.'
        );
      } finally {
        setRevokingId(null);
      }
    },
    [householdContext]
  );

  const handleAcceptInviteToken = useCallback(async () => {
    setJoinFeedback(null);
    setErrorMessage(null);

    if (!joinTokenInput.trim()) {
      setJoinFeedback({
        type: 'error',
        text: 'Please paste an invitation token or link.',
      });
      return;
    }

    setAcceptingInvite(true);
    try {
      const result = await acceptHouseholdInvitation(joinTokenInput);
      if (result.success) {
        setJoinFeedback({
          type: 'success',
          text: result.message || 'Successfully joined household!',
        });
        setJoinTokenInput('');
        await reloadHouseholdData();
      } else {
        setJoinFeedback({
          type: 'error',
          text: result.message || 'Could not accept invitation.',
        });
      }
    } catch (err) {
      setJoinFeedback({
        type: 'error',
        text:
          err instanceof Error ? err.message : 'Failed to accept invitation.',
      });
    } finally {
      setAcceptingInvite(false);
    }
  }, [joinTokenInput, reloadHouseholdData]);

  return {
    loading,
    errorMessage,
    householdContext,
    isOwner: householdContext?.role === 'owner',
    members,
    invitations,
    inviteeEmail,
    setInviteeEmail,
    creatingInvite,
    latestCreatedInvite,
    revokingId,
    handleGenerateInvite,
    handleShareInvite,
    handleShareTokenOnly,
    handleRevokeInvite,
    joinTokenInput,
    setJoinTokenInput,
    acceptingInvite,
    joinFeedback,
    handleAcceptInviteToken,
    reloadHouseholdData,
  };
}

