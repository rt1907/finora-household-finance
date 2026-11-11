import type {
  AccountRow,
  CategoryRow,
  PaymentMethodType,
  TransactionScope,
  TransactionType,
  TransactionVisibility,
} from '@/types/database';
import { isValidPastOrTodayIsoDate } from '@/utils/date';

export interface ValidateTransactionDraftInput {
  amountText: string;
  type: TransactionType;
  scope: TransactionScope;
  shareWithHousehold: boolean;
  selectedCategory: CategoryRow | null;
  selectedAccount: AccountRow | null;
  paymentMethod: PaymentMethodType;
  transactionDate: string;
  description: string;
  householdId: string | null;
  currentUserId: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errorMessage: string | null;
  parsedAmount: number;
  resolvedVisibility: TransactionVisibility;
}

/**
 * Pure business-rule validator for Add Transaction (V1).
 * Note: Supabase PostgreSQL RLS & triggers remain the authoritative enforcement
 * layer; this validator provides immediate, clear feedback before network round-trips.
 */
export function resolveTransactionVisibility(
  scope: TransactionScope,
  shareWithHousehold: boolean
): TransactionVisibility {
  if (scope === 'household') {
    return 'shared';
  }
  return shareWithHousehold ? 'shared' : 'private';
}

export function validateTransactionDraft(
  draft: ValidateTransactionDraftInput
): ValidationResult {
  const resolvedVisibility = resolveTransactionVisibility(
    draft.scope,
    draft.shareWithHousehold
  );

  if (!draft.currentUserId) {
    return {
      valid: false,
      errorMessage: 'Please sign in to record a transaction.',
      parsedAmount: 0,
      resolvedVisibility,
    };
  }

  if (!draft.householdId) {
    return {
      valid: false,
      errorMessage: 'No active household found. Please create or join a household first.',
      parsedAmount: 0,
      resolvedVisibility,
    };
  }

  // 1. Validate Transaction Type
  if (draft.type !== 'expense' && draft.type !== 'income') {
    return {
      valid: false,
      errorMessage: 'Transaction type must be either Expense or Income.',
      parsedAmount: 0,
      resolvedVisibility,
    };
  }

  // 2. Validate Amount (> 0, finite, max 2 decimal places)
  const sanitizedAmount = draft.amountText.trim().replace(/,/g, '');
  if (!sanitizedAmount || !/^\d+(\.\d{1,2})?$/.test(sanitizedAmount)) {
    return {
      valid: false,
      errorMessage: 'Please enter a valid amount greater than zero (up to 2 decimal places).',
      parsedAmount: 0,
      resolvedVisibility,
    };
  }

  const parsedAmount = Number(sanitizedAmount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return {
      valid: false,
      errorMessage: 'Amount is mandatory and must be greater than zero.',
      parsedAmount: 0,
      resolvedVisibility,
    };
  }

  // 3. Validate Scope & Privacy Invariant
  if (draft.scope !== 'personal' && draft.scope !== 'household') {
    return {
      valid: false,
      errorMessage: 'Invalid transaction scope.',
      parsedAmount,
      resolvedVisibility,
    };
  }

  if (draft.scope === 'household' && resolvedVisibility !== 'shared') {
    return {
      valid: false,
      errorMessage: 'Household transactions must always be shared with the household.',
      parsedAmount,
      resolvedVisibility,
    };
  }

  // 4. Validate Category Compatibility
  if (!draft.selectedCategory) {
    return {
      valid: false,
      errorMessage: `Please select an ${draft.type} category.`,
      parsedAmount,
      resolvedVisibility,
    };
  }

  if (draft.selectedCategory.is_archived) {
    return {
      valid: false,
      errorMessage: 'The selected category is archived and cannot be used for new transactions.',
      parsedAmount,
      resolvedVisibility,
    };
  }

  if (draft.selectedCategory.type !== draft.type) {
    return {
      valid: false,
      errorMessage: `Selected category "${draft.selectedCategory.name}" is an ${draft.selectedCategory.type} category and cannot be used for an ${draft.type} transaction.`,
      parsedAmount,
      resolvedVisibility,
    };
  }

  if (
    !draft.selectedCategory.is_system &&
    draft.selectedCategory.household_id !== draft.householdId
  ) {
    return {
      valid: false,
      errorMessage: 'Selected category does not belong to your active household.',
      parsedAmount,
      resolvedVisibility,
    };
  }

  // 5. Validate Account Ownership, Visibility & Payment Method Separation
  if (draft.selectedAccount) {
    if (draft.selectedAccount.is_archived) {
      return {
        valid: false,
        errorMessage: 'The selected account is archived and cannot be linked to new transactions.',
        parsedAmount,
        resolvedVisibility,
      };
    }

    if (draft.selectedAccount.household_id !== draft.householdId) {
      return {
        valid: false,
        errorMessage: 'Selected account does not belong to your active household.',
        parsedAmount,
        resolvedVisibility,
      };
    }

    const canAccessAccount =
      draft.selectedAccount.owner_id === draft.currentUserId ||
      draft.selectedAccount.is_shared_with_household;

    if (!canAccessAccount) {
      return {
        valid: false,
        errorMessage: 'You cannot use a private account owned by another household member.',
        parsedAmount,
        resolvedVisibility,
      };
    }

    if (
      draft.paymentMethod === 'upi' &&
      draft.selectedAccount.type !== 'bank_account'
    ) {
      return {
        valid: false,
        errorMessage:
          'UPI is a payment method that can only be linked to a Bank Account (or left without a linked account).',
        parsedAmount,
        resolvedVisibility,
      };
    }
  }

  // 6. Validate Date (Current Local Date or Retrospective Date)
  if (!isValidPastOrTodayIsoDate(draft.transactionDate)) {
    return {
      valid: false,
      errorMessage:
        'Please enter a valid date (YYYY-MM-DD) that is today or in the past.',
      parsedAmount,
      resolvedVisibility,
    };
  }

  // 7. Validate Optional Description Length
  if (draft.description.trim().length > 500) {
    return {
      valid: false,
      errorMessage: 'Description cannot exceed 500 characters.',
      parsedAmount,
      resolvedVisibility,
    };
  }

  return {
    valid: true,
    errorMessage: null,
    parsedAmount,
    resolvedVisibility,
  };
}

export function validateNewCategoryName(
  rawName: string,
  type: TransactionType,
  existingCategories: CategoryRow[]
): { valid: boolean; normalizedName: string; errorMessage: string | null } {
  const normalizedName = rawName.trim();

  if (!normalizedName) {
    return {
      valid: false,
      normalizedName,
      errorMessage: 'Category name is required.',
    };
  }

  if (normalizedName.length > 60) {
    return {
      valid: false,
      normalizedName,
      errorMessage: 'Category name must be 60 characters or fewer.',
    };
  }

  const lowerCandidate = normalizedName.toLowerCase();
  const duplicate = existingCategories.find(
    (cat) =>
      cat.type === type && cat.name.trim().toLowerCase() === lowerCandidate
  );

  if (duplicate) {
    return {
      valid: false,
      normalizedName,
      errorMessage: `A ${type} category named "${duplicate.name}" already exists.`,
    };
  }

  return {
    valid: true,
    normalizedName,
    errorMessage: null,
  };
}

