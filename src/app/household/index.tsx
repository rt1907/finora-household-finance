import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { useHouseholdViewModel } from '@/features/household/hooks/useHouseholdViewModel';
import { formatReadableDate } from '@/utils/date';

export default function HouseholdScreen() {
  const vm = useHouseholdViewModel();

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Household & Members</Text>
          <View style={styles.headerRightSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {vm.loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.helperText}>Loading household...</Text>
            </View>
          ) : !vm.householdContext ? (
            <Card style={styles.cardSection}>
              <Text style={styles.sectionTitle}>Join a Household</Text>
              <Text style={styles.helperText}>
                Have an invitation token or link from your partner? Paste it below to join their household, or go to Sign In / Create Household.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Paste invitation token or link"
                placeholderTextColor={Colors.textMuted}
                value={vm.joinTokenInput}
                onChangeText={vm.setJoinTokenInput}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {vm.joinFeedback ? (
                <Text
                  style={
                    vm.joinFeedback.type === 'success'
                      ? styles.successText
                      : styles.errorText
                  }
                >
                  {vm.joinFeedback.text}
                </Text>
              ) : null}

              <Button
                title={vm.acceptingInvite ? 'Joining...' : 'Join Household'}
                variant="primary"
                onPress={vm.handleAcceptInviteToken}
                disabled={vm.acceptingInvite}
              />

              <Button
                title="Sign In / Create Household"
                variant="outline"
                onPress={() => router.push('/auth')}
              />
            </Card>
          ) : (
            <>
              {/* 1. Household Summary */}
              <Card style={styles.cardSection}>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.householdTitle}>
                      🏠 {vm.householdContext.household.name}
                    </Text>
                    <Text style={styles.helperText}>
                      Base Currency: {vm.householdContext.household.base_currency}
                    </Text>
                  </View>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>
                      {vm.householdContext.role === 'owner'
                        ? 'Owner'
                        : 'Member'}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* 2. Current Members List */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Members ({vm.members.length})
                </Text>
                {vm.members.map((member) => {
                  const isMe = member.user_id === vm.householdContext?.userId;
                  const displayName =
                    member.profile?.full_name ||
                    (isMe ? 'You' : 'Household Member');
                  return (
                    <Card key={member.id} style={styles.memberCard}>
                      <View style={styles.rowBetween}>
                        <View style={styles.memberNameGroup}>
                          <Text style={styles.memberIcon}>👤</Text>
                          <View>
                            <Text style={styles.memberName}>
                              {displayName} {isMe ? '(You)' : ''}
                            </Text>
                            <Text style={styles.memberJoined}>
                              Joined{' '}
                              {formatReadableDate(
                                member.joined_at.slice(0, 10)
                              )}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.memberRoleTag}>
                          {member.role === 'owner' ? 'Owner' : 'Member'}
                        </Text>
                      </View>
                    </Card>
                  );
                })}
              </View>

              {/* 3. Invite Partner / Family Member (Owner Only) */}
              {vm.isOwner ? (
                <Card style={styles.cardSection}>
                  <Text style={styles.sectionTitle}>
                    Invite Partner or Family Member
                  </Text>
                  <Text style={styles.helperText}>
                    Generate a secure 7-day invitation link. Email is optional—if entered, only that verified email can accept.
                  </Text>

                  <TextInput
                    style={styles.input}
                    placeholder="Partner's email (optional)"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={vm.inviteeEmail}
                    onChangeText={vm.setInviteeEmail}
                  />

                  <Button
                    title={
                      vm.creatingInvite
                        ? 'Generating Link...'
                        : 'Generate Invitation Link'
                    }
                    variant="primary"
                    onPress={vm.handleGenerateInvite}
                    disabled={vm.creatingInvite}
                  />

                  {/* Newly Created One-Time Token Box */}
                  {vm.latestCreatedInvite ? (
                    <View style={styles.tokenBox}>
                      <Text style={styles.tokenLabel}>
                        Invitation Token Ready (Valid for 7 days):
                      </Text>
                      <Text selectable style={styles.tokenValue}>
                        {vm.latestCreatedInvite.raw_token}
                      </Text>
                      <Button
                        title="Share Token Only (Easy Copy)"
                        variant="secondary"
                        onPress={vm.handleShareTokenOnly}
                      />
                      <Button
                        title="Share Full Invite Message"
                        variant="outline"
                        onPress={vm.handleShareInvite}
                      />
                    </View>
                  ) : null}
                </Card>
              ) : null}

              {/* 4. Sent Invitations List (Owner Only) */}
              {vm.isOwner && vm.invitations.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Sent Invitations</Text>
                  {vm.invitations.map((inv) => (
                    <Card key={inv.id} style={styles.inviteCard}>
                      <View style={styles.rowBetween}>
                        <View style={styles.flex}>
                          <Text style={styles.inviteEmail}>
                            {inv.invitee_email || 'Open Link Invitation'}
                          </Text>
                          <Text style={styles.inviteMeta}>
                            Status: {inv.status.toUpperCase()} • Expires{' '}
                            {inv.expires_at.slice(0, 10)}
                          </Text>
                        </View>

                        {inv.status === 'pending' ? (
                          <Pressable
                            onPress={() => vm.handleRevokeInvite(inv.id)}
                            disabled={vm.revokingId === inv.id}
                            style={styles.revokeBtn}
                          >
                            <Text style={styles.revokeBtnText}>
                              {vm.revokingId === inv.id
                                ? 'Revoking...'
                                : 'Revoke'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </Card>
                  ))}
                </View>
              ) : null}

              {/* 5. Join Another Household via Token */}
              <Card style={styles.cardSection}>
                <Text style={styles.sectionTitle}>
                  Have an Invite Token?
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Paste invitation token or link"
                  placeholderTextColor={Colors.textMuted}
                  value={vm.joinTokenInput}
                  onChangeText={vm.setJoinTokenInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {vm.joinFeedback ? (
                  <Text
                    style={
                      vm.joinFeedback.type === 'success'
                        ? styles.successText
                        : styles.errorText
                    }
                  >
                    {vm.joinFeedback.text}
                  </Text>
                ) : null}
                <Button
                  title={
                    vm.acceptingInvite ? 'Accepting...' : 'Accept Invitation'
                  }
                  variant="outline"
                  onPress={vm.handleAcceptInviteToken}
                  disabled={vm.acceptingInvite}
                />
              </Card>
            </>
          )}

          {vm.errorMessage ? (
            <Card style={styles.errorBanner}>
              <Text style={styles.errorText}>{vm.errorMessage}</Text>
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerRightSpacer: {
    width: 32,
  },
  scrollContent: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  cardSection: {
    gap: Spacing.sm,
  },
  section: {
    gap: Spacing.xs + 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  householdTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  helperText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  roleBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  memberCard: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  memberNameGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberIcon: {
    fontSize: 16,
  },
  memberName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  memberJoined: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  memberRoleTag: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    fontSize: 13,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  tokenBox: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm + 2,
    gap: Spacing.xs + 2,
    marginTop: 4,
  },
  tokenLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  tokenValue: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inviteCard: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  inviteEmail: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  inviteMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  revokeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  revokeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.danger,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.danger,
  },
  successText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.success,
  },
});

