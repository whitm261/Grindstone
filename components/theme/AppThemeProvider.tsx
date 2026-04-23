import AsyncStorage from 'expo-sqlite/kv-store';
import {
  createContext,
  use,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  builtInThemes,
  defaultThemeId,
  getThemeById,
  type AppTheme,
  type ThemeId,
} from '@/constants/theme';

const STORAGE_KEY = 'movingweight.theme';

type ThemeContextValue = {
  theme: AppTheme;
  themeId: ThemeId;
  themes: readonly AppTheme[];
  ready: boolean;
  setThemeId: (nextThemeId: ThemeId) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [themeId, setThemeIdState] = useState<ThemeId>(defaultThemeId);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadThemePreference() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && stored) {
          const next = getThemeById(stored).id;
          setThemeIdState(next);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void loadThemePreference();

    return () => {
      cancelled = true;
    };
  }, []);

  const value: ThemeContextValue = {
    theme: getThemeById(themeId),
    themeId,
    themes: builtInThemes,
    ready,
    async setThemeId(nextThemeId) {
      setThemeIdState(nextThemeId);
      await AsyncStorage.setItem(STORAGE_KEY, nextThemeId);
    },
  };

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useAppTheme() {
  const value = use(ThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return value.theme;
}

export function useThemePreference() {
  const value = use(ThemeContext);
  if (!value) {
    throw new Error('useThemePreference must be used within AppThemeProvider');
  }
  return {
    ready: value.ready,
    themeId: value.themeId,
    themes: value.themes,
    setThemeId: value.setThemeId,
  };
}
