import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { KpiCashFlowBar } from '@/components/charts/KpiCashFlowBar';
import { KpiRadialGauge } from '@/components/charts/KpiRadialGauge';
import { ResponsivePieChart, PieSlice } from '@/components/charts/ResponsivePieChart';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { useDashboardViewModel } from '@/features/dashboard/hooks/useDashboardViewModel';
import { formatCurrencyAmount } from '@/utils/date';

const CATEGORY_COLORS = [
  '#0F766E', // Primary Teal
  '#4F46E5', // Indigo
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#0EA5E9', // Sky
  '#F43F5E', // Rose
];

function getCategoryEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('grocer') || lower.includes('dining') || lower.includes('food'))
    return '🛒';
  if (lower.includes('hous') || lower.includes('rent')) return '🏠';
  if (lower.includes('util') || lower.includes('bill')) return '⚡';
  if (lower.includes('transport') || lower.includes('fuel') || lower.includes('car'))
    return '🚗';
  if (lower.includes('health') || lower.includes('med')) return '❤️';
  if (lower.includes('shop')) return '🛍️';
  if (lower.includes('edu') || lower.includes('fam')) return '📚';
  if (lower.includes('leisure') || lower.includes('entert')) return '🎬';
  if (lower.includes('invest') || lower.includes('saving')) return '📈';
  return '🏷️';
}

export default function MonthlyDashboardScreen() {
  const vm = useDashboardViewModel();
  const s = vm.primarySummary;
  const currency =
    s?.currency ?? vm.dashboardData?.context.household.base_currency ?? 'INR';

  const myContributionPct =
    s && s.household_total_expense > 0
      ? Math.round(
          (s.my_household_contribution_expense / s.household_total_expense) *
            100
        )
      : 0;

  const netHouseholdCashFlow = s
    ? s.household_total_income - s.household_total_expense
    : 0;

  const personalSlices: PieSlice[] = useMemo(() => {
    const personal = s?.my_personal_expense ?? 0;
    const hhShare = s?.my_household_contribution_expense ?? 0;
    const slices: PieSlice[] = [];
    if (personal > 0) {
      slices.push({
        id: 'personal',
        label: 'Personal Expenses',
        value: personal,
        color: Colors.primary,
        subtitle: 'Private to you',
      });
    }
    if (hhShare > 0) {
      slices.push({
        id: 'hh-share',
        label: 'Household Share',
        value: hhShare,
        color: Colors.secondary,
        subtitle: 'Your share of joint costs',
      });
    }
    return slices;
  }, [s?.my_household_contribution_expense, s?.my_personal_expense]);

  const myMonthlyCategorySlices: PieSlice[] = useMemo(() => {
    return vm.categoryBreakdown.myCategories.map((item, idx) => ({
      id: item.categoryId,
      label: item.categoryName,
      value: item.amount,
      color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
      subtitle: `${item.percentage}% in ${vm.monthLabel}`,
    }));
  }, [vm.categoryBreakdown.myCategories, vm.monthLabel]);

  return (
    <ScreenContainer>
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          }}
          style={styles.backBtn}
          hitSlop={10}
        >
          <Text style={styles.backBtnText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Monthly Dashboard</Text>
        <Pressable
          onPress={() => router.push('/transactions/add')}
          hitSlop={8}
          style={styles.plusIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Add Transaction"
        >
          <Text style={styles.plusIconBtnText}>＋</Text>
        </Pressable>
      </View>

      {/* Month Switcher Bar */}
      <View style={styles.monthBar}>
        <Pressable
          onPress={vm.goToPreviousMonth}
          style={styles.monthNavBtn}
          hitSlop={8}
        >
          <Text style={styles.monthNavText}>◀ Prev</Text>
        </Pressable>

        <View style={styles.monthCenter}>
          <Text style={styles.monthLabel}>{vm.monthLabel}</Text>
          {!vm.isCurrentMonth ? (
            <Pressable onPress={vm.resetToCurrentMonth} hitSlop={6}>
              <Text style={styles.resetMonthLink}>Jump to Current</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={vm.goToNextMonth}
          disabled={vm.isCurrentMonth}
          style={[
            styles.monthNavBtn,
            vm.isCurrentMonth && styles.monthNavBtnDisabled,
          ]}
          hitSlop={8}
        >
          <Text
            style={[
              styles.monthNavText,
              vm.isCurrentMonth && styles.monthNavTextDisabled,
            ]}
          >
            Next ▶
          </Text>
        </Pressable>
      </View>

      {vm.loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : !vm.dashboardData ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptyText}>
            Please sign in and create or join a household to view your monthly
            financial dashboard.
          </Text>
          <Button
            title="Go to Sign In / Setup"
            variant="primary"
            onPress={() => router.push('/auth')}
          />
        </Card>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {vm.errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{vm.errorMessage}</Text>
            </View>
          ) : null}

          {/* SECTION 1: My Personal Finances (Pie Chart, Numbers Removed as Requested) */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionBadge}>SECTION 1 • PERSONAL</Text>
              <Text style={styles.sectionTitle}>My Personal Finances</Text>
            </View>

            <ResponsivePieChart
              slices={personalSlices}
              currency={currency}
              centerLabel="My Spending"
              centerValue={formatCurrencyAmount(
                s?.my_total_expenditure ?? 0,
                currency
              )}
              emptyMessage="No personal expenses recorded this month"
            />
          </Card>

          {/* SECTION 2: My Household Contribution (Single KPI Gauge Chart + Retained Numbers) */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionBadge}>SECTION 2 • CONTRIBUTION</Text>
              <Text style={styles.sectionTitle}>My Household Contribution</Text>
            </View>

            {/* Single KPI Radial Gauge Chart */}
            <View style={styles.kpiChartContainer}>
              <KpiRadialGauge
                percentage={myContributionPct}
                label="Your Share"
                subLabel={`You paid ${myContributionPct}% of household expenses in ${vm.monthLabel}`}
                color={Colors.primary}
              />
            </View>

            {/* Retained Numbers */}
            <View style={styles.gridRow}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Household Paid by Me</Text>
                <Text style={styles.metricValue}>
                  {formatCurrencyAmount(
                    s?.my_household_contribution_expense ?? 0,
                    currency
                  )}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Household Income Added</Text>
                <Text style={styles.metricIncomeValue}>
                  {formatCurrencyAmount(
                    s?.my_household_contribution_income ?? 0,
                    currency
                  )}
                </Text>
              </View>
            </View>
          </Card>

          {/* SECTION 3: Overall Household Finances (Single KPI Cash Flow Bar Chart + Retained Numbers) */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionBadge}>SECTION 3 • HOUSEHOLD</Text>
              <Text style={styles.sectionTitle}>
                Overall Household Finances
              </Text>
            </View>

            {/* Single KPI Cash Flow Bar Chart */}
            <View style={styles.kpiChartContainer}>
              <KpiCashFlowBar
                expense={s?.household_total_expense ?? 0}
                income={s?.household_total_income ?? 0}
                currency={currency}
              />
            </View>

            {/* Retained Numbers */}
            <View style={styles.gridRow}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Household Expense</Text>
                <Text style={styles.metricValue}>
                  {formatCurrencyAmount(
                    s?.household_total_expense ?? 0,
                    currency
                  )}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Household Income</Text>
                <Text style={styles.metricIncomeValue}>
                  {formatCurrencyAmount(
                    s?.household_total_income ?? 0,
                    currency
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.highlightRow}>
              <View style={styles.highlightCol}>
                <Text style={styles.highlightLabel}>
                  Net Household Cash Flow
                </Text>
                <Text
                  style={[
                    styles.highlightValue,
                    netHouseholdCashFlow < 0 && styles.negativeValue,
                  ]}
                >
                  {netHouseholdCashFlow >= 0 ? '+' : '-'}
                  {formatCurrencyAmount(
                    Math.abs(netHouseholdCashFlow),
                    currency
                  )}
                </Text>
              </View>
            </View>
          </Card>

          {/* Category Breakdown: Household Expenses */}
          <Card style={styles.sectionCard}>
            <View style={styles.rowBetween}>
              <View style={styles.titleWithIconRow}>
                <Text style={styles.categoryHeaderIcon}>🏠</Text>
                <Text style={styles.sectionTitle}>
                  Household Categories ({vm.monthLabel})
                </Text>
              </View>
              {/* 3. History with relevant icon */}
              <Pressable
                onPress={() => router.push('/transactions')}
                hitSlop={8}
                style={styles.historyBtn}
                accessibilityRole="button"
                accessibilityLabel="View Transaction History"
              >
                <Text style={styles.historyBtnIcon}>📜</Text>
                <Text style={styles.historyBtnText}>History</Text>
              </Pressable>
            </View>

            {vm.categoryBreakdown.householdCategories.length === 0 ? (
              <Text style={styles.emptyText}>
                No shared or household expenses recorded in {vm.monthLabel}.
              </Text>
            ) : (
              vm.categoryBreakdown.householdCategories.map((item) => (
                <View key={item.categoryId} style={styles.catItem}>
                  <View style={styles.rowBetween}>
                    <View style={styles.catNameWithIcon}>
                      <Text style={styles.catItemEmoji}>
                        {getCategoryEmoji(item.categoryName)}
                      </Text>
                      <Text style={styles.catName}>{item.categoryName}</Text>
                    </View>
                    <Text style={styles.catAmount}>
                      {formatCurrencyAmount(item.amount, currency)} (
                      {item.percentage}%)
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.max(item.percentage, 4)}%` },
                      ]}
                    />
                  </View>
                </View>
              ))
            )}
          </Card>

          {/* Category Breakdown: My Personal & Household Expenditure (3. Monthly Pie Chart) */}
          <Card style={styles.sectionCard}>
            <View style={styles.titleWithIconRow}>
              <Text style={styles.categoryHeaderIcon}>💳</Text>
              <Text style={styles.sectionTitle}>
                My Spending by Category ({vm.monthLabel})
              </Text>
            </View>

            <ResponsivePieChart
              slices={myMonthlyCategorySlices}
              currency={currency}
              centerLabel={vm.monthLabel}
              centerValue={
                myMonthlyCategorySlices.length > 0
                  ? formatCurrencyAmount(
                      myMonthlyCategorySlices.reduce(
                        (acc, curr) => acc + curr.value,
                        0
                      ),
                      currency
                    )
                  : undefined
              }
              emptyMessage={`No personal expenses recorded in ${vm.monthLabel}`}
            />
          </Card>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  addLink: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  plusIconBtn: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusIconBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primaryDark,
    lineHeight: 18,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 4,
    marginBottom: Spacing.sm,
  },
  monthNavBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  monthNavBtnDisabled: {
    opacity: 0.4,
  },
  monthNavText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  monthNavTextDisabled: {
    color: Colors.textMuted,
  },
  monthCenter: {
    alignItems: 'center',
    gap: 2,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  resetMonthLink: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  sectionCard: {
    gap: Spacing.sm,
  },
  kpiChartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: Spacing.xs,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primaryDark,
    letterSpacing: 0.6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metricBox: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm + 2,
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  metricIncomeValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.success,
  },
  highlightRow: {
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  highlightCol: {
    gap: 2,
  },
  highlightLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  highlightValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  negativeValue: {
    color: Colors.danger,
  },
  sharePillRow: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sharePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleWithIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  categoryHeaderIcon: {
    fontSize: 16,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  historyBtnIcon: {
    fontSize: 13,
  },
  historyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  catNameWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  catItemEmoji: {
    fontSize: 14,
  },
  catItem: {
    gap: 4,
    paddingTop: 4,
  },
  catName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  catAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  progressTrack: {
    height: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  progressFillPersonal: {
    height: '100%',
    backgroundColor: Colors.secondary,
    borderRadius: BorderRadius.full,
  },
  emptyCard: {
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  errorText: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '500',
  },
});

