import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { useAppTheme } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import type { AppTheme } from '@/constants/theme';
import {
  archiveExercise,
  getExercise,
  getExerciseProgressHistory,
  restoreExercise,
  updateExercise,
} from '@/lib/queries';

export default function ExerciseDetailScreen() {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [archived, setArchived] = useState(false);
  const [tab, setTab] = useState<'volume' | 'weight'>('weight');
  const [history, setHistory] = useState<ReturnType<typeof getExerciseProgressHistory>>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  const reload = useCallback(() => {
    const ex = getExercise(id);
    if (!ex) {
      router.back();
      return;
    }
    setName(ex.name);
    setNotes(ex.notes);
    setArchived(ex.archivedAt !== null);
    const progress = getExerciseProgressHistory(id, 365);
    setHistory(progress);
    setSelectedWorkoutId((current) => progress.some((point) => point.workoutId === current)
      ? current
      : progress.at(-1)?.workoutId ?? null);
  }, [id, router]);

  useFocusEffect(reload);

  const selectedIndex = history.findIndex((point) => point.workoutId === selectedWorkoutId);
  const selected = history[selectedIndex];
  const chartPoints = history.map((point, i) => ({
    value: tab === 'volume' ? point.volume : point.maxWeight,
    label: i % 2 === 0 ? new Date(point.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) : '',
    dataPointText: tab === 'weight' ? `${point.reps} reps` : '',
    dataPointRadius: point.workoutId === selectedWorkoutId ? 6 : 3,
    onPress: () => setSelectedWorkoutId(point.workoutId),
  }));

  const save = () => {
    const n = name.trim();
    if (!n) return;
    updateExercise(id, n, notes);
    router.back();
  };

  const archive = () => {
    Alert.alert('Archive exercise', 'Hide this exercise from the library and exercise pickers. Your history and existing programs will be preserved. You can restore it from the archived library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () => {
          archiveExercise(id);
          router.back();
        },
      },
    ]);
  };

  const hasChart = chartPoints.length > 0;
  const chartWidth = Math.max(160, Math.min(width - theme.space.md * 4, 340));

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {archived && <Text style={styles.description}>Archived exercise. Your workout history is preserved.</Text>}
        <Text style={styles.label}>Name</Text>
        <TextField value={name} onChangeText={setName} />
        <Text style={[styles.label, styles.mt]}>Notes</Text>
        <TextField value={notes} onChangeText={setNotes} multiline />

        <Text style={[styles.label, styles.mt]}>Progress · Past year</Text>
        <View style={styles.tabRow}>
          <Button
            variant={tab === 'weight' ? 'primary' : 'ghost'}
            onPress={() => setTab('weight')}
            style={styles.tabBtn}>
            Heaviest weight
          </Button>
          <Button
            variant={tab === 'volume' ? 'primary' : 'ghost'}
            onPress={() => setTab('volume')}
            style={styles.tabBtn}>
            Volume
          </Button>
        </View>
        <Text style={styles.description}>
          {tab === 'weight'
            ? 'Heaviest completed set per workout, with reps. Tied weights show the set with the most reps. Zero is bodyweight or no added weight.'
            : 'Volume is the sum of reps × weight across completed sets. It measures workload. Sets with no added weight contribute 0.'}
        </Text>

        {hasChart ? (
          <View style={styles.chartWrap}>
            <LineChart
              data={chartPoints}
              focusEnabled
              focusedDataPointIndex={selectedIndex}
              onFocus={(_point: unknown, index: number) => setSelectedWorkoutId(history[index].workoutId)}
              scrollToIndex={Math.max(selectedIndex, 0)}
              width={chartWidth}
              height={200}
              spacing={Math.max(72, chartWidth / (chartPoints.length + 1))}
              initialSpacing={12}
              color={theme.colors.chartLine}
              thickness={2}
              hideRules={false}
              rulesColor={theme.colors.chartGrid}
              rulesType="solid"
              xAxisColor={theme.colors.chartGrid}
              yAxisColor={theme.colors.chartGrid}
              yAxisTextStyle={{ color: theme.colors.chartLabel, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: theme.colors.chartLabel, fontSize: 9 }}
              yAxisThickness={1}
              xAxisThickness={1}
              hideYAxisText={false}
              areaChart
              startFillColor={theme.colors.accent}
              endFillColor={theme.colors.background}
              startOpacity={0.35}
              endOpacity={0.05}
              dataPointsColor={theme.colors.accent}
              dataPointsRadius={3}
              textColor={theme.colors.chartLabel}
              textFontSize={10}
              noOfSections={4}
              maxValue={Math.max(...chartPoints.map((point) => point.value), 1) * 1.2}
            />
          </View>
        ) : (
          <Text style={styles.chartEmpty}>Log completed workouts including this exercise to see trends.</Text>
        )}

        {selected && (
          <View style={styles.sessionDetail}>
            <Text style={styles.sessionName}>{selected.label}</Text>
            <Text style={styles.description}>{new Date(selected.date).toLocaleString()}</Text>
            <Text style={styles.performance}>
              {selected.maxWeight === 0 ? 'No added weight' : `Heaviest: ${selected.maxWeight}`} · {selected.reps} reps
            </Text>
            {tab === 'volume' && <Text style={styles.description}>Volume: {Number(selected.volume.toFixed(2))} · {selected.setCount} completed sets</Text>}
            <Text style={styles.description}>Workout {selectedIndex + 1} of {history.length} · Tap a point or browse below.</Text>
            <View style={styles.tabRow}>
              <Button variant="ghost" disabled={selectedIndex === 0} onPress={() => setSelectedWorkoutId(history[selectedIndex - 1].workoutId)}>Previous</Button>
              <Button variant="ghost" disabled={selectedIndex === history.length - 1} onPress={() => setSelectedWorkoutId(history[selectedIndex + 1].workoutId)}>Next</Button>
            </View>
            <Button variant="ghost" onPress={() => router.push(`/session/${selected.workoutId}`)}>View workout</Button>
          </View>
        )}

        <View style={styles.actions}>
          <Button onPress={save}>Save</Button>
          {archived ? (
            <Button variant="ghost" onPress={() => { restoreExercise(id); setArchived(false); }}>Restore exercise</Button>
          ) : (
            <Button variant="danger" onPress={archive}>Archive exercise</Button>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space.md, paddingBottom: 48 },
    label: {
      fontSize: theme.fontSize.caption,
      fontWeight: '600',
      color: theme.colors.textMuted,
      marginBottom: theme.space.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    mt: { marginTop: theme.space.md },
    tabRow: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.sm },
    tabBtn: { flex: 1 },
    chartWrap: {
      marginTop: theme.space.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: theme.space.md,
      alignItems: 'center',
    },
    chartEmpty: {
      color: theme.colors.textSecondary,
      marginTop: theme.space.sm,
      lineHeight: 22,
    },
    actions: { marginTop: theme.space.lg, gap: theme.space.sm },
    description: { color: theme.colors.textSecondary, marginTop: theme.space.sm, lineHeight: 22 },
    sessionDetail: {
      marginTop: theme.space.md,
      padding: theme.space.md,
      gap: theme.space.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    sessionName: { color: theme.colors.textPrimary, fontSize: theme.fontSize.body, fontWeight: '600' },
    performance: { color: theme.colors.accent, fontSize: theme.fontSize.body, fontWeight: '600' },
  });
