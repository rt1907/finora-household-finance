import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundaryProps, Stack, usePathname } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { BorderRadius, Colors, Spacing } from '@/constants/theme';
import { trackScreenView } from '@/services/analytics/posthog';

try {
  WebBrowser.maybeCompleteAuthSession();
} catch {
  // Safe guard in case browser auth completion is unavailable during boot
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <View style={errorStyles.container}>
        <Text style={errorStyles.title}>Something went wrong</Text>
        <Text style={errorStyles.message}>
          {error?.message || 'An unexpected error occurred.'}
        </Text>
        <Pressable
          style={errorStyles.button}
          onPress={() => {
            void retry();
          }}
        >
          <Text style={errorStyles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    </SafeAreaProvider>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  message: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default function RootLayout() {
  const pathname = usePathname();

  useEffect(() => {
    trackScreenView(pathname);
  }, [pathname]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen
          name="auth"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="household/index"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="accounts/index"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="dashboard/index"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="settings/index"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="join"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="transactions/add"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="transactions/index"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="transactions/[id]"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}

