-- ============================================================================
-- Migration: 20261108000000_initial_household_finance_schema.sql
-- Description: Complete production-grade PostgreSQL schema for the Collaborative
--              Household Finance mobile application.
--              Includes:
--                - Custom enums & 8 core tables with strict constraints
--                - Server-controlled creation & update timestamps
--                - Immutable ownership & household-scope protections
--                - Concurrency-safe last-owner protection & ownership transfer
--                - Owner-only invitation creation, revocation, and non-rollback
--                  expiry persistence during invitation acceptance
--                - Cross-entity transaction link & currency validation (preserving
--                  existing archived links on historical edits)
--                - Anti-probing SECURITY DEFINER RLS helpers with empty search_path
--                - Explicit table-level, column-level, and function-level grants
--                - Multi-currency-safe 3-section dashboard summary RPC
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ============================================================================
-- 1. CUSTOM ENUM TYPES
-- ============================================================================

CREATE TYPE public.household_role AS ENUM ('owner', 'member');

CREATE TYPE public.invitation_status AS ENUM (
  'pending',
  'accepted',
  'revoked',
  'expired'
);

CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');

CREATE TYPE public.transaction_scope AS ENUM ('personal', 'household');

CREATE TYPE public.transaction_visibility AS ENUM ('private', 'shared');

CREATE TYPE public.account_type AS ENUM (
  'bank_account',
  'cash',
  'credit_card',
  'fixed_deposit',
  'mutual_fund',
  'stocks'
);

-- ============================================================================
-- 2. TABLES, PRIMARY KEYS, FOREIGN KEYS & CONSTRAINTS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 profiles
-- Mirrors auth.users(id). Does NOT store email so fellow household members
-- cannot harvest email addresses via SELECT queries.
-- ----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT
    CONSTRAINT chk_profiles_full_name_len CHECK (
      full_name IS NULL OR pg_catalog.char_length(pg_catalog.btrim(full_name)) BETWEEN 1 AND 100
    ),
  avatar_url TEXT
    CONSTRAINT chk_profiles_avatar_url_len CHECK (
      avatar_url IS NULL OR pg_catalog.char_length(pg_catalog.btrim(avatar_url)) <= 500
    ),
  default_currency CHAR(3) NOT NULL DEFAULT 'INR'
    CONSTRAINT chk_profiles_currency_format CHECK (default_currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- ----------------------------------------------------------------------------
-- 2.2 households
-- Represents a couple or nuclear family financial unit.
-- ----------------------------------------------------------------------------
CREATE TABLE public.households (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name TEXT NOT NULL
    CONSTRAINT chk_households_name_len CHECK (
      pg_catalog.char_length(pg_catalog.btrim(name)) BETWEEN 1 AND 100
    ),
  base_currency CHAR(3) NOT NULL DEFAULT 'INR'
    CONSTRAINT chk_households_currency_format CHECK (base_currency ~ '^[A-Z]{3}$'),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- ----------------------------------------------------------------------------
-- 2.3 household_members
-- Join table mapping users to households with role-based permissions.
-- ----------------------------------------------------------------------------
CREATE TABLE public.household_members (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.household_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT uq_household_members_household_user UNIQUE (household_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 2.4 invitations
-- Secure token-based household invitations for invitation links.
-- `token_hash` is revoked from `anon` and `authenticated` at the column grant
-- level so client SELECT queries can never read or leak invitation hashes.
-- ----------------------------------------------------------------------------
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_email TEXT
    CONSTRAINT chk_invitations_email_normalized CHECK (
      invitee_email IS NULL
      OR (
        pg_catalog.char_length(invitee_email) BETWEEN 3 AND 254
        AND invitee_email = pg_catalog.lower(pg_catalog.btrim(invitee_email))
      )
    ),
  role public.household_role NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL UNIQUE
    CONSTRAINT chk_invitations_token_hash_len CHECK (pg_catalog.char_length(token_hash) = 64),
  status public.invitation_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (pg_catalog.now() + INTERVAL '7 days'),
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_invitations_expiry CHECK (expires_at > created_at),
  CONSTRAINT chk_invitations_acceptance_consistency CHECK (
    (status = 'accepted' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
    OR (status <> 'accepted' AND accepted_by IS NULL AND accepted_at IS NULL)
  )
);

-- ----------------------------------------------------------------------------
-- 2.5 categories
-- Supports global system defaults (is_system = true, household_id IS NULL) and
-- custom household categories (is_system = false, household_id IS NOT NULL).
-- Uses ON DELETE RESTRICT from transactions so referenced categories must be
-- archived (`is_archived = true`) rather than hard-deleted.
-- ----------------------------------------------------------------------------
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL
    CONSTRAINT chk_categories_name_len CHECK (
      pg_catalog.char_length(pg_catalog.btrim(name)) BETWEEN 1 AND 60
    ),
  type public.transaction_type NOT NULL,
  icon TEXT
    CONSTRAINT chk_categories_icon_len CHECK (
      icon IS NULL OR pg_catalog.char_length(pg_catalog.btrim(icon)) <= 60
    ),
  color_hex CHAR(7)
    CONSTRAINT chk_categories_color_hex CHECK (
      color_hex IS NULL OR color_hex ~ '^#[0-9A-Fa-f]{6}$'
    ),
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_categories_system_scope CHECK (
    (is_system = true AND household_id IS NULL AND created_by IS NULL)
    OR (is_system = false AND household_id IS NOT NULL AND created_by IS NOT NULL)
  )
);

-- ----------------------------------------------------------------------------
-- 2.6 accounts
-- Supports bank_account, cash, credit_card, fixed_deposit, mutual_fund, stocks.
-- Private by default (`is_shared_with_household = false`).
-- Composite unique key `UNIQUE (id, household_id)` supports same-household
-- composite foreign key enforcement from `transactions`.
-- ----------------------------------------------------------------------------
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL
    CONSTRAINT chk_accounts_name_len CHECK (
      pg_catalog.char_length(pg_catalog.btrim(name)) BETWEEN 1 AND 100
    ),
  type public.account_type NOT NULL,
  institution_name TEXT
    CONSTRAINT chk_accounts_inst_len CHECK (
      institution_name IS NULL OR pg_catalog.char_length(pg_catalog.btrim(institution_name)) <= 100
    ),
  currency CHAR(3) NOT NULL DEFAULT 'INR'
    CONSTRAINT chk_accounts_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  is_shared_with_household BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT uq_accounts_id_household UNIQUE (id, household_id)
);

-- ----------------------------------------------------------------------------
-- 2.7 account_balances
-- Manual point-in-time balance snapshots in V1, strictly independent of
-- transaction records. Negative balances are permitted (e.g., credit cards,
-- overdrafts).
-- ----------------------------------------------------------------------------
CREATE TABLE public.account_balances (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance NUMERIC(15, 2) NOT NULL,
  as_of_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT
    CONSTRAINT chk_account_balances_notes_len CHECK (
      notes IS NULL OR pg_catalog.char_length(notes) <= 500
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- ----------------------------------------------------------------------------
-- 2.8 transactions
-- Supports income & expense, personal & household scope, and private vs shared
-- visibility.
--   - `category_id` uses `ON DELETE RESTRICT` to encourage archiving categories
--     that have historical transactions rather than deleting them.
--   - `(account_id, household_id)` composite foreign key (`MATCH SIMPLE`)
--     guarantees at the storage layer that any non-null `account_id` belongs
--     to the exact same `household_id`.
-- ----------------------------------------------------------------------------
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  account_id UUID,
  type public.transaction_type NOT NULL,
  scope public.transaction_scope NOT NULL,
  visibility public.transaction_visibility NOT NULL DEFAULT 'private',
  amount NUMERIC(15, 2) NOT NULL
    CONSTRAINT chk_transactions_amount_positive CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR'
    CONSTRAINT chk_transactions_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT
    CONSTRAINT chk_transactions_desc_len CHECK (
      description IS NULL OR pg_catalog.char_length(description) <= 500
    ),
  merchant TEXT
    CONSTRAINT chk_transactions_merchant_len CHECK (
      merchant IS NULL OR pg_catalog.char_length(pg_catalog.btrim(merchant)) <= 120
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT fk_transactions_account_same_household
    FOREIGN KEY (account_id, household_id)
    REFERENCES public.accounts(id, household_id)
    MATCH SIMPLE
    ON DELETE SET NULL (account_id),
  CONSTRAINT chk_transactions_scope_visibility CHECK (
    (scope = 'household' AND visibility = 'shared')
    OR (scope = 'personal' AND visibility IN ('private', 'shared'))
  )
);

-- ============================================================================
-- 3. INDEXES FOR PERFORMANCE, UNIQUENESS & DASHBOARD AGGREGATIONS
-- ============================================================================

CREATE INDEX idx_households_created_by ON public.households(created_by);

CREATE INDEX idx_household_members_user_id ON public.household_members(user_id);
CREATE INDEX idx_household_members_household_id ON public.household_members(household_id);
CREATE INDEX idx_household_members_owners
  ON public.household_members(household_id, user_id)
  WHERE role = 'owner';

CREATE INDEX idx_invitations_household_status ON public.invitations(household_id, status);
CREATE INDEX idx_invitations_inviter_id ON public.invitations(inviter_id);
CREATE INDEX idx_invitations_token_hash ON public.invitations(token_hash) WHERE status = 'pending';

CREATE INDEX idx_categories_household_type ON public.categories(household_id, type);
CREATE INDEX idx_categories_created_by ON public.categories(created_by);

-- Case-insensitive AND whitespace-trimmed uniqueness for global system categories
CREATE UNIQUE INDEX uq_categories_system_name_type
  ON public.categories(pg_catalog.lower(pg_catalog.btrim(name)), type)
  WHERE is_system = true;

-- Case-insensitive AND whitespace-trimmed uniqueness for custom household categories
CREATE UNIQUE INDEX uq_categories_household_name_type
  ON public.categories(household_id, pg_catalog.lower(pg_catalog.btrim(name)), type)
  WHERE household_id IS NOT NULL;

CREATE INDEX idx_accounts_household_owner ON public.accounts(household_id, owner_id);
CREATE INDEX idx_accounts_shared ON public.accounts(household_id, is_shared_with_household);

CREATE INDEX idx_account_balances_account_date
  ON public.account_balances(account_id, as_of_date DESC, created_at DESC);
CREATE INDEX idx_account_balances_recorded_by ON public.account_balances(recorded_by);

-- Composite index covering multi-currency 3-section dashboard rollups & feeds
CREATE INDEX idx_transactions_dashboard
  ON public.transactions(
    household_id,
    transaction_date DESC,
    currency,
    type,
    scope,
    visibility,
    created_by
  );
CREATE INDEX idx_transactions_creator_date
  ON public.transactions(created_by, transaction_date DESC);
CREATE INDEX idx_transactions_category_id ON public.transactions(category_id);
CREATE INDEX idx_transactions_account_id ON public.transactions(account_id);

-- ============================================================================
-- 4. EXPLICIT TABLE & COLUMN PRIVILEGE GRANTS
-- ============================================================================
-- Principle of least privilege:
--   1. Revoke all direct table access from `anon`.
--   2. Restrict `authenticated` table grants to operations permitted by design
--      (e.g., no direct INSERT on `household_members` or `invitations`; no
--      direct UPDATE on `invitations`; `token_hash` excluded from SELECT).

REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.households FROM anon, authenticated;
REVOKE ALL ON public.household_members FROM anon, authenticated;
REVOKE ALL ON public.invitations FROM anon, authenticated;
REVOKE ALL ON public.categories FROM anon, authenticated;
REVOKE ALL ON public.accounts FROM anon, authenticated;
REVOKE ALL ON public.account_balances FROM anon, authenticated;
REVOKE ALL ON public.transactions FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.household_members TO authenticated;

-- Column-level SELECT on `invitations` (explicitly omits `token_hash`)
GRANT SELECT (
  id,
  household_id,
  inviter_id,
  invitee_email,
  role,
  status,
  expires_at,
  accepted_by,
  accepted_at,
  created_at,
  updated_at
) ON public.invitations TO authenticated;
GRANT DELETE ON public.invitations TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;

-- ============================================================================
-- 5. SECURITY DEFINER HELPER FUNCTIONS (EMPTY SEARCH_PATH & ANTI-PROBING)
-- ============================================================================
-- All helper functions run with `SET search_path = ''` and fully-qualified
-- references (`public.*`, `auth.*`, `pg_catalog.*`).
-- Every check is strictly bound to `(SELECT auth.uid())` so callers cannot
-- probe arbitrary users, households, accounts, or categories to leak existence.

-- ----------------------------------------------------------------------------
-- 5.1 Check if current authenticated user is a member of `_household_id`
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_household_member(_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = _household_id
      AND hm.user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_household_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_household_member(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5.2 Check if current authenticated user is an 'owner' of `_household_id`
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_household_owner(_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = _household_id
      AND hm.user_id = (SELECT auth.uid())
      AND hm.role = 'owner'::public.household_role
  );
$$;

REVOKE ALL ON FUNCTION public.is_household_owner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_household_owner(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5.3 Check if current authenticated user shares any household with `_target_user_id`
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shares_household_with(_target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members hm_self
    INNER JOIN public.household_members hm_target
      ON hm_self.household_id = hm_target.household_id
    WHERE hm_self.user_id = (SELECT auth.uid())
      AND hm_target.user_id = _target_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.shares_household_with(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_household_with(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5.4 Check if current authenticated user can view `_account_id` (and its balances)
-- Note: Archived accounts (`is_archived = true`) remain viewable for historical
-- inspection by their owner or fellow household members (if shared), while new
-- transaction linking to archived accounts is blocked by trigger validation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_account(_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accounts a
    INNER JOIN public.household_members hm
      ON hm.household_id = a.household_id
     AND hm.user_id = (SELECT auth.uid())
    WHERE a.id = _account_id
      AND (
        a.owner_id = (SELECT auth.uid())
        OR a.is_shared_with_household = true
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_account(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_account(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5.5 Check if current authenticated user is the owner of `_account_id`
-- and remains an active member of the account's household.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_account_owner(_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accounts a
    INNER JOIN public.household_members hm
      ON hm.household_id = a.household_id
     AND hm.user_id = (SELECT auth.uid())
    WHERE a.id = _account_id
      AND a.owner_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_account_owner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_owner(UUID) TO authenticated;

-- ============================================================================
-- 6. TRIGGERS: SERVER-CONTROLLED TIMESTAMPS, NORMALIZATION, ATOMIC OWNER,
--              TRANSACTION INTEGRITY, IMMUTABILITY & LAST-OWNER PROTECTION
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 6.1 Server-Controlled Creation & Update Timestamps (All 8 Tables)
-- Prevents clients from spoofing `created_at`, `joined_at`, or `updated_at`
-- during INSERT, and preserves immutable `created_at` / `joined_at` while
-- advancing `updated_at` on UPDATE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_server_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  _now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'household_members' THEN
      NEW.joined_at := _now;
      NEW.updated_at := _now;
    ELSE
      NEW.created_at := _now;
      NEW.updated_at := _now;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'household_members' THEN
      NEW.joined_at := OLD.joined_at;
      NEW.updated_at := _now;
    ELSE
      NEW.created_at := OLD.created_at;
      NEW.updated_at := _now;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_server_timestamps() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_profiles_timestamps
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_server_timestamps();

CREATE TRIGGER trg_households_timestamps
  BEFORE INSERT OR UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.enforce_server_timestamps();

CREATE TRIGGER trg_household_members_timestamps
  BEFORE INSERT OR UPDATE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_server_timestamps();

CREATE TRIGGER trg_invitations_timestamps
  BEFORE INSERT OR UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_server_timestamps();

CREATE TRIGGER trg_categories_timestamps
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_server_timestamps();

CREATE TRIGGER trg_accounts_timestamps
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_server_timestamps();

CREATE TRIGGER trg_account_balances_timestamps
  BEFORE INSERT OR UPDATE ON public.account_balances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_server_timestamps();

CREATE TRIGGER trg_transactions_timestamps
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_server_timestamps();

-- ----------------------------------------------------------------------------
-- 6.2 Normalize Category & Household Names (Trim Leading/Trailing Spaces)
-- Prevents duplicate categories or households caused by whitespace padding.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_name_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.name := pg_catalog.btrim(NEW.name);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_name_fields() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_categories_normalize_name
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.normalize_name_fields();

CREATE TRIGGER trg_households_normalize_name
  BEFORE INSERT OR UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.normalize_name_fields();

CREATE TRIGGER trg_accounts_normalize_name
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.normalize_name_fields();

-- ----------------------------------------------------------------------------
-- 6.3 Automatic Profile Creation on Supabase Auth Signup
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'avatar_url'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- 6.4 Atomic Creator-as-Owner Trigger on `households` INSERT
-- Guarantees that creating a household ALWAYS registers `NEW.created_by` as
-- `'owner'` in `public.household_members` inside the same transaction.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_household_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner'::public.household_role)
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET role = 'owner'::public.household_role;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_household_owner() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_households_auto_add_owner
  AFTER INSERT ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_household_owner();

-- ----------------------------------------------------------------------------
-- 6.5 Enforce Immutable Ownership & Scope Columns Across Core Tables
-- Also prevents changing an account's currency once transactions or balances
-- are linked to it, preserving multi-currency integrity.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_immutable_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    IF NEW.household_id IS DISTINCT FROM OLD.household_id THEN
      RAISE EXCEPTION 'Cannot change household_id of an existing transaction.';
    END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Cannot change created_by of an existing transaction.';
    END IF;

  ELSIF TG_TABLE_NAME = 'accounts' THEN
    IF NEW.household_id IS DISTINCT FROM OLD.household_id THEN
      RAISE EXCEPTION 'Cannot change household_id of an existing account.';
    END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'Cannot transfer account owner_id.';
    END IF;
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN
      IF EXISTS (
        SELECT 1 FROM public.transactions t WHERE t.account_id = OLD.id
      ) OR EXISTS (
        SELECT 1 FROM public.account_balances ab WHERE ab.account_id = OLD.id
      ) THEN
        RAISE EXCEPTION 'Cannot change currency of an account that already has recorded balances or linked transactions.';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'account_balances' THEN
    IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
      RAISE EXCEPTION 'Cannot change account_id of an existing balance entry.';
    END IF;
    IF NEW.recorded_by IS DISTINCT FROM OLD.recorded_by THEN
      RAISE EXCEPTION 'Cannot change recorded_by of an existing balance entry.';
    END IF;

  ELSIF TG_TABLE_NAME = 'households' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Cannot change created_by of an existing household.';
    END IF;

  ELSIF TG_TABLE_NAME = 'household_members' THEN
    IF NEW.household_id IS DISTINCT FROM OLD.household_id THEN
      RAISE EXCEPTION 'Cannot move membership to another household_id.';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Cannot reassign membership user_id.';
    END IF;

  ELSIF TG_TABLE_NAME = 'categories' THEN
    IF NEW.household_id IS DISTINCT FROM OLD.household_id THEN
      RAISE EXCEPTION 'Cannot change household_id of an existing category.';
    END IF;
    IF NEW.is_system IS DISTINCT FROM OLD.is_system THEN
      RAISE EXCEPTION 'Cannot change is_system flag on a category.';
    END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Cannot change created_by of an existing category.';
    END IF;
    IF NEW.type IS DISTINCT FROM OLD.type THEN
      IF EXISTS (
        SELECT 1 FROM public.transactions t WHERE t.category_id = OLD.id
      ) THEN
        RAISE EXCEPTION 'Cannot change the transaction type (income/expense) of a category already used by transactions.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_immutable_ownership() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_transactions_immutable_ownership
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_immutable_ownership();

CREATE TRIGGER trg_accounts_immutable_ownership
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_immutable_ownership();

CREATE TRIGGER trg_account_balances_immutable_ownership
  BEFORE UPDATE ON public.account_balances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_immutable_ownership();

CREATE TRIGGER trg_households_immutable_ownership
  BEFORE UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.enforce_immutable_ownership();

CREATE TRIGGER trg_household_members_immutable_ownership
  BEFORE UPDATE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_immutable_ownership();

CREATE TRIGGER trg_categories_immutable_ownership
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_immutable_ownership();

-- ----------------------------------------------------------------------------
-- 6.6 Transaction Link, Archival & Currency Integrity Trigger
-- Validates on every INSERT and UPDATE of `public.transactions`:
--   1. Category exists, belongs to the transaction's household (or is a global
--      system category), and its `type` matches `NEW.type` ('income'/'expense').
--   2. If inserting a new transaction or changing `category_id` to a different
--      category, the target category must NOT be archived (`is_archived = false`).
--      (Editing the description/amount of a historical transaction whose
--      category was later archived remains permitted.)
--   3. If `account_id` is provided:
--      - Must belong to `NEW.household_id`.
--      - Must be accessible to `NEW.created_by` (`owner_id = NEW.created_by`
--        OR `is_shared_with_household = true`).
--      - `NEW.currency` must match the linked account's `currency` so mixed
--        currencies cannot corrupt account-linked transaction records.
--      - If inserting a new transaction or changing `account_id` to a different
--        account, the target account must NOT be archived (`is_archived = false`).
-- ----------------------------------------------------------------------------
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
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_transaction_integrity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_transactions_validate_integrity
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_integrity();

-- ----------------------------------------------------------------------------
-- 6.7 Concurrency-Safe Household Ownership Protection
-- Acquires a row-level `FOR UPDATE` lock on the parent `public.households` row
-- to serialize concurrent owner removals/demotions for the same household.
-- Prevents two owners from simultaneously demoting/deleting themselves in
-- concurrent transactions and leaving the household with zero owners.
-- When the parent household itself is being deleted (`DELETE FROM households`),
-- cascading deletion of `household_members` is permitted cleanly.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_last_household_owner_loss()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _remaining_owners INTEGER;
  _locked_household_id UUID;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner'::public.household_role)
     OR (
       TG_OP = 'UPDATE'
       AND OLD.role = 'owner'::public.household_role
       AND NEW.role <> 'owner'::public.household_role
     )
  THEN
    -- Serialize concurrent ownership changes on the parent household row.
    -- If the parent household row was just deleted in the current transaction
    -- (triggering ON DELETE CASCADE on household_members), this SELECT returns
    -- NOT FOUND and we allow the cascade to complete.
    SELECT h.id
    INTO _locked_household_id
    FROM public.households h
    WHERE h.id = OLD.household_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN OLD;
    END IF;

    -- Lock and count other remaining owners in this household
    SELECT pg_catalog.count(*)
    INTO _remaining_owners
    FROM (
      SELECT hm.id
      FROM public.household_members hm
      WHERE hm.household_id = OLD.household_id
        AND hm.role = 'owner'::public.household_role
        AND hm.id <> OLD.id
      FOR UPDATE
    ) locked_owners;

    IF _remaining_owners = 0 THEN
      RAISE EXCEPTION 'Cannot remove or demote the last owner of a household. Transfer ownership to another member first or delete the household.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_last_household_owner_loss() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_household_members_protect_last_owner
  BEFORE UPDATE OR DELETE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_household_owner_loss();

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.households FORCE ROW LEVEL SECURITY;
ALTER TABLE public.household_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.account_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 7.1 profiles Policies
-- Visible only to self or fellow household members. Contains no email column.
-- ----------------------------------------------------------------------------
CREATE POLICY "profiles_select_own_or_fellow_member"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.shares_household_with(id)
  );

CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- 7.2 households Policies
-- Any authenticated user can create a household (`trg_households_auto_add_owner`
-- atomically adds them as `owner`). Only owners can update or delete.
-- ----------------------------------------------------------------------------
CREATE POLICY "households_select_member"
  ON public.households
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(id));

CREATE POLICY "households_insert_authenticated"
  ON public.households
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "households_update_owner"
  ON public.households
  FOR UPDATE
  TO authenticated
  USING (public.is_household_owner(id))
  WITH CHECK (public.is_household_owner(id));

CREATE POLICY "households_delete_owner"
  ON public.households
  FOR DELETE
  TO authenticated
  USING (public.is_household_owner(id));

-- ----------------------------------------------------------------------------
-- 7.3 household_members Policies
-- Direct client INSERT is disallowed (handled by `trg_households_auto_add_owner`
-- and `accept_household_invitation`).
-- Only household owners can update roles or remove members; members can leave
-- (`user_id = auth.uid()`), protected by `trg_household_members_protect_last_owner`.
-- ----------------------------------------------------------------------------
CREATE POLICY "household_members_select_fellow_members"
  ON public.household_members
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY "household_members_update_owner"
  ON public.household_members
  FOR UPDATE
  TO authenticated
  USING (public.is_household_owner(household_id))
  WITH CHECK (public.is_household_owner(household_id));

CREATE POLICY "household_members_delete_owner_or_self"
  ON public.household_members
  FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_household_owner(household_id)
  );

-- ----------------------------------------------------------------------------
-- 7.4 invitations Policies
-- Only household owners can create, view, revoke, or delete invitations.
-- Direct client INSERT and UPDATE are disabled at both the GRANT and RLS levels;
-- creation uses `create_household_invitation`, revocation uses
-- `revoke_household_invitation`, and acceptance uses `accept_household_invitation`.
-- `token_hash` is revoked at the column-grant level from `authenticated`.
-- ----------------------------------------------------------------------------
CREATE POLICY "invitations_select_owner_only"
  ON public.invitations
  FOR SELECT
  TO authenticated
  USING (public.is_household_owner(household_id));

CREATE POLICY "invitations_delete_owner_only"
  ON public.invitations
  FOR DELETE
  TO authenticated
  USING (public.is_household_owner(household_id));

-- ----------------------------------------------------------------------------
-- 7.5 categories Policies
-- - All authenticated users can read global system categories (`is_system = true`).
-- - Household members can read and create custom categories for their household.
-- - ONLY the category creator (`created_by = auth.uid()`) OR a household owner
--   (`public.is_household_owner(household_id)`) can UPDATE (including archiving)
--   or DELETE a custom household category.
-- - System categories can never be modified or deleted by regular users.
-- ----------------------------------------------------------------------------
CREATE POLICY "categories_select_system_or_household"
  ON public.categories
  FOR SELECT
  TO authenticated
  USING (
    is_system = true
    OR (household_id IS NOT NULL AND public.is_household_member(household_id))
  );

CREATE POLICY "categories_insert_household_member"
  ON public.categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_system = false
    AND household_id IS NOT NULL
    AND public.is_household_member(household_id)
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY "categories_update_creator_or_owner"
  ON public.categories
  FOR UPDATE
  TO authenticated
  USING (
    is_system = false
    AND household_id IS NOT NULL
    AND public.is_household_member(household_id)
    AND (
      created_by = (SELECT auth.uid())
      OR public.is_household_owner(household_id)
    )
  )
  WITH CHECK (
    is_system = false
    AND household_id IS NOT NULL
    AND public.is_household_member(household_id)
    AND (
      created_by = (SELECT auth.uid())
      OR public.is_household_owner(household_id)
    )
  );

CREATE POLICY "categories_delete_creator_or_owner"
  ON public.categories
  FOR DELETE
  TO authenticated
  USING (
    is_system = false
    AND household_id IS NOT NULL
    AND public.is_household_member(household_id)
    AND (
      created_by = (SELECT auth.uid())
      OR public.is_household_owner(household_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 7.6 accounts Policies
-- Private by default (`is_shared_with_household = false`).
-- Other household members can view an account ONLY when `is_shared_with_household = true`.
-- Archived accounts remain viewable by authorized users for historical records,
-- while `trg_transactions_validate_integrity` prevents linking archived accounts
-- to new transactions.
-- Only the account owner can create, update, share/unshare, archive, or delete.
-- ----------------------------------------------------------------------------
CREATE POLICY "accounts_select_owner_or_shared_household_member"
  ON public.accounts
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(household_id)
    AND (
      owner_id = (SELECT auth.uid())
      OR is_shared_with_household = true
    )
  );

CREATE POLICY "accounts_insert_owner_only"
  ON public.accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND public.is_household_member(household_id)
  );

CREATE POLICY "accounts_update_owner_only"
  ON public.accounts
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND public.is_household_member(household_id)
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND public.is_household_member(household_id)
  );

CREATE POLICY "accounts_delete_owner_only"
  ON public.accounts
  FOR DELETE
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND public.is_household_member(household_id)
  );

-- ----------------------------------------------------------------------------
-- 7.7 account_balances Policies
-- Balance visibility strictly mirrors the parent account's sharing status via
-- `public.can_view_account(account_id)`.
-- Only the account owner (`public.is_account_owner(account_id)`) can insert,
-- update, or delete balance snapshots, and `recorded_by` must match `auth.uid()`.
-- ----------------------------------------------------------------------------
CREATE POLICY "account_balances_select_if_account_visible"
  ON public.account_balances
  FOR SELECT
  TO authenticated
  USING (public.can_view_account(account_id));

CREATE POLICY "account_balances_insert_account_owner"
  ON public.account_balances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    recorded_by = (SELECT auth.uid())
    AND public.is_account_owner(account_id)
  );

CREATE POLICY "account_balances_update_account_owner"
  ON public.account_balances
  FOR UPDATE
  TO authenticated
  USING (
    recorded_by = (SELECT auth.uid())
    AND public.is_account_owner(account_id)
  )
  WITH CHECK (
    recorded_by = (SELECT auth.uid())
    AND public.is_account_owner(account_id)
  );

CREATE POLICY "account_balances_delete_account_owner"
  ON public.account_balances
  FOR DELETE
  TO authenticated
  USING (
    recorded_by = (SELECT auth.uid())
    AND public.is_account_owner(account_id)
  );

-- ----------------------------------------------------------------------------
-- 7.8 transactions Policies
-- Visibility:
--   - Creator can view all of their own transactions in the household.
--   - Other household members can view `scope = 'household'` transactions and
--     `scope = 'personal' AND visibility = 'shared'` transactions.
--   - Private personal transactions (`scope = 'personal' AND visibility = 'private'`)
--     are NEVER visible to other household members.
-- Mutation:
--   - Only the transaction creator (`created_by = auth.uid()`) who is an active
--     member of `household_id` can INSERT, UPDATE, or DELETE.
--   - Cross-entity category, account, archival, and currency rules are enforced
--     by `trg_transactions_validate_integrity` on every INSERT and UPDATE.
-- ----------------------------------------------------------------------------
CREATE POLICY "transactions_select_creator_or_shared_with_household"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(household_id)
    AND (
      created_by = (SELECT auth.uid())
      OR scope = 'household'::public.transaction_scope
      OR (
        scope = 'personal'::public.transaction_scope
        AND visibility = 'shared'::public.transaction_visibility
      )
    )
  );

CREATE POLICY "transactions_insert_creator_only"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.is_household_member(household_id)
  );

CREATE POLICY "transactions_update_creator_only"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND public.is_household_member(household_id)
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.is_household_member(household_id)
  );

CREATE POLICY "transactions_delete_creator_only"
  ON public.transactions
  FOR DELETE
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND public.is_household_member(household_id)
  );

-- ============================================================================
-- 8. SECURE WORKFLOW & DASHBOARD CALCULATION RPC FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 8.1 Atomic Household Creation RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_household_with_owner(
  _name TEXT,
  _base_currency CHAR(3) DEFAULT 'INR'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _new_household_id UUID;
  _current_user_id UUID := (SELECT auth.uid());
BEGIN
  IF _current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a household.';
  END IF;

  INSERT INTO public.households (name, base_currency, created_by)
  VALUES (pg_catalog.btrim(_name), _base_currency, _current_user_id)
  RETURNING id INTO _new_household_id;

  -- `trg_households_auto_add_owner` automatically inserts the owner row into
  -- `public.household_members` within this same transaction.
  RETURN _new_household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_household_with_owner(TEXT, CHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household_with_owner(TEXT, CHAR) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8.2 Concurrency-Safe Household Ownership Transfer RPC
-- Acquires a `FOR UPDATE` lock on the parent `households` row, verifies caller
-- ownership, promotes `_new_owner_user_id` to `'owner'` FIRST, and then
-- optionally demotes the caller to `'member'`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_household_ownership(
  _household_id UUID,
  _new_owner_user_id UUID,
  _demote_self BOOLEAN DEFAULT true
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _current_user_id UUID := (SELECT auth.uid());
  _locked_household_id UUID;
BEGIN
  IF _current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF _household_id IS NULL OR _new_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Both _household_id and _new_owner_user_id are required.';
  END IF;

  -- Serialize ownership changes on this household
  SELECT h.id
  INTO _locked_household_id
  FROM public.households h
  WHERE h.id = _household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found.';
  END IF;

  IF NOT public.is_household_owner(_household_id) THEN
    RAISE EXCEPTION 'Only an existing household owner can transfer ownership.';
  END IF;

  IF _new_owner_user_id = _current_user_id THEN
    RAISE EXCEPTION 'Target user is already the current owner.';
  END IF;

  -- 1. Promote target member to owner first
  UPDATE public.household_members
  SET role = 'owner'::public.household_role
  WHERE household_id = _household_id
    AND user_id = _new_owner_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user must be an existing member of the household before transferring ownership.';
  END IF;

  -- 2. Optionally demote caller to 'member' now that another owner exists
  IF COALESCE(_demote_self, true) THEN
    UPDATE public.household_members
    SET role = 'member'::public.household_role
    WHERE household_id = _household_id
      AND user_id = _current_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_household_ownership(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_household_ownership(UUID, UUID, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8.3 Secure Invitation Creation RPC (Owner-Only)
-- Only household owners (`public.is_household_owner(_household_id)`) can create
-- invitations (both 'member' and 'owner' roles). Regular members cannot invite.
-- Normalizes optional `_invitee_email` with `lower(btrim(...))`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_household_invitation(
  _household_id UUID,
  _invitee_email TEXT DEFAULT NULL,
  _role public.household_role DEFAULT 'member',
  _expires_in_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  invitation_id UUID,
  raw_token TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _current_user_id UUID := (SELECT auth.uid());
  _generated_token TEXT;
  _token_hash TEXT;
  _normalized_email TEXT;
  _new_id UUID;
  _expiry TIMESTAMPTZ;
BEGIN
  IF _current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create an invitation.';
  END IF;

  -- Strict requirement: ONLY household owners can create invitations
  IF NOT public.is_household_owner(_household_id) THEN
    RAISE EXCEPTION 'Only household owners can create invitations.';
  END IF;

  IF _expires_in_days IS NULL OR _expires_in_days < 1 OR _expires_in_days > 30 THEN
    RAISE EXCEPTION 'Invitation expiry must be between 1 and 30 days.';
  END IF;

  _normalized_email := NULLIF(pg_catalog.lower(pg_catalog.btrim(_invitee_email)), '');

  -- Generate 32 cryptographic random bytes (64 hex chars) as the one-time raw token
  _generated_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  _token_hash := pg_catalog.encode(extensions.digest(_generated_token, 'sha256'), 'hex');
  _expiry := pg_catalog.now() + pg_catalog.make_interval(days => _expires_in_days);

  INSERT INTO public.invitations (
    household_id,
    inviter_id,
    invitee_email,
    role,
    token_hash,
    status,
    expires_at
  )
  VALUES (
    _household_id,
    _current_user_id,
    _normalized_email,
    COALESCE(_role, 'member'::public.household_role),
    _token_hash,
    'pending'::public.invitation_status,
    _expiry
  )
  RETURNING id INTO _new_id;

  RETURN QUERY SELECT _new_id, _generated_token, _expiry;
END;
$$;

REVOKE ALL ON FUNCTION public.create_household_invitation(UUID, TEXT, public.household_role, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household_invitation(UUID, TEXT, public.household_role, INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8.4 Secure Invitation Revocation RPC (Owner-Only)
-- Replaces direct client UPDATE on `public.invitations` so users can never
-- tamper with `role`, `invitee_email`, `expires_at`, or `accepted_by`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_household_invitation(_invitation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _current_user_id UUID := (SELECT auth.uid());
  _invite public.invitations%ROWTYPE;
BEGIN
  IF _current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to revoke an invitation.';
  END IF;

  SELECT *
  INTO _invite
  FROM public.invitations i
  WHERE i.id = _invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found.';
  END IF;

  IF NOT public.is_household_owner(_invite.household_id) THEN
    RAISE EXCEPTION 'Only household owners can revoke invitations.';
  END IF;

  IF _invite.status <> 'pending'::public.invitation_status THEN
    RAISE EXCEPTION 'Only pending invitations can be revoked (current status: %).', _invite.status;
  END IF;

  UPDATE public.invitations
  SET status = 'revoked'::public.invitation_status
  WHERE id = _invite.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_household_invitation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_household_invitation(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8.5 Secure Invitation Acceptance Workflow RPC (Non-Rollback Expiry Persistence)
-- Fixes the PostgreSQL transaction-rollback bug on expired invitations:
--   - Returns a structured outcome (`success`, `status_code`, `message`, `household_id`)
--     instead of raising an exception after marking an invitation `'expired'`,
--     ensuring the `UPDATE public.invitations SET status = 'expired'` commits
--     durably to disk.
--   - Uses `SELECT ... FOR UPDATE` on the invitation row so concurrent
--     acceptance attempts are serialized and cannot accept the same token twice.
--   - When `invitee_email` is specified, verifies that `auth.users.email`
--     matches case-insensitively AND that `auth.users.email_confirmed_at IS NOT NULL`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_household_invitation(_raw_token TEXT)
RETURNS TABLE (
  success BOOLEAN,
  status_code TEXT,
  message TEXT,
  household_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _current_user_id UUID := (SELECT auth.uid());
  _current_user_email TEXT;
  _email_confirmed_at TIMESTAMPTZ;
  _token_hash TEXT;
  _invite public.invitations%ROWTYPE;
BEGIN
  IF _current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to accept an invitation.';
  END IF;

  IF _raw_token IS NULL OR pg_catalog.char_length(pg_catalog.btrim(_raw_token)) < 32 THEN
    RETURN QUERY SELECT
      false,
      'INVALID_TOKEN'::TEXT,
      'Invalid invitation token format.'::TEXT,
      NULL::UUID;
    RETURN;
  END IF;

  _token_hash := pg_catalog.encode(extensions.digest(pg_catalog.btrim(_raw_token), 'sha256'), 'hex');

  -- Lock the invitation row to prevent concurrent double-acceptance
  SELECT *
  INTO _invite
  FROM public.invitations i
  WHERE i.token_hash = _token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'INVALID_TOKEN'::TEXT,
      'Invalid invitation token.'::TEXT,
      NULL::UUID;
    RETURN;
  END IF;

  -- Check if already expired while still marked 'pending' -> persist 'expired' without raising exception
  IF _invite.status = 'pending'::public.invitation_status AND _invite.expires_at <= pg_catalog.now() THEN
    UPDATE public.invitations
    SET status = 'expired'::public.invitation_status
    WHERE id = _invite.id;

    RETURN QUERY SELECT
      false,
      'EXPIRED'::TEXT,
      'This invitation has expired.'::TEXT,
      NULL::UUID;
    RETURN;
  END IF;

  IF _invite.status <> 'pending'::public.invitation_status THEN
    RETURN QUERY SELECT
      false,
      'NOT_PENDING'::TEXT,
      pg_catalog.format('Invitation is no longer active (status: %s).', _invite.status),
      NULL::UUID;
    RETURN;
  END IF;

  -- If the invitation is restricted to a specific email address, require a
  -- matching AND verified email address on `auth.users`.
  IF _invite.invitee_email IS NOT NULL THEN
    SELECT au.email, au.email_confirmed_at
    INTO _current_user_email, _email_confirmed_at
    FROM auth.users au
    WHERE au.id = _current_user_id;

    IF pg_catalog.lower(pg_catalog.btrim(COALESCE(_current_user_email, ''))) <> pg_catalog.lower(pg_catalog.btrim(_invite.invitee_email)) THEN
      RETURN QUERY SELECT
        false,
        'EMAIL_MISMATCH'::TEXT,
        'This invitation was issued for a different email address.'::TEXT,
        NULL::UUID;
      RETURN;
    END IF;

    IF _email_confirmed_at IS NULL THEN
      RETURN QUERY SELECT
        false,
        'EMAIL_UNVERIFIED'::TEXT,
        'Please verify your email address before accepting this invitation.'::TEXT,
        NULL::UUID;
      RETURN;
    END IF;
  END IF;

  -- Check if user is already a member of the target household
  IF EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = _invite.household_id
      AND hm.user_id = _current_user_id
  ) THEN
    RETURN QUERY SELECT
      false,
      'ALREADY_MEMBER'::TEXT,
      'You are already a member of this household.'::TEXT,
      _invite.household_id;
    RETURN;
  END IF;

  -- Insert membership and mark invitation accepted atomically
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (_invite.household_id, _current_user_id, _invite.role);

  UPDATE public.invitations
  SET status = 'accepted'::public.invitation_status,
      accepted_by = _current_user_id,
      accepted_at = pg_catalog.now()
  WHERE id = _invite.id;

  RETURN QUERY SELECT
    true,
    'ACCEPTED'::TEXT,
    'Successfully joined the household.'::TEXT,
    _invite.household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_household_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_household_invitation(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8.6 Archive Category Helper RPC
-- Safely archives or unarchives a custom household category (`is_archived`),
-- preferred over hard-deleting categories that are already referenced by
-- historical transactions.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_category_archived(
  _category_id UUID,
  _is_archived BOOLEAN DEFAULT true
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  UPDATE public.categories
  SET is_archived = COALESCE(_is_archived, true)
  WHERE id = _category_id
    AND is_system = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category not found or you do not have permission to modify it.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_category_archived(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_category_archived(UUID, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8.7 Refined Multi-Currency 3-Section Dashboard Summary RPC
-- Runs as `SECURITY INVOKER` with `SET search_path = ''` so RLS policies on
-- `public.transactions` are strictly enforced at the database engine level.
--
-- Features:
--   1. Validates both `_start_date` and `_end_date` are non-null and
--      `_end_date >= _start_date`.
--   2. Validates caller is an active member of `_household_id`.
--   3. Groups strictly by `currency` so amounts from different currencies are
--      NEVER silently added together. Always returns at least one row for the
--      household's `base_currency` even when there are 0 transactions.
--   4. Returns the 3 distinct dashboard sections + combined personal expenditure:
--      - Section A (My Personal Finances):
--        `my_personal_income`, `my_personal_expense`
--        (Only caller's `scope = 'personal'` transactions, both private & shared;
--        excludes household transactions.)
--      - Section B (My Household Contribution):
--        `my_household_contribution_income`, `my_household_contribution_expense`
--        (Only caller's `scope = 'household'` transactions.)
--      - Combined Personal Expenditure:
--        `my_total_expenditure` = `my_personal_expense + my_household_contribution_expense`
--        (plus `my_total_income` = `my_personal_income + my_household_contribution_income`)
--      - Section C (Overall Household Finances):
--        `household_total_income`, `household_total_expense`
--        (All members' `scope = 'household'` transactions + all members'
--        `scope = 'personal' AND visibility = 'shared'` transactions;
--        strictly excludes all private personal transactions.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  _household_id UUID,
  _start_date DATE,
  _end_date DATE
)
RETURNS TABLE (
  currency CHAR(3),
  my_personal_income NUMERIC(15, 2),
  my_personal_expense NUMERIC(15, 2),
  my_household_contribution_income NUMERIC(15, 2),
  my_household_contribution_expense NUMERIC(15, 2),
  my_total_income NUMERIC(15, 2),
  my_total_expenditure NUMERIC(15, 2),
  household_total_income NUMERIC(15, 2),
  household_total_expense NUMERIC(15, 2)
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  _current_user_id UUID := (SELECT auth.uid());
  _base_currency CHAR(3);
BEGIN
  IF _current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF _household_id IS NULL THEN
    RAISE EXCEPTION 'Household ID is required.';
  END IF;

  IF _start_date IS NULL OR _end_date IS NULL THEN
    RAISE EXCEPTION 'Both _start_date and _end_date must be provided.';
  END IF;

  IF _end_date < _start_date THEN
    RAISE EXCEPTION 'Invalid date range: _end_date (%) cannot precede _start_date (%).', _end_date, _start_date;
  END IF;

  IF NOT public.is_household_member(_household_id) THEN
    RAISE EXCEPTION 'Access denied: user is not a member of the requested household.';
  END IF;

  SELECT h.base_currency
  INTO _base_currency
  FROM public.households h
  WHERE h.id = _household_id;

  RETURN QUERY
  WITH visible_transactions AS (
    SELECT
      t.currency,
      t.type,
      t.scope,
      t.visibility,
      t.created_by,
      t.amount
    FROM public.transactions t
    WHERE t.household_id = _household_id
      AND t.transaction_date BETWEEN _start_date AND _end_date
  ),
  currencies AS (
    SELECT _base_currency AS currency
    WHERE _base_currency IS NOT NULL
    UNION
    SELECT DISTINCT vt.currency
    FROM visible_transactions vt
  )
  SELECT
    c.currency::CHAR(3) AS currency,

    -- Section A: My Personal Finances (caller's personal private + personal shared; excludes household)
    COALESCE(pg_catalog.sum(vt.amount) FILTER (
      WHERE vt.created_by = _current_user_id
        AND vt.scope = 'personal'::public.transaction_scope
        AND vt.type = 'income'::public.transaction_type
    ), 0)::NUMERIC(15, 2) AS my_personal_income,

    COALESCE(pg_catalog.sum(vt.amount) FILTER (
      WHERE vt.created_by = _current_user_id
        AND vt.scope = 'personal'::public.transaction_scope
        AND vt.type = 'expense'::public.transaction_type
    ), 0)::NUMERIC(15, 2) AS my_personal_expense,

    -- Section B: My Household Contribution (caller's household transactions only)
    COALESCE(pg_catalog.sum(vt.amount) FILTER (
      WHERE vt.created_by = _current_user_id
        AND vt.scope = 'household'::public.transaction_scope
        AND vt.type = 'income'::public.transaction_type
    ), 0)::NUMERIC(15, 2) AS my_household_contribution_income,

    COALESCE(pg_catalog.sum(vt.amount) FILTER (
      WHERE vt.created_by = _current_user_id
        AND vt.scope = 'household'::public.transaction_scope
        AND vt.type = 'expense'::public.transaction_type
    ), 0)::NUMERIC(15, 2) AS my_household_contribution_expense,

    -- Derived Combined Totals for Caller (Personal + My Household Contribution)
    COALESCE(pg_catalog.sum(vt.amount) FILTER (
      WHERE vt.created_by = _current_user_id
        AND vt.scope IN ('personal'::public.transaction_scope, 'household'::public.transaction_scope)
        AND vt.type = 'income'::public.transaction_type
    ), 0)::NUMERIC(15, 2) AS my_total_income,

    COALESCE(pg_catalog.sum(vt.amount) FILTER (
      WHERE vt.created_by = _current_user_id
        AND vt.scope IN ('personal'::public.transaction_scope, 'household'::public.transaction_scope)
        AND vt.type = 'expense'::public.transaction_type
    ), 0)::NUMERIC(15, 2) AS my_total_expenditure,

    -- Section C: Overall Household Finances (all household + all shared personal; never private personal)
    COALESCE(pg_catalog.sum(vt.amount) FILTER (
      WHERE vt.type = 'income'::public.transaction_type
        AND (
          vt.scope = 'household'::public.transaction_scope
          OR (
            vt.scope = 'personal'::public.transaction_scope
            AND vt.visibility = 'shared'::public.transaction_visibility
          )
        )
    ), 0)::NUMERIC(15, 2) AS household_total_income,

    COALESCE(pg_catalog.sum(vt.amount) FILTER (
      WHERE vt.type = 'expense'::public.transaction_type
        AND (
          vt.scope = 'household'::public.transaction_scope
          OR (
            vt.scope = 'personal'::public.transaction_scope
            AND vt.visibility = 'shared'::public.transaction_visibility
          )
        )
    ), 0)::NUMERIC(15, 2) AS household_total_expense

  FROM currencies c
  LEFT JOIN visible_transactions vt
    ON vt.currency = c.currency
  GROUP BY c.currency
  ORDER BY (c.currency = _base_currency) DESC, c.currency ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_summary(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(UUID, DATE, DATE) TO authenticated;
