import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import type { AppTheme } from '@/constants/theme';

type SettingsSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

type SettingsRowProps = {
  title: string;
  description?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
};

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function SettingsRow({
  title,
  description,
  trailing,
  onPress,
  selected = false,
}: SettingsRowProps) {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && onPress ? styles.rowPressed : null,
      ]}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      <View style={styles.rowTrailing}>
        {trailing ?? (
          <View style={[styles.radio, selected && { borderColor: theme.colors.accent }]}>
            {selected ? <View style={styles.radioFill} /> : null}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    section: { gap: theme.space.sm },
    sectionHeader: { gap: theme.space.xs },
    sectionTitle: {
      fontSize: theme.fontSize.caption,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: theme.colors.textMuted,
    },
    sectionDescription: {
      fontSize: theme.fontSize.body,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    sectionBody: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
    },
    row: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.md,
      paddingHorizontal: theme.space.md,
      paddingVertical: theme.space.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    rowSelected: {
      backgroundColor: theme.colors.accentMuted,
    },
    rowPressed: {
      opacity: 0.92,
    },
    rowText: {
      flex: 1,
      gap: theme.space.xs,
    },
    rowTitle: {
      fontSize: theme.fontSize.body,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    rowDescription: {
      fontSize: theme.fontSize.caption,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    rowTrailing: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceElevated,
    },
    radioFill: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.accent,
    },
  });
