import React, { useEffect, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FinoraBrandIcon } from '@/components/ui/FinoraBrandIcon';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';

interface BrandSplashViewProps {
  onFinish: () => void;
}

const SPLASH_HIGHLIGHTS = [
  {
    icon: '🤝',
    text: 'Shared Household Budgets',
  },
  {
    icon: '🔒',
    text: 'Private Personal Freedom',
  },
  {
    icon: '📊',
    text: 'Clear Monthly Insights',
  },
] as const;

export function BrandSplashView({ onFinish }: BrandSplashViewProps) {
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [scaleAnim] = useState(() => new Animated.Value(0.95));

  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: useNative,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 50,
        useNativeDriver: useNative,
      }),
    ]).start();

    const timer = setTimeout(() => {
      onFinish();
    }, 2600);

    return () => {
      clearTimeout(timer);
    };
  }, [fadeAnim, onFinish, scaleAnim]);

  return (
    <Pressable style={styles.container} onPress={onFinish}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Application Icon Emblem (Capturing Group Financing) */}
        <FinoraBrandIcon size={84} />

        {/* App Name & One-Line Tagline */}
        <View style={styles.brandTextGroup}>
          <Text
            style={styles.appName}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            Finora
          </Text>
          <Text style={styles.tagline}>
            Shared financial space.
          </Text>
        </View>

        {/* Compact Responsive Feature Cards (Vertically & Horizontally Aligned) */}
        <View style={styles.highlightsContainer}>
          {SPLASH_HIGHLIGHTS.map((item) => (
            <View key={item.text} style={styles.highlightPill}>
              <View style={styles.highlightIconCircle}>
                <Text style={styles.highlightIcon}>{item.icon}</Text>
              </View>
              <Text
                style={styles.highlightText}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {item.text}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <Text style={styles.footerHint}>Loading your ledger...</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: Spacing.lg,
  },
  iconOuterRing: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInnerBadge: {
    width: 74,
    height: 74,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconEmoji: {
    fontSize: 34,
  },
  currencyBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.secondary,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.surface,
  },
  brandTextGroup: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primaryDark,
    textAlign: 'center',
    lineHeight: 18,
  },
  highlightsContainer: {
    width: '100%',
    maxWidth: 300,
    gap: Spacing.sm,
  },
  highlightPill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    overflow: 'hidden',
  },
  highlightIconCircle: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  highlightIcon: {
    fontSize: 14,
  },
  highlightText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  footerHint: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
});
