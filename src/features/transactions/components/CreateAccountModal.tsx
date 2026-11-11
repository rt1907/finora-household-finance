import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { ACCOUNT_TYPE_LABELS } from '@/features/transactions/types/transaction.types';
import { AccountType } from '@/types/database';

const SUPPORTED_ACCOUNT_TYPES: AccountType[] = [
  'cash',
  'credit_card',
  'bank_account',
  'fixed_deposit',
  'mutual_fund',
  'stocks',
];

interface CreateAccountModalProps {
  visible: boolean;
  name: string;
  selectedType: AccountType;
  institutionName: string;
  shareWithHousehold: boolean;
  errorMessage: string | null;
  submitting: boolean;
  onChangeName: (value: string) => void;
  onSelectType: (type: AccountType) => void;
  onChangeInstitutionName: (value: string) => void;
  onToggleShareWithHousehold: (value: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CreateAccountModal({
  visible,
  name,
  selectedType,
  institutionName,
  shareWithHousehold,
  errorMessage,
  submitting,
  onChangeName,
  onSelectType,
  onChangeInstitutionName,
  onToggleShareWithHousehold,
  onClose,
  onSubmit,
}: CreateAccountModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Account</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <Text style={styles.helperText}>
            Accounts are private to you by default. Note: UPI is a payment method, not an account—add a Bank Account here to link UPI transactions.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Account Type</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.typeRow}
            >
              {SUPPORTED_ACCOUNT_TYPES.map((type) => {
                const isSelected = selectedType === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => onSelectType(type)}
                    style={[
                      styles.typeChip,
                      isSelected && styles.typeChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeLabel,
                        isSelected && styles.typeLabelSelected,
                      ]}
                    >
                      {ACCOUNT_TYPE_LABELS[type]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Account Name</Text>
            <TextInput
              style={styles.input}
              placeholder={
                selectedType === 'cash'
                  ? 'e.g., Cash Wallet'
                  : selectedType === 'credit_card'
                    ? 'e.g., HDFC Millennia Credit Card'
                    : 'e.g., Primary Savings Account'
              }
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={onChangeName}
              maxLength={100}
            />
          </View>

          {selectedType !== 'cash' ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Institution / Bank (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., HDFC Bank, SBI, ICICI"
                placeholderTextColor={Colors.textMuted}
                value={institutionName}
                onChangeText={onChangeInstitutionName}
                maxLength={100}
              />
            </View>
          ) : null}

          <View style={styles.shareRow}>
            <View style={styles.shareTextCol}>
              <Text style={styles.label}>Share account with household</Text>
              <Text style={styles.shareSubtext}>
                {shareWithHousehold
                  ? 'Household members can view this account and link transactions to it.'
                  : 'Private to you. Other household members cannot see this account.'}
              </Text>
            </View>
            <Switch
              value={shareWithHousehold}
              onValueChange={onToggleShareWithHousehold}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={
                shareWithHousehold ? Colors.primary : Colors.textMuted
              }
            />
          </View>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={onClose}
              disabled={submitting}
              style={styles.actionBtn}
            />
            <Button
              title={submitting ? 'Saving...' : 'Save Account'}
              variant="primary"
              onPress={onSubmit}
              disabled={submitting}
              style={styles.actionBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  helperText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  fieldGroup: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  typeRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  typeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 4,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  typeChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  typeLabelSelected: {
    color: Colors.primaryDark,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  shareTextCol: {
    flex: 1,
    gap: 2,
  },
  shareSubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  actionBtn: {
    flex: 1,
  },
});

