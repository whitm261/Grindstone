import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AppThemeProvider, useAppTheme, useThemePreference } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { createNavigationTheme } from '@/constants/navigationTheme';
import type { AppTheme } from '@/constants/theme';
import { getSQLite } from '@/db/client';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    getSQLite();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <AppThemeProvider>
      <RootNavigator fontsLoaded={loaded} />
    </AppThemeProvider>
  );
}

function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const theme = useAppTheme();
  const { ready } = useThemePreference();
  const styles = useThemedStyles(createStyles);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme]);

  useEffect(() => {
    if (fontsLoaded && ready) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, ready]);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={createNavigationTheme(theme)}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.textPrimary,
            headerTitleStyle: { color: theme.colors.textPrimary },
            contentStyle: { backgroundColor: theme.colors.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="workout/[id]"
            options={{ title: 'Workout', presentation: 'card' }}
          />
          <Stack.Screen name="exercise/new" options={{ title: 'New exercise' }} />
          <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise' }} />
          <Stack.Screen name="template/new" options={{ title: 'New template' }} />
          <Stack.Screen name="template/[id]" options={{ title: 'Template' }} />
          <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.background },
  });
