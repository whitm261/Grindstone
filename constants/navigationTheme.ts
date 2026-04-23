import { DarkTheme, type Theme } from '@react-navigation/native';

import type { AppTheme } from '@/constants/theme';

export function createNavigationTheme(theme: AppTheme): Theme {
  return {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: theme.colors.accent,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      notification: theme.colors.accent,
    },
  };
}
