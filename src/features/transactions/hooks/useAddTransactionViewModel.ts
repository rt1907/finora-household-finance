import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from '@/config/env';
import {
  createAccount,
  createCustomCategory,
  createTransaction,
  fetchAccessibleAccounts,
  fetchActiveHouseholdContext,
  fetchHouseholdCategories,
} from '@/features/transactions/services/transactionService';
import {
  ActiveHouseholdContext,
  BUILTIN_DEFAULT_CATEGORIES,
} from '@/features/transactions/types/transaction.types';
import {
  resolveTransactionVisibility,
  validateNewCategoryName,
  validateTransactionDraft,
} from '@/features/transactions/utils/validation';
import {
  AccountRow,
  AccountType,
  CategoryRow,
  PaymentMethodType,
  TransactionScope,
  TransactionType,
} from '@/types/database';
import { getLocalTodayIsoDate, shiftIsoDateByDays } from '@/utils/date';

/**
 * View-model hook for the Add Transaction screen (V1).
 * Keeps all business logic, Supabase queries, privacy rules, and validation
 * separated from UI presentation components.
 */
export function useAddTransactionViewModel(onSuccessNavigateBack: () => void) {
  const backendConfigured = isSupabaseConfigured();

  // Household & Auth Context
  const [householdContext, setHouseholdContext] =
    useState<ActiveHouseholdContext | null>(null);
  const [loadingContext, setLoadingContext] = useState<boolean>(
    backendConfigured
  );
  const [contextError, setContextError] = useState<string | null>(null);

  // Remote Reference Data (Strictly real database records, never fake mock transactions)
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  // Form State (Preserved across failed save attempts)
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

  // Submission & Feedback State
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(
    null
  );

  // Create Custom Category Modal State
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

  // Create Account Modal State
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

  const loadReferenceData = useCallback(async () => {
    if (!backendConfigured) {
      setLoadingContext(false);
      return;
    }

    setLoadingContext(true);
    setContextError(null);

    try {
      const ctx = await fetchActiveHouseholdContext();
      setHouseholdContext(ctx);

      if (ctx) {
        const [loadedCategories, loadedAccounts] = await Promise.all([
          fetchHouseholdCategories(ctx.household.id),
          fetchAccessibleAccounts(ctx.household.id),
        ]);
        setCategories(loadedCategories);
        setAccounts(loadedAccounts);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to load household data from Supabase.';
      setContextError(message);
    } finally {
      setLoadingContext(false);
    }
  }, [backendConfigured]);

  useEffect(() => {
    if (!backendConfigured) {
      return;
    }
    let active = true;

    async function initialize() {
      try {
        const ctx = await fetchActiveHouseholdContext();
        if (!active) {
          return;
        }
        setHouseholdContext(ctx);

        if (ctx) {
          const [loadedCategories, loadedAccounts] = await Promise.all([
            fetchHouseholdCategories(ctx.household.id),
            fetchAccessibleAccounts(ctx.household.id),
          ]);
          if (active) {
            setCategories(loadedCategories);
            setAccounts(loadedAccounts);
          }
        }
      } catch (err) {
        if (active) {
          setContextError(
            err instanceof Error
              ? err.message
              : 'Unable to load household data from Supabase.'
          );
        }
      } finally {
        if (active) {
          setLoadingContext(false);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [backendConfigured]);

  // Filter categories strictly by Expense or Income.
  // If remote categories haven't loaded yet, provide the 3 built-in default categories
  // so the category dropdown always displays 3 categories + "Add category".
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

  // Derive active category ID without synchronous setState in useEffect
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

  /**
   * Filter selectable accounts based on the chosen payment method:
   * - 'cash' -> shows 'cash' accounts
   * - 'credit_card' -> shows 'credit_card' accounts
   * - 'upi' -> UPI is a payment method, NOT an account. Links to 'bank_account'.
   * - 'bank_transfer' / 'debit_card' -> shows bank & investment accounts ('bank_account', 'fixed_deposit', 'mutual_fund', 'stocks')
   */
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

  // Derive active account ID without synchronous setState in useEffect
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

  // Handler: Change Transaction Type (Expense / Income)
  const handleSelectType = useCallback((nextType: TransactionType) => {
    setType(nextType);
    setFormError(null);
  }, []);

  // Handler: Change Scope (Personal default / Household explicit alternative)
  const handleSelectScope = useCallback((nextScope: TransactionScope) => {
    setScope(nextScope);
    if (nextScope === 'personal') {
      setShareWithHousehold(false);
    }
    setFormError(null);
  }, []);

  // Handler: Change Payment Method / Quick Default Option
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

  // Date quick-selection helpers
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

  // Custom Category Creation
  const openCreateCategoryModal = useCallback(() => {
    setNewCategoryName('');
    setNewCategoryIcon(type === 'expense' ? 'shopping-cart' : 'briefcase');
    setCategoryModalError(null);
    setIsCategoryModalOpen(true);
  }, [type]);

  const handleCreateCustomCategory = useCallback(async () => {
    if (!householdContext) {
      setCategoryModalError(
        'Sign in and select a household before creating a custom category.'
      );
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

  // Account Creation
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
      setAccountModalError(
        'Sign in and select a household before adding an account.'
      );
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

  // Save Transaction
  const handleSaveTransaction = useCallback(async () => {
    setFormError(null);
    setSaveSuccessMessage(null);

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
      const currency =
        selectedAccount?.currency ??
        householdContext.household.base_currency ??
        'INR';

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

      await createTransaction({
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

      setSaveSuccessMessage('Transaction saved successfully!');
      setTimeout(() => {
        onSuccessNavigateBack();
      }, 450);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while saving the transaction.';
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }, [
    amountText,
    description,
    householdContext,
    onSuccessNavigateBack,
    paymentMethod,
    scope,
    selectedAccount,
    selectedCategory,
    shareWithHousehold,
    transactionDate,
    type,
  ]);

  const effectiveVisibility = resolveTransactionVisibility(
    scope,
    shareWithHousehold
  );

  return {
    backendConfigured,
    loadingContext,
    contextError,
    householdContext,
    reloadContext: loadReferenceData,

    // Form fields
    type,
    setType: handleSelectType,
    amountText,
    setAmountText,
    scope,
    setScope: handleSelectScope,
    shareWithHousehold,
    setShareWithHousehold,
    effectiveVisibility,

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

    // Submission
    saving,
    formError,
    saveSuccessMessage,
    handleSaveTransaction,
  };
}
