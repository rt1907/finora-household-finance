import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { useAccountsViewModel } from '@/features/accounts/hooks/useAccountsViewModel';
import { CreateAccountModal } from '@/features/transactions/components/CreateAccountModal';
import { ACCOUNT_TYPE_LABELS } from '@/features/transactions/types/transaction.types';
import { confirmDestructiveAction } from '@/utils/confirm';
import { formatCurrencyAmount, formatReadableDate } from '@/utils/date';

export default function AccountsScreen() {
  const vm = useAccountsViewModel();

  const confirmArchive = (accountName: string, onConfirm: () => void) => {
    confirmDestructiveAction(
      'Archive Account',
      `Remove "${accountName}" from active accounts? Past transactions linked to it will be preserved.`,
      'Archive',
      onConfirm
    );
  };

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
        <Text style={styles.headerTitle}>Accounts & Balances</Text>
        <Pressable
          onPress={() => vm.openAddAccountModal('bank_account')}
          hitSlop={8}
          style={styles.plusIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Add Account"
        >
          <Text style={styles.plusIconBtnText}>＋</Text>
        </Pressable>
      </View>

      {vm.loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : !vm.householdContext ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptyText}>
            Please sign in and create or join a household to manage accounts and
            balances.
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
          {/* Summary Totals Card */}
          <Card style={styles.summaryCard}>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>My Manual Balances</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrencyAmount(
                    vm.totals.myTotalBalance,
                    vm.totals.currency
                  )}
                </Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Shared with Household</Text>
                <Text style={styles.summaryValueHighlight}>
                  {formatCurrencyAmount(
                    vm.totals.sharedHouseholdBalance,
                    vm.totals.currency
                  )}
                </Text>
              </View>
            </View>
            <Text style={styles.summaryNote}>
              Balances are entered manually and kept separate from daily
              transactions.
            </Text>
          </Card>

          {vm.errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{vm.errorMessage}</Text>
            </View>
          ) : null}

          {/* My Accounts Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>
                My Accounts ({vm.myAccounts.length})
              </Text>
              <Pressable
                onPress={() => vm.openAddAccountModal('bank_account')}
                hitSlop={8}
                style={styles.plusIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Add Account"
              >
                <Text style={styles.plusIconBtnText}>＋</Text>
              </Pressable>
            </View>

            {vm.myAccounts.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  No accounts added yet. Tap the ＋ button to add your Bank
                  Account, Cash, Credit Card, Fixed Deposit, Mutual Fund, or
                  Stocks.
                </Text>
              </Card>
            ) : (
              vm.myAccounts.map((acc) => {
                const isBusy = vm.updatingAccountId === acc.id;
                return (
                  <Card key={acc.id} style={styles.accountCard}>
                    <View style={styles.accountTopRow}>
                      <View style={styles.accountNameCol}>
                        <Text style={styles.accountName}>{acc.name}</Text>
                        <Text style={styles.accountMeta}>
                          {ACCOUNT_TYPE_LABELS[acc.type]}
                          {acc.institution_name
                            ? ` • ${acc.institution_name}`
                            : ''}
                        </Text>
                      </View>
                      <View style={styles.balanceCol}>
                        <Text style={styles.balanceAmount}>
                          {acc.latestBalance
                            ? formatCurrencyAmount(
                                acc.latestBalance.balance,
                                acc.currency
                              )
                            : 'No balance set'}
                        </Text>
                        {acc.latestBalance ? (
                          <Text style={styles.balanceDate}>
                            As of{' '}
                            {formatReadableDate(acc.latestBalance.as_of_date)}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Visible to everyone toggle */}
                    <View style={styles.visibilityRow}>
                      <Text style={styles.visibilityLabel}>
                        Visible to everyone
                      </Text>
                      <Switch
                        value={acc.is_shared_with_household}
                        disabled={isBusy}
                        onValueChange={(val) => {
                          void vm.handleToggleShareAccount(acc, val);
                        }}
                        trackColor={{
                          false: Colors.border,
                          true: Colors.primaryLight,
                        }}
                        thumbColor={
                          acc.is_shared_with_household
                            ? Colors.primary
                            : Colors.textMuted
                        }
                      />
                    </View>

                    {/* Action buttons row */}
                    <View style={styles.accountActionsRow}>
                      <Pressable
                        onPress={() => vm.openBalanceModal(acc)}
                        style={styles.updateBalanceBtn}
                      >
                        <Text style={styles.updateBalanceBtnText}>
                          Update Balance
                        </Text>
                      </Pressable>

                      <Pressable
                        disabled={isBusy}
                        onPress={() =>
                          confirmArchive(acc.name, () => {
                            void vm.handleArchiveAccount(acc);
                          })
                        }
                        style={styles.archiveBtn}
                      >
                        <Text style={styles.archiveBtnText}>Archive</Text>
                      </Pressable>
                    </View>
                  </Card>
                );
              })
            )}
          </View>

          {/* Shared by Partner / Family Members Section */}
          {vm.partnerSharedAccounts.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Shared by Household ({vm.partnerSharedAccounts.length})
              </Text>
              {vm.partnerSharedAccounts.map((acc) => (
                <Card key={acc.id} style={styles.accountCard}>
                  <View style={styles.accountTopRow}>
                    <View style={styles.accountNameCol}>
                      <Text style={styles.accountName}>{acc.name}</Text>
                      <Text style={styles.accountMeta}>
                        {ACCOUNT_TYPE_LABELS[acc.type]}
                        {acc.institution_name
                          ? ` • ${acc.institution_name}`
                          : ''}{' '}
                        • Shared by {acc.ownerDisplayName}
                      </Text>
                    </View>
                    <View style={styles.balanceCol}>
                      <Text style={styles.balanceAmount}>
                        {acc.latestBalance
                          ? formatCurrencyAmount(
                              acc.latestBalance.balance,
                              acc.currency
                            )
                          : 'No balance set'}
                      </Text>
                      {acc.latestBalance ? (
                        <Text style={styles.balanceDate}>
                          As of{' '}
                          {formatReadableDate(acc.latestBalance.as_of_date)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Modal: Add Account */}
      <CreateAccountModal
        visible={vm.accountModalVisible}
        name={vm.newAccountName}
        selectedType={vm.newAccountType}
        institutionName={vm.newAccountInstitution}
        shareWithHousehold={vm.newAccountShared}
        errorMessage={vm.accountModalError}
        submitting={vm.creatingAccount}
        onChangeName={vm.setNewAccountName}
        onSelectType={vm.setNewAccountType}
        onChangeInstitutionName={vm.setNewAccountInstitution}
        onToggleShareWithHousehold={vm.setNewAccountShared}
        onClose={() => vm.setAccountModalVisible(false)}
        onSubmit={() => {
          void vm.handleCreateAccount();
        }}
      />

      {/* Modal: Record Manual Balance */}
      <Modal
        visible={Boolean(vm.balanceModalAccount)}
        transparent
        animationType="slide"
        onRequestClose={vm.closeBalanceModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Update Balance • {vm.balanceModalAccount?.name}
              </Text>
              <Pressable onPress={vm.closeBalanceModal} hitSlop={8}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Current Balance ({vm.balanceModalAccount?.currency ?? 'INR'})
              </Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                value={vm.balanceInput}
                onChangeText={vm.setBalanceInput}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>As of Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textMuted}
                value={vm.balanceAsOfDate}
                onChangeText={vm.setBalanceAsOfDate}
                maxLength={10}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Note (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Monthly statement check"
                placeholderTextColor={Colors.textMuted}
                value={vm.balanceNotes}
                onChangeText={vm.setBalanceNotes}
                maxLength={150}
              />
            </View>

            {vm.balanceModalError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{vm.balanceModalError}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={vm.closeBalanceModal}
                disabled={vm.recordingBalance}
                style={styles.modalActionBtn}
              />
              <Button
                title={vm.recordingBalance ? 'Saving...' : 'Save Balance'}
                variant="primary"
                onPress={() => {
                  void vm.handleRecordBalance();
                }}
                disabled={vm.recordingBalance}
                style={styles.modalActionBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
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
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  summaryCard: {
    gap: Spacing.sm,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm + 2,
    gap: 2,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  summaryValueHighlight: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  summaryNote: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
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
  accountCard: {
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 4,
  },
  accountTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  accountNameCol: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  accountMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  balanceCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  balanceDate: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  visibilityLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  accountActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  updateBalanceBtn: {
    flex: 1,
    paddingVertical: Spacing.xs + 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
  },
  updateBalanceBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  archiveBtn: {
    paddingVertical: Spacing.xs + 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  archiveBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  modalCloseText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  modalActionBtn: {
    flex: 1,
  },
});

