import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/constants/theme';

interface ScreenContainerProps extends ViewProps {
  children: React.ReactNode;
  edges?: Edge[];
  padded?: boolean;
}

export function ScreenContainer({
  children,
  edges = ['top', 'bottom', 'left', 'right'],
  padded = true,
  style,
  ...rest
}: ScreenContainerProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      <View style={[styles.container, padded && styles.padded, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});

