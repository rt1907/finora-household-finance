import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from '@/config/env';
import {
  fetchMonthlyDashboardDetail,
  subscribeToTransactionUpdates,
} from '@/features/transactions/services/transactionService';
import { HouseholdDashboardData } from '@/features/transactions/types/transaction.types';
import { getMonthDateRangeFromYearMonth } from '@/utils/date';

export interface CategorySpendItem {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
}

export function useDashboardViewModel() {
  const backendReady = isSupabaseConfigured();
  const now = new Date();

  const [selectedPeriod, setSelectedPeriod] = useState<{
    year: number;
    monthIndex: number;
  }>({
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
  });

  const [dashboardData, setDashboardData] =
    useState<HouseholdDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(backendReady);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const monthRange = useMemo(
    () =>
      getMonthDateRangeFromYearMonth(
        selectedPeriod.year,
        selectedPeriod.monthIndex
      ),
    [selectedPeriod.year, selectedPeriod.monthIndex]
  );

  const isCurrentMonth = useMemo(() => {
    const today = new Date();
    return (
      selectedPeriod.year === today.getFullYear() &&
      selectedPeriod.monthIndex === today.getMonth()
    );
  }, [selectedPeriod.year, selectedPeriod.monthIndex]);

  const goToPreviousMonth = useCallback(() => {
    setSelectedPeriod((prev) => {
      if (prev.monthIndex === 0) {
        return { year: prev.year - 1, monthIndex: 11 };
      }
      return { year: prev.year, monthIndex: prev.monthIndex - 1 };
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setSelectedPeriod((prev) => {
      const today = new Date();
      if (
        prev.year === today.getFullYear() &&
        prev.monthIndex === today.getMonth()
      ) {
        return prev;
      }
      if (prev.monthIndex === 11) {
        return { year: prev.year + 1, monthIndex: 0 };
      }
      return { year: prev.year, monthIndex: prev.monthIndex + 1 };
    });
  }, []);

  const resetToCurrentMonth = useCallback(() => {
    const today = new Date();
    setSelectedPeriod({
      year: today.getFullYear(),
      monthIndex: today.getMonth(),
    });
  }, []);

  const reloadDashboard = useCallback(async () => {
    if (!backendReady) {
      setDashboardData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const data = await fetchMonthlyDashboardDetail(
        monthRange.startDate,
        monthRange.endDate
      );
      setDashboardData(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to load monthly dashboard.'
      );
    } finally {
      setLoading(false);
    }
  }, [backendReady, monthRange.endDate, monthRange.startDate]);

  useEffect(() => {
    let isMounted = true;

    async function loadMonth() {
      if (!backendReady) {
        if (isMounted) {
          setDashboardData(null);
          setLoading(false);
        }
        return;
      }

      try {
        const data = await fetchMonthlyDashboardDetail(
          monthRange.startDate,
          monthRange.endDate
        );
        if (isMounted) {
          setDashboardData(data);
          setErrorMessage(null);
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Unable to load monthly dashboard.'
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadMonth();

    const unsubscribe = subscribeToTransactionUpdates(() => {
      void reloadDashboard();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [backendReady, monthRange.endDate, monthRange.startDate, reloadDashboard]);

  const primarySummary = useMemo(
    () => dashboardData?.summaries?.[0] ?? null,
    [dashboardData]
  );

  // Compute Category Breakdown for Household Expenditure & My Personal Expenditure
  const categoryBreakdown = useMemo(() => {
    if (!dashboardData) {
      return {
        myCategories: [] as CategorySpendItem[],
        householdCategories: [] as CategorySpendItem[],
      };
    }

    const userId = dashboardData.context.userId;
    const baseCurrency = dashboardData.context.household.base_currency;

    const myTotalsByCat = new Map<string, { name: string; amount: number }>();
    const householdTotalsByCat = new Map<
      string,
      { name: string; amount: number }
    >();

    let myTotalSum = 0;
    let householdTotalSum = 0;

    dashboardData.recentTransactions.forEach((tx) => {
      if (tx.type !== 'expense' || tx.currency !== baseCurrency) {
        return;
      }

      const catId = tx.category_id;
      const catName = tx.category?.name ?? 'Other';
      const amt = Number(tx.amount || 0);

      // Caller's own expenditure (Personal + Caller's Household transactions)
      if (tx.created_by === userId) {
        const prev = myTotalsByCat.get(catId) ?? { name: catName, amount: 0 };
        prev.amount += amt;
        myTotalsByCat.set(catId, prev);
        myTotalSum += amt;
      }

      // Household expenditure (Household + Shared Personal; never Private Personal)
      if (
        tx.scope === 'household' ||
        (tx.scope === 'personal' && tx.visibility === 'shared')
      ) {
        const prev = householdTotalsByCat.get(catId) ?? {
          name: catName,
          amount: 0,
        };
        prev.amount += amt;
        householdTotalsByCat.set(catId, prev);
        householdTotalSum += amt;
      }
    });

    const myCategories: CategorySpendItem[] = Array.from(
      myTotalsByCat.entries()
    )
      .map(([categoryId, val]) => ({
        categoryId,
        categoryName: val.name,
        amount: val.amount,
        percentage:
          myTotalSum > 0 ? Math.round((val.amount / myTotalSum) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const householdCategories: CategorySpendItem[] = Array.from(
      householdTotalsByCat.entries()
    )
      .map(([categoryId, val]) => ({
        categoryId,
        categoryName: val.name,
        amount: val.amount,
        percentage:
          householdTotalSum > 0
            ? Math.round((val.amount / householdTotalSum) * 100)
            : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      myCategories,
      householdCategories,
    };
  }, [dashboardData]);

  return {
    loading,
    errorMessage,
    dashboardData,
    primarySummary,
    monthLabel: monthRange.label,
    isCurrentMonth,
    goToPreviousMonth,
    goToNextMonth,
    resetToCurrentMonth,
    reloadDashboard,
    categoryBreakdown,
  };
}
