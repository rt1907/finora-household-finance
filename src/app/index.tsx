import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ResponsivePieChart, PieSlice } from '@/components/charts/ResponsivePieChart';
import { BrandSplashView } from '@/components/ui/BrandSplashView';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FinoraBrandIcon } from '@/components/ui/FinoraBrandIcon';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { AuthAndSetupFlow } from '@/features/auth/components/AuthAndSetupFlow';
import { useOnboardingViewModel } from '@/features/onboarding/hooks/useOnboardingViewModel';
import { confirmDestructiveAction } from '@/utils/confirm';
import { formatCompactDate, formatCurrencyAmount } from '@/utils/date';

function getScopeMnemonic(scope: string, visibility: string): {
  icon: string;
  shortLabel: string;
} {
  if (scope === 'household') {
    return { icon: '🏠', shortLabel: 'HH' };
  }
  if (visibility === 'shared') {
    return { icon: '👥', shortLabel: 'Shared' };
  }
  return { icon: '🔒', shortLabel: 'Priv' };
}

export default function WelcomeScreen() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [showInsights, setShowInsights] = useState<boolean>(false);

  const {
    appName,
    dashboardData,
    expenditureAnalytics,
    loadingDashboard,
    dashboardError,
    refreshDashboard,
    handleDeleteTransaction,
  } = useOnboardingViewModel();

  const hasInsights = Boolean(
    expenditureAnalytics && expenditureAnalytics.totalExpenditure > 0
  );

  const contributionSlices: PieSlice[] = useMemo(() => {
    if (!expenditureAnalytics || expenditureAnalytics.contributions.length === 0) {
      return [];
    }
    return expenditureAnalytics.contributions.map((c) => ({
      id: c.userId,
      label: c.name,
      value: c.amount,
      color: c.color,
      subtitle: c.isCurrentUser
        ? 'Personal + household share'
        : 'Household contribution',
    }));
  }, [expenditureAnalytics]);

  const confirmRemoveTransaction = (
    categoryName: string,
    transactionId: string
  ) => {
    confirmDestructiveAction(
      'Delete Transaction',
      `Delete this "${categoryName}" transaction?`,
      'Delete',
      () => {
        void handleDeleteTransaction(transactionId);
      }
    );
  };

  useFocusEffect(
    useCallback(() => {
      void refreshDashboard();
    }, [refreshDashboard])
  );

  const handleFinishSplash = useCallback(() => {
    setShowSplash(false);
  }, []);

  if (showSplash) {
    return (
      <ScreenContainer>
        <BrandSplashView onFinish={handleFinishSplash} />
      </ScreenContainer>
    );
  }

  const primarySummary = dashboardData?.summaries?.[0] ?? null;

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Compact Single-Line Top Bar (Settings Icon Only on Top Right) */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <FinoraBrandIcon size={32} />
              <Text
                style={styles.title}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {appName}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/settings')}
              style={styles.settingsIconBtn}
              hitSlop={10}
              accessibilityLabel="Settings"
            >
              <Text style={styles.settingsIconText}>⚙️</Text>
            </Pressable>
          </View>

          {/* Authenticated & Active Household View */}
          {dashboardData ? (
            <View style={styles.liveSection}>
              <Card style={styles.summaryCard}>
                {/* Household Title & Actions: Info Insight Button (only if insights exist) + Refresh Icon */}
                <View style={styles.summaryHeaderRow}>
                  <Text
                    style={styles.householdName}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {dashboardData.context.household.name}
                  </Text>

                  <View style={styles.headerActionsGroup}>
                    {/* (i) Insight Button - appears ONLY if there is any insight, disappears otherwise */}
                    {hasInsights ? (
                      <Pressable
                        onPress={() => setShowInsights((prev) => !prev)}
                        style={[
                          styles.infoBtn,
                          showInsights && styles.infoBtnActive,
                        ]}
                        hitSlop={8}
                        accessibilityLabel="Expenditure Insights"
                      >
                        <Text
                          style={[
                            styles.infoBtnText,
                            showInsights && styles.infoBtnTextActive,
                          ]}
                        >
                          ⓘ
                        </Text>
                      </Pressable>
                    ) : null}

                    {/* Refresh Button as clean icon */}
                    <Pressable
                      onPress={refreshDashboard}
                      hitSlop={8}
                      style={styles.refreshIconBtn}
                      accessibilityLabel="Refresh Dashboard"
                    >
                      {loadingDashboard ? (
                        <ActivityIndicator
                          size="small"
                          color={Colors.primary}
                        />
                      ) : (
                        <Text style={styles.refreshIconText}>🔄</Text>
                      )}
                    </Pressable>
                  </View>
                </View>

                {/* Responsive Quick Navigation Pills */}
                <View style={styles.quickNavRow}>
                  <Pressable
                    onPress={() => router.push('/dashboard')}
                    style={styles.quickNavPill}
                  >
                    <Text
                      style={styles.quickNavPillText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      📊 Stats
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push('/accounts')}
                    style={styles.quickNavPill}
                  >
                    <Text
                      style={styles.quickNavPillText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      🏦 Accounts
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push('/household')}
                    style={styles.quickNavPill}
                  >
                    <Text
                      style={styles.quickNavPillText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      👥 Members
                    </Text>
                  </Pressable>
                </View>

                {/* Insights Drawer (Toggled by the (i) button) */}
                {showInsights && hasInsights && expenditureAnalytics ? (
                  <View style={styles.analyticsInsightsBox}>
                    <View style={styles.insightsHeader}>
                      <Text style={styles.insightsHeaderTitle}>
                        💡 Spending Insights
                      </Text>
                      <Pressable
                        onPress={() => setShowInsights(false)}
                        hitSlop={6}
                      >
                        <Text style={styles.insightsCloseBtn}>✕</Text>
                      </Pressable>
                    </View>

                    {/* Top Contributor */}
                    {expenditureAnalytics.topContributor ? (
                      <View style={styles.insightItem}>
                        <Text style={styles.insightEmoji}>👑</Text>
                        <View style={styles.insightCol}>
                          <Text style={styles.insightTitle}>
                            Top Contributor
                          </Text>
                          <Text style={styles.insightText}>
                            <Text style={styles.insightBold}>
                              {expenditureAnalytics.topContributor.name}
                            </Text>{' '}
                            contributed{' '}
                            {formatCurrencyAmount(
                              expenditureAnalytics.topContributor.amount,
                              primarySummary?.currency ?? 'INR'
                            )}{' '}
                            ({expenditureAnalytics.topContributor.percentage}%
                            of expenses)
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Multi-member Split Overview */}
                    {expenditureAnalytics.isMultiMember ? (
                      <View style={styles.insightItem}>
                        <Text style={styles.insightEmoji}>⚖️</Text>
                        <View style={styles.insightCol}>
                          <Text style={styles.insightTitle}>
                            Contribution Split Ratio
                          </Text>
                          <Text style={styles.insightText}>
                            {expenditureAnalytics.contributions
                              .map((c) => `${c.name}: ${c.percentage}%`)
                              .join('  •  ')}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.insightItem}>
                        <Text style={styles.insightEmoji}>👥</Text>
                        <View style={styles.insightCol}>
                          <Text style={styles.insightTitle}>
                            Solo Contributor
                          </Text>
                          <Text style={styles.insightText}>
                            You contributed 100% of recorded expenses. Tap
                            &ldquo;Members&rdquo; above to invite your partner
                            or family.
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                ) : null}

                {/* 1. Responsive Pie Chart in the SAME Card (Numeric card removed, Total Spent retained in center) */}
                <ResponsivePieChart
                  slices={contributionSlices}
                  currency={primarySummary?.currency ?? 'INR'}
                  centerLabel="Total Spent"
                  centerValue={
                    expenditureAnalytics &&
                    expenditureAnalytics.totalExpenditure > 0
                      ? formatCurrencyAmount(
                          expenditureAnalytics.totalExpenditure,
                          primarySummary?.currency ?? 'INR'
                        )
                      : primarySummary
                        ? formatCurrencyAmount(
                            primarySummary.household_total_expense,
                            primarySummary.currency
                          )
                        : undefined
                  }
                  emptyMessage="No expenditure recorded this month"
                />

                {/* Sub-Metrics Underneath in the SAME Card */}
                {primarySummary ? (
                  <View style={styles.subMetricsRow}>
                    <View style={styles.subMetricBox}>
                      <Text
                        style={styles.subMetricLabel}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        Personal
                      </Text>
                      <Text
                        style={styles.subMetricValue}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {formatCurrencyAmount(
                          primarySummary.my_personal_expense,
                          primarySummary.currency
                        )}
                      </Text>
                    </View>

                    <View style={styles.subMetricBox}>
                      <Text
                        style={styles.subMetricLabel}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        My HH Share
                      </Text>
                      <Text
                        style={styles.subMetricValue}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {formatCurrencyAmount(
                          primarySummary.my_household_contribution_expense,
                          primarySummary.currency
                        )}
                      </Text>
                    </View>

                    <View style={styles.subMetricBox}>
                      <Text
                        style={styles.subMetricLabel}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        Household
                      </Text>
                      <Text
                        style={styles.subMetricValueHighlight}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {formatCurrencyAmount(
                          primarySummary.household_total_expense,
                          primarySummary.currency
                        )}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </Card>

              {/* Recent Transactions Section */}
              <View style={styles.recentListSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeading}>Recent Transactions</Text>
                  <Pressable
                    onPress={() => router.push('/transactions')}
                    hitSlop={8}
                  >
                    <Text style={styles.refreshLink}>View All →</Text>
                  </Pressable>
                </View>

                {dashboardData.recentTransactions.length === 0 ? (
                  <Card style={styles.emptyCard}>
                    <Text style={styles.emptyText}>
                      No transactions recorded yet. Tap &ldquo;+ Add
                      Transaction&rdquo; below to record your first income or
                      expense.
                    </Text>
                  </Card>
                ) : (
                  dashboardData.recentTransactions.map((tx) => {
                    const mnemonic = getScopeMnemonic(tx.scope, tx.visibility);
                    const isMine =
                      tx.created_by === dashboardData.context.userId;
                    return (
                      <Pressable
                        key={tx.id}
                        onPress={() => router.push(`/transactions/${tx.id}`)}
                      >
                        <Card style={styles.txRowCard}>
                          <View style={styles.txMainRow}>
                            {/* Compact Mnemonic Icon Badge */}
                            <View style={styles.txMnemonicCircle}>
                              <Text style={styles.txMnemonicIcon}>
                                {mnemonic.icon}
                              </Text>
                            </View>

                            {/* Category Name + Compact Single-Line Meta */}
                            <View style={styles.txCenterCol}>
                              <Text
                                style={styles.txCategoryName}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {tx.category?.name ?? 'Transaction'}
                              </Text>
                              <Text
                                style={styles.txMeta}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {formatCompactDate(tx.transaction_date)} •{' '}
                                {mnemonic.shortLabel}
                                {tx.description ? ` • ${tx.description}` : ''}
                              </Text>
                            </View>

                            {/* Responsive Non-Colliding Amount + Delete Button */}
                            <View style={styles.txRightGroup}>
                              <Text
                                style={[
                                  styles.txAmount,
                                  tx.type === 'income'
                                    ? styles.txIncome
                                    : styles.txExpense,
                                ]}
                                numberOfLines={1}
                              >
                                {tx.type === 'income' ? '+' : '-'}
                                {formatCurrencyAmount(tx.amount, tx.currency)}
                              </Text>
                              {isMine ? (
                                <Pressable
                                  onPress={() =>
                                    confirmRemoveTransaction(
                                      tx.category?.name ?? 'Transaction',
                                      tx.id
                                    )
                                  }
                                  style={styles.txDeleteBtn}
                                  hitSlop={8}
                                  accessibilityLabel="Delete Transaction"
                                >
                                  <Text style={styles.txDeleteIcon}>🗑️</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          </View>
                        </Card>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </View>
          ) : (
            /* Unauthenticated or Household Setup Pending -> Direct Login & Household Setup Flow */
            <AuthAndSetupFlow
              onComplete={() => {
                void refreshDashboard();
              }}
            />
          )}

          {dashboardError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{dashboardError}</Text>
            </View>
          ) : null}
        </ScrollView>

        {dashboardData ? (
          <View style={styles.footer}>
            <Button
              title="+ Add Transaction"
              variant="primary"
              onPress={() => {
                router.push('/transactions/add');
              }}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
    gap: Spacing.sm + 2,
  },
  header: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  settingsIconBtn: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconText: {
    fontSize: 16,
  },
  miniIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniIconText: {
    fontSize: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  liveSection: {
    gap: Spacing.md,
  },
  summaryCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  chartCard: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  chartTitleCol: {
    flex: 1,
  },
  chartBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.8,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  memberBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.xs + 4,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  memberBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  analyticsInsightsBox: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  insightEmoji: {
    fontSize: 16,
    marginTop: 1,
  },
  insightCol: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  insightText: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginTop: 1,
  },
  insightBold: {
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoBtn: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  infoBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  infoBtnTextActive: {
    color: Colors.primaryDark,
  },
  refreshIconBtn: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIconText: {
    fontSize: 13,
  },
  insightsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  insightsHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  insightsCloseBtn: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    paddingHorizontal: 4,
  },
  householdName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  refreshLink: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    flexShrink: 0,
  },
  quickNavRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickNavPill: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickNavPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  metricsStack: {
    gap: Spacing.xs + 2,
  },
  mainExpenditureCard: {
    width: '100%',
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 2,
  },
  mainExpenditureLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  mainExpenditureValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  subMetricsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  subMetricBox: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs + 3,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 2,
  },
  subMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  subMetricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subMetricValueHighlight: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  recentListSection: {
    gap: Spacing.xs + 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  txRowCard: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm + 4,
  },
  txMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  txMnemonicCircle: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  txMnemonicIcon: {
    fontSize: 13,
  },
  txCenterCol: {
    flex: 1,
    gap: 1,
  },
  txCategoryName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  txMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  txRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  txAmount: {
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 0,
  },
  txDeleteBtn: {
    padding: 4,
    borderRadius: BorderRadius.sm,
  },
  txDeleteIcon: {
    fontSize: 13,
  },
  txExpense: {
    color: Colors.textPrimary,
  },
  txIncome: {
    color: Colors.success,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  errorText: {
    fontSize: 12,
    color: Colors.danger,
  },
  footer: {
    paddingTop: Spacing.xs,
  },
});
