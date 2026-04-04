import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { theme } from '@/constants/theme';
import type { WorkoutDetail } from '@/lib/queries';
import { getWorkoutDetail } from '@/lib/queries';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);

  const load = useCallback(() => {
    const d = getWorkoutDetail(id);
    if (!d) {
      router.back();
      return;
    }
    setDetail(d);
  }, [id, router]);

  useFocusEffect(load);

  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{detail.workout.name}</Text>
      <Text style={styles.meta}>
        {detail.workout.completedAt
          ? `Completed ${new Date(detail.workout.completedAt).toLocaleString()}`
          : `Started ${new Date(detail.workout.startedAt).toLocaleString()}`}
      </Text>

      {detail.blocks.map((block) => (
        <Card key={block.workoutExercise.id} style={styles.block}>
          <Text style={styles.exerciseName}>{block.exercise.name}</Text>
          {block.sets.map((s) => (
            <View key={s.id} style={styles.setLine}>
              <Text style={styles.setText}>
                Set {s.index + 1}: {s.reps} × {s.weight}
                {s.completed ? ' ✓' : ''}
              </Text>
            </View>
          ))}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  muted: { color: theme.colors.textMuted },
  content: { padding: theme.space.md, paddingBottom: 48 },
  title: {
    fontSize: theme.fontSize.headline,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  meta: { fontSize: theme.fontSize.caption, color: theme.colors.textSecondary, marginTop: theme.space.xs, marginBottom: theme.space.lg },
  block: { marginBottom: theme.space.md },
  exerciseName: { fontSize: theme.fontSize.title, fontWeight: '700', color: theme.colors.textPrimary, marginBottom: theme.space.sm },
  setLine: { paddingVertical: 4 },
  setText: { fontSize: theme.fontSize.body, color: theme.colors.textSecondary },
});
