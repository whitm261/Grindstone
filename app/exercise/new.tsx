import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import type { AppTheme } from '@/constants/theme';
import { createExercise } from '@/lib/queries';

export default function NewExerciseScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  const save = () => {
    const n = name.trim();
    if (!n) return;
    createExercise(n, notes);
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        <Text style={styles.label}>Name</Text>
        <TextField
          value={name}
          onChangeText={setName}
          placeholder="e.g. Back squat"
          autoFocus
        />
        <Text style={[styles.label, styles.mt]}>Notes (optional)</Text>
        <TextField
          value={notes}
          onChangeText={setNotes}
          placeholder="Cues, equipment…"
          multiline
        />
        <View style={styles.actions}>
          <Button onPress={save} disabled={!name.trim()}>
            Save exercise
          </Button>
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
    actions: { marginTop: theme.space.lg },
  });
