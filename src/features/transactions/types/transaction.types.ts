import {
  AccountRow,
  AccountType,
  CategoryRow,
  DashboardSummaryResult,
  HouseholdRole,
  HouseholdRow,
  PaymentMethodType,
  TransactionRow,
  TransactionScope,
  TransactionType,
  TransactionVisibility,
} from '@/types/database';

export interface ActiveHouseholdContext {
  userId: string;
  household: HouseholdRow;
  role: HouseholdRole;
}

export interface CreateCustomCategoryInput {
  householdId: string;
  name: string;
  type: TransactionType;
  icon?: string | null;
  colorHex?: string | null;
}

export interface CreateAccountInput {
  householdId: string;
  name: string;
  type: AccountType;
  institutionName?: string | null;
  currency?: string;
  isSharedWithHousehold?: boolean;
}

export interface CreateTransactionInput {
  householdId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  scope: TransactionScope;
  visibility: TransactionVisibility;
  categoryId: string;
  accountId: string | null;
  paymentMethod: PaymentMethodType;
  transactionDate: string;
  description?: string | null;
}

export interface UpdateTransactionInput {
  transactionId: string;
  householdId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  scope: TransactionScope;
  visibility: TransactionVisibility;
  categoryId: string;
  accountId: string | null;
  paymentMethod: PaymentMethodType;
  transactionDate: string;
  description?: string | null;
}

export type TransactionScopeFilter = 'all' | 'personal' | 'household';

export interface TransactionWithRelations extends TransactionRow {
  category?: Pick<CategoryRow, 'id' | 'name' | 'type' | 'icon' | 'color_hex'> | null;
  account?: Pick<AccountRow, 'id' | 'name' | 'type' | 'is_shared_with_household'> | null;
}

export interface HouseholdDashboardData {
  context: ActiveHouseholdContext;
  summaries: DashboardSummaryResult[];
  recentTransactions: TransactionWithRelations[];
}

/**
 * Payment methods are distinct from financial accounts.
 * Specifically, UPI is a payment method (which may optionally link to a Bank Account),
 * NEVER a standalone account type.
 */
export interface PaymentMethodOption {
  id: PaymentMethodType;
  label: string;
  subtitle: string;
  requiresAccountType?: AccountType[];
  allowsOptionalBankLink?: boolean;
}

export const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  {
    id: 'cash',
    label: 'Cash',
    subtitle: 'Physical cash',
    requiresAccountType: ['cash'],
  },
  {
    id: 'credit_card',
    label: 'Credit Card',
    subtitle: 'Card swipe or online',
    requiresAccountType: ['credit_card'],
  },
  {
    id: 'upi',
    label: 'UPI',
    subtitle: 'Payment method (optional bank link)',
    requiresAccountType: ['bank_account'],
    allowsOptionalBankLink: true,
  },
  {
    id: 'bank_transfer',
    label: 'Bank / Debit',
    subtitle: 'NEFT, IMPS, or Debit Card',
    requiresAccountType: ['bank_account'],
  },
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank_account: 'Bank Account',
  cash: 'Cash',
  credit_card: 'Credit Card',
  fixed_deposit: 'Fixed Deposit',
  mutual_fund: 'Mutual Fund',
  stocks: 'Stocks / Equity',
};

export const CATEGORY_ICON_PRESETS: { id: string; label: string; glyph: string }[] = [
  { id: 'shopping-cart', label: 'Groceries', glyph: '🛒' },
  { id: 'home', label: 'Home', glyph: '🏠' },
  { id: 'zap', label: 'Utilities', glyph: '⚡' },
  { id: 'car', label: 'Transport', glyph: '🚗' },
  { id: 'heart', label: 'Health', glyph: '❤️' },
  { id: 'shopping-bag', label: 'Shopping', glyph: '🛍️' },
  { id: 'film', label: 'Leisure', glyph: '🎬' },
  { id: 'book-open', label: 'Education', glyph: '📚' },
  { id: 'trending-up', label: 'Savings', glyph: '📈' },
  { id: 'briefcase', label: 'Work', glyph: '💼' },
  { id: 'award', label: 'Freelance', glyph: '🏆' },
  { id: 'bar-chart-2', label: 'Returns', glyph: '📊' },
  { id: 'gift', label: 'Gift', glyph: '🎁' },
  { id: 'tag', label: 'General', glyph: '🏷️' },
];

export interface DefaultCategorySeed {
  id: string;
  name: string;
  type: TransactionType;
  icon: string;
  color_hex: string;
}

export const BUILTIN_DEFAULT_CATEGORIES: DefaultCategorySeed[] = [
  // 3 Default Expense Categories
  {
    id: 'builtin-expense-groceries',
    name: 'Groceries & Dining',
    type: 'expense',
    icon: 'shopping-cart',
    color_hex: '#16A34A',
  },
  {
    id: 'builtin-expense-housing',
    name: 'Housing & Rent',
    type: 'expense',
    icon: 'home',
    color_hex: '#0F766E',
  },
  {
    id: 'builtin-expense-utilities',
    name: 'Utilities & Bills',
    type: 'expense',
    icon: 'zap',
    color_hex: '#0284C7',
  },
  // 3 Default Income Categories
  {
    id: 'builtin-income-salary',
    name: 'Salary & Wages',
    type: 'income',
    icon: 'briefcase',
    color_hex: '#16A34A',
  },
  {
    id: 'builtin-income-business',
    name: 'Business & Freelance',
    type: 'income',
    icon: 'award',
    color_hex: '#0F766E',
  },
  {
    id: 'builtin-income-returns',
    name: 'Investment Returns & Dividends',
    type: 'income',
    icon: 'bar-chart-2',
    color_hex: '#4F46E5',
  },
];

export interface UserContributionItem {
  userId: string;
  name: string;
  isCurrentUser: boolean;
  amount: number;
  percentage: number;
  color: string;
}

export interface HouseholdExpenditureAnalytics {
  totalExpenditure: number;
  contributions: UserContributionItem[];
  topContributor: UserContributionItem | null;
  isMultiMember: boolean;
  memberCount: number;
  currency: string;
}
