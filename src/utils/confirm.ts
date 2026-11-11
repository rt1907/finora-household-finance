import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation dialog that works on Android, iOS, and Web.
 */
export function confirmDestructiveAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void
): void {
  if (Platform.OS === 'web') {
    const confirmed =
      typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`);
    if (confirmed) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: 'destructive',
      onPress: onConfirm,
    },
  ]);
}

