import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from '@/config/env';
import {
  deleteTransaction,
  fetchHouseholdDashboardAndRecentTransactions,
  fetchHouseholdExpenditureAnalytics,
  subscribeToTransactionUpdates,
} from '@/features/transactions/services/transactionService';
import {
  HouseholdDashboardData,
  HouseholdExpenditureAnalytics,
} from '@/features/transactions/types/transaction.types';
import { FeatureHighlight } from '@/types/household';
import { getCurrentMonthDateRange } from '@/utils/date';

/**
 * Custom hook encapsulating business logic for the home/welcome entry screen.
 * Loads real dashboard summaries and recent transactions when Supabase is
 * configured and the user belongs to an active household, and refreshes
 * automatically whenever a new transaction is saved.
 */
export function useOnboardingViewModel() {
  const backendReady = isSupabaseConfigured();

  const [dashboardData, setDashboardData] =
    useState<HouseholdDashboardData | null>(null);
  const [expenditureAnalytics, setExpenditureAnalytics] =
    useState<HouseholdExpenditureAnalytics | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState<boolean>(
    backendReady
  );
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const refreshDashboard = useCallback(async () => {
    if (!backendReady) {
      setDashboardData(null);
      setExpenditureAnalytics(null);
      setLoadingDashboard(false);
      return;
    }

    setLoadingDashboard(true);
    setDashboardError(null);

    try {
      const data = await fetchHouseholdDashboardAndRecentTransactions();
      setDashboardData(data);

      if (data?.context) {
        const { startDate, endDate } = getCurrentMonthDateRange();
        const analytics = await fetchHouseholdExpenditureAnalytics(
          data.context.household.id,
          data.context.userId,
          startDate,
          endDate,
          data.summaries?.[0]?.currency ??
            data.context.household.base_currency ??
            'INR'
        );
        setExpenditureAnalytics(analytics);
      } else {
        setExpenditureAnalytics(null);
      }
    } catch (err) {
      setDashboardError(
        err instanceof Error ? err.message : 'Unable to refresh dashboard data.'
      );
    } finally {
      setLoadingDashboard(false);
    }
  }, [backendReady]);

  // Automatically refresh dashboard & recent transactions when a transaction is saved
  useEffect(() => {
    const unsubscribe = subscribeToTransactionUpdates(() => {
      void refreshDashboard();
    });
    return unsubscribe;
  }, [refreshDashboard]);

  const highlights: FeatureHighlight[] = useMemo(
    () => [
      {
        id: 'shared-budgets',
        title: 'Shared Household Budgets',
        description:
          'Track joint expenses, groceries, bills, and savings goals in real time with your partner or family.',
        badge: 'Collaborative',
      },
      {
        id: 'privacy-controls',
        title: 'Multi-User Access & Roles',
        description:
          'Built with row-level security so each household’s financial records remain strictly isolated and private.',
        badge: 'Secure',
      },
      {
        id: 'insights',
        title: 'Clear Monthly Insights',
        description:
          'Understand who paid what and how your household cash flow tracks against your monthly targets.',
        badge: 'Transparent',
      },
    ],
    []
  );

  const handleDeleteTransaction = useCallback(
    async (transactionId: string) => {
      if (!dashboardData) return;
      try {
        await deleteTransaction(
          transactionId,
          dashboardData.context.household.id
        );
      } catch (err) {
        setDashboardError(
          err instanceof Error ? err.message : 'Unable to delete transaction.'
        );
      }
    },
    [dashboardData]
  );

  return {
    appName: 'Finora',
    tagline: 'Shared financial space.',
    backendReady,
    highlights,
    dashboardData,
    expenditureAnalytics,
    loadingDashboard,
    dashboardError,
    refreshDashboard,
    handleDeleteTransaction,
  };
}
