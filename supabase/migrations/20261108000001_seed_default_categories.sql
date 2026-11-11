-- ============================================================================
-- Migration: 20261108000001_seed_default_categories.sql
-- Description: Idempotently seeds global system default categories
--              (`is_system = true`, `household_id IS NULL`, `created_by IS NULL`)
--              for income and expenses.
--              Matches the functional unique index `uq_categories_system_name_type`
--              on `(pg_catalog.lower(pg_catalog.btrim(name)), type) WHERE is_system = true`
--              so running this migration multiple times never creates duplicates.
-- ============================================================================

INSERT INTO public.categories (
  household_id,
  name,
  type,
  icon,
  color_hex,
  is_system,
  is_archived,
  created_by
)
VALUES
  -- Expense Categories
  (NULL, 'Groceries & Dining', 'expense', 'shopping-cart', '#16A34A', true, false, NULL),
  (NULL, 'Housing & Rent', 'expense', 'home', '#0F766E', true, false, NULL),
  (NULL, 'Utilities & Bills', 'expense', 'zap', '#0284C7', true, false, NULL),
  (NULL, 'Transportation', 'expense', 'car', '#4F46E5', true, false, NULL),
  (NULL, 'Healthcare & Medical', 'expense', 'heart', '#DC2626', true, false, NULL),
  (NULL, 'Shopping & Lifestyle', 'expense', 'shopping-bag', '#9333EA', true, false, NULL),
  (NULL, 'Entertainment & Leisure', 'expense', 'film', '#D97706', true, false, NULL),
  (NULL, 'Education & Family', 'expense', 'book-open', '#2563EB', true, false, NULL),
  -- Note: Flagged for product review in deliverables: 'Investments & Savings'
  -- is retained as an 'expense' cash-outflow category unless you prefer a dedicated
  -- transfer/savings treatment, so expenditure reporting is not silently altered.
  (NULL, 'Investments & Savings', 'expense', 'trending-up', '#059669', true, false, NULL),
  (NULL, 'Miscellaneous Expense', 'expense', 'more-horizontal', '#64748B', true, false, NULL),

  -- Income Categories
  (NULL, 'Salary & Wages', 'income', 'briefcase', '#16A34A', true, false, NULL),
  (NULL, 'Business & Freelance', 'income', 'award', '#0F766E', true, false, NULL),
  (NULL, 'Investment Returns & Dividends', 'income', 'bar-chart-2', '#4F46E5', true, false, NULL),
  (NULL, 'Rental Income', 'income', 'key', '#D97706', true, false, NULL),
  -- Note: Flagged for product review in deliverables: 'Gifts & Refunds'
  -- mixes true income (gifts) with expense reimbursements (refunds).
  (NULL, 'Gifts & Refunds', 'income', 'gift', '#9333EA', true, false, NULL),
  (NULL, 'Other Income', 'income', 'plus-circle', '#64748B', true, false, NULL)
ON CONFLICT (pg_catalog.lower(pg_catalog.btrim(name)), type) WHERE is_system = true
DO UPDATE SET
  icon = EXCLUDED.icon,
  color_hex = EXCLUDED.color_hex,
  is_archived = false;
