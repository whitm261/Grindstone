import { DarkTheme, type Theme } from '@react-navigation/native';

import { theme } from '@/constants/theme';

export const navigationDarkTheme: Theme = {
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
