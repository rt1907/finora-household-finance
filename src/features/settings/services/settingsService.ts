import { getSupabaseClient } from '@/services/supabase/client';
import { ProfileRow } from '@/types/database';
import { notifyTransactionSaved } from '@/features/transactions/services/transactionService';

/**
 * Fetches the authenticated user's profile row from `public.profiles`.
 */
export async function fetchCurrentUserProfile(
  userId: string
): Promise<ProfileRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load profile: ${error.message}`);
  }

  return data ?? null;
}

/**
 * Updates or inserts the authenticated user's display name (`full_name`) in `public.profiles`.
 */
export async function updateUserProfileDisplayName(
  userId: string,
  fullName: string
): Promise<ProfileRow> {
  const supabase = getSupabaseClient();
  const trimmedName = fullName.trim();

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name: trimmedName || null,
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to update display name.');
    }

    notifyTransactionSaved();
    return data;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      full_name: trimmedName || null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to save display name.');
  }

  notifyTransactionSaved();
  return data;
}

/**
 * Archives a custom household category (`is_system = false`) via the
 * `set_category_archived` RPC so historical transactions remain intact.
 */
export async function archiveCustomHouseholdCategory(
  categoryId: string
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.rpc('set_category_archived', {
    _category_id: categoryId,
    _is_archived: true,
  });

  if (error) {
    throw new Error(error.message || 'Unable to archive custom category.');
  }

  notifyTransactionSaved();
}

