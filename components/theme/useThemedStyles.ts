import { useMemo } from 'react';

import { useAppTheme } from '@/components/theme/AppThemeProvider';
import type { AppTheme } from '@/constants/theme';

export function useThemedStyles<T>(createStyles: (theme: AppTheme) => T) {
  const theme = useAppTheme();
  return useMemo(() => createStyles(theme), [createStyles, theme]);
}
