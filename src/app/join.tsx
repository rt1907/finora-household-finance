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
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { useAuthHouseholdViewModel } from '@/features/auth/hooks/useAuthHouseholdViewModel';

export default function JoinHouseholdDeepLinkScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const initialToken = typeof params.token === 'string' ? params.token : '';

  const vm = useAuthHouseholdViewModel(() => {
    router.replace('/');
  }, initialToken);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/')}
          style={styles.backBtn}
          hitSlop={10}
        >
          <Text style={styles.backBtnText}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Household Invitation</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.inviteBannerCard}>
          <Text style={styles.bannerTitle}>Join Partner&apos;s Household</Text>
          <Text style={styles.bannerText}>
            {vm.authUser
              ? 'Your invitation code is ready below. Tap "Accept & Join Household" to connect.'
              : 'Sign in or create an account first, and your invitation code will be ready to accept.'}
          </Text>
        </Card>

        {vm.loadingInitial ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : !vm.authUser ? (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Step 1: Sign In or Sign Up</Text>
            <Button
              title="Continue to Sign In / Sign Up"
              variant="primary"
              onPress={() =>
                router.replace({
                  pathname: '/auth',
                  params: initialToken ? { token: initialToken } : undefined,
                })
              }
            />
          </Card>
        ) : (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Accept Invitation</Text>
            <Text style={styles.helperText}>
              Signed in as {vm.authUser.email}
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Invitation Token</Text>
              <TextInput
                style={styles.input}
                placeholder="Paste invitation token or link"
                placeholderTextColor={Colors.textMuted}
                value={vm.inviteTokenInput}
                onChangeText={vm.setInviteTokenInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {vm.errorMessage ? (
              <Text style={styles.errorText}>{vm.errorMessage}</Text>
            ) : null}

            <Button
              title={
                vm.submitting ? 'Joining...' : 'Accept & Join Household'
              }
              variant="primary"
              disabled={vm.submitting}
              onPress={() => {
                void vm.handleJoinHouseholdByToken();
              }}
            />
          </Card>
        )}
      </ScrollView>
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
    fontSize: 14,
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
  scrollContent: {
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  centerBox: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBannerCard: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
    gap: 4,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  bannerText: {
    fontSize: 13,
    color: Colors.primaryDark,
    lineHeight: 18,
  },
  card: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  helperText: {
    fontSize: 12,
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
  errorText: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '500',
  },
});

