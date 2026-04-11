import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { theme } from '@/constants/theme';
import {
  deleteExercise,
  getExercise,
  getExerciseMaxWeightHistory,
  getExerciseVolumeHistory,
  updateExercise,
} from '@/lib/queries';

const chartWidth = Math.min(Dimensions.get('window').width - theme.space.md * 4, 340);

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [tab, setTab] = useState<'volume' | 'weight'>('volume');
  const [volData, setVolData] = useState<ReturnType<typeof getExerciseVolumeHistory>>([]);
  const [weightData, setWeightData] = useState<ReturnType<typeof getExerciseMaxWeightHistory>>([]);

  const reload = useCallback(() => {
    const ex = getExercise(id);
    if (!ex) {
      router.back();
      return;
    }
    setName(ex.name);
    setNotes(ex.notes);
    setVolData(getExerciseVolumeHistory(id, 365));
    setWeightData(getExerciseMaxWeightHistory(id, 365));
  }, [id]);

  useFocusEffect(reload);

  const chartPoints =
    tab === 'volume'
      ? volData.map((d, i) => ({
          value: d.volume,
          label: i % 2 === 0 ? d.date.slice(5, 10) : '',
          dataPointText: '',
        }))
      : weightData.map((d, i) => ({
          value: d.maxWeight,
          label: i % 2 === 0 ? d.date.slice(5, 10) : '',
          dataPointText: '',
        }));

  const save = () => {
    const n = name.trim();
    if (!n) return;
    updateExercise(id, n, notes);
    router.back();
  };

  const remove = () => {
    Alert.alert('Delete exercise', 'This removes it from templates and history links may break.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteExercise(id);
          router.back();
        },
      },
    ]);
  };

  const hasChart = chartPoints.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Name</Text>
        <TextField value={name} onChangeText={setName} />
        <Text style={[styles.label, styles.mt]}>Notes</Text>
        <TextField value={notes} onChangeText={setNotes} multiline />

        <Text style={[styles.label, styles.mt]}>Progress (completed workouts)</Text>
        <View style={styles.tabRow}>
          <Button
            variant={tab === 'volume' ? 'primary' : 'ghost'}
            onPress={() => setTab('volume')}
            style={styles.tabBtn}>
            Volume
          </Button>
          <Button
            variant={tab === 'weight' ? 'primary' : 'ghost'}
            onPress={() => setTab('weight')}
            style={styles.tabBtn}>
            Max weight
          </Button>
        </View>

        {hasChart ? (
          <View style={styles.chartWrap}>
            <LineChart
              data={chartPoints}
              width={chartWidth}
              height={200}
              spacing={Math.max(40, chartWidth / (chartPoints.length + 1))}
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
              curved
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
              maxValue={
                tab === 'volume'
                  ? Math.max(...volData.map((d) => d.volume), 1) * 1.1
                  : Math.max(...weightData.map((d) => d.maxWeight), 1) * 1.1
              }
            />
          </View>
        ) : (
          <Text style={styles.chartEmpty}>Log completed workouts including this exercise to see trends.</Text>
        )}

        <View style={styles.actions}>
          <Button onPress={save}>Save</Button>
          <Button variant="danger" onPress={remove}>
            <View style={styles.delRow}>
              <FontAwesome name="trash" size={16} color={theme.colors.danger} />
              <Text style={styles.delText}> Delete</Text>
            </View>
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  delRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  delText: { color: theme.colors.danger, fontWeight: '600', fontSize: theme.fontSize.body },
});
