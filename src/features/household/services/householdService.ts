import { getSupabaseClient } from '@/services/supabase/client';
import {
  AcceptInvitationResult,
  CreatedInvitationResult,
  HouseholdMemberRow,
  HouseholdRole,
  InvitationRow,
  ProfileRow,
} from '@/types/database';
import { notifyTransactionSaved } from '@/features/transactions/services/transactionService';

export interface HouseholdMemberWithProfile extends HouseholdMemberRow {
  profile: Pick<ProfileRow, 'id' | 'full_name' | 'avatar_url'> | null;
}

/**
 * Fetches all members of the specified household along with their display profiles.
 * RLS ensures only members of the household can read memberships and profiles.
 */
export async function fetchHouseholdMembers(
  householdId: string
): Promise<HouseholdMemberWithProfile[]> {
  const supabase = getSupabaseClient();

  const { data: members, error: membersError } = await supabase
    .from('household_members')
    .select('*')
    .eq('household_id', householdId)
    .order('joined_at', { ascending: true });

  if (membersError) {
    throw new Error(`Failed to load household members: ${membersError.message}`);
  }

  if (!members || members.length === 0) {
    return [];
  }

  const userIds = members.map((m) => m.user_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', userIds);

  if (profilesError) {
    throw new Error(`Failed to load member profiles: ${profilesError.message}`);
  }

  const profileMap = new Map<
    string,
    Pick<ProfileRow, 'id' | 'full_name' | 'avatar_url'>
  >();
  (profiles ?? []).forEach((p) => profileMap.set(p.id, p));

  return members.map((member) => ({
    ...member,
    profile: profileMap.get(member.user_id) ?? null,
  }));
}

/**
 * Fetches safe invitation metadata for the household (for household owners).
 * Note: `token_hash` is never selected because it is revoked at the PostgreSQL column level.
 */
export async function fetchHouseholdInvitations(
  householdId: string
): Promise<InvitationRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('invitations')
    .select(
      'id, household_id, inviter_id, invitee_email, role, status, expires_at, accepted_by, accepted_at, created_at, updated_at'
    )
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(`Failed to load invitations: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Creates a secure one-time invitation token via `create_household_invitation` RPC.
 * Only household owners can call this. Returns the raw token ONCE so the owner
 * can share it with their partner or family member.
 */
export async function createHouseholdInvitation(input: {
  householdId: string;
  inviteeEmail?: string | null;
  role?: HouseholdRole;
  expiresInDays?: number;
}): Promise<CreatedInvitationResult> {
  const supabase = getSupabaseClient();

  const normalizedEmail = input.inviteeEmail?.trim()
    ? input.inviteeEmail.trim().toLowerCase()
    : null;

  const { data, error } = await supabase.rpc('create_household_invitation', {
    _household_id: input.householdId,
    _invitee_email: normalizedEmail,
    _role: input.role ?? 'member',
    _expires_in_days: input.expiresInDays ?? 7,
  });

  if (error) {
    throw new Error(error.message || 'Failed to create invitation.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.raw_token) {
    throw new Error('Invitation token was not returned by the server.');
  }

  return row;
}

/**
 * Revokes a pending invitation via the owner-only `revoke_household_invitation` RPC.
 */
export async function revokeHouseholdInvitation(
  invitationId: string
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.rpc('revoke_household_invitation', {
    _invitation_id: invitationId,
  });

  if (error) {
    throw new Error(error.message || 'Failed to revoke invitation.');
  }
}

/**
 * Extracts a 64-char hex invitation token from:
 * - A raw token
 * - A deep link (`household-finance://join?token=...`)
 * - An entire copied WhatsApp/SMS share message
 */
export function extractInvitationToken(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return '';
  }

  const tokenParamMatch = trimmed.match(/[?&]token=([a-fA-F0-9]{32,128})/);
  if (tokenParamMatch && tokenParamMatch[1]) {
    return tokenParamMatch[1];
  }

  const hexTokenMatch = trimmed.match(/\b([a-fA-F0-9]{64})\b/);
  if (hexTokenMatch && hexTokenMatch[1]) {
    return hexTokenMatch[1];
  }

  return trimmed;
}

export async function acceptHouseholdInvitation(
  rawTokenOrLink: string
): Promise<AcceptInvitationResult> {
  const supabase = getSupabaseClient();
  const cleanToken = extractInvitationToken(rawTokenOrLink);

  if (!cleanToken) {
    throw new Error('Please enter an invitation token or link.');
  }

  // Ensure the joining user has a `public.profiles` row before inserting membership
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from('profiles').insert({
        id: user.id,
        full_name:
          (user.user_metadata?.full_name as string | undefined)?.trim() || null,
      });
    }
  }

  const { data, error } = await supabase.rpc('accept_household_invitation', {
    _raw_token: cleanToken,
  });

  if (error) {
    throw new Error(error.message || 'Failed to accept invitation.');
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) {
    throw new Error('Unexpected response when accepting invitation.');
  }

  if (result.success) {
    notifyTransactionSaved();
  }

  return result;
}

