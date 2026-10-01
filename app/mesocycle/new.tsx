import { Stack, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import type { AppTheme } from '@/constants/theme';
import { createMesocycle } from '@/lib/queries';

export default function NewMesocycleScreen() {
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState('8');
  const [notes, setNotes] = useState('');
  const router = useRouter();

  const handleCreate = () => {
    if (!name.trim()) return;
    const numWeeks = parseInt(weeks, 10);
    if (isNaN(numWeeks) || numWeeks < 1) return;

    const row = createMesocycle(name, numWeeks, notes);
    router.replace(`/mesocycle/${row.id}` as Href);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'New Mesocycle' }} />
      <Card style={styles.card}>
        <Text style={styles.label}>Mesocycle Name</Text>
        <TextField
          value={name}
          onChangeText={setName}
          placeholder="e.g. SBD Strength Block"
          autoFocus
        />
        
        <Text style={[styles.label, styles.mt]}>Number of Weeks</Text>
        <TextField
          value={weeks}
          onChangeText={setWeeks}
          keyboardType="number-pad"
          placeholder="8-12"
        />
        
        <Text style={[styles.label, styles.mt]}>Notes (Optional)</Text>
        <TextField
          value={notes}
          onChangeText={setNotes}
          placeholder="Goals, focus, etc."
          multiline
        />
      </Card>

      <Button
        onPress={handleCreate}
        disabled={!name.trim()}
        style={styles.button}>
        Continue to Builder
      </Button>
    </ScrollView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 16,
    },
    card: {
      padding: 16,
      marginBottom: 24,
    },
    label: {
      fontSize: theme.fontSize.caption,
      fontWeight: '600',
      color: theme.colors.textMuted,
      marginBottom: theme.space.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    mt: {
      marginTop: 16,
    },
    button: {
      marginTop: 8,
    },
  });
