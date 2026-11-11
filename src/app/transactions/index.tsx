import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { useTransactionListViewModel } from '@/features/transactions/hooks/useTransactionListViewModel';
import {
  CATEGORY_ICON_PRESETS,
  TransactionScopeFilter,
} from '@/features/transactions/types/transaction.types';
import { formatCompactDate, formatCurrencyAmount } from '@/utils/date';

const FILTER_OPTIONS: { id: TransactionScopeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'personal', label: 'Personal' },
  { id: 'household', label: 'Household' },
];

function getCategoryGlyph(iconName: string | null | undefined): string {
  if (!iconName) {
    return '🏷️';
  }
  const match = CATEGORY_ICON_PRESETS.find((item) => item.id === iconName);
  return match ? match.glyph : '🏷️';
}

export default function TransactionsListScreen() {
  const vm = useTransactionListViewModel();
  const { reloadTransactions } = vm;

  useFocusEffect(
    useCallback(() => {
      void reloadTransactions();
    }, [reloadTransactions])
  );

  const confirmDeleteTransaction = (
    txId: string,
    categoryLabel: string
  ) => {
    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' &&
        window.confirm(`Delete "${categoryLabel}" transaction?`);
      if (confirmed) {
        void vm.handleDeleteTransaction(txId);
      }
      return;
    }

    Alert.alert(
      'Delete Transaction',
      `Remove "${categoryLabel}" permanently?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void vm.handleDeleteTransaction(txId);
          },
        },
      ]
    );
  };

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable
          onPress={handleClose}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Transactions</Text>
        <Pressable
          onPress={() => router.push('/transactions/add')}
          style={styles.addMiniBtn}
          accessibilityRole="button"
          accessibilityLabel="Add Transaction"
        >
          <Text style={styles.addMiniBtnText}>＋</Text>
        </Pressable>
      </View>

      {/* Filter Tabs: All / Personal / Household */}
      <View style={styles.filterBar}>
        {FILTER_OPTIONS.map((tab) => {
          const isSelected = vm.scopeFilter === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => vm.setScopeFilter(tab.id)}
              style={[
                styles.filterTab,
                isSelected && styles.filterTabSelected,
              ]}
            >
              <Text
                style={[
                  styles.filterTabText,
                  isSelected && styles.filterTabTextSelected,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {vm.loading ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.helperText}>Loading transactions...</Text>
          </View>
        ) : vm.errorMessage ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{vm.errorMessage}</Text>
          </Card>
        ) : vm.filteredTransactions.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No transactions found for this filter.
            </Text>
          </Card>
        ) : (
          vm.filteredTransactions.map((tx) => {
            const isMine =
              vm.householdContext?.userId === tx.created_by;
            const isDeleting = vm.deletingTransactionId === tx.id;
            const categoryLabel = tx.category?.name ?? 'Transaction';
            return (
              <Pressable
                key={tx.id}
                onPress={() => router.push(`/transactions/${tx.id}`)}
              >
                <Card style={styles.txCard}>
                  <View style={styles.txRowTop}>
                    <View style={styles.txTitleGroup}>
                      <Text style={styles.txGlyph}>
                        {getCategoryGlyph(tx.category?.icon)}
                      </Text>
                      <Text
                        style={styles.txCategoryName}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {categoryLabel}
                      </Text>
                    </View>
                    <View style={styles.txRightActions}>
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
                          disabled={isDeleting}
                          onPress={(e) => {
                            e.stopPropagation();
                            confirmDeleteTransaction(tx.id, categoryLabel);
                          }}
                          hitSlop={8}
                          style={styles.txDeleteBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Delete transaction"
                        >
                          <Text style={styles.txDeleteIcon}>
                            {isDeleting ? '…' : '🗑️'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.txRowBottom}>
                    <Text
                      style={styles.txMeta}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {formatCompactDate(tx.transaction_date)} •{' '}
                      {tx.scope === 'household'
                        ? '🏠 HH'
                        : tx.visibility === 'shared'
                          ? '👥 Shared'
                          : '🔒 Priv'}
                    </Text>
                    <Text style={styles.editHint}>
                      {isMine ? 'Edit' : 'View'}
                    </Text>
                  </View>

                  {tx.description ? (
                    <Text style={styles.txDescription} numberOfLines={1}>
                      {tx.description}
                    </Text>
                  ) : null}
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="+ Add Transaction"
          variant="primary"
          onPress={() => router.push('/transactions/add')}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  addMiniBtn: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMiniBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primaryDark,
    lineHeight: 18,
  },
  filterBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  filterTabSelected: {
    backgroundColor: Colors.primary,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterTabTextSelected: {
    color: Colors.surface,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  helperText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 12,
    color: Colors.danger,
  },
  emptyCard: {
    backgroundColor: Colors.surface,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  txCard: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    gap: 4,
  },
  txRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  txTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  txGlyph: {
    fontSize: 13,
    flexShrink: 0,
  },
  txCategoryName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  txRightActions: {
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
    padding: 3,
    borderRadius: BorderRadius.sm,
  },
  txDeleteIcon: {
    fontSize: 12,
  },
  txExpense: {
    color: Colors.textPrimary,
  },
  txIncome: {
    color: Colors.success,
  },
  txRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  editHint: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  txDescription: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  footer: {
    paddingTop: Spacing.xs,
  },
});

