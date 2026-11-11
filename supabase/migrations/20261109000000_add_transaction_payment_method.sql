-- ============================================================================
-- Migration: 20261109000000_add_transaction_payment_method.sql
-- Description: Adds first-class `payment_method` support to `public.transactions`
--              so payment channels (such as UPI, Cash, Credit Card, Debit Card,
--              Bank Transfer) are stored separately from financial accounts
--              (`public.accounts`).
--
--              Enforces architectural rules for UPI:
--                - UPI is a payment method (`payment_method = 'upi'`), NEVER
--                  an account type in `public.accounts`.
--                - A UPI transaction may have `account_id IS NULL` (no linked
--                  account) or link solely to a `bank_account` (`type = 'bank_account'`).
-- ============================================================================

-- 1. Create custom enum for payment methods (distinct from `public.account_type`)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'payment_method_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.payment_method_type AS ENUM (
      'cash',
      'upi',
      'credit_card',
      'debit_card',
      'bank_transfer',
      'other'
    );
  END IF;
END;
$$;

-- 2. Add `payment_method` column to `public.transactions`
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method_type NOT NULL DEFAULT 'other';

CREATE INDEX IF NOT EXISTS idx_transactions_payment_method
  ON public.transactions(household_id, payment_method);

-- 3. Update `public.validate_transaction_integrity()` to validate UPI -> bank_account rule
CREATE OR REPLACE FUNCTION public.validate_transaction_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _cat public.categories%ROWTYPE;
  _acc public.accounts%ROWTYPE;
BEGIN
  -- 1. Validate Category
  SELECT *
  INTO _cat
  FROM public.categories c
  WHERE c.id = NEW.category_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid category_id: category does not exist.';
  END IF;

  IF NOT (_cat.is_system = true OR _cat.household_id = NEW.household_id) THEN
    RAISE EXCEPTION 'Category does not belong to this household.';
  END IF;

  IF _cat.type <> NEW.type THEN
    RAISE EXCEPTION 'Category type (%) does not match transaction type (%).', _cat.type, NEW.type;
  END IF;

  IF _cat.is_archived = true AND (TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id) THEN
    RAISE EXCEPTION 'Cannot link a transaction to an archived category.';
  END IF;

  -- 2. Validate Linked Account (optional)
  IF NEW.account_id IS NOT NULL THEN
    SELECT *
    INTO _acc
    FROM public.accounts a
    WHERE a.id = NEW.account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid account_id: account does not exist.';
    END IF;

    IF _acc.household_id <> NEW.household_id THEN
      RAISE EXCEPTION 'Linked account does not belong to this household.';
    END IF;

    IF NOT (_acc.owner_id = NEW.created_by OR _acc.is_shared_with_household = true) THEN
      RAISE EXCEPTION 'Access denied: cannot link a private account owned by another household member.';
    END IF;

    IF _acc.currency <> NEW.currency THEN
      RAISE EXCEPTION 'Transaction currency (%) must match the linked account currency (%).', NEW.currency, _acc.currency;
    END IF;

    IF _acc.is_archived = true AND (TG_OP = 'INSERT' OR NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
      RAISE EXCEPTION 'Cannot link a transaction to an archived account.';
    END IF;

    -- 3. UPI Payment Method Rule:
    -- If payment_method is 'upi' and an account is linked, it MUST be a bank_account.
    IF NEW.payment_method = 'upi'::public.payment_method_type
       AND _acc.type <> 'bank_account'::public.account_type
    THEN
      RAISE EXCEPTION 'UPI transactions can only be linked to a Bank Account (received account type: %).', _acc.type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_transaction_integrity() FROM PUBLIC, anon, authenticated;

