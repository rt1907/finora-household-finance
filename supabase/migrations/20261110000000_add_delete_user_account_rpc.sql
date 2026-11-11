-- ============================================================================
-- Migration: 20261110000000_add_delete_user_account_rpc.sql
-- Purpose:   Allow an authenticated user to permanently delete their own
--            account (`auth.users` + `public.profiles`) and any single-member
--            households they own, while safely transferring ownership if
--            another member still belongs to a shared household.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _current_user_id UUID := (SELECT auth.uid());
  _hh RECORD;
  _next_owner_user_id UUID;
BEGIN
  IF _current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to delete account.';
  END IF;

  -- Handle households where this user is currently an owner
  FOR _hh IN
    SELECT hm.household_id
    FROM public.household_members hm
    WHERE hm.user_id = _current_user_id
      AND hm.role = 'owner'::public.household_role
  LOOP
    -- Check if there is another owner or member in this household
    SELECT hm2.user_id
    INTO _next_owner_user_id
    FROM public.household_members hm2
    WHERE hm2.household_id = _hh.household_id
      AND hm2.user_id <> _current_user_id
    ORDER BY (hm2.role = 'owner'::public.household_role) DESC, hm2.joined_at ASC
    LIMIT 1;

    IF _next_owner_user_id IS NULL THEN
      -- Sole member of this household -> delete the entire household
      DELETE FROM public.households
      WHERE id = _hh.household_id;
    ELSE
      -- Ensure the remaining member is promoted to owner before this user is removed
      UPDATE public.household_members
      SET role = 'owner'::public.household_role
      WHERE household_id = _hh.household_id
        AND user_id = _next_owner_user_id;
    END IF;
  END LOOP;

  -- Delete the user from auth.users (cascades to public.profiles and dependent rows)
  DELETE FROM auth.users
  WHERE id = _current_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

