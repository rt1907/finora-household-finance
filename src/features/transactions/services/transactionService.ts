import {
  identifyAnalyticsUser,
  trackAnalyticsEvent,
} from '@/services/analytics/posthog';
import { getSupabaseClient } from '@/services/supabase/client';
import {
  AccountRow,
  CategoryRow,
  DashboardSummaryResult,
  TransactionRow,
} from '@/types/database';
import {
  ActiveHouseholdContext,
  CreateAccountInput,
  CreateCustomCategoryInput,
  CreateTransactionInput,
  HouseholdDashboardData,
  HouseholdExpenditureAnalytics,
  TransactionWithRelations,
  UpdateTransactionInput,
  UserContributionItem,
} from '@/features/transactions/types/transaction.types';
import { getCurrentMonthDateRange } from '@/utils/date';

/**
 * Lightweight pub/sub refresh bus so saving a transaction immediately triggers
 * a reload of dashboard totals and recent transactions when navigating back.
 */
type RefreshListener = () => void;
const refreshListeners = new Set<RefreshListener>();

export function subscribeToTransactionUpdates(
  listener: RefreshListener
): () => void {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

export function notifyTransactionSaved(): void {
  refreshListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore individual listener errors
    }
  });
}

/**
 * Resolves the currently authenticated user and their primary household membership.
 * Never bypasses Supabase RLS.
 */
export async function fetchActiveHouseholdContext(): Promise<ActiveHouseholdContext | null> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data: memberships, error: memberError } = await supabase
    .from('household_members')
    .select('household_id, role, joined_at')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1);

  if (memberError) {
    throw new Error(`Failed to load household membership: ${memberError.message}`);
  }

  if (!memberships || memberships.length === 0) {
    return null;
  }

  const primaryMembership = memberships[0];

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('*')
    .eq('id', primaryMembership.household_id)
    .single();

  if (householdError || !household) {
    throw new Error(
      `Failed to load household details: ${householdError?.message ?? 'Not found'}`
    );
  }

  identifyAnalyticsUser(user.id);

  return {
    userId: user.id,
    household,
    role: primaryMembership.role,
  };
}

/**
 * Creates a new household using the atomic `create_household_with_owner` RPC.
 * Ensures the caller's `public.profiles` row exists first so foreign-key
 * constraints (`households_created_by_fkey`) always succeed.
 */
export async function createHouseholdWithOwner(
  name: string,
  baseCurrency: string = 'INR'
): Promise<string> {
  const supabase = getSupabaseClient();

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

  const { data, error } = await supabase.rpc('create_household_with_owner', {
    _name: name.trim(),
    _base_currency: baseCurrency.trim().toUpperCase(),
  });

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create household.');
  }

  trackAnalyticsEvent('household_created', {
    base_currency: baseCurrency.trim().toUpperCase(),
  });

  return data;
}

/**
 * Fetches global system categories + unarchived custom categories for the household.
 */
export async function fetchHouseholdCategories(
  householdId: string
): Promise<CategoryRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_archived', false)
    .or(`is_system.eq.true,household_id.eq.${householdId}`)
    .order('is_system', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Unable to load categories: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Creates a custom category scoped to the household (`is_system = false`).
 * Available to all household members per V1 requirements.
 */
export async function createCustomCategory(
  input: CreateCustomCategoryInput
): Promise<CategoryRow> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Authentication required to create a category.');
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({
      household_id: input.householdId,
      name: input.name.trim(),
      type: input.type,
      icon: input.icon?.trim() || 'tag',
      color_hex: input.colorHex || '#0F766E',
      is_system: false,
      is_archived: false,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      throw new Error(
        `A ${input.type} category named "${input.name.trim()}" already exists.`
      );
    }
    throw new Error(error?.message ?? 'Failed to create custom category.');
  }

  return data;
}

/**
 * Fetches unarchived accounts accessible to the current user in the household.
 * RLS automatically restricts results to:
 *   - User's own accounts (`owner_id = auth.uid()`)
 *   - Fellow members' accounts where `is_shared_with_household = true`
 */
export async function fetchAccessibleAccounts(
  householdId: string
): Promise<AccountRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('household_id', householdId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Unable to load accounts: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Creates a new financial account (e.g. Bank Account, Cash, Credit Card, etc.).
 * Private by default (`is_shared_with_household = false`) unless explicitly shared.
 */
export async function createAccount(
  input: CreateAccountInput
): Promise<AccountRow> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Authentication required to create an account.');
  }

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      household_id: input.householdId,
      owner_id: user.id,
      name: input.name.trim(),
      type: input.type,
      institution_name: input.institutionName?.trim() || null,
      currency: (input.currency || 'INR').toUpperCase(),
      is_shared_with_household: Boolean(input.isSharedWithHousehold),
      is_archived: false,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create account.');
  }

  trackAnalyticsEvent('account_created', {
    account_type: input.type,
    is_shared: Boolean(input.isSharedWithHousehold),
  });

  return data;
}

/**
 * Inserts a new transaction in `public.transactions`.
 * Enforces RLS, creator ownership, and scope-visibility invariants.
 * Gracefully falls back if `20261109000000_add_transaction_payment_method.sql`
 * has not yet been applied to the target database.
 */
export async function createTransaction(
  input: CreateTransactionInput
): Promise<TransactionRow> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to save a transaction.');
  }

  const resolvedVisibility =
    input.scope === 'household' ? 'shared' : input.visibility;

  const basePayload = {
    household_id: input.householdId,
    created_by: user.id,
    category_id: input.categoryId,
    account_id: input.accountId,
    type: input.type,
    scope: input.scope,
    visibility: resolvedVisibility,
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    transaction_date: input.transactionDate,
    description: input.description?.trim() ? input.description.trim() : null,
  };

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      ...basePayload,
      payment_method: input.paymentMethod,
    })
    .select('*')
    .single();

  if (error) {
    // If the user has not yet executed `20261109000000_add_transaction_payment_method.sql`,
    // retry without the `payment_method` column so V1 saving still works against migration 000000.
    if (
      error.message?.includes('payment_method') &&
      (error.code === 'PGRST204' || error.code === '42703')
    ) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('transactions')
        .insert(basePayload)
        .select('*')
        .single();

      if (fallbackError || !fallbackData) {
        throw new Error(
          fallbackError?.message ?? 'Failed to save transaction.'
        );
      }

      notifyTransactionSaved();
      return fallbackData;
    }

    throw new Error(error.message || 'Failed to save transaction.');
  }

  if (!data) {
    throw new Error('Transaction could not be saved.');
  }

  notifyTransactionSaved();
  trackAnalyticsEvent('transaction_created', {
    type: input.type,
    scope: input.scope,
    visibility: resolvedVisibility,
    payment_method: input.paymentMethod,
  });
  return data;
}

/**
 * Fetches a single transaction by ID for viewing or editing.
 * RLS ensures private transactions of other members are never accessible.
 */
export async function fetchTransactionById(
  transactionId: string,
  householdId: string
): Promise<TransactionRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('household_id', householdId)
    .single();

  if (error) {
    throw new Error(`Unable to load transaction: ${error.message}`);
  }

  return data ?? null;
}

/**
 * Updates an existing transaction created by the current authenticated user.
 * Enforces creator ownership (`created_by = user.id`) and household membership.
 */
export async function updateTransaction(
  input: UpdateTransactionInput
): Promise<TransactionRow> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to update a transaction.');
  }

  const resolvedVisibility =
    input.scope === 'household' ? 'shared' : input.visibility;

  const baseUpdatePayload = {
    category_id: input.categoryId,
    account_id: input.accountId,
    type: input.type,
    scope: input.scope,
    visibility: resolvedVisibility,
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    transaction_date: input.transactionDate,
    description: input.description?.trim() ? input.description.trim() : null,
  };

  const { data, error } = await supabase
    .from('transactions')
    .update({
      ...baseUpdatePayload,
      payment_method: input.paymentMethod,
    })
    .eq('id', input.transactionId)
    .eq('household_id', input.householdId)
    .eq('created_by', user.id)
    .select('*')
    .single();

  if (error) {
    if (
      error.message?.includes('payment_method') &&
      (error.code === 'PGRST204' || error.code === '42703')
    ) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('transactions')
        .update(baseUpdatePayload)
        .eq('id', input.transactionId)
        .eq('household_id', input.householdId)
        .eq('created_by', user.id)
        .select('*')
        .single();

      if (fallbackError || !fallbackData) {
        throw new Error(
          fallbackError?.message ??
            'Failed to update transaction. Only the creator can edit this transaction.'
        );
      }

      notifyTransactionSaved();
      return fallbackData;
    }

    throw new Error(
      error.message ||
        'Failed to update transaction. Only the creator can edit this transaction.'
    );
  }

  if (!data) {
    throw new Error('Only the creator can edit this transaction.');
  }

  notifyTransactionSaved();
  trackAnalyticsEvent('transaction_updated', {
    type: input.type,
    scope: input.scope,
    visibility: resolvedVisibility,
    payment_method: input.paymentMethod,
  });
  return data;
}

/**
 * Deletes an existing transaction created by the current authenticated user.
 * Enforces creator ownership (`created_by = user.id`) at both query and RLS levels.
 */
export async function deleteTransaction(
  transactionId: string,
  householdId: string
): Promise<void> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to delete a transaction.');
  }

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('household_id', householdId)
    .eq('created_by', user.id);

  if (error) {
    throw new Error(`Failed to delete transaction: ${error.message}`);
  }

  notifyTransactionSaved();
}

/**
 * Fetches full visible transaction history for the active household.
 */
export async function fetchHouseholdTransactionsList(
  householdId: string,
  limit: number = 100
): Promise<TransactionWithRelations[]> {
  const supabase = getSupabaseClient();

  const [txResponse, categories, accounts] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .eq('household_id', householdId)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
    fetchHouseholdCategories(householdId),
    fetchAccessibleAccounts(householdId),
  ]);

  if (txResponse.error) {
    throw new Error(
      `Failed to load transactions: ${txResponse.error.message}`
    );
  }

  const categoryMap = new Map<string, CategoryRow>();
  categories.forEach((cat) => categoryMap.set(cat.id, cat));

  const accountMap = new Map<string, AccountRow>();
  accounts.forEach((acc) => accountMap.set(acc.id, acc));

  return (txResponse.data ?? []).map((tx) => ({
    ...tx,
    category: tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null,
    account: tx.account_id ? (accountMap.get(tx.account_id) ?? null) : null,
  }));
}

/**
 * Fetches the current month's dashboard summary via `get_dashboard_summary` RPC
 * and the latest visible transactions for the active household.
 * Strictly respects RLS so private personal transactions of other members are never exposed.
 */
export async function fetchHouseholdDashboardAndRecentTransactions(): Promise<HouseholdDashboardData | null> {
  const context = await fetchActiveHouseholdContext();
  if (!context) {
    return null;
  }

  const supabase = getSupabaseClient();
  const { startDate, endDate } = getCurrentMonthDateRange();

  const [summaryResponse, txResponse, categories, accounts] = await Promise.all([
    supabase.rpc('get_dashboard_summary', {
      _household_id: context.household.id,
      _start_date: startDate,
      _end_date: endDate,
    }),
    supabase
      .from('transactions')
      .select('*')
      .eq('household_id', context.household.id)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
    fetchHouseholdCategories(context.household.id),
    fetchAccessibleAccounts(context.household.id),
  ]);

  if (summaryResponse.error) {
    throw new Error(
      `Failed to load dashboard summary: ${summaryResponse.error.message}`
    );
  }

  if (txResponse.error) {
    throw new Error(
      `Failed to load recent transactions: ${txResponse.error.message}`
    );
  }

  const categoryMap = new Map<string, CategoryRow>();
  categories.forEach((cat) => categoryMap.set(cat.id, cat));

  const accountMap = new Map<string, AccountRow>();
  accounts.forEach((acc) => accountMap.set(acc.id, acc));

  const recentTransactions: TransactionWithRelations[] = (
    txResponse.data ?? []
  ).map((tx) => ({
    ...tx,
    category: tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null,
    account: tx.account_id ? (accountMap.get(tx.account_id) ?? null) : null,
  }));

  const summaries: DashboardSummaryResult[] = summaryResponse.data ?? [];

  return {
    context,
    summaries,
    recentTransactions,
  };
}

/**
 * Fetches the 3-section dashboard summary and all visible transactions within
 * a specific `[startDate, endDate]` window (e.g., a selected calendar month).
 */
export async function fetchMonthlyDashboardDetail(
  startDate: string,
  endDate: string
): Promise<HouseholdDashboardData | null> {
  const context = await fetchActiveHouseholdContext();
  if (!context) {
    return null;
  }

  const supabase = getSupabaseClient();

  const [summaryResponse, txResponse, categories, accounts] = await Promise.all([
    supabase.rpc('get_dashboard_summary', {
      _household_id: context.household.id,
      _start_date: startDate,
      _end_date: endDate,
    }),
    supabase
      .from('transactions')
      .select('*')
      .eq('household_id', context.household.id)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false }),
    fetchHouseholdCategories(context.household.id),
    fetchAccessibleAccounts(context.household.id),
  ]);

  if (summaryResponse.error) {
    throw new Error(
      `Failed to load monthly summary: ${summaryResponse.error.message}`
    );
  }

  if (txResponse.error) {
    throw new Error(
      `Failed to load monthly transactions: ${txResponse.error.message}`
    );
  }

  const categoryMap = new Map<string, CategoryRow>();
  categories.forEach((cat) => categoryMap.set(cat.id, cat));

  const accountMap = new Map<string, AccountRow>();
  accounts.forEach((acc) => accountMap.set(acc.id, acc));

  const recentTransactions: TransactionWithRelations[] = (
    txResponse.data ?? []
  ).map((tx) => ({
    ...tx,
    category: tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null,
    account: tx.account_id ? (accountMap.get(tx.account_id) ?? null) : null,
  }));

  return {
    context,
    summaries: summaryResponse.data ?? [],
    recentTransactions,
  };
}

const PALETTE_COLORS = [
  '#0F766E', // Primary Teal
  '#6366F1', // Indigo
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#0EA5E9', // Sky
  '#F43F5E', // Rose
];

/**
 * Calculates per-user expenditure contribution analytics for the active household.
 * Shows exactly who contributed how much to the household's spending.
 */
export async function fetchHouseholdExpenditureAnalytics(
  householdId: string,
  currentUserId: string,
  startDate: string,
  endDate: string,
  currency: string = 'INR'
): Promise<HouseholdExpenditureAnalytics> {
  const supabase = getSupabaseClient();

  // 1. Fetch household members and their profiles
  const { data: members } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId);

  const memberUserIds = (members ?? []).map((m) => m.user_id);
  const memberNameMap = new Map<string, string>();

  if (memberUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', memberUserIds);

    (profiles ?? []).forEach((p) => {
      memberNameMap.set(p.id, p.full_name?.trim() || '');
    });
  }

  // 2. Fetch all visible expense transactions in this household for the date range
  const { data: expenses, error } = await supabase
    .from('transactions')
    .select('created_by, amount')
    .eq('household_id', householdId)
    .eq('type', 'expense')
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate);

  if (error) {
    throw new Error(`Failed to load expenditure analytics: ${error.message}`);
  }

  // 3. Group expenses by created_by user
  const userExpenseMap = new Map<string, number>();
  memberUserIds.forEach((uid) => userExpenseMap.set(uid, 0));

  (expenses ?? []).forEach((tx) => {
    const currentAmt = userExpenseMap.get(tx.created_by) ?? 0;
    userExpenseMap.set(tx.created_by, currentAmt + (tx.amount ?? 0));
  });

  const totalExpenditure = Array.from(userExpenseMap.values()).reduce(
    (a, b) => a + b,
    0
  );

  // 4. Construct sorted contribution items (Current user always first, then others by amount descending)
  let colorIndex = 0;
  const contributions: UserContributionItem[] = Array.from(
    userExpenseMap.entries()
  ).map(([userId, amount]) => {
    const isCurrentUser = userId === currentUserId;
    const rawName = memberNameMap.get(userId) || (isCurrentUser ? 'You' : 'Member');
    const displayName = isCurrentUser
      ? rawName && rawName !== 'You'
        ? `${rawName} (You)`
        : 'You'
      : rawName;
    const percentage =
      totalExpenditure > 0 ? Math.round((amount / totalExpenditure) * 100) : 0;
    const color = isCurrentUser
      ? '#0F766E'
      : PALETTE_COLORS[(colorIndex++ % (PALETTE_COLORS.length - 1)) + 1];

    return {
      userId,
      name: displayName,
      isCurrentUser,
      amount,
      percentage,
      color,
    };
  });

  contributions.sort((a, b) => {
    if (a.isCurrentUser) return -1;
    if (b.isCurrentUser) return 1;
    return b.amount - a.amount;
  });

  const topContributor =
    contributions.length > 0 && totalExpenditure > 0
      ? contributions.reduce((prev, curr) => (curr.amount > prev.amount ? curr : prev), contributions[0])
      : null;

  return {
    totalExpenditure,
    contributions,
    topContributor,
    isMultiMember: memberUserIds.length > 1,
    memberCount: memberUserIds.length,
    currency,
  };
}

