import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { formatCurrencyAmount } from '@/utils/date';

interface KpiCashFlowBarProps {
  expense: number;
  income: number;
  currency?: string;
}

export function KpiCashFlowBar({
  expense,
  income,
  currency = 'INR',
}: KpiCashFlowBarProps) {
  const total = expense + income;
  const expensePct = total > 0 ? Math.round((expense / total) * 100) : 50;
  const incomePct = total > 0 ? Math.round((income / total) * 100) : 50;
  const netFlow = income - expense;
  const isSurplus = netFlow >= 0;

  return (
    <View style={styles.container}>
      {/* Ratio Header */}
      <View style={styles.headerRow}>
        <View style={styles.ratioColLeft}>
          <Text style={styles.colLabel}>Expense Share</Text>
          <Text style={styles.expenseValue}>
            {expensePct}% • {formatCurrencyAmount(expense, currency)}
          </Text>
        </View>

        <View style={styles.badgeWrapper}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: isSurplus ? '#DCFCE7' : '#FEE2E2' },
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                { color: isSurplus ? '#166534' : '#991B1B' },
              ]}
            >
              {isSurplus ? '✓ Surplus' : '⚠ Deficit'}
            </Text>
          </View>
        </View>

        <View style={styles.ratioColRight}>
          <Text style={styles.colLabelRight}>Income Share</Text>
          <Text style={styles.incomeValue}>
            {incomePct}% • {formatCurrencyAmount(income, currency)}
          </Text>
        </View>
      </View>

      {/* Dual Progress Bar Track */}
      <View style={styles.track}>
        <View
          style={[
            styles.expenseSegment,
            { width: `${Math.max(4, Math.min(96, expensePct))}%` },
          ]}
        />
        <View
          style={[
            styles.incomeSegment,
            { width: `${Math.max(4, Math.min(96, incomePct))}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs + 2,
  },
  ratioColLeft: {
    flex: 1,
  },
  ratioColRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  colLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  colLabelRight: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  expenseValue: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.danger,
    marginTop: 1,
  },
  incomeValue: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.success,
    marginTop: 1,
    textAlign: 'right',
  },
  badgeWrapper: {
    paddingHorizontal: Spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: Spacing.xs + 4,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  track: {
    height: 10,
    width: '100%',
    flexDirection: 'row',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    backgroundColor: Colors.border,
  },
  expenseSegment: {
    height: '100%',
    backgroundColor: Colors.danger,
  },
  incomeSegment: {
    height: '100%',
    backgroundColor: Colors.success,
  },
});

