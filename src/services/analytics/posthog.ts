import { Platform } from 'react-native';
import { Env, isPostHogConfigured } from '@/config/env';

/**
 * Privacy-Safe PostHog Analytics Service for Finora.
 *
 * Security & Privacy Rules:
 * 1. Never transmits sensitive financial or personal fields (`amount`, `balance`,
 *    `description`, `notes`, `email`, `full_name`, `institution_name`, `raw_token`).
 * 2. Uses only the anonymous UUID (`userId`) or an ephemeral session ID as `distinct_id`.
 * 3. Fails silently if offline or if `EXPO_PUBLIC_POSTHOG_API_KEY` is not yet configured.
 */

const FORBIDDEN_ANALYTICS_KEYS = new Set([
  'amount',
  'balance',
  'description',
  'notes',
  'email',
  'invitee_email',
  'full_name',
  'name',
  'institution_name',
  'raw_token',
  'token',
  'password',
]);

let currentDistinctId: string = `anon_${Math.random().toString(36).slice(2, 11)}`;

export function identifyAnalyticsUser(userId: string): void {
  if (!userId) return;
  currentDistinctId = userId;
}

export function resetAnalyticsUser(): void {
  currentDistinctId = `anon_${Math.random().toString(36).slice(2, 11)}`;
}

function sanitizeProperties(
  rawProps?: Record<string, string | number | boolean | null | undefined>
): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {
    app_name: 'Finora',
    platform: Platform.OS,
  };

  if (!rawProps) {
    return safe;
  }

  Object.entries(rawProps).forEach(([key, value]) => {
    if (
      !FORBIDDEN_ANALYTICS_KEYS.has(key.toLowerCase()) &&
      value !== undefined
    ) {
      safe[key] = value;
    }
  });

  return safe;
}

export function trackAnalyticsEvent(
  eventName: string,
  properties?: Record<string, string | number | boolean | null | undefined>
): void {
  if (!isPostHogConfigured()) {
    return;
  }

  const payload = {
    api_key: Env.posthogApiKey,
    event: eventName,
    distinct_id: currentDistinctId,
    properties: sanitizeProperties(properties),
    timestamp: new Date().toISOString(),
  };

  void fetch(`${Env.posthogHost}/capture/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Ignore network errors so analytics never interrupts user actions
  });
}

export function trackScreenView(pathname: string): void {
  trackAnalyticsEvent('$screen', {
    $screen_name: pathname || '/',
  });
}

