import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAppTheme } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import type { AppTheme } from '@/constants/theme';

type Variant = 'primary' | 'ghost' | 'danger';

type Props = {
  onPress: () => void;
  children: ReactNode;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  onPress,
  children,
  variant = 'primary',
  disabled,
  loading,
  style,
}: Props) {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [pressed && styles.pressed]}>
      {({ pressed }) => (
        <MotiView
          animate={{
            scale: pressed && !disabled ? 0.97 : 1,
            opacity: disabled ? 0.5 : 1,
          }}
          transition={{ type: 'timing', duration: 120 }}
          style={[
            styles.base,
            isPrimary && styles.primary,
            variant === 'ghost' && styles.ghost,
            isDanger && styles.danger,
            style,
          ]}>
          {loading ? (
            <ActivityIndicator color={isPrimary ? theme.colors.background : theme.colors.accent} />
          ) : typeof children === 'string' ? (
            <Text
              style={[
                styles.label,
                isPrimary && styles.labelPrimary,
                variant === 'ghost' && styles.labelGhost,
                isDanger && styles.labelDanger,
              ]}>
              {children}
            </Text>
          ) : (
            children
          )}
        </MotiView>
      )}
    </Pressable>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    pressed: { opacity: 0.9 },
    base: {
      minHeight: 48,
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: {
      backgroundColor: theme.colors.accent,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    danger: {
      backgroundColor: theme.colors.dangerMuted,
      borderWidth: 1,
      borderColor: theme.colors.danger,
    },
    label: {
      fontSize: theme.fontSize.body,
      fontWeight: '600',
    },
    labelPrimary: {
      color: theme.colors.background,
    },
    labelGhost: {
      color: theme.colors.textPrimary,
    },
    labelDanger: {
      color: theme.colors.danger,
    },
  });
