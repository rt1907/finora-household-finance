import { getSupabaseClient } from '@/services/supabase/client';
import {
  AccountBalanceRow,
  AccountRow,
  ProfileRow,
} from '@/types/database';
import { notifyTransactionSaved } from '@/features/transactions/services/transactionService';

export interface AccountWithLatestBalance extends AccountRow {
  isOwner: boolean;
  ownerDisplayName: string;
  latestBalance: AccountBalanceRow | null;
  recentBalances: AccountBalanceRow[];
}

export interface RecordAccountBalanceInput {
  accountId: string;
  balance: number;
  asOfDate: string;
  notes?: string;
}

/**
 * Fetches all accessible unarchived accounts in the household along with their
 * manual balance snapshots (`account_balances`) and owner display names.
 * RLS guarantees that private accounts and private balances of other household
 * members are never returned.
 */
export async function fetchHouseholdAccountsWithBalances(
  householdId: string,
  currentUserId: string
): Promise<AccountWithLatestBalance[]> {
  const supabase = getSupabaseClient();

  const [accountsRes, profilesRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_archived', false)
      .order('created_at', { ascending: true }),
    supabase.from('profiles').select('*'),
  ]);

  if (accountsRes.error) {
    throw new Error(`Unable to load accounts: ${accountsRes.error.message}`);
  }

  const accounts = accountsRes.data ?? [];
  if (accounts.length === 0) {
    return [];
  }

  const profileMap = new Map<string, ProfileRow>();
  (profilesRes.data ?? []).forEach((p) => profileMap.set(p.id, p));

  const accountIds = accounts.map((a) => a.id);

  const { data: balancesData, error: balancesError } = await supabase
    .from('account_balances')
    .select('*')
    .in('account_id', accountIds)
    .order('as_of_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (balancesError) {
    throw new Error(
      `Unable to load account balances: ${balancesError.message}`
    );
  }

  const balancesByAccount = new Map<string, AccountBalanceRow[]>();
  (balancesData ?? []).forEach((bal) => {
    const existing = balancesByAccount.get(bal.account_id) ?? [];
    existing.push(bal);
    balancesByAccount.set(bal.account_id, existing);
  });

  return accounts.map((acc) => {
    const isOwner = acc.owner_id === currentUserId;
    const ownerProfile = profileMap.get(acc.owner_id);
    const ownerDisplayName =
      ownerProfile?.full_name?.trim() ||
      (isOwner ? 'You' : `Member (${acc.owner_id.slice(0, 6)})`);
    const recentBalances = balancesByAccount.get(acc.id) ?? [];

    return {
      ...acc,
      isOwner,
      ownerDisplayName,
      latestBalance: recentBalances[0] ?? null,
      recentBalances: recentBalances.slice(0, 5),
    };
  });
}

/**
 * Toggles whether an account is shared with the household (`is_shared_with_household`).
 * Only the account owner (`owner_id = auth.uid()`) can update this setting.
 */
export async function updateAccountSharing(
  accountId: string,
  householdId: string,
  isSharedWithHousehold: boolean
): Promise<AccountRow> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Authentication required to update account sharing.');
  }

  const { data, error } = await supabase
    .from('accounts')
    .update({
      is_shared_with_household: isSharedWithHousehold,
    })
    .eq('id', accountId)
    .eq('household_id', householdId)
    .eq('owner_id', user.id)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? 'Only the account owner can change sharing settings.'
    );
  }

  notifyTransactionSaved();
  return data;
}

/**
 * Records a manual point-in-time balance entry in `public.account_balances`.
 * In V1, account balances are entered manually and kept independent of transactions.
 * Only the account owner can record balances.
 */
export async function recordManualAccountBalance(
  input: RecordAccountBalanceInput
): Promise<AccountBalanceRow> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Authentication required to record an account balance.');
  }

  const { data, error } = await supabase
    .from('account_balances')
    .insert({
      account_id: input.accountId,
      recorded_by: user.id,
      balance: input.balance,
      as_of_date: input.asOfDate,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to record manual balance.');
  }

  return data;
}

/**
 * Archives an account (`is_archived = true`) so it no longer appears in active
 * account selectors while preserving historical transaction links.
 */
export async function archiveAccount(
  accountId: string,
  householdId: string
): Promise<void> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Authentication required to archive an account.');
  }

  const { error } = await supabase
    .from('accounts')
    .update({ is_archived: true })
    .eq('id', accountId)
    .eq('household_id', householdId)
    .eq('owner_id', user.id);

  if (error) {
    throw new Error(error.message || 'Failed to archive account.');
  }

  notifyTransactionSaved();
}

