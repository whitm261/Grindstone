import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import type { AppTheme } from '@/constants/theme';
import { getMesocycleDetail, startActiveMesocycle } from '@/lib/queries';

export default function StartMesocycleScreen() {
  const styles = useThemedStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [focusLifts, setFocusLifts] = useState<{ id: string; name: string; max: string }[]>([]);

  useEffect(() => {
    const d = getMesocycleDetail(id);
    if (!d) return;

    const map = new Map<string, string>();
    d.workouts.forEach(w => {
      w.exercises.forEach(e => {
        if (e.mesoExercise.isFocus) map.set(e.exercise.id, e.exercise.name);
      });
    });

    setFocusLifts(Array.from(map.entries()).map(([id, name]) => ({ id, name, max: '100' })));
  }, [id]);

  const handleStart = () => {
    const maxes = focusLifts.map(l => ({
      exerciseId: l.id,
      weight: l.max.trim() === '' ? NaN : Number(l.max)
    }));

    try {
      const activeId = startActiveMesocycle(id, maxes);
      if (activeId) {
        router.replace(`/mesocycle/active/${activeId}` as Href);
      }
    } catch (error) {
      Alert.alert('Could not start block', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Start Block' }} />
      <Text style={styles.title}>Set your 1-Rep Maxes</Text>
      <Text style={styles.sub}>These will be used to calculate your target weights for this block.</Text>

      {focusLifts.map((lift, index) => (
        <Card key={lift.id} style={styles.card}>
          <Text style={styles.label}>{lift.name} 1RM</Text>
          <TextField
            value={lift.max}
            onChangeText={(t) => {
              const next = [...focusLifts];
              next[index].max = t;
              setFocusLifts(next);
            }}
            keyboardType="decimal-pad"
            placeholder="100"
          />
        </Card>
      ))}

      <Button onPress={handleStart} style={styles.btn}>
        Start Training Block
      </Button>
    </ScrollView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 16 },
    title: { fontSize: 22, fontWeight: 'bold', color: theme.colors.textPrimary, marginBottom: 8 },
    sub: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 24 },
    card: { padding: 16, marginBottom: 16 },
    label: {
      fontSize: theme.fontSize.caption,
      fontWeight: '600',
      color: theme.colors.textMuted,
      marginBottom: theme.space.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    btn: { marginTop: 8 },
  });
