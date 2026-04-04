import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { theme } from '@/constants/theme';

export function TextField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={theme.colors.textMuted}
      selectionColor={theme.colors.accent}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm + 2,
    fontSize: theme.fontSize.body,
    color: theme.colors.textPrimary,
    minHeight: 48,
  },
});
