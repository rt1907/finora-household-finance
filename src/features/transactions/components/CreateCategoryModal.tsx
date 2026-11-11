import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { CATEGORY_ICON_PRESETS } from '@/features/transactions/types/transaction.types';
import { TransactionType } from '@/types/database';

interface CreateCategoryModalProps {
  visible: boolean;
  transactionType: TransactionType;
  name: string;
  selectedIcon: string;
  errorMessage: string | null;
  submitting: boolean;
  onChangeName: (value: string) => void;
  onSelectIcon: (iconId: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CreateCategoryModal({
  visible,
  transactionType,
  name,
  selectedIcon,
  errorMessage,
  submitting,
  onChangeName,
  onSelectIcon,
  onClose,
  onSubmit,
}: CreateCategoryModalProps) {
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
            <Text style={styles.title}>
              New {transactionType === 'expense' ? 'Expense' : 'Income'} Category
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <Text style={styles.helperText}>
            Custom categories are available to all members of your household.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Category Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Pet Care, Childcare, Side Project"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={onChangeName}
              maxLength={60}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Optional Icon</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.iconRow}
            >
              {CATEGORY_ICON_PRESETS.map((preset) => {
                const isSelected = selectedIcon === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => onSelectIcon(preset.id)}
                    style={[
                      styles.iconChip,
                      isSelected && styles.iconChipSelected,
                    ]}
                  >
                    <Text style={styles.iconGlyph}>{preset.glyph}</Text>
                    <Text
                      style={[
                        styles.iconLabel,
                        isSelected && styles.iconLabelSelected,
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
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
              title={submitting ? 'Creating...' : 'Create Category'}
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
  iconRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  iconChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  iconChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  iconGlyph: {
    fontSize: 15,
  },
  iconLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  iconLabelSelected: {
    color: Colors.primaryDark,
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

