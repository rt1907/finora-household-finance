import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { CreateAccountModal } from '@/features/transactions/components/CreateAccountModal';
import { CreateCategoryModal } from '@/features/transactions/components/CreateCategoryModal';
import { useAddTransactionViewModel } from '@/features/transactions/hooks/useAddTransactionViewModel';
import {
  CATEGORY_ICON_PRESETS,
  PAYMENT_METHOD_OPTIONS,
} from '@/features/transactions/types/transaction.types';
import { formatReadableDate, getLocalTodayIsoDate } from '@/utils/date';

function getCategoryGlyph(iconName: string | null): string {
  if (!iconName) {
    return '🏷️';
  }
  const match = CATEGORY_ICON_PRESETS.find((item) => item.id === iconName);
  return match ? match.glyph : '🏷️';
}

export default function AddTransactionScreen() {
  const vm = useAddTransactionViewModel(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  });

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const currencyCode =
    vm.householdContext?.household.base_currency ?? 'INR';
  const currencySymbol = currencyCode === 'INR' ? '₹' : currencyCode;
  const todayIso = getLocalTodayIsoDate();

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 1. HEADER: Add transaction + close/back button */}
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Close Add Transaction"
          >
            <Text style={styles.backButtonText}>✕</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Add Transaction</Text>
          <View style={styles.headerRightSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Compact Sign-in / Household prompt if not yet authenticated */}
          {vm.loadingContext ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : !vm.householdContext ? (
            <Pressable
              onPress={() => router.push('/auth')}
              style={styles.signInBanner}
            >
              <Text style={styles.signInBannerText}>
                Sign in or create a household to save transactions →
              </Text>
            </Pressable>
          ) : null}

          {/* 2. EXPENSE / INCOME SEGMENTED SELECTOR */}
          <View style={styles.segmentedContainer}>
            <Pressable
              onPress={() => vm.setType('expense')}
              style={[
                styles.segmentButton,
                vm.type === 'expense' && styles.segmentExpenseActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  vm.type === 'expense' && styles.segmentLabelActive,
                ]}
              >
                Expense
              </Text>
            </Pressable>
            <Pressable
              onPress={() => vm.setType('income')}
              style={[
                styles.segmentButton,
                vm.type === 'income' && styles.segmentIncomeActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  vm.type === 'income' && styles.segmentLabelActive,
                ]}
              >
                Income
              </Text>
            </Pressable>
          </View>

          {/* 3. PROMINENT AMOUNT INPUT */}
          <Card style={styles.amountCard}>
            <Text style={styles.sectionCaption}>AMOUNT ({currencyCode})</Text>
            <View style={styles.amountInputRow}>
              <Text
                style={[
                  styles.currencySymbol,
                  vm.type === 'income'
                    ? styles.incomeAccentText
                    : styles.expenseAccentText,
                ]}
              >
                {currencySymbol}
              </Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                value={vm.amountText}
                onChangeText={vm.setAmountText}
                maxLength={12}
              />
            </View>
          </Card>

          {/* 4. PERSONAL / HOUSEHOLD SCOPE SELECTOR (Icon + Label only) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transaction Scope</Text>
            <View style={styles.scopeRow}>
              <Pressable
                onPress={() => vm.setScope('personal')}
                style={[
                  styles.scopeOption,
                  vm.scope === 'personal' && styles.scopeOptionSelected,
                ]}
              >
                <Text style={styles.scopeIcon}>👤</Text>
                <Text
                  style={[
                    styles.scopeTitle,
                    vm.scope === 'personal' && styles.scopeTitleSelected,
                  ]}
                >
                  Personal
                </Text>
              </Pressable>

              <Pressable
                onPress={() => vm.setScope('household')}
                style={[
                  styles.scopeOption,
                  vm.scope === 'household' && styles.scopeOptionSelected,
                ]}
              >
                <Text style={styles.scopeIcon}>🏠</Text>
                <Text
                  style={[
                    styles.scopeTitle,
                    vm.scope === 'household' && styles.scopeTitleSelected,
                  ]}
                >
                  Household
                </Text>
              </Pressable>
            </View>
          </View>

          {/* 5. CATEGORY SELECTOR (Dropdown with categories + plus icon button) */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Category</Text>
              <Pressable
                onPress={() => {
                  vm.setIsCategoryDropdownOpen(false);
                  vm.openCreateCategoryModal();
                }}
                hitSlop={8}
                style={styles.plusIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Add Category"
              >
                <Text style={styles.plusIconBtnText}>＋</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() =>
                vm.setIsCategoryDropdownOpen(!vm.isCategoryDropdownOpen)
              }
              style={styles.dropdownTrigger}
            >
              <View style={styles.dropdownSelectedRow}>
                <Text style={styles.dropdownIcon}>
                  {getCategoryGlyph(vm.selectedCategory?.icon ?? null)}
                </Text>
                <Text style={styles.dropdownSelectedText}>
                  {vm.selectedCategory?.name ?? 'Select category'}
                </Text>
              </View>
              <Text style={styles.dropdownChevron}>
                {vm.isCategoryDropdownOpen ? '▲' : '▼'}
              </Text>
            </Pressable>

            {vm.isCategoryDropdownOpen ? (
              <View style={styles.dropdownMenu}>
                {vm.filteredCategories.map((cat) => {
                  const isSelected = cat.id === vm.selectedCategoryId;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => {
                        vm.setSelectedCategoryId(cat.id);
                        vm.setIsCategoryDropdownOpen(false);
                      }}
                      style={[
                        styles.dropdownItem,
                        isSelected && styles.dropdownItemSelected,
                      ]}
                    >
                      <Text style={styles.dropdownIcon}>
                        {getCategoryGlyph(cat.icon)}
                      </Text>
                      <Text
                        style={[
                          styles.dropdownItemText,
                          isSelected && styles.dropdownItemTextSelected,
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={() => {
                    vm.setIsCategoryDropdownOpen(false);
                    vm.openCreateCategoryModal();
                  }}
                  style={styles.dropdownAddOption}
                  accessibilityRole="button"
                  accessibilityLabel="Add Custom Category"
                >
                  <View style={styles.plusIconSmallCircle}>
                    <Text style={styles.plusIconBtnText}>＋</Text>
                  </View>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* 6. ACCOUNT & PAYMENT METHOD SELECTOR */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Account & Payment Method</Text>
              <Pressable
                onPress={() => vm.openCreateAccountModal()}
                hitSlop={8}
                style={styles.plusIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Add Account"
              >
                <Text style={styles.plusIconBtnText}>＋</Text>
              </Pressable>
            </View>

            <View style={styles.paymentMethodGrid}>
              {PAYMENT_METHOD_OPTIONS.map((option) => {
                const isSelected = vm.paymentMethod === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => vm.setPaymentMethod(option.id)}
                    style={[
                      styles.paymentCard,
                      isSelected && styles.paymentCardSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.paymentTitle,
                        isSelected && styles.paymentTitleSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Selectable Account chips for the chosen payment method */}
            {vm.compatibleAccounts.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.accountChipsRow}
              >
                <Pressable
                  onPress={() => vm.setSelectedAccountId(null)}
                  style={[
                    styles.accountChip,
                    vm.selectedAccountId === null && styles.accountChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.accountChipText,
                      vm.selectedAccountId === null &&
                        styles.accountChipTextSelected,
                    ]}
                  >
                    No linked account
                  </Text>
                </Pressable>
                {vm.compatibleAccounts.map((acc) => {
                  const isSelected = acc.id === vm.selectedAccountId;
                  return (
                    <Pressable
                      key={acc.id}
                      onPress={() => vm.setSelectedAccountId(acc.id)}
                      style={[
                        styles.accountChip,
                        isSelected && styles.accountChipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.accountChipText,
                          isSelected && styles.accountChipTextSelected,
                        ]}
                      >
                        {acc.name}
                        {acc.institution_name
                          ? ` (${acc.institution_name})`
                          : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>

          {/* 7. DATE SELECTOR */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transaction Date</Text>
            <Card style={styles.dateCard}>
              <View style={styles.quickDateRow}>
                <Pressable
                  onPress={() => vm.handleSelectQuickDate(0)}
                  style={[
                    styles.quickDateChip,
                    vm.transactionDate === todayIso &&
                      styles.quickDateChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.quickDateText,
                      vm.transactionDate === todayIso &&
                        styles.quickDateTextSelected,
                    ]}
                  >
                    Today
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => vm.handleSelectQuickDate(-1)}
                  style={styles.quickDateChip}
                >
                  <Text style={styles.quickDateText}>Yesterday</Text>
                </Pressable>

                <Pressable
                  onPress={() => vm.handleStepDate(-1)}
                  style={styles.quickDateChip}
                >
                  <Text style={styles.quickDateText}>◀ -1 Day</Text>
                </Pressable>

                <Pressable
                  onPress={() => vm.handleStepDate(1)}
                  disabled={vm.transactionDate >= todayIso}
                  style={[
                    styles.quickDateChip,
                    vm.transactionDate >= todayIso && styles.disabledChip,
                  ]}
                >
                  <Text style={styles.quickDateText}>+1 Day ▶</Text>
                </Pressable>
              </View>

              <View style={styles.dateInputRow}>
                <Text style={styles.dateReadableLabel}>
                  {formatReadableDate(vm.transactionDate)}
                </Text>
                <TextInput
                  style={styles.dateIsoInput}
                  value={vm.transactionDate}
                  onChangeText={vm.setTransactionDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textMuted}
                  maxLength={10}
                />
              </View>
            </Card>
          </View>

          {/* 8. OPTIONAL DESCRIPTION FIELD */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description (Optional)</Text>
            <TextInput
              style={styles.descriptionInput}
              placeholder="Add a note (e.g., Weekly vegetables, electricity bill)"
              placeholderTextColor={Colors.textMuted}
              value={vm.description}
              onChangeText={vm.setDescription}
              maxLength={500}
              multiline
            />
          </View>

          {/* 9. VISIBILITY CONTROL (Personal transactions only) */}
          {vm.scope === 'personal' ? (
            <Card style={styles.visibilityCard}>
              <View style={styles.visibilityRow}>
                <Text style={styles.visibilityTitle}>Visible to everyone</Text>
                <Switch
                  value={vm.shareWithHousehold}
                  onValueChange={vm.setShareWithHousehold}
                  trackColor={{
                    false: Colors.border,
                    true: Colors.primaryLight,
                  }}
                  thumbColor={
                    vm.shareWithHousehold ? Colors.primary : Colors.textMuted
                  }
                />
              </View>
            </Card>
          ) : null}

          {/* Error & Success Feedback Banners */}
          {vm.formError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{vm.formError}</Text>
            </View>
          ) : null}

          {vm.saveSuccessMessage ? (
            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>
                {vm.saveSuccessMessage}
              </Text>
            </View>
          ) : null}

          {/* 10. SAVE TRANSACTION BUTTON */}
          <View style={styles.saveContainer}>
            <Button
              title={vm.saving ? 'Saving Transaction...' : 'Save Transaction'}
              variant="primary"
              onPress={vm.handleSaveTransaction}
              disabled={vm.saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Custom Category Modal */}
      <CreateCategoryModal
        visible={vm.isCategoryModalOpen}
        transactionType={vm.type}
        name={vm.newCategoryName}
        selectedIcon={vm.newCategoryIcon}
        errorMessage={vm.categoryModalError}
        submitting={vm.creatingCategory}
        onChangeName={vm.setNewCategoryName}
        onSelectIcon={vm.setNewCategoryIcon}
        onClose={vm.closeCreateCategoryModal}
        onSubmit={vm.handleCreateCustomCategory}
      />

      {/* Create Account Modal */}
      <CreateAccountModal
        visible={vm.isAccountModalOpen}
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
        onClose={vm.closeCreateAccountModal}
        onSubmit={vm.handleCreateAccount}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.xs,
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
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerRightSpacer: {
    width: 32,
  },
  scrollContent: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm + 4,
  },
  signInBanner: {
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  signInBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  loadingText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentExpenseActive: {
    backgroundColor: Colors.primary,
  },
  segmentIncomeActive: {
    backgroundColor: Colors.success,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  segmentLabelActive: {
    color: Colors.surface,
  },
  amountCard: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: 2,
  },
  sectionCaption: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: Colors.textMuted,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  currencySymbol: {
    fontSize: 26,
    fontWeight: '700',
  },
  expenseAccentText: {
    color: Colors.primary,
  },
  incomeAccentText: {
    color: Colors.success,
  },
  amountInput: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    minWidth: 110,
    textAlign: 'center',
    paddingVertical: 2,
  },
  section: {
    gap: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  plusIconBtn: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusIconSmallCircle: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusIconBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primaryDark,
    lineHeight: 17,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  scopeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  scopeOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  scopeIcon: {
    fontSize: 14,
  },
  scopeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  scopeTitleSelected: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  dropdownSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownIcon: {
    fontSize: 14,
  },
  dropdownSelectedText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  dropdownChevron: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  dropdownMenu: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dropdownItemSelected: {
    backgroundColor: Colors.primaryLight,
  },
  dropdownItemText: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  dropdownItemTextSelected: {
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  dropdownAddOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentMethodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  paymentCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  paymentTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  paymentTitleSelected: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  accountChipsRow: {
    gap: Spacing.sm,
    paddingTop: 4,
  },
  accountChip: {
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  accountChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  accountChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  accountChipTextSelected: {
    color: Colors.primaryDark,
  },
  dateCard: {
    padding: Spacing.sm + 2,
    gap: Spacing.sm,
  },
  quickDateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickDateChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickDateChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  disabledChip: {
    opacity: 0.4,
  },
  quickDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  quickDateTextSelected: {
    color: Colors.primaryDark,
  },
  dateInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dateReadableLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  dateIsoInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    minWidth: 104,
    textAlign: 'center',
  },
  descriptionInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    fontSize: 13,
    color: Colors.textPrimary,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  visibilityCard: {
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visibilityTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  errorBannerText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  successBanner: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  successBannerText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  saveContainer: {
    marginTop: 4,
  },
});
