import FontAwesome from '@expo/vector-icons/FontAwesome';
import { usePreventRemove } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  LayoutAnimation,
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
import { SetRow } from '@/components/workout/SetRow';
import { useWorkoutDraft } from '@/components/workout/useWorkoutDraft';
import { validateWorkoutDraft, type SetDraft, type SetInputErrors } from '@/lib/workoutDraft';
import type { LastExerciseData, WorkoutDetail } from '@/lib/queries';
import {
  abandonWorkout,
  addExerciseToWorkout,
  addSetToWorkoutExercise,
  completeWorkout,
  getLastWorkoutDataForExercises,
  getWorkoutDetail,
  listExercises,
  moveWorkoutExercise,
  removeLastSet,
  removeWorkoutExerciseBlock,
  saveWorkoutDraft,
} from '@/lib/queries';
import { formatRelDate, fmtSet } from '@/lib/utils';

export default function WorkoutScreen() {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [exitRoute, setExitRoute] = useState<'session' | 'back' | null>(null);
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [lastData, setLastData] = useState<Map<string, LastExerciseData>>(new Map());
  const { draft, load: loadDraft, updateSet, updateName, getCurrent, saveError, retrySave } = useWorkoutDraft(id);
  const [errors, setErrors] = useState<Record<string, SetInputErrors>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const blockPositions = useRef<Record<string, number>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const refresh = useCallback(() => {
    try {
      const d = getWorkoutDetail(id);
      if (!d) {
        router.back();
        return;
      }
      if (d.workout.completedAt) {
        router.replace(`/session/${id}`);
        return;
      }
      loadDraft(d);
      setDetail(d);
      setLastData(getLastWorkoutDataForExercises(d.blocks.map((b) => b.exercise.id)));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load this workout.');
    }
  }, [id, router, loadDraft]);

  useFocusEffect(refresh);

  usePreventRemove(Boolean(saveError) && exitRoute === null, ({ data }) => {
    Alert.alert('Latest edits are not saved', 'Retry saving before leaving, or leave without your latest edits.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Retry save', onPress: retrySave },
      { text: 'Leave without edits', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  useEffect(() => {
    if (exitRoute === 'session') router.replace(`/session/${id}`);
    else if (exitRoute === 'back') router.back();
  }, [exitRoute, id, router]);

  useEffect(() => {
    if (pickerOpen) setExercises(listExercises());
  }, [pickerOpen]);

  const toggleCollapse = (weId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((c) => ({ ...c, [weId]: !c[weId] }));
  };

  const changeSet = useCallback((setId: string, patch: Partial<SetDraft>) => {
    updateSet(setId, patch);
    setErrors((previous) => {
      if (!previous[setId]) return previous;
      const next = { ...previous };
      delete next[setId];
      return next;
    });
  }, [updateSet]);

  const changeStructure = (action: () => unknown) => {
    try {
      const latest = getCurrent();
      if (latest) saveWorkoutDraft(id, latest);
      action();
      refresh();
    } catch (error) {
      Alert.alert('Unable to save change', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const finish = () => {
    const latest = getCurrent();
    if (!latest) return;
    const result = validateWorkoutDraft(latest);
    setErrors(result.errors);
    if (!result.valid) {
      const firstBlock = detail?.blocks.find((block) => block.sets.some((set) => result.errors[set.id]));
      if (firstBlock) {
        setCollapsed((previous) => ({ ...previous, [firstBlock.workoutExercise.id]: false }));
        scrollRef.current?.scrollTo({ y: blockPositions.current[firstBlock.workoutExercise.id] ?? 0, animated: true });
      }
      Alert.alert('Check your sets', 'Correct the highlighted reps and weight in checked sets, then finish again.');
      return;
    }
    const message = result.completedSets.length === 0
      ? 'No sets are checked. Finish without recording any performed sets? Unchecked sets will be removed.'
      : result.skippedCount > 0
        ? `Save ${result.completedSets.length} completed sets? ${result.skippedCount} unchecked sets will be skipped and removed.`
        : 'Save your completed sets and finish this workout?';
    Alert.alert('Finish workout', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finish', onPress: () => {
        try {
          completeWorkout(id, getCurrent() ?? latest);
          Keyboard.dismiss();
          setExitRoute('session');
        } catch (error) {
          Alert.alert('Unable to finish', error instanceof Error ? error.message : 'Your workout remains open. Please try again.');
        }
      } },
    ]);
  };

  const discard = () => {
    Alert.alert('Discard workout', 'Delete this session and all logged sets?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          try {
            abandonWorkout(id);
            setExitRoute('back');
          } catch (error) {
            Alert.alert('Unable to discard', error instanceof Error ? error.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  const pickExercise = (ex: Exercise) => {
    changeStructure(() => {
      addExerciseToWorkout(id, ex.id);
      setPickerOpen(false);
    });
  };

  if (!detail || !draft) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>{loadError ?? 'Loading…'}</Text>
        {loadError && <Button onPress={refresh}>Retry</Button>}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TextField
          style={styles.titleInput}
          accessibilityLabel="Workout name"
          value={draft.name}
          onChangeText={updateName}
        />
        <Text style={styles.started}>
          Started {new Date(detail.workout.startedAt).toLocaleString()}
        </Text>

        {(saveError || loadError) && (
          <View style={styles.saveWarning}>
            <Text accessibilityLiveRegion="polite" style={styles.error}>{saveError ?? loadError}</Text>
            <Button variant="ghost" onPress={saveError ? retrySave : refresh}>Retry save</Button>
          </View>
        )}
        <Text style={styles.started}>Reps × weight · Use 0 for bodyweight. Check the sets you perform.</Text>
        <View style={styles.toolbar}>
          <Button onPress={finish}>Finish workout</Button>
          <Button variant="ghost" onPress={discard}>
            Discard
          </Button>
        </View>

        <Pressable
          style={styles.addExerciseBtn}
          accessibilityRole="button"
          accessibilityLabel="Add exercise"
          onPress={() => { Keyboard.dismiss(); setPickerOpen(true); }}>
          <FontAwesome name="plus" size={14} color={theme.colors.accent} />
          <Text style={styles.addExerciseText}> Add exercise</Text>
        </Pressable>

        {detail.blocks.map((block) => {
          const isCollapsed = collapsed[block.workoutExercise.id];
          const allDone = block.sets.length > 0 && block.sets.every((s) => draft.sets[s.id]?.completed);
          const prev = lastData.get(block.exercise.id);
          return (
            <View key={block.workoutExercise.id}
              onLayout={(event) => { blockPositions.current[block.workoutExercise.id] = event.nativeEvent.layout.y; }}>
            <Card style={styles.block}>
              <View style={styles.blockTitleRow}>
                <Pressable style={styles.blockTitleLeft}
                  accessibilityRole="button" accessibilityLabel={`${block.exercise.name}, ${isCollapsed ? 'expand' : 'collapse'}`}
                  accessibilityState={{ expanded: !isCollapsed }}
                  onPress={() => toggleCollapse(block.workoutExercise.id)}>
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
                </Pressable>
                <View style={styles.blockActions}>
                  <Pressable style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`Move ${block.exercise.name} up`}
                    onPress={() => {
                      changeStructure(() => moveWorkoutExercise(block.workoutExercise.id, -1));
                    }}>
                    <FontAwesome name="arrow-up" size={16} color={theme.colors.textMuted} />
                  </Pressable>
                  <Pressable style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`Move ${block.exercise.name} down`}
                    onPress={() => {
                      changeStructure(() => moveWorkoutExercise(block.workoutExercise.id, 1));
                    }}>
                    <FontAwesome name="arrow-down" size={16} color={theme.colors.textMuted} />
                  </Pressable>
                  <Pressable style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`Remove ${block.exercise.name}`}
                    onPress={() => {
                      Alert.alert('Remove exercise', 'Remove this movement from the workout?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => {
                            changeStructure(() => removeWorkoutExerciseBlock(block.workoutExercise.id));
                          },
                        },
                      ]);
                    }}>
                    <FontAwesome name="trash-o" size={16} color={theme.colors.danger} />
                  </Pressable>
                </View>
              </View>

              {prev && (
                <Text style={styles.lastSession}>
                  Last ({formatRelDate(prev.completedAt)}): {prev.sets.map(fmtSet).join(' · ')}
                </Text>
              )}

              {!isCollapsed && (
                <View style={styles.sets}>
                  {block.sets.map((set) => (
                    <SetRow key={set.id} id={set.id} index={set.index}
                      exerciseName={block.exercise.name} draft={draft.sets[set.id]}
                      errors={errors[set.id]} onChange={changeSet} />
                  ))}
                  <View style={styles.setButtons}>
                    <Pressable
                      style={styles.smallBtn}
                      onPress={() => {
                        changeStructure(() => addSetToWorkoutExercise(block.workoutExercise.id));
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      }}>
                      <Text style={styles.smallBtnText}>+ Set</Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallBtn}
                      onPress={() => {
                        changeStructure(() => removeLastSet(block.workoutExercise.id));
                      }}>
                      <Text style={styles.smallBtnText}>− Set</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </Card>
            </View>
          );
        })}

        {detail.blocks.length === 0 ? (
          <Text style={styles.empty}>Add exercises to start logging sets.</Text>
        ) : null}
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add exercise</Text>
            <FlatList
              keyboardShouldPersistTaps="handled"
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

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
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
    addExerciseBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', marginBottom: theme.space.md },
    addExerciseText: { color: theme.colors.accent, fontWeight: '700', fontSize: theme.fontSize.body },
    block: { marginBottom: theme.space.md },
    blockTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    blockTitleLeft: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, flex: 1 },
    exerciseName: { fontSize: theme.fontSize.title, fontWeight: '700', color: theme.colors.textPrimary, flex: 1 },
    blockActions: { flexDirection: 'row' },
    iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    error: { color: theme.colors.danger },
    saveWarning: { gap: theme.space.sm, marginBottom: theme.space.md },
    lastSession: {
      fontSize: theme.fontSize.caption,
      color: theme.colors.textMuted,
      marginTop: theme.space.xs,
      marginBottom: theme.space.xs,
    },
    sets: { marginTop: theme.space.sm, gap: theme.space.sm },
    setButtons: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.sm },
    smallBtn: {
      minHeight: 48,
      justifyContent: 'center',
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
