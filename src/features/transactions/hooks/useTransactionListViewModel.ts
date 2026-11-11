import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured } from '@/config/env';
import {
  deleteTransaction,
  fetchActiveHouseholdContext,
  fetchHouseholdTransactionsList,
  subscribeToTransactionUpdates,
} from '@/features/transactions/services/transactionService';
import {
  ActiveHouseholdContext,
  TransactionScopeFilter,
  TransactionWithRelations,
} from '@/features/transactions/types/transaction.types';

export function useTransactionListViewModel() {
  const backendConfigured = isSupabaseConfigured();

  const [householdContext, setHouseholdContext] =
    useState<ActiveHouseholdContext | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>(
    []
  );
  const [scopeFilter, setScopeFilter] =
    useState<TransactionScopeFilter>('all');
  const [loading, setLoading] = useState<boolean>(backendConfigured);
  const [deletingTransactionId, setDeletingTransactionId] = useState<
    string | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasLoadedOnceRef = useRef<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);

  const reloadTransactions = useCallback(async () => {
    if (!backendConfigured) {
      setLoading(false);
      return;
    }

    if (isFetchingRef.current) {
      return;
    }
    isFetchingRef.current = true;

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }
    setErrorMessage(null);

    try {
      const ctx = await fetchActiveHouseholdContext();
      setHouseholdContext(ctx);
      if (ctx) {
        const list = await fetchHouseholdTransactionsList(ctx.household.id);
        setTransactions(list);
      } else {
        setTransactions([]);
      }
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to load transactions.'
      );
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [backendConfigured]);

  useEffect(() => {
    if (!backendConfigured) {
      return;
    }
    let active = true;

    async function init() {
      if (isFetchingRef.current) {
        return;
      }
      isFetchingRef.current = true;
      try {
        const ctx = await fetchActiveHouseholdContext();
        if (!active) return;
        setHouseholdContext(ctx);
        if (ctx) {
          const list = await fetchHouseholdTransactionsList(ctx.household.id);
          if (active) setTransactions(list);
        } else if (active) {
          setTransactions([]);
        }
        hasLoadedOnceRef.current = true;
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Unable to load transactions.'
          );
        }
      } finally {
        isFetchingRef.current = false;
        if (active) setLoading(false);
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, [backendConfigured]);

  useEffect(() => {
    const unsubscribe = subscribeToTransactionUpdates(() => {
      void reloadTransactions();
    });
    return unsubscribe;
  }, [reloadTransactions]);

  const handleDeleteTransaction = useCallback(
    async (transactionId: string) => {
      if (!householdContext) {
        return;
      }

      setDeletingTransactionId(transactionId);
      setErrorMessage(null);

      try {
        await deleteTransaction(transactionId, householdContext.household.id);
        setTransactions((prev) => prev.filter((tx) => tx.id !== transactionId));
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to delete transaction.'
        );
      } finally {
        setDeletingTransactionId(null);
      }
    },
    [householdContext]
  );

  const filteredTransactions = useMemo(() => {
    if (scopeFilter === 'all') {
      return transactions;
    }
    if (scopeFilter === 'personal') {
      return transactions.filter((tx) => tx.scope === 'personal');
    }
    return transactions.filter((tx) => tx.scope === 'household');
  }, [scopeFilter, transactions]);

  return {
    loading,
    deletingTransactionId,
    errorMessage,
    householdContext,
    scopeFilter,
    setScopeFilter,
    filteredTransactions,
    reloadTransactions,
    handleDeleteTransaction,
  };
}

