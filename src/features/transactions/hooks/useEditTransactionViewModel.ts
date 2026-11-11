import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from '@/config/env';
import {
  createAccount,
  createCustomCategory,
  deleteTransaction,
  fetchAccessibleAccounts,
  fetchActiveHouseholdContext,
  fetchHouseholdCategories,
  fetchTransactionById,
  updateTransaction,
} from '@/features/transactions/services/transactionService';
import {
  ActiveHouseholdContext,
  BUILTIN_DEFAULT_CATEGORIES,
} from '@/features/transactions/types/transaction.types';
import {
  validateNewCategoryName,
  validateTransactionDraft,
} from '@/features/transactions/utils/validation';
import {
  AccountRow,
  AccountType,
  CategoryRow,
  PaymentMethodType,
  TransactionRow,
  TransactionScope,
  TransactionType,
} from '@/types/database';
import { getLocalTodayIsoDate, shiftIsoDateByDays } from '@/utils/date';

/**
 * View-model hook for viewing, editing, or deleting an existing transaction.
 * Enforces creator-only edit/delete permissions (`created_by === userId`).
 */
export function useEditTransactionViewModel(
  transactionId: string | undefined,
  onSuccessNavigateBack: () => void
) {
  const backendConfigured = isSupabaseConfigured();

  const [householdContext, setHouseholdContext] =
    useState<ActiveHouseholdContext | null>(null);
  const [originalTransaction, setOriginalTransaction] =
    useState<TransactionRow | null>(null);
  const [loading, setLoading] = useState<boolean>(backendConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  // Form fields
  const [type, setType] = useState<TransactionType>('expense');
  const [amountText, setAmountText] = useState<string>('');
  const [scope, setScope] = useState<TransactionScope>('personal');
  const [shareWithHousehold, setShareWithHousehold] = useState<boolean>(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodType>('cash');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const [transactionDate, setTransactionDate] = useState<string>(() =>
    getLocalTodayIsoDate()
  );
  const [description, setDescription] = useState<string>('');

  // Dropdown & Modal states
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] =
    useState<boolean>(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] =
    useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [newCategoryIcon, setNewCategoryIcon] =
    useState<string>('shopping-cart');
  const [categoryModalError, setCategoryModalError] = useState<string | null>(
    null
  );
  const [creatingCategory, setCreatingCategory] = useState<boolean>(false);

  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [newAccountName, setNewAccountName] = useState<string>('');
  const [newAccountType, setNewAccountType] = useState<AccountType>('cash');
  const [newAccountInstitution, setNewAccountInstitution] =
    useState<string>('');
  const [newAccountShared, setNewAccountShared] = useState<boolean>(false);
  const [accountModalError, setAccountModalError] = useState<string | null>(
    null
  );
  const [creatingAccount, setCreatingAccount] = useState<boolean>(false);

  // Submission & Delete confirmation state
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [confirmingDelete, setConfirmingDelete] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!backendConfigured || !transactionId) {
      return;
    }

    let active = true;

    async function load() {
      try {
        const ctx = await fetchActiveHouseholdContext();
        if (!active) return;
        setHouseholdContext(ctx);

        if (!ctx) {
          setLoadError('Please sign in to view or edit this transaction.');
          return;
        }

        const [tx, loadedCategories, loadedAccounts] = await Promise.all([
          fetchTransactionById(transactionId as string, ctx.household.id),
          fetchHouseholdCategories(ctx.household.id),
          fetchAccessibleAccounts(ctx.household.id),
        ]);

        if (!active) return;

        if (!tx) {
          setLoadError('Transaction not found.');
          return;
        }

        setOriginalTransaction(tx);
        setCategories(loadedCategories);
        setAccounts(loadedAccounts);

        // Populate form with existing transaction values
        setType(tx.type);
        setAmountText(String(tx.amount));
        setScope(tx.scope);
        setShareWithHousehold(
          tx.scope === 'personal' ? tx.visibility === 'shared' : true
        );
        setSelectedCategoryId(tx.category_id);
        setPaymentMethod(tx.payment_method ?? 'cash');
        setSelectedAccountId(tx.account_id);
        setTransactionDate(tx.transaction_date);
        setDescription(tx.description ?? '');
      } catch (err) {
        if (active) {
          setLoadError(
            err instanceof Error
              ? err.message
              : 'Failed to load transaction details.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [backendConfigured, transactionId]);

  const isCreator = useMemo(() => {
    if (!householdContext || !originalTransaction) {
      return false;
    }
    return originalTransaction.created_by === householdContext.userId;
  }, [householdContext, originalTransaction]);

  const filteredCategories = useMemo<CategoryRow[]>(() => {
    const remoteMatches = categories.filter(
      (cat) => cat.type === type && !cat.is_archived
    );
    if (remoteMatches.length > 0) {
      return remoteMatches;
    }
    return BUILTIN_DEFAULT_CATEGORIES.filter((item) => item.type === type).map(
      (seed) => ({
        id: seed.id,
        household_id: null,
        name: seed.name,
        type: seed.type,
        icon: seed.icon,
        color_hex: seed.color_hex,
        is_system: true,
        is_archived: false,
        created_by: null,
        created_at: '',
        updated_at: '',
      })
    );
  }, [categories, type]);

  const effectiveSelectedCategoryId = useMemo(() => {
    if (filteredCategories.length === 0) {
      return null;
    }
    const exists = filteredCategories.some(
      (cat) => cat.id === selectedCategoryId
    );
    return exists ? selectedCategoryId : filteredCategories[0].id;
  }, [filteredCategories, selectedCategoryId]);

  const selectedCategory = useMemo(
    () =>
      filteredCategories.find(
        (cat) => cat.id === effectiveSelectedCategoryId
      ) ?? null,
    [filteredCategories, effectiveSelectedCategoryId]
  );

  const compatibleAccounts = useMemo(() => {
    const activeAccounts = accounts.filter((acc) => !acc.is_archived);
    if (paymentMethod === 'cash') {
      return activeAccounts.filter((acc) => acc.type === 'cash');
    }
    if (paymentMethod === 'credit_card') {
      return activeAccounts.filter((acc) => acc.type === 'credit_card');
    }
    if (paymentMethod === 'upi') {
      return activeAccounts.filter((acc) => acc.type === 'bank_account');
    }
    if (
      paymentMethod === 'bank_transfer' ||
      paymentMethod === 'debit_card'
    ) {
      return activeAccounts.filter(
        (acc) =>
          acc.type === 'bank_account' ||
          acc.type === 'fixed_deposit' ||
          acc.type === 'mutual_fund' ||
          acc.type === 'stocks'
      );
    }
    return activeAccounts;
  }, [accounts, paymentMethod]);

  const effectiveSelectedAccountId = useMemo(() => {
    if (!selectedAccountId) {
      return null;
    }
    const stillCompatible = compatibleAccounts.some(
      (acc) => acc.id === selectedAccountId
    );
    return stillCompatible ? selectedAccountId : null;
  }, [compatibleAccounts, selectedAccountId]);

  const selectedAccount = useMemo(
    () =>
      accounts.find((acc) => acc.id === effectiveSelectedAccountId) ?? null,
    [accounts, effectiveSelectedAccountId]
  );

  const handleSelectType = useCallback((nextType: TransactionType) => {
    setType(nextType);
    setFormError(null);
  }, []);

  const handleSelectScope = useCallback((nextScope: TransactionScope) => {
    setScope(nextScope);
    if (nextScope === 'personal') {
      setShareWithHousehold(false);
    }
    setFormError(null);
  }, []);

  const handleSelectPaymentMethod = useCallback(
    (nextMethod: PaymentMethodType) => {
      setPaymentMethod(nextMethod);
      setFormError(null);

      const targetType: AccountType | null =
        nextMethod === 'cash'
          ? 'cash'
          : nextMethod === 'credit_card'
            ? 'credit_card'
            : null;

      if (targetType) {
        const match = accounts.find(
          (acc) => !acc.is_archived && acc.type === targetType
        );
        setSelectedAccountId(match ? match.id : null);
      } else {
        setSelectedAccountId(null);
      }
    },
    [accounts]
  );

  const handleSelectQuickDate = useCallback((daysOffsetFromToday: number) => {
    const today = getLocalTodayIsoDate();
    setTransactionDate(
      daysOffsetFromToday === 0
        ? today
        : shiftIsoDateByDays(today, daysOffsetFromToday)
    );
    setFormError(null);
  }, []);

  const handleStepDate = useCallback(
    (deltaDays: number) => {
      const today = getLocalTodayIsoDate();
      const candidate = shiftIsoDateByDays(transactionDate, deltaDays);
      if (candidate <= today) {
        setTransactionDate(candidate);
        setFormError(null);
      }
    },
    [transactionDate]
  );

  const openCreateCategoryModal = useCallback(() => {
    setNewCategoryName('');
    setNewCategoryIcon(type === 'expense' ? 'shopping-cart' : 'briefcase');
    setCategoryModalError(null);
    setIsCategoryModalOpen(true);
  }, [type]);

  const handleCreateCustomCategory = useCallback(async () => {
    if (!householdContext) {
      setCategoryModalError('Sign in to create a custom category.');
      return;
    }

    const check = validateNewCategoryName(newCategoryName, type, categories);
    if (!check.valid) {
      setCategoryModalError(check.errorMessage);
      return;
    }

    setCreatingCategory(true);
    setCategoryModalError(null);

    try {
      const created = await createCustomCategory({
        householdId: householdContext.household.id,
        name: check.normalizedName,
        type,
        icon: newCategoryIcon,
      });

      setCategories((prev) => [...prev, created]);
      setSelectedCategoryId(created.id);
      setIsCategoryModalOpen(false);
    } catch (err) {
      setCategoryModalError(
        err instanceof Error ? err.message : 'Could not create category.'
      );
    } finally {
      setCreatingCategory(false);
    }
  }, [categories, householdContext, newCategoryIcon, newCategoryName, type]);

  const handleSelectNewAccountType = useCallback((nextType: AccountType) => {
    setNewAccountType(nextType);
    setNewAccountName((prev) => {
      const trimmed = prev.trim();
      const defaultNames = [
        '',
        'Cash',
        'Credit Card',
        'Bank Account',
        'Fixed Deposit',
        'Mutual Fund',
        'Stocks',
      ];
      if (!defaultNames.includes(trimmed)) {
        return prev;
      }
      if (nextType === 'cash') return 'Cash';
      if (nextType === 'credit_card') return 'Credit Card';
      return '';
    });
  }, []);

  const openCreateAccountModal = useCallback(
    (presetType?: AccountType) => {
      const initialType: AccountType =
        presetType ??
        (paymentMethod === 'credit_card'
          ? 'credit_card'
          : paymentMethod === 'upi' || paymentMethod === 'bank_transfer'
            ? 'bank_account'
            : 'cash');

      setNewAccountType(initialType);
      setNewAccountName(
        initialType === 'cash'
          ? 'Cash'
          : initialType === 'credit_card'
            ? 'Credit Card'
            : ''
      );
      setNewAccountInstitution('');
      setNewAccountShared(false);
      setAccountModalError(null);
      setIsAccountModalOpen(true);
    },
    [paymentMethod]
  );

  const handleCreateAccount = useCallback(async () => {
    if (!householdContext) {
      setAccountModalError('Sign in to add an account.');
      return;
    }

    const trimmedName = newAccountName.trim();
    if (!trimmedName) {
      setAccountModalError('Account name is required.');
      return;
    }

    setCreatingAccount(true);
    setAccountModalError(null);

    try {
      const created = await createAccount({
        householdId: householdContext.household.id,
        name: trimmedName,
        type: newAccountType,
        institutionName: newAccountInstitution.trim() || null,
        currency: householdContext.household.base_currency,
        isSharedWithHousehold: newAccountShared,
      });

      setAccounts((prev) => [...prev, created]);

      if (created.type === 'cash') {
        setPaymentMethod('cash');
      } else if (created.type === 'credit_card') {
        setPaymentMethod('credit_card');
      } else if (created.type === 'bank_account') {
        setPaymentMethod((prev) =>
          prev === 'upi' || prev === 'bank_transfer' ? prev : 'bank_transfer'
        );
      } else {
        setPaymentMethod('bank_transfer');
      }

      setSelectedAccountId(created.id);
      setIsAccountModalOpen(false);
    } catch (err) {
      setAccountModalError(
        err instanceof Error ? err.message : 'Failed to create account.'
      );
    } finally {
      setCreatingAccount(false);
    }
  }, [
    householdContext,
    newAccountInstitution,
    newAccountName,
    newAccountShared,
    newAccountType,
  ]);

  const handleUpdateTransaction = useCallback(async () => {
    setFormError(null);
    setSaveSuccessMessage(null);

    if (!isCreator || !originalTransaction) {
      setFormError('Only the transaction creator can edit this transaction.');
      return;
    }

    const validation = validateTransactionDraft({
      amountText,
      type,
      scope,
      shareWithHousehold,
      selectedCategory,
      selectedAccount,
      paymentMethod,
      transactionDate,
      description,
      householdId: householdContext?.household.id ?? null,
      currentUserId: householdContext?.userId ?? null,
    });

    if (!validation.valid || !householdContext || !selectedCategory) {
      setFormError(
        validation.errorMessage ?? 'Please check the transaction details.'
      );
      return;
    }

    setSaving(true);

    try {
      let resolvedCategoryId = selectedCategory.id;
      if (resolvedCategoryId.startsWith('builtin-')) {
        const createdCat = await createCustomCategory({
          householdId: householdContext.household.id,
          name: selectedCategory.name,
          type: selectedCategory.type,
          icon: selectedCategory.icon,
          colorHex: selectedCategory.color_hex,
        });
        setCategories((prev) => [...prev, createdCat]);
        resolvedCategoryId = createdCat.id;
      }

      const currency =
        selectedAccount?.currency ??
        originalTransaction.currency ??
        householdContext.household.base_currency ??
        'INR';

      await updateTransaction({
        transactionId: originalTransaction.id,
        householdId: householdContext.household.id,
        type,
        amount: validation.parsedAmount,
        currency,
        scope,
        visibility: validation.resolvedVisibility,
        categoryId: resolvedCategoryId,
        accountId: selectedAccount ? selectedAccount.id : null,
        paymentMethod,
        transactionDate,
        description: description.trim() ? description.trim() : null,
      });

      setSaveSuccessMessage('Transaction updated!');
      setTimeout(() => {
        onSuccessNavigateBack();
      }, 400);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update transaction.'
      );
    } finally {
      setSaving(false);
    }
  }, [
    amountText,
    description,
    householdContext,
    isCreator,
    onSuccessNavigateBack,
    originalTransaction,
    paymentMethod,
    scope,
    selectedAccount,
    selectedCategory,
    shareWithHousehold,
    transactionDate,
    type,
  ]);

  const handleDeleteTransaction = useCallback(async () => {
    if (!isCreator || !originalTransaction || !householdContext) {
      setFormError('Only the transaction creator can delete this transaction.');
      return;
    }

    setDeleting(true);
    setFormError(null);

    try {
      await deleteTransaction(
        originalTransaction.id,
        householdContext.household.id
      );
      onSuccessNavigateBack();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to delete transaction.'
      );
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }, [householdContext, isCreator, onSuccessNavigateBack, originalTransaction]);

  return {
    loading,
    loadError,
    householdContext,
    originalTransaction,
    isCreator,

    // Form state
    type,
    setType: handleSelectType,
    amountText,
    setAmountText,
    scope,
    setScope: handleSelectScope,
    shareWithHousehold,
    setShareWithHousehold,

    // Categories
    filteredCategories,
    selectedCategory,
    selectedCategoryId: effectiveSelectedCategoryId,
    setSelectedCategoryId,
    isCategoryDropdownOpen,
    setIsCategoryDropdownOpen,
    isCategoryModalOpen,
    openCreateCategoryModal,
    closeCreateCategoryModal: () => setIsCategoryModalOpen(false),
    newCategoryName,
    setNewCategoryName,
    newCategoryIcon,
    setNewCategoryIcon,
    categoryModalError,
    creatingCategory,
    handleCreateCustomCategory,

    // Accounts & Payment Methods
    paymentMethod,
    setPaymentMethod: handleSelectPaymentMethod,
    compatibleAccounts,
    selectedAccountId: effectiveSelectedAccountId,
    setSelectedAccountId,
    isAccountModalOpen,
    openCreateAccountModal,
    closeCreateAccountModal: () => setIsAccountModalOpen(false),
    newAccountName,
    setNewAccountName,
    newAccountType,
    setNewAccountType: handleSelectNewAccountType,
    newAccountInstitution,
    setNewAccountInstitution,
    newAccountShared,
    setNewAccountShared,
    accountModalError,
    creatingAccount,
    handleCreateAccount,

    // Date & Description
    transactionDate,
    setTransactionDate,
    handleSelectQuickDate,
    handleStepDate,
    description,
    setDescription,

    // Actions
    saving,
    deleting,
    confirmingDelete,
    setConfirmingDelete,
    formError,
    saveSuccessMessage,
    handleUpdateTransaction,
    handleDeleteTransaction,
  };
}
