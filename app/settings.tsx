import { MotiView } from 'moti';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useThemePreference } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { SettingsRow, SettingsSection } from '@/components/ui/SettingsSection';
import type { AppTheme } from '@/constants/theme';

export default function SettingsScreen() {
  const styles = useThemedStyles(createStyles);
  const { themeId, themes, setThemeId } = useThemePreference();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 260 }}
        style={styles.hero}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Pick the look you want for the app. Theme changes apply immediately and stay saved on-device.
        </Text>
      </MotiView>

      <SettingsSection
        title="Appearance"
        description="Choose from the built-in color themes tuned for a fitness tracking workflow.">
        {themes.map((item, index) => (
          <View key={item.id}>
            <SettingsRow
              title={item.label}
              description={item.description}
              selected={item.id === themeId}
              onPress={() => void setThemeId(item.id)}
              trailing={
                <View style={styles.swatchRow}>
                  <View style={[styles.swatch, { backgroundColor: item.colors.background }]} />
                  <View style={[styles.swatch, { backgroundColor: item.colors.surface }]} />
                  <View style={[styles.swatch, { backgroundColor: item.colors.accent }]} />
                  {item.id === themeId ? (
                    <FontAwesome
                      name="check-circle"
                      size={18}
                      color={item.colors.accent}
                      style={styles.selectedIcon}
                    />
                  ) : null}
                </View>
              }
            />
            {index === themes.length - 1 ? null : <View style={styles.divider} />}
          </View>
        ))}
      </SettingsSection>
    </ScrollView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: theme.space.md,
      gap: theme.space.lg,
      paddingBottom: theme.space.xl,
    },
    hero: {
      gap: theme.space.sm,
    },
    title: {
      fontSize: theme.fontSize.display,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: theme.fontSize.body,
      lineHeight: 22,
      color: theme.colors.textSecondary,
    },
    swatchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.xs,
      marginLeft: theme.space.sm,
    },
    swatch: {
      width: 16,
      height: 16,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    selectedIcon: {
      marginLeft: theme.space.xs,
    },
    divider: {
      marginLeft: theme.space.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
  });
