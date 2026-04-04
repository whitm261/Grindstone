import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
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

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { theme } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import {
  getTemplateDetail,
  listExercises,
  replaceTemplateStructure,
  updateTemplateMeta,
} from '@/lib/queries';

type Block = { exerciseId: string; exerciseName: string; sets: Array<{ reps: number; weight: number }> };

export default function EditTemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);

  const load = useCallback(() => {
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
          ? it.sets.map((s) => ({ reps: s.targetReps, weight: s.targetWeight }))
          : [{ reps: 8, weight: 0 }],
      })),
    );
    setAllExercises(listExercises());
  }, [id, router]);

  useFocusEffect(load);

  const persistMeta = () => {
    updateTemplateMeta(id, name, notes);
  };

  const saveStructure = () => {
    persistMeta();
    const structure = blocks.map((b) => ({
      exerciseId: b.exerciseId,
      sets: b.sets.map((s) => ({
        reps: Math.max(0, Math.round(s.reps)),
        weight: Number(s.weight) || 0,
      })),
    }));
    replaceTemplateStructure(id, structure);
  };

  const addExercise = (ex: Exercise) => {
    setBlocks((prev) => [
      ...prev,
      { exerciseId: ex.id, exerciseName: ex.name, sets: [{ reps: 8, weight: 0 }] },
    ]);
    setPickerOpen(false);
  };

  const removeBlock = (index: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const addSet = (blockIndex: number) => {
    setBlocks((prev) => {
      const next = [...prev];
      const last = next[blockIndex].sets[next[blockIndex].sets.length - 1];
      next[blockIndex] = {
        ...next[blockIndex],
        sets: [...next[blockIndex].sets, { reps: last?.reps ?? 8, weight: last?.weight ?? 0 }],
      };
      return next;
    });
  };

  const removeSet = (blockIndex: number, setIndex: number) => {
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
    patch: Partial<{ reps: number; weight: number }>,
  ) => {
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
        <TextField value={name} onChangeText={setName} onBlur={persistMeta} />
        <Text style={[styles.label, styles.mt]}>Notes</Text>
        <TextField value={notes} onChangeText={setNotes} multiline onBlur={persistMeta} />

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
              <Pressable onPress={() => removeBlock(bi)} hitSlop={8}>
                <FontAwesome name="times" size={18} color={theme.colors.danger} />
              </Pressable>
            </View>
            {block.sets.map((s, si) => (
              <View key={si} style={styles.setRow}>
                <Text style={styles.setIdx}>Set {si + 1}</Text>
                <TextField
                  style={styles.setInput}
                  keyboardType="number-pad"
                  value={String(s.reps)}
                  onChangeText={(t) =>
                    updateSet(bi, si, { reps: parseInt(t, 10) || 0 })
                  }
                />
                <Text style={styles.x}>×</Text>
                <TextField
                  style={styles.setInput}
                  keyboardType="decimal-pad"
                  value={String(s.weight)}
                  onChangeText={(t) =>
                    updateSet(bi, si, { weight: parseFloat(t) || 0 })
                  }
                />
                <Pressable onPress={() => removeSet(bi, si)} disabled={block.sets.length <= 1}>
                  <FontAwesome
                    name="minus-circle"
                    size={22}
                    color={block.sets.length <= 1 ? theme.colors.border : theme.colors.textMuted}
                  />
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addSet} onPress={() => addSet(bi)}>
              <Text style={styles.addSetText}>+ Add set</Text>
            </Pressable>
          </Card>
        ))}

        <View style={styles.actions}>
          <Button
            onPress={() => {
              saveStructure();
              router.back();
            }}>
            Save template
          </Button>
        </View>
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose exercise</Text>
            <FlatList
              data={allExercises}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              renderItem={({ item }) => (
                <Pressable style={styles.pickerRow} onPress={() => addExercise(item)}>
                  <Text style={styles.pickerName}>{item.name}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.hint}>Create exercises in the Exercises tab first.</Text>
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
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.space.md,
  },
  addLink: { flexDirection: 'row', alignItems: 'center' },
  addLinkText: { color: theme.colors.accent, fontWeight: '700', fontSize: theme.fontSize.body },
  hint: { color: theme.colors.textSecondary, marginVertical: theme.space.md, lineHeight: 22 },
  block: { marginBottom: theme.space.md },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockTitle: { fontSize: theme.fontSize.title, fontWeight: '700', color: theme.colors.textPrimary },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    marginTop: theme.space.sm,
  },
  setIdx: { width: 44, color: theme.colors.textSecondary, fontSize: theme.fontSize.caption },
  setInput: { flex: 1, minHeight: 44, paddingVertical: 8 },
  x: { color: theme.colors.textMuted },
  addSet: { marginTop: theme.space.sm },
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
  pickerRow: { paddingVertical: theme.space.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  pickerName: { fontSize: theme.fontSize.body, color: theme.colors.textPrimary },
});
