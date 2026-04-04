import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { theme } from '@/constants/theme';
import type { Exercise, SetLog } from '@/db/schema';
import type { WorkoutDetail } from '@/lib/queries';
import {
  abandonWorkout,
  addExerciseToWorkout,
  addSetToWorkoutExercise,
  completeWorkout,
  getWorkoutDetail,
  listExercises,
  moveWorkoutExercise,
  removeLastSet,
  removeWorkoutExerciseBlock,
  updateSetLog,
  updateWorkoutName,
} from '@/lib/queries';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function SetRow({
  set,
  onToggleComplete,
  onUpdateReps,
  onUpdateWeight,
}: {
  set: SetLog;
  onToggleComplete: () => void;
  onUpdateReps: (n: number) => void;
  onUpdateWeight: (n: number) => void;
}) {
  const [reps, setReps] = useState(String(set.reps));
  const [weight, setWeight] = useState(String(set.weight));
  const debounceR = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const debounceW = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setReps(String(set.reps));
    setWeight(String(set.weight));
  }, [set.reps, set.weight, set.id]);

  const scheduleReps = (t: string) => {
    setReps(t);
    clearTimeout(debounceR.current);
    debounceR.current = setTimeout(() => {
      onUpdateReps(parseInt(t, 10) || 0);
    }, 400);
  };

  const scheduleWeight = (t: string) => {
    setWeight(t);
    clearTimeout(debounceW.current);
    debounceW.current = setTimeout(() => {
      onUpdateWeight(parseFloat(t) || 0);
    }, 400);
  };

  return (
    <MotiView
      animate={{
        opacity: set.completed ? 0.55 : 1,
        translateX: set.completed ? 4 : 0,
      }}
      transition={{ type: 'timing', duration: 220 }}
      style={[
        styles.setRow,
        set.completed && { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentMuted },
      ]}>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggleComplete();
        }}
        style={styles.checkWrap}>
        <MotiView
          animate={{ scale: set.completed ? 1 : 0.85 }}
          transition={{ type: 'spring', damping: 14 }}>
          <FontAwesome
            name={set.completed ? 'check-circle' : 'circle-o'}
            size={26}
            color={set.completed ? theme.colors.accent : theme.colors.textMuted}
          />
        </MotiView>
      </Pressable>
      <Text style={styles.setLabel}>#{set.index + 1}</Text>
      <TextField
        style={styles.setInput}
        keyboardType="number-pad"
        value={reps}
        onChangeText={scheduleReps}
        onBlur={() => onUpdateReps(parseInt(reps, 10) || 0)}
      />
      <Text style={styles.times}>×</Text>
      <TextField
        style={styles.setInput}
        keyboardType="decimal-pad"
        value={weight}
        onChangeText={scheduleWeight}
        onBlur={() => onUpdateWeight(parseFloat(weight) || 0)}
      />
    </MotiView>
  );
}

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const refresh = useCallback(() => {
    const d = getWorkoutDetail(id);
    if (!d) {
      router.back();
      return;
    }
    if (d.workout.completedAt) {
      router.replace(`/session/${id}`);
      return;
    }
    setDetail(d);
    setSessionTitle(d.workout.name);
  }, [id, router]);

  useFocusEffect(refresh);

  const toggleCollapse = (weId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((c) => ({ ...c, [weId]: !c[weId] }));
  };

  const finish = () => {
    Alert.alert('Finish workout', 'Mark this session as complete?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish',
        onPress: () => {
          completeWorkout(id);
          router.replace(`/session/${id}`);
        },
      },
    ]);
  };

  const discard = () => {
    Alert.alert('Discard workout', 'Delete this session and all logged sets?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          abandonWorkout(id);
          router.back();
        },
      },
    ]);
  };

  const commitTitle = () => {
    updateWorkoutName(id, sessionTitle);
    refresh();
  };

  const pickExercise = (ex: Exercise) => {
    addExerciseToWorkout(id, ex.id);
    setPickerOpen(false);
    refresh();
  };

  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TextField
          style={styles.titleInput}
          value={sessionTitle}
          onChangeText={setSessionTitle}
          onBlur={commitTitle}
        />
        <Text style={styles.started}>
          Started {new Date(detail.workout.startedAt).toLocaleString()}
        </Text>

        <View style={styles.toolbar}>
          <Button onPress={finish}>Finish workout</Button>
          <Button variant="ghost" onPress={discard}>
            Discard
          </Button>
        </View>

        <Pressable
          style={styles.addExerciseBtn}
          onPress={() => {
            setExercises(listExercises());
            setPickerOpen(true);
          }}>
          <FontAwesome name="plus" size={14} color={theme.colors.accent} />
          <Text style={styles.addExerciseText}> Add exercise</Text>
        </Pressable>

        {detail.blocks.map((block) => {
          const isCollapsed = collapsed[block.workoutExercise.id];
          const allDone = block.sets.length > 0 && block.sets.every((s) => s.completed);
          return (
            <Card key={block.workoutExercise.id} style={styles.block}>
              <Pressable
                style={styles.blockTitleRow}
                onPress={() => toggleCollapse(block.workoutExercise.id)}>
                <View style={styles.blockTitleLeft}>
                  <FontAwesome
                    name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                    size={16}
                    color={theme.colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.exerciseName,
                      allDone && { color: theme.colors.textSecondary },
                    ]}>
                    {block.exercise.name}
                  </Text>
                </View>
                <View style={styles.blockActions}>
                  <Pressable
                    onPress={() => {
                      moveWorkoutExercise(block.workoutExercise.id, -1);
                      refresh();
                    }}>
                    <FontAwesome name="arrow-up" size={16} color={theme.colors.textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      moveWorkoutExercise(block.workoutExercise.id, 1);
                      refresh();
                    }}>
                    <FontAwesome name="arrow-down" size={16} color={theme.colors.textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Alert.alert('Remove exercise', 'Remove this movement from the workout?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => {
                            removeWorkoutExerciseBlock(block.workoutExercise.id);
                            refresh();
                          },
                        },
                      ]);
                    }}>
                    <FontAwesome name="trash-o" size={16} color={theme.colors.danger} />
                  </Pressable>
                </View>
              </Pressable>

              {!isCollapsed && (
                <View style={styles.sets}>
                  {block.sets.map((set) => (
                    <SetRow
                      key={set.id}
                      set={set}
                      onToggleComplete={() => {
                        const next = !set.completed;
                        updateSetLog(set.id, { completed: next });
                        if (next) {
                          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                        refresh();
                      }}
                      onUpdateReps={(n) => {
                        updateSetLog(set.id, { reps: n });
                        refresh();
                      }}
                      onUpdateWeight={(n) => {
                        updateSetLog(set.id, { weight: n });
                        refresh();
                      }}
                    />
                  ))}
                  <View style={styles.setButtons}>
                    <Pressable
                      style={styles.smallBtn}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        addSetToWorkoutExercise(block.workoutExercise.id);
                        refresh();
                      }}>
                      <Text style={styles.smallBtnText}>+ Set</Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallBtn}
                      onPress={() => {
                        removeLastSet(block.workoutExercise.id);
                        refresh();
                      }}>
                      <Text style={styles.smallBtnText}>− Set</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </Card>
          );
        })}

        {detail.blocks.length === 0 ? (
          <Text style={styles.empty}>Add exercises to start logging sets.</Text>
        ) : null}
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add exercise</Text>
            <FlatList
              data={exercises}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              renderItem={({ item }) => (
                <Pressable style={styles.pickerRow} onPress={() => pickExercise(item)}>
                  <Text style={styles.pickerName}>{item.name}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Text style={styles.empty}>
                    No exercises yet. Create one to add it to this workout.
                  </Text>
                  <Button
                    onPress={() => {
                      setPickerOpen(false);
                      router.push('/exercise/new');
                    }}>
                    Create exercise
                  </Button>
                </View>
              }
            />
            <Button variant="ghost" onPress={() => setPickerOpen(false)}>
              Cancel
            </Button>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  loading: { color: theme.colors.textMuted },
  scroll: { padding: theme.space.md, paddingBottom: 48 },
  titleInput: {
    fontSize: theme.fontSize.headline,
    fontWeight: '700',
    marginBottom: theme.space.xs,
  },
  started: { fontSize: theme.fontSize.caption, color: theme.colors.textMuted, marginBottom: theme.space.md },
  toolbar: { gap: theme.space.sm, marginBottom: theme.space.md },
  addExerciseBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.space.md },
  addExerciseText: { color: theme.colors.accent, fontWeight: '700', fontSize: theme.fontSize.body },
  block: { marginBottom: theme.space.md },
  blockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  blockTitleLeft: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, flex: 1 },
  exerciseName: { fontSize: theme.fontSize.title, fontWeight: '700', color: theme.colors.textPrimary, flex: 1 },
  blockActions: { flexDirection: 'row', gap: theme.space.md },
  sets: { marginTop: theme.space.md, gap: theme.space.sm },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    padding: theme.space.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
  },
  checkWrap: { padding: 4 },
  setLabel: { width: 28, color: theme.colors.textSecondary, fontSize: theme.fontSize.caption },
  setInput: { flex: 1, minHeight: 44 },
  times: { color: theme.colors.textMuted },
  setButtons: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.sm },
  smallBtn: {
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  smallBtnText: { color: theme.colors.accent, fontWeight: '600' },
  empty: { color: theme.colors.textSecondary, textAlign: 'center', marginTop: theme.space.lg },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    padding: theme.space.md,
  },
  modalCard: { maxHeight: '75%' },
  modalTitle: {
    fontSize: theme.fontSize.title,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.space.md,
  },
  modalList: { maxHeight: 360 },
  modalEmpty: { paddingVertical: theme.space.md, gap: theme.space.md, alignItems: 'stretch' },
  pickerRow: { paddingVertical: theme.space.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  pickerName: { fontSize: theme.fontSize.body, color: theme.colors.textPrimary },
});
