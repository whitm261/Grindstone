import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack, type Href } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppTheme } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import type { AppTheme } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import {
  getMesocycleDetail,
  listExercises,
  replaceMesocycleStructure,
} from '@/lib/queries';

type MesoSet = {
  weekNumber: number | null;
  reps: number;
  percentage: number | null;
};

type DraftMesoSet = {
  weekNumber: number | null;
  reps: string;
  percentage: string;
};

type MesoExercise = {
  exerciseId: string;
  exerciseName: string;
  isFocus: boolean;
  sets: DraftMesoSet[];
};

type MesoWorkout = {
  id: string; // temp id for UI
  name: string;
  exercises: MesoExercise[];
};

const createDraftId = () => Math.random().toString(36).slice(2, 11);

const normalizeNumericInput = (value: string) => value.replace(',', '.');

const parseWholeNumber = (value: string, fallback: number) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parsePercentage = (value: string) => {
  const normalized = normalizeNumericInput(value).trim();
  if (!normalized) return null;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const createAccessorySet = (reps = '10'): DraftMesoSet => ({
  weekNumber: null,
  reps,
  percentage: '',
});

const createFocusSets = (weeks: number): DraftMesoSet[] =>
  Array.from({ length: weeks }, (_, index) => ({
    weekNumber: index + 1,
    reps: '5',
    percentage: '70',
  }));

const createWorkoutName = (order: number) => `Workout ${order}`;

function cloneExercise(exercise: MesoExercise): MesoExercise {
  return {
    ...exercise,
    sets: exercise.sets.map((set) => ({ ...set })),
  };
}

function appendCloneSuffix(name: string) {
  const trimmed = name.trim();
  return trimmed ? `${trimmed} Copy` : 'Workout Copy';
}

export default function MesocycleBuilderScreen() {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState(1);
  const [workouts, setWorkouts] = useState<MesoWorkout[]>([]);
  const [exercisePicker, setExercisePicker] = useState<{ workoutId: string } | null>(null);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);

  const load = useCallback(() => {
    const d = getMesocycleDetail(id);
    if (!d) return;
    setName(d.mesocycle.name);
    setWeeks(d.mesocycle.weeks);
    setAllExercises(listExercises());

    if (d.workouts.length > 0) {
      setWorkouts(
        d.workouts.map((w) => ({
          id: w.workout.id,
          name: w.workout.name,
          exercises: w.exercises.map((e) => ({
            exerciseId: e.exercise.id,
            exerciseName: e.exercise.name,
            isFocus: e.mesoExercise.isFocus,
            sets: e.sets.map((s) => ({
              weekNumber: s.weekNumber,
              reps: String(s.targetReps),
              percentage: s.targetPercentage === null ? '' : String(s.targetPercentage),
            })),
          })),
        })),
      );
    } else {
      setWorkouts([{ id: createDraftId(), name: createWorkoutName(1), exercises: [] }]);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = () => {
    const structure = workouts.map((workout, index) => ({
      name: workout.name.trim() || createWorkoutName(index + 1),
      dayNumber: index + 1,
      exercises: workout.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        isFocus: e.isFocus,
        sets: e.sets.map((s) => ({
          weekNumber: s.weekNumber,
          reps: Math.max(0, parseWholeNumber(s.reps, 0)),
          percentage: s.weekNumber === null ? null : parsePercentage(s.percentage),
        })),
      })),
    }));
    replaceMesocycleStructure(id, structure);
    Alert.alert('Success', 'Mesocycle structure saved!');
  };

  const addWorkout = () => {
    setWorkouts((prev) => [
      ...prev,
      { id: createDraftId(), name: createWorkoutName(prev.length + 1), exercises: [] },
    ]);
  };

  const duplicateWorkout = (workoutId: string) => {
    setWorkouts((prev) => {
      const source = prev.find((workout) => workout.id === workoutId);
      if (!source) return prev;
      return [
        ...prev,
        {
          id: createDraftId(),
          name: appendCloneSuffix(source.name),
          exercises: source.exercises.map(cloneExercise),
        },
      ];
    });
  };

  const duplicateAllWorkouts = () => {
    setWorkouts((prev) => [
      ...prev,
      ...prev.map((workout) => ({
        id: createDraftId(),
        name: appendCloneSuffix(workout.name),
        exercises: workout.exercises.map(cloneExercise),
      })),
    ]);
  };

  const updateWorkoutName = (workoutId: string, nextName: string) => {
    setWorkouts((prev) =>
      prev.map((workout) =>
        workout.id === workoutId ? { ...workout, name: nextName } : workout,
      ),
    );
  };

  const addExercise = (workoutId: string, ex: Exercise) => {
    setWorkouts((prev) =>
      prev.map((d) => {
        if (d.id !== workoutId) return d;
        return {
          ...d,
          exercises: [
            ...d.exercises,
            {
              exerciseId: ex.id,
              exerciseName: ex.name,
              isFocus: false,
              sets: [createAccessorySet()],
            },
          ],
        };
      })
    );
    setExercisePicker(null);
  };

  const toggleFocus = (workoutId: string, exIndex: number) => {
    setWorkouts((prev) =>
      prev.map((d) => {
        if (d.id !== workoutId) return d;
        const exercises = [...d.exercises];
        const ex = exercises[exIndex];
        const newIsFocus = !ex.isFocus;
        const newSets = newIsFocus ? createFocusSets(weeks) : [createAccessorySet()];
        exercises[exIndex] = { ...ex, isFocus: newIsFocus, sets: newSets };
        return { ...d, exercises };
      })
    );
  };

  const updateSet = (
    workoutId: string,
    exIndex: number,
    setIndex: number,
    patch: Partial<DraftMesoSet>,
  ) => {
    setWorkouts((prev) =>
      prev.map((d) => {
        if (d.id !== workoutId) return d;
        const exercises = [...d.exercises];
        const sets = [...exercises[exIndex].sets];
        sets[setIndex] = { ...sets[setIndex], ...patch };
        exercises[exIndex] = { ...exercises[exIndex], sets };
        return { ...d, exercises };
      })
    );
  };

  const addSetToAccessory = (workoutId: string, exIndex: number) => {
    setWorkouts((prev) =>
      prev.map((d) => {
        if (d.id !== workoutId) return d;
        const exercises = [...d.exercises];
        const sets = [...exercises[exIndex].sets];
        const last = sets[sets.length - 1];
        sets.push(createAccessorySet(last?.reps ?? '10'));
        exercises[exIndex] = { ...exercises[exIndex], sets };
        return { ...d, exercises };
      })
    );
  };

  const startBlock = () => {
    save();
    // Gather unique focus exercises
    const focusExMap = new Map<string, string>();
    workouts.forEach(d => {
      d.exercises.forEach(e => {
        if (e.isFocus) focusExMap.set(e.exerciseId, e.exerciseName);
      });
    });

    const focusExs = Array.from(focusExMap.entries());
    if (focusExs.length === 0) {
      Alert.alert('Error', 'Add at least one focus lift to start a block.');
      return;
    }

    router.push(({
      pathname: '/mesocycle/start/[id]',
      params: { id }
    } as unknown) as Href);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Edit Block Layout' }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.subTitle}>{weeks} Weeks</Text>
          <Text style={styles.subCopy}>
            Workouts are ordered sessions, not fixed calendar days. Rest days can go anywhere.
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Button variant="ghost" onPress={addWorkout} style={styles.headerActionButton}>
            Add Workout
          </Button>
          {workouts.length > 0 ? (
            <Button
              variant="ghost"
              onPress={duplicateAllWorkouts}
              style={styles.headerActionButton}>
              Duplicate All
            </Button>
          ) : null}
        </View>

        {workouts.map((workout, workoutIndex) => (
          <View key={workout.id} style={styles.daySection}>
            <View style={styles.workoutHeader}>
              <View style={styles.workoutHeaderText}>
                <Text style={styles.workoutIndex}>Workout {workoutIndex + 1}</Text>
                <TextField
                  value={workout.name}
                  onChangeText={(value) => updateWorkoutName(workout.id, value)}
                  placeholder={createWorkoutName(workoutIndex + 1)}
                  style={styles.workoutNameInput}
                />
              </View>
              <View style={styles.workoutHeaderActions}>
                <Pressable onPress={() => duplicateWorkout(workout.id)} hitSlop={8}>
                  <FontAwesome name="copy" size={16} color={theme.colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={() =>
                    setWorkouts((prev) => prev.filter((item) => item.id !== workout.id))
                  }
                  hitSlop={8}>
                  <FontAwesome name="trash" size={18} color={theme.colors.danger} />
                </Pressable>
              </View>
            </View>

            <View style={styles.dayHeader}>
              <Pressable onPress={() => setExercisePicker({ workoutId: workout.id })}>
                <Text style={styles.addText}>+ Add Exercise</Text>
              </Pressable>
            </View>

            {workout.exercises.map((ex, exIdx) => (
              <Card key={`${ex.exerciseId}-${exIdx}`} style={styles.exCard}>
                <View style={styles.exHeader}>
                  <View>
                    <Text style={styles.exName}>{ex.exerciseName}</Text>
                    <Pressable onPress={() => toggleFocus(workout.id, exIdx)} style={styles.focusToggle}>
                      <FontAwesome 
                        name={ex.isFocus ? "star" : "star-o"} 
                        size={14} 
                        color={ex.isFocus ? theme.colors.accent : theme.colors.textMuted} 
                      />
                      <Text style={[styles.focusText, ex.isFocus && styles.focusTextActive]}>
                        {ex.isFocus ? "Focus Progression" : "Accessory"}
                      </Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={() => {
                    setWorkouts(prev => prev.map(d => d.id === workout.id ? { ...d, exercises: d.exercises.filter((_, i) => i !== exIdx) } : d));
                  }}>
                    <FontAwesome name="trash" size={18} color={theme.colors.danger} />
                  </Pressable>
                </View>

                {ex.isFocus ? (
                  <View style={styles.weeksList}>
                    {ex.sets.map((s, si) => (
                      <View key={si} style={styles.weekRow}>
                        <Text style={styles.weekLabel}>W{s.weekNumber}</Text>
                        <View style={styles.weekInputWrapper}>
                          <Text style={styles.inputLabel}>Reps</Text>
                          <TextField
                            value={s.reps}
                            onChangeText={(t) => updateSet(workout.id, exIdx, si, { reps: t })}
                            keyboardType="number-pad"
                          />
                        </View>
                        <View style={styles.weekInputWrapper}>
                          <Text style={styles.inputLabel}>% 1RM</Text>
                          <TextField
                            value={s.percentage}
                            onChangeText={(t) =>
                              updateSet(workout.id, exIdx, si, {
                                percentage: normalizeNumericInput(t),
                              })
                            }
                            keyboardType="decimal-pad"
                            placeholder="70"
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.accessoryList}>
                    {ex.sets.map((s, si) => (
                      <View key={si} style={styles.accRow}>
                        <Text style={styles.accLabel}>Set {si + 1}</Text>
                        <TextField
                          style={styles.accInput}
                          value={s.reps}
                          onChangeText={(t) => updateSet(workout.id, exIdx, si, { reps: t })}
                          keyboardType="number-pad"
                        />
                        <Text style={styles.accSuffix}>reps</Text>
                        <Pressable onPress={() => {
                          setWorkouts(prev => prev.map(d => d.id === workout.id ? {
                            ...d,
                            exercises: d.exercises.map((e, i) => i === exIdx ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e)
                          } : d));
                        }} disabled={ex.sets.length <= 1}>
                           <FontAwesome name="minus-circle" size={20} color={theme.colors.textMuted} />
                        </Pressable>
                      </View>
                    ))}
                    <Pressable onPress={() => addSetToAccessory(workout.id, exIdx)}>
                      <Text style={styles.addSetText}>+ Add Set</Text>
                    </Pressable>
                  </View>
                )}
              </Card>
            ))}
          </View>
        ))}

        <View style={styles.footerActions}>
          <Button onPress={save} style={styles.saveBtn}>Save Structure</Button>
          <Button onPress={startBlock}>Start Training Block</Button>
        </View>
      </ScrollView>

      <Modal visible={!!exercisePicker} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose exercise</Text>
            <FlatList
              data={allExercises}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable style={styles.pickerRow} onPress={() => exercisePicker && addExercise(exercisePicker.workoutId, item)}>
                  <Text style={styles.pickerName}>{item.name}</Text>
                </Pressable>
              )}
            />
            <Button variant="ghost" onPress={() => setExercisePicker(null)}>Cancel</Button>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { padding: 16, paddingBottom: 100 },
    header: { marginBottom: 24 },
    title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.textPrimary },
    subTitle: { fontSize: 16, color: theme.colors.textMuted, marginTop: 4 },
    subCopy: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 12, lineHeight: 20 },
    headerActions: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    headerActionButton: { flex: 1 },
    daySection: { marginBottom: 32 },
    workoutHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    workoutHeaderText: { flex: 1 },
    workoutIndex: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 6,
    },
    workoutNameInput: {
      fontSize: 20,
      fontWeight: '700',
      minHeight: 52,
    },
    workoutHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingTop: 12,
    },
    dayHeader: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12 },
    addText: { color: theme.colors.accent, fontWeight: '600' },
    exCard: { padding: 12, marginBottom: 12 },
    exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    exName: { fontSize: 18, fontWeight: '600', color: theme.colors.textPrimary },
    focusToggle: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    focusText: { fontSize: 12, color: theme.colors.textMuted, marginLeft: 6 },
    focusTextActive: { color: theme.colors.accent, fontWeight: '600' },
    weeksList: { marginTop: 8 },
    weekRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    weekLabel: { width: 30, fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
    weekInputWrapper: { flex: 1 },
    inputLabel: { fontSize: 10, color: theme.colors.textMuted, marginBottom: 4, textTransform: 'uppercase' },
    accessoryList: { marginTop: 4 },
    accRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    accLabel: { width: 50, fontSize: 14, color: theme.colors.textSecondary },
    accInput: { width: 60 },
    accSuffix: { fontSize: 14, color: theme.colors.textMuted },
    addSetText: { color: theme.colors.accent, fontSize: 14, fontWeight: '600', marginTop: 4 },
    footerActions: { marginTop: 24, gap: 12 },
    saveBtn: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 16 },
    modalCard: { maxHeight: '80%' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.textPrimary, marginBottom: 16 },
    pickerRow: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    pickerName: { fontSize: 16, color: theme.colors.textPrimary },
  });
