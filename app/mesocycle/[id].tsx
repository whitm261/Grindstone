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

type MesoExercise = {
  exerciseId: string;
  exerciseName: string;
  isFocus: boolean;
  sets: MesoSet[];
};

type MesoDay = {
  id: string; // temp id for UI
  name: string;
  dayNumber: number;
  exercises: MesoExercise[];
};

export default function MesocycleBuilderScreen() {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState(1);
  const [days, setDays] = useState<MesoDay[]>([]);
  const [exercisePicker, setExercisePicker] = useState<{ dayId: string } | null>(null);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);

  const load = useCallback(() => {
    const d = getMesocycleDetail(id);
    if (!d) return;
    setName(d.mesocycle.name);
    setWeeks(d.mesocycle.weeks);
    setAllExercises(listExercises());

    if (d.workouts.length > 0) {
      setDays(
        d.workouts.map((w) => ({
          id: w.workout.id,
          name: w.workout.name,
          dayNumber: w.workout.dayNumber,
          exercises: w.exercises.map((e) => ({
            exerciseId: e.exercise.id,
            exerciseName: e.exercise.name,
            isFocus: e.mesoExercise.isFocus,
            sets: e.sets.map((s) => ({
              weekNumber: s.weekNumber,
              reps: s.targetReps,
              percentage: s.targetPercentage,
            })),
          })),
        }))
      );
    } else {
      // Default one day
      setDays([{ id: 'default-1', name: 'Day 1', dayNumber: 1, exercises: [] }]);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = () => {
    const structure = days.map((d) => ({
      name: d.name,
      dayNumber: d.dayNumber,
      exercises: d.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        isFocus: e.isFocus,
        sets: e.sets.map((s) => ({
          weekNumber: s.weekNumber,
          reps: s.reps,
          percentage: s.percentage,
        })),
      })),
    }));
    replaceMesocycleStructure(id, structure);
    Alert.alert('Success', 'Mesocycle structure saved!');
  };

  const addDay = () => {
    setDays((prev) => [
      ...prev,
      { id: Math.random().toString(), name: `Day ${prev.length + 1}`, dayNumber: prev.length + 1, exercises: [] },
    ]);
  };

  const addExercise = (dayId: string, ex: Exercise) => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: [
            ...d.exercises,
            {
              exerciseId: ex.id,
              exerciseName: ex.name,
              isFocus: false, // Default to accessory
              sets: [{ weekNumber: null, reps: 10, percentage: null }],
            },
          ],
        };
      })
    );
    setExercisePicker(null);
  };

  const toggleFocus = (dayId: string, exIndex: number) => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const exercises = [...d.exercises];
        const ex = exercises[exIndex];
        const newIsFocus = !ex.isFocus;
        
        // Reset sets based on focus
        let newSets: MesoSet[] = [];
        if (newIsFocus) {
          // One set for every week
          for (let w = 1; w <= weeks; w++) {
            newSets.push({ weekNumber: w, reps: 5, percentage: 70 });
          }
        } else {
          // Baseline sets
          newSets = [{ weekNumber: null, reps: 10, percentage: null }];
        }

        exercises[exIndex] = { ...ex, isFocus: newIsFocus, sets: newSets };
        return { ...d, exercises };
      })
    );
  };

  const updateSet = (dayId: string, exIndex: number, setIndex: number, patch: Partial<MesoSet>) => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const exercises = [...d.exercises];
        const sets = [...exercises[exIndex].sets];
        sets[setIndex] = { ...sets[setIndex], ...patch };
        exercises[exIndex] = { ...exercises[exIndex], sets };
        return { ...d, exercises };
      })
    );
  };

  const addSetToAccessory = (dayId: string, exIndex: number) => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const exercises = [...d.exercises];
        const sets = [...exercises[exIndex].sets];
        const last = sets[sets.length - 1];
        sets.push({ weekNumber: null, reps: last?.reps ?? 10, percentage: null });
        exercises[exIndex] = { ...exercises[exIndex], sets };
        return { ...d, exercises };
      })
    );
  };

  const startBlock = () => {
    save();
    // Gather unique focus exercises
    const focusExMap = new Map<string, string>();
    days.forEach(d => {
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
        </View>

        {days.map((day) => (
          <View key={day.id} style={styles.daySection}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayTitle}>{day.name}</Text>
              <Pressable onPress={() => setExercisePicker({ dayId: day.id })}>
                <Text style={styles.addText}>+ Add Exercise</Text>
              </Pressable>
            </View>

            {day.exercises.map((ex, exIdx) => (
              <Card key={`${ex.exerciseId}-${exIdx}`} style={styles.exCard}>
                <View style={styles.exHeader}>
                  <View>
                    <Text style={styles.exName}>{ex.exerciseName}</Text>
                    <Pressable onPress={() => toggleFocus(day.id, exIdx)} style={styles.focusToggle}>
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
                    setDays(prev => prev.map(d => d.id === day.id ? { ...d, exercises: d.exercises.filter((_, i) => i !== exIdx) } : d));
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
                            value={String(s.reps)}
                            onChangeText={(t) => updateSet(day.id, exIdx, si, { reps: parseInt(t, 10) || 0 })}
                            keyboardType="number-pad"
                          />
                        </View>
                        <View style={styles.weekInputWrapper}>
                          <Text style={styles.inputLabel}>% 1RM</Text>
                          <TextField
                            value={String(s.percentage)}
                            onChangeText={(t) => updateSet(day.id, exIdx, si, { percentage: parseFloat(t) || 0 })}
                            keyboardType="decimal-pad"
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
                          value={String(s.reps)}
                          onChangeText={(t) => updateSet(day.id, exIdx, si, { reps: parseInt(t, 10) || 0 })}
                          keyboardType="number-pad"
                        />
                        <Text style={styles.accSuffix}>reps</Text>
                        <Pressable onPress={() => {
                          setDays(prev => prev.map(d => d.id === day.id ? {
                            ...d,
                            exercises: d.exercises.map((e, i) => i === exIdx ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e)
                          } : d));
                        }} disabled={ex.sets.length <= 1}>
                           <FontAwesome name="minus-circle" size={20} color={theme.colors.textMuted} />
                        </Pressable>
                      </View>
                    ))}
                    <Pressable onPress={() => addSetToAccessory(day.id, exIdx)}>
                      <Text style={styles.addSetText}>+ Add Set</Text>
                    </Pressable>
                  </View>
                )}
              </Card>
            ))}
          </View>
        ))}

        <Button variant="ghost" onPress={addDay}>Add Day</Button>
        
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
                <Pressable style={styles.pickerRow} onPress={() => exercisePicker && addExercise(exercisePicker.dayId, item)}>
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
    daySection: { marginBottom: 32 },
    dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    dayTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.textPrimary },
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
