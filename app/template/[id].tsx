import FontAwesome from '@expo/vector-icons/FontAwesome';
import { usePreventRemove } from '@react-navigation/native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  getTemplateDetail,
  listExercises,
  saveTemplate,
} from '@/lib/queries';
import { parseSetInput, type SetInputErrors } from '@/lib/workoutDraft';

type Block = { exerciseId: string; exerciseName: string; sets: Array<{ reps: string; weight: string }> };

export default function EditTemplateScreen() {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [setErrors, setSetErrors] = useState<Record<string, SetInputErrors>>({});
  const loadedId = useRef<string | null>(null);

  const load = useCallback(() => {
    setAllExercises(listExercises());
    // Returning from Create exercise refreshes the picker without losing edits.
    if (loadedId.current === id) return;
    const d = getTemplateDetail(id);
    if (!d) {
      router.back();
      return;
    }
    setName(d.template.name);
    setNotes(d.template.notes);
    setBlocks(
      d.items.map((it) => ({
        exerciseId: it.exercise.id,
        exerciseName: it.exercise.name,
        sets: it.sets.length
          ? it.sets.map((s) => ({ reps: String(s.targetReps), weight: String(s.targetWeight) }))
          : [{ reps: '8', weight: '0' }],
      })),
    );
    loadedId.current = id;
    setHasChanges(false);
    setSaved(false);
    setNameError(null);
    setSetErrors({});
  }, [id, router]);

  useFocusEffect(load);

  usePreventRemove(hasChanges, ({ data }) => {
    Alert.alert('Discard changes?', 'You have unsaved changes to this template.', [
      { text: "Don't leave", style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setHasChanges(false);
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  // Let the navigation guard observe a successful save before leaving.
  useEffect(() => {
    if (saved && !hasChanges) router.back();
  }, [saved, hasChanges, router]);

  const markChanged = () => {
    setHasChanges(true);
    setNameError(null);
    setSetErrors({});
  };

  const saveStructure = () => {
    const errors: Record<string, SetInputErrors> = {};
    let firstError = '';
    const structure = blocks.map((block, bi) => ({
      exerciseId: block.exerciseId,
      sets: block.sets.map((set, si) => {
        const parsed = parseSetInput(set);
        if (!parsed.valid) {
          errors[`${bi}:${si}`] = parsed.errors;
          firstError ||= `${block.exerciseName}, set ${si + 1}: ${Object.values(parsed.errors).join(' ')}`;
        }
        return { reps: parsed.reps, weight: parsed.weight };
      }),
    }));
    const invalidName = !name.trim();
    setNameError(invalidName ? 'Enter a template name.' : null);
    setSetErrors(errors);
    if (invalidName || firstError) {
      Alert.alert('Check template', invalidName ? 'Enter a template name.' : firstError);
      return;
    }
    try {
      saveTemplate(id, name, notes, structure);
      setHasChanges(false);
      setSaved(true);
    } catch (error) {
      Alert.alert('Could not save template', error instanceof Error ? error.message : 'Your edits are still here. Please try again.');
    }
  };

  const addExercise = (ex: Exercise) => {
    markChanged();
    setBlocks((prev) => [
      ...prev,
      { exerciseId: ex.id, exerciseName: ex.name, sets: [{ reps: '8', weight: '0' }] },
    ]);
    setPickerOpen(false);
  };

  const removeBlock = (index: number) => {
    markChanged();
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const addSet = (blockIndex: number) => {
    markChanged();
    setBlocks((prev) => {
      const next = [...prev];
      const last = next[blockIndex].sets[next[blockIndex].sets.length - 1];
      next[blockIndex] = {
        ...next[blockIndex],
        sets: [...next[blockIndex].sets, { reps: last?.reps ?? '8', weight: last?.weight ?? '0' }],
      };
      return next;
    });
  };

  const removeSet = (blockIndex: number, setIndex: number) => {
    markChanged();
    setBlocks((prev) => {
      const next = [...prev];
      if (next[blockIndex].sets.length <= 1) return prev;
      next[blockIndex] = {
        ...next[blockIndex],
        sets: next[blockIndex].sets.filter((_, i) => i !== setIndex),
      };
      return next;
    });
  };

  const updateSet = (
    blockIndex: number,
    setIndex: number,
    patch: Partial<{ reps: string; weight: string }>,
  ) => {
    markChanged();
    setBlocks((prev) => {
      const next = [...prev];
      const sets = [...next[blockIndex].sets];
      sets[setIndex] = { ...sets[setIndex], ...patch };
      next[blockIndex] = { ...next[blockIndex], sets };
      return next;
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Name</Text>
        <TextField value={name} onChangeText={(text) => { markChanged(); setName(text); }} />
        {nameError && <Text style={styles.error}>{nameError}</Text>}
        <Text style={[styles.label, styles.mt]}>Notes</Text>
        <TextField value={notes} onChangeText={(text) => { markChanged(); setNotes(text); }} multiline />

        <View style={styles.rowBetween}>
          <Text style={[styles.label, styles.mt]}>Exercises</Text>
          <Pressable onPress={() => setPickerOpen(true)} style={styles.addLink}>
            <FontAwesome name="plus" size={14} color={theme.colors.accent} />
            <Text style={styles.addLinkText}> Add</Text>
          </Pressable>
        </View>

        {blocks.length === 0 ? (
          <Text style={styles.hint}>Add exercises and define default sets (reps / weight).</Text>
        ) : null}

        {blocks.map((block, bi) => (
          <Card key={`${block.exerciseId}-${bi}`} style={styles.block}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTitle}>{block.exerciseName}</Text>
              <Pressable onPress={() => removeBlock(bi)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`Remove ${block.exerciseName}`}>
                <FontAwesome name="times" size={18} color={theme.colors.danger} />
              </Pressable>
            </View>
            {block.sets.map((s, si) => (
              <View key={si}>
                <View style={styles.setRow}>
                  <Text style={styles.setIdx}>Set {si + 1}</Text>
                  <TextField
                    style={styles.setInput}
                    keyboardType="number-pad"
                    value={s.reps}
                    accessibilityLabel={`${block.exerciseName}, set ${si + 1} reps`}
                    onChangeText={(reps) => updateSet(bi, si, { reps })}
                  />
                  <Text style={styles.x}>×</Text>
                  <TextField
                    style={styles.setInput}
                    keyboardType="decimal-pad"
                    value={s.weight}
                    accessibilityLabel={`${block.exerciseName}, set ${si + 1} weight`}
                    onChangeText={(weight) => updateSet(bi, si, { weight })}
                  />
                  <Pressable onPress={() => removeSet(bi, si)} disabled={block.sets.length <= 1} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`Remove set ${si + 1}`}>
                    <FontAwesome
                      name="minus-circle"
                      size={22}
                      color={block.sets.length <= 1 ? theme.colors.border : theme.colors.textMuted}
                    />
                  </Pressable>
                </View>
                {setErrors[`${bi}:${si}`] && (
                  <Text style={styles.error}>{`${block.exerciseName}, set ${si + 1}: ${Object.values(setErrors[`${bi}:${si}`]).join(' ')}`}</Text>
                )}
              </View>
            ))}
            <Pressable style={styles.addSet} onPress={() => addSet(bi)}>
              <Text style={styles.addSetText}>+ Add set</Text>
            </Pressable>
          </Card>
        ))}

        <View style={styles.actions}>
          <Button onPress={saveStructure}>
            Save template
          </Button>
        </View>
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose exercise</Text>
            <FlatList
              data={allExercises}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={styles.pickerRow} onPress={() => addExercise(item)}>
                  <Text style={styles.pickerName}>{item.name}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Text style={styles.hint}>
                    No exercises yet. Create one to add it to this template.
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
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: theme.space.md,
    },
    addLink: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: theme.space.sm },
    addLinkText: { color: theme.colors.accent, fontWeight: '700', fontSize: theme.fontSize.body },
    hint: { color: theme.colors.textSecondary, marginVertical: theme.space.md, lineHeight: 22 },
    error: { color: theme.colors.danger, marginTop: theme.space.sm, lineHeight: 22 },
    block: { marginBottom: theme.space.md },
    blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    blockTitle: { flex: 1, fontSize: theme.fontSize.title, fontWeight: '700', color: theme.colors.textPrimary },
    iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    setRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.sm,
      marginTop: theme.space.sm,
    },
    setIdx: { width: 44, color: theme.colors.textSecondary, fontSize: theme.fontSize.caption },
    setInput: { flex: 1, minHeight: 44, paddingVertical: 8 },
    x: { color: theme.colors.textMuted },
    addSet: { marginTop: theme.space.sm, minHeight: 48, justifyContent: 'center' },
    addSetText: { color: theme.colors.accent, fontWeight: '600' },
    actions: { marginTop: theme.space.lg },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
      padding: theme.space.md,
    },
    modalCard: { maxHeight: '70%' },
    modalTitle: {
      fontSize: theme.fontSize.title,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      marginBottom: theme.space.md,
    },
    modalList: { maxHeight: 320 },
    modalEmpty: { paddingVertical: theme.space.md, gap: theme.space.md, alignItems: 'stretch' },
    pickerRow: { paddingVertical: theme.space.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    pickerName: { fontSize: theme.fontSize.body, color: theme.colors.textPrimary },
  });
