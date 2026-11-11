import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { useAuthHouseholdViewModel } from '@/features/auth/hooks/useAuthHouseholdViewModel';
import { confirmDestructiveAction } from '@/utils/confirm';

interface AuthAndSetupFlowProps {
  initialInviteToken?: string;
  onComplete: () => void;
}

export function AuthAndSetupFlow({
  initialInviteToken = '',
  onComplete,
}: AuthAndSetupFlowProps) {
  const vm = useAuthHouseholdViewModel(onComplete, initialInviteToken);

  const confirmDeleteAccount = () => {
    confirmDestructiveAction(
      'Delete Account',
      'Are you sure you want to permanently delete your account and associated personal data? This cannot be undone.',
      'Delete Account',
      () => {
        void vm.handleDeleteAccount();
      }
    );
  };

  if (vm.loadingInitial) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.helperText}>Checking your session...</Text>
      </View>
    );
  }

  // Step 1: Not Signed In -> Sign In / Sign Up Form + Google Sign-In
  if (!vm.authUser) {
    return (
      <Card style={styles.formCard}>
        <View style={styles.segmentedRow}>
          <Pressable
            onPress={() => vm.setMode('signin')}
            style={[
              styles.segmentBtn,
              vm.mode === 'signin' && styles.segmentBtnActive,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                vm.mode === 'signin' && styles.segmentTextActive,
              ]}
            >
              Sign In
            </Text>
          </Pressable>
          <Pressable
            onPress={() => vm.setMode('signup')}
            style={[
              styles.segmentBtn,
              vm.mode === 'signup' && styles.segmentBtnActive,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                vm.mode === 'signup' && styles.segmentTextActive,
              ]}
            >
              Sign Up
            </Text>
          </Pressable>
        </View>

        {vm.mode === 'signup' ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Ronnie"
              placeholderTextColor={Colors.textMuted}
              value={vm.fullName}
              onChangeText={vm.setFullName}
              autoCapitalize="words"
            />
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={vm.email}
            onChangeText={vm.setEmail}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Minimum 6 characters"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            value={vm.password}
            onChangeText={vm.setPassword}
          />
        </View>

        {vm.errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{vm.errorMessage}</Text>
          </View>
        ) : null}

        {vm.infoMessage ? (
          <View style={styles.infoBanner}>
            <Text style={styles.infoText}>{vm.infoMessage}</Text>
          </View>
        ) : null}

        <Button
          title={
            vm.submitting
              ? 'Please wait...'
              : vm.mode === 'signin'
                ? 'Sign In'
                : 'Create Account'
          }
          variant="primary"
          onPress={() => {
            void vm.handleAuthSubmit();
          }}
          disabled={vm.submitting}
        />

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          onPress={() => {
            void vm.handleGoogleSignIn();
          }}
          disabled={vm.submitting}
          style={styles.googleBtn}
        >
          <Text style={styles.googleBtnIcon}>G</Text>
          <Text style={styles.googleBtnText}>Continue with Google</Text>
        </Pressable>
      </Card>
    );
  }

  // Step 2: Signed In, No Household Yet -> Create or Join Household
  if (!vm.householdContext) {
    return (
      <View style={styles.setupContainer}>
        <Card style={styles.formCard}>
          <Text style={styles.cardHeading}>Create Your Household</Text>
          <Text style={styles.helperText}>
            Signed in as {vm.authUser.email}. Give your home ledger a name to
            get started.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Household Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Our Home"
              placeholderTextColor={Colors.textMuted}
              value={vm.householdName}
              onChangeText={vm.setHouseholdName}
            />
          </View>

          <Button
            title={vm.submitting ? 'Creating...' : 'Create Group'}
            variant="primary"
            onPress={() => {
              void vm.handleCreateHousehold();
            }}
            disabled={vm.submitting}
          />
        </Card>

        <Card style={styles.formCard}>
          <Text style={styles.cardHeading}>Join Partner&apos;s Household</Text>
          <Text style={styles.helperText}>
            Have an invitation link or token from your partner? Paste it below.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Invitation Token or Link</Text>
            <TextInput
              style={styles.input}
              placeholder="Paste token or link"
              placeholderTextColor={Colors.textMuted}
              value={vm.inviteTokenInput}
              onChangeText={vm.setInviteTokenInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {vm.errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{vm.errorMessage}</Text>
            </View>
          ) : null}

          <Button
            title={vm.submitting ? 'Joining...' : 'Join Household with Token'}
            variant="secondary"
            onPress={() => {
              void vm.handleJoinHouseholdByToken();
            }}
            disabled={vm.submitting}
          />

          <Button
            title="Sign Out"
            variant="outline"
            onPress={() => {
              void vm.handleSignOut();
            }}
            disabled={vm.submitting}
          />

          <Button
            title="Delete Account"
            variant="danger"
            onPress={confirmDeleteAccount}
            disabled={vm.submitting}
          />
        </Card>
      </View>
    );
  }

  // Step 3: Signed In & Active Household
  return (
    <Card style={styles.formCard}>
      <Text style={styles.cardHeading}>
        {vm.householdContext.household.name}
      </Text>
      <Text style={styles.helperText}>
        Signed in as {vm.authUser.email} ({vm.householdContext.role})
      </Text>

      <Button
        title="Continue to Dashboard"
        variant="primary"
        onPress={onComplete}
      />

      <Button
        title="Sign Out"
        variant="outline"
        onPress={() => {
          void vm.handleSignOut();
        }}
        disabled={vm.submitting}
      />

      <Button
        title="Delete Account"
        variant="danger"
        onPress={confirmDeleteAccount}
        disabled={vm.submitting}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  setupContainer: {
    gap: Spacing.md,
  },
  centerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  formCard: {
    gap: Spacing.md,
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  helperText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.surface,
  },
  fieldGroup: {
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
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
    fontWeight: '500',
    lineHeight: 17,
  },
  infoBanner: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  infoText: {
    fontSize: 12,
    color: Colors.primaryDark,
    fontWeight: '600',
    lineHeight: 17,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: 11,
    backgroundColor: Colors.background,
  },
  googleBtnIcon: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  googleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});

