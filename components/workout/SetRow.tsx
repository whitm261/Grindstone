import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { TextField } from '@/components/ui/TextField';
import type { AppTheme } from '@/constants/theme';
import type { SetDraft, SetInputErrors } from '@/lib/workoutDraft';

export const SetRow = memo(function SetRow({ id, index, exerciseName, draft, errors, onChange }: {
  id: string;
  index: number;
  exerciseName: string;
  draft: SetDraft;
  errors?: SetInputErrors;
  onChange: (id: string, patch: Partial<SetDraft>) => void;
}) {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const label = `${exerciseName}, set ${index + 1}`;
  return (
    <View>
      <View style={[styles.row, draft.completed && styles.completed]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`${label}, completed`}
          accessibilityState={{ checked: draft.completed }}
          onPress={() => {
            onChange(id, { completed: !draft.completed });
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }}
          style={styles.check}>
          <FontAwesome name={draft.completed ? 'check-circle' : 'circle-o'} size={26}
            color={draft.completed ? theme.colors.accent : theme.colors.textMuted} />
        </Pressable>
        <Text style={styles.label}>#{index + 1}</Text>
        <TextField style={[styles.input, errors?.reps && styles.invalid]} keyboardType="number-pad"
          accessibilityLabel={`${label}, reps`} value={draft.reps}
          onChangeText={(reps) => onChange(id, { reps })} />
        <Text style={styles.times}>×</Text>
        <TextField style={[styles.input, errors?.weight && styles.invalid]} keyboardType="decimal-pad"
          accessibilityLabel={`${label}, weight`} value={draft.weight}
          onChangeText={(weight) => onChange(id, { weight })} />
      </View>
      {errors?.reps && <Text accessibilityLiveRegion="polite" style={styles.error}>{errors.reps}</Text>}
      {errors?.weight && <Text accessibilityLiveRegion="polite" style={styles.error}>{errors.weight}</Text>}
    </View>
  );
});

const createStyles = (theme: AppTheme) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs, padding: theme.space.xs,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated },
  completed: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentMuted },
  check: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  label: { width: 24, color: theme.colors.textSecondary, fontSize: theme.fontSize.caption },
  input: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: theme.space.sm },
  invalid: { borderColor: theme.colors.danger },
  times: { color: theme.colors.textMuted },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.caption, marginTop: theme.space.xs },
});
