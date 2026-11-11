import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { useSettingsViewModel } from '@/features/settings/hooks/useSettingsViewModel';
import { CreateCategoryModal } from '@/features/transactions/components/CreateCategoryModal';
import { confirmDestructiveAction } from '@/utils/confirm';

export default function SettingsScreen() {
  const vm = useSettingsViewModel(() => {
    router.replace('/');
  });

  const confirmArchiveCategory = (
    categoryName: string,
    onConfirm: () => void
  ) => {
    confirmDestructiveAction(
      'Archive Custom Category',
      `Remove "${categoryName}" from new transaction selections? Past transactions will keep this category.`,
      'Archive',
      onConfirm
    );
  };

  const confirmDeleteAccount = () => {
    confirmDestructiveAction(
      'Delete Account',
      'Permanently delete your Finora account and personal data? This cannot be undone.',
      'Delete Account',
      () => {
        void vm.handleDeleteAccount();
      }
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
        <Text style={styles.headerTitle}>Profile & Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      {vm.loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : !vm.authUser ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Not Signed In</Text>
          <Text style={styles.helperText}>
            Sign in or create an account to manage your profile and household
            settings.
          </Text>
          <Button
            title="Sign In / Sign Up"
            variant="primary"
            onPress={() => router.push('/auth')}
          />
        </Card>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {vm.errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{vm.errorMessage}</Text>
            </View>
          ) : null}

          {vm.successMessage ? (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>{vm.successMessage}</Text>
            </View>
          ) : null}

          {/* 1. My Profile Card */}
          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>My Profile</Text>
              {vm.householdContext ? (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>
                    {vm.householdContext.role === 'owner'
                      ? 'Household Owner'
                      : 'Household Member'}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Signed-In Email</Text>
              <Text style={styles.readonlyValue}>{vm.authUser.email}</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Display Name</Text>
              <Text style={styles.helperText}>
                Shown to your partner on shared accounts and member lists.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Ronnie"
                placeholderTextColor={Colors.textMuted}
                value={vm.displayName}
                onChangeText={vm.setDisplayName}
                maxLength={80}
              />
            </View>

            <Button
              title={vm.savingProfile ? 'Saving...' : 'Save Display Name'}
              variant="primary"
              disabled={vm.savingProfile}
              onPress={() => {
                void vm.handleSaveProfileName();
              }}
            />
          </Card>

          {/* 2. Custom Household Categories Card */}
          {vm.householdContext ? (
            <Card style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>
                  Custom Categories ({vm.customCategories.length})
                </Text>
                <Pressable
                  onPress={() => vm.openAddCategoryModal('expense')}
                  style={styles.plusIconBtn}
                  hitSlop={8}
                  accessibilityLabel="Add Custom Category"
                >
                  <Text style={styles.plusIconText}>＋</Text>
                </Pressable>
              </View>

              {vm.customCategories.length === 0 ? (
                <Text style={styles.helperText}>
                  No custom categories created yet. Tap the ＋ button above to
                  add a custom category for your household.
                </Text>
              ) : (
                vm.customCategories.map((cat) => {
                  const canArchive =
                    cat.created_by === vm.authUser?.userId ||
                    vm.householdContext?.role === 'owner';
                  const isBusy = vm.archivingCategoryId === cat.id;

                  return (
                    <View key={cat.id} style={styles.categoryRow}>
                      <View style={styles.categoryInfo}>
                        <Text style={styles.categoryName}>{cat.name}</Text>
                        <Text style={styles.categoryMeta}>
                          {cat.type === 'income' ? 'Income' : 'Expense'}
                        </Text>
                      </View>
                      {canArchive ? (
                        <Pressable
                          disabled={isBusy}
                          onPress={() =>
                            confirmArchiveCategory(cat.name, () => {
                              void vm.handleArchiveCategory(cat);
                            })
                          }
                          style={styles.archiveBtn}
                        >
                          <Text style={styles.archiveBtnText}>
                            {isBusy ? '...' : 'Archive'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })
              )}
            </Card>
          ) : null}

          {/* 3. Session & Sign Out / Delete Account Card */}
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Account Session</Text>
            <Button
              title={vm.signingOut ? 'Signing Out...' : 'Sign Out'}
              variant="outline"
              disabled={vm.signingOut || vm.deletingAccount}
              onPress={() => {
                void vm.handleSignOut();
              }}
            />
            <Button
              title={
                vm.deletingAccount ? 'Deleting Account...' : 'Delete Account'
              }
              variant="danger"
              disabled={vm.signingOut || vm.deletingAccount}
              onPress={confirmDeleteAccount}
            />
          </Card>
        </ScrollView>
      )}

      {/* Modal: Create Custom Category */}
      <CreateCategoryModal
        visible={vm.categoryModalVisible}
        transactionType={vm.newCategoryType}
        name={vm.newCategoryName}
        selectedIcon={vm.newCategoryIcon}
        errorMessage={vm.categoryModalError}
        submitting={vm.creatingCategory}
        onChangeName={vm.setNewCategoryName}
        onSelectIcon={vm.setNewCategoryIcon}
        onClose={() => vm.setCategoryModalVisible(false)}
        onSubmit={() => {
          void vm.handleCreateCustomCategory();
        }}
      />
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
  headerSpacer: {
    width: 34,
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
  card: {
    gap: Spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  roleBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  readonlyValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  helperText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
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
  plusIconBtn: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusIconText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  categoryInfo: {
    gap: 2,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  categoryMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  archiveBtn: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  archiveBtnText: {
    fontSize: 11,
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
  successBanner: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  successText: {
    fontSize: 12,
    color: Colors.primaryDark,
    fontWeight: '600',
  },
});

