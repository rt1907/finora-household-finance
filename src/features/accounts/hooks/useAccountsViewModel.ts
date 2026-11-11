import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from '@/config/env';
import {
  AccountWithLatestBalance,
  archiveAccount,
  fetchHouseholdAccountsWithBalances,
  recordManualAccountBalance,
  updateAccountSharing,
} from '@/features/accounts/services/accountService';
import {
  createAccount,
  fetchActiveHouseholdContext,
} from '@/features/transactions/services/transactionService';
import { ActiveHouseholdContext } from '@/features/transactions/types/transaction.types';
import { AccountType } from '@/types/database';
import { getLocalTodayIsoDate, isValidPastOrTodayIsoDate } from '@/utils/date';

export function useAccountsViewModel() {
  const backendReady = isSupabaseConfigured();

  const [loading, setLoading] = useState<boolean>(true);
  const [householdContext, setHouseholdContext] =
    useState<ActiveHouseholdContext | null>(null);
  const [accounts, setAccounts] = useState<AccountWithLatestBalance[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Add Account Modal state
  const [accountModalVisible, setAccountModalVisible] =
    useState<boolean>(false);
  const [newAccountName, setNewAccountName] = useState<string>('');
  const [newAccountType, setNewAccountType] =
    useState<AccountType>('bank_account');
  const [newAccountInstitution, setNewAccountInstitution] =
    useState<string>('');
  const [newAccountShared, setNewAccountShared] = useState<boolean>(false);
  const [creatingAccount, setCreatingAccount] = useState<boolean>(false);
  const [accountModalError, setAccountModalError] = useState<string | null>(
    null
  );

  // Record Manual Balance Modal state
  const [balanceModalAccount, setBalanceModalAccount] =
    useState<AccountWithLatestBalance | null>(null);
  const [balanceInput, setBalanceInput] = useState<string>('');
  const [balanceAsOfDate, setBalanceAsOfDate] = useState<string>(
    getLocalTodayIsoDate()
  );
  const [balanceNotes, setBalanceNotes] = useState<string>('');
  const [recordingBalance, setRecordingBalance] = useState<boolean>(false);
  const [balanceModalError, setBalanceModalError] = useState<string | null>(
    null
  );

  // Toggling share / archiving state
  const [updatingAccountId, setUpdatingAccountId] = useState<string | null>(
    null
  );

  const reloadAccounts = useCallback(async () => {
    if (!backendReady) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const ctx = await fetchActiveHouseholdContext();
      setHouseholdContext(ctx);

      if (!ctx) {
        setAccounts([]);
        return;
      }

      const list = await fetchHouseholdAccountsWithBalances(
        ctx.household.id,
        ctx.userId
      );
      setAccounts(list);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to load accounts.'
      );
    } finally {
      setLoading(false);
    }
  }, [backendReady]);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (!backendReady) {
        if (isMounted) {
          setLoading(false);
        }
        return;
      }

      try {
        const ctx = await fetchActiveHouseholdContext();
        if (!isMounted) return;
        setHouseholdContext(ctx);

        if (!ctx) {
          setAccounts([]);
          return;
        }

        const list = await fetchHouseholdAccountsWithBalances(
          ctx.household.id,
          ctx.userId
        );
        if (isMounted) {
          setAccounts(list);
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Unable to load accounts.'
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      isMounted = false;
    };
  }, [backendReady]);

  const myAccounts = useMemo(
    () => accounts.filter((acc) => acc.isOwner),
    [accounts]
  );

  const partnerSharedAccounts = useMemo(
    () => accounts.filter((acc) => !acc.isOwner && acc.is_shared_with_household),
    [accounts]
  );

  const totals = useMemo(() => {
    const currency = householdContext?.household.base_currency ?? 'INR';
    let myTotalBalance = 0;
    let sharedHouseholdBalance = 0;

    accounts.forEach((acc) => {
      const latest = Number(acc.latestBalance?.balance ?? 0);
      if (acc.isOwner) {
        myTotalBalance += latest;
      }
      if (acc.is_shared_with_household) {
        sharedHouseholdBalance += latest;
      }
    });

    return {
      currency,
      myTotalBalance,
      sharedHouseholdBalance,
    };
  }, [accounts, householdContext]);

  const openAddAccountModal = useCallback((defaultType?: AccountType) => {
    setNewAccountName('');
    setNewAccountType(defaultType ?? 'bank_account');
    setNewAccountInstitution('');
    setNewAccountShared(false);
    setAccountModalError(null);
    setAccountModalVisible(true);
  }, []);

  const handleCreateAccount = useCallback(async () => {
    setAccountModalError(null);
    if (!householdContext) {
      setAccountModalError('Sign in and join a household to add accounts.');
      return;
    }

    const trimmedName = newAccountName.trim();
    if (!trimmedName) {
      setAccountModalError('Account name is required.');
      return;
    }
    if (trimmedName.length > 100) {
      setAccountModalError('Account name must be 100 characters or fewer.');
      return;
    }
    const duplicate = accounts.some(
      (acc) =>
        acc.owner_id === householdContext.userId &&
        acc.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setAccountModalError(
        `You already have an account named "${trimmedName}".`
      );
      return;
    }

    setCreatingAccount(true);
    try {
      await createAccount({
        householdId: householdContext.household.id,
        name: newAccountName,
        type: newAccountType,
        institutionName: newAccountInstitution,
        currency: householdContext.household.base_currency,
        isSharedWithHousehold: newAccountShared,
      });
      setAccountModalVisible(false);
      await reloadAccounts();
    } catch (err) {
      setAccountModalError(
        err instanceof Error ? err.message : 'Unable to create account.'
      );
    } finally {
      setCreatingAccount(false);
    }
  }, [
    accounts,
    householdContext,
    newAccountInstitution,
    newAccountName,
    newAccountShared,
    newAccountType,
    reloadAccounts,
  ]);

  const handleToggleShareAccount = useCallback(
    async (account: AccountWithLatestBalance, nextShared: boolean) => {
      if (!householdContext || !account.isOwner) return;

      setUpdatingAccountId(account.id);
      setErrorMessage(null);

      try {
        await updateAccountSharing(
          account.id,
          householdContext.household.id,
          nextShared
        );
        setAccounts((prev) =>
          prev.map((item) =>
            item.id === account.id
              ? { ...item, is_shared_with_household: nextShared }
              : item
          )
        );
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Unable to update account sharing.'
        );
      } finally {
        setUpdatingAccountId(null);
      }
    },
    [householdContext]
  );

  const openBalanceModal = useCallback((account: AccountWithLatestBalance) => {
    setBalanceModalAccount(account);
    setBalanceInput(
      account.latestBalance ? String(account.latestBalance.balance) : ''
    );
    setBalanceAsOfDate(getLocalTodayIsoDate());
    setBalanceNotes('');
    setBalanceModalError(null);
  }, []);

  const closeBalanceModal = useCallback(() => {
    setBalanceModalAccount(null);
    setBalanceModalError(null);
  }, []);

  const handleRecordBalance = useCallback(async () => {
    if (!balanceModalAccount) return;
    setBalanceModalError(null);

    const trimmed = balanceInput.trim();
    if (!trimmed || !/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
      setBalanceModalError(
        'Enter a valid numeric balance (up to 2 decimal places).'
      );
      return;
    }

    const numericBalance = Number(trimmed);
    if (!Number.isFinite(numericBalance)) {
      setBalanceModalError('Enter a valid balance amount.');
      return;
    }

    if (!isValidPastOrTodayIsoDate(balanceAsOfDate)) {
      setBalanceModalError(
        'Please enter a valid date (YYYY-MM-DD) not in the future.'
      );
      return;
    }

    setRecordingBalance(true);
    try {
      await recordManualAccountBalance({
        accountId: balanceModalAccount.id,
        balance: numericBalance,
        asOfDate: balanceAsOfDate,
        notes: balanceNotes,
      });
      setBalanceModalAccount(null);
      await reloadAccounts();
    } catch (err) {
      setBalanceModalError(
        err instanceof Error ? err.message : 'Unable to save balance.'
      );
    } finally {
      setRecordingBalance(false);
    }
  }, [
    balanceAsOfDate,
    balanceInput,
    balanceModalAccount,
    balanceNotes,
    reloadAccounts,
  ]);

  const handleArchiveAccount = useCallback(
    async (account: AccountWithLatestBalance) => {
      if (!householdContext || !account.isOwner) return;

      setUpdatingAccountId(account.id);
      setErrorMessage(null);

      try {
        await archiveAccount(account.id, householdContext.household.id);
        setAccounts((prev) => prev.filter((item) => item.id !== account.id));
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to archive account.'
        );
      } finally {
        setUpdatingAccountId(null);
      }
    },
    [householdContext]
  );

  return {
    loading,
    householdContext,
    myAccounts,
    partnerSharedAccounts,
    totals,
    errorMessage,
    updatingAccountId,
    reloadAccounts,

    // Add Account Modal
    accountModalVisible,
    setAccountModalVisible,
    newAccountName,
    setNewAccountName,
    newAccountType,
    setNewAccountType,
    newAccountInstitution,
    setNewAccountInstitution,
    newAccountShared,
    setNewAccountShared,
    creatingAccount,
    accountModalError,
    openAddAccountModal,
    handleCreateAccount,

    // Sharing & Archive
    handleToggleShareAccount,
    handleArchiveAccount,

    // Manual Balance Modal
    balanceModalAccount,
    balanceInput,
    setBalanceInput,
    balanceAsOfDate,
    setBalanceAsOfDate,
    balanceNotes,
    setBalanceNotes,
    recordingBalance,
    balanceModalError,
    openBalanceModal,
    closeBalanceModal,
    handleRecordBalance,
  };
}
