import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack, type Href } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import { useAppTheme } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { Button } from '@/components/ui/Button';
import type { AppTheme } from '@/constants/theme';
import { getActiveMesocycleDetail, startWorkoutFromMesocycleDay, completeActiveMesocycle } from '@/lib/queries';

export default function ActiveMesocycleScreen() {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);

  const load = useCallback(() => {
    setData(getActiveMesocycleDetail(id));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return null;

  const { active, mesoDetail, workoutsCompleted } = data;
  const totalWeeks = mesoDetail.mesocycle.weeks;

  const isCompleted = (mwId: string, week: number) => {
    return workoutsCompleted.some((w: any) => 
      w.activeMesocycleId === id && 
      w.mesocycleWeek === week && 
      w.name.startsWith(mesoDetail.workouts.find((mw: any) => mw.workout.id === mwId).workout.name)
    );
  };

  const startWorkout = (mwId: string, week: number) => {
    const workout = startWorkoutFromMesocycleDay(id, mwId, week);
    if (workout) {
      router.push(`/session/${workout.id}`);
    }
  };

  const handleComplete = () => {
    completeActiveMesocycle(id);
    router.replace('/(tabs)/mesocycles' as Href);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Training Block' }} />
      <View style={styles.header}>
        <Text style={styles.title}>{active.name}</Text>
        <Text style={styles.sub}>Progress: {workoutsCompleted.length} sessions done</Text>
      </View>

      {Array.from({ length: totalWeeks }).map((_, i) => {
        const week = i + 1;
        return (
          <View key={week} style={styles.weekSection}>
            <Text style={styles.weekTitle}>Week {week}</Text>
            <View style={styles.daysGrid}>
              {mesoDetail.workouts.map((mw: any) => {
                const done = isCompleted(mw.workout.id, week);
                return (
                  <Pressable 
                    key={mw.workout.id} 
                    style={[styles.dayCard, done && styles.dayCardDone]}
                    onPress={() => !done && startWorkout(mw.workout.id, week)}
                  >
                    <Text style={[styles.dayName, done && styles.dayTextDone]}>{mw.workout.name}</Text>
                    {done ? (
                      <FontAwesome name="check-circle" size={16} color={theme.colors.accent} />
                    ) : (
                      <FontAwesome name="play-circle" size={16} color={theme.colors.textMuted} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      <Button 
        onPress={handleComplete} 
        variant="ghost"
        style={styles.completeBtn}>
        Complete Entire Block
      </Button>
    </ScrollView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 16 },
    header: { marginBottom: 24 },
    title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.textPrimary },
    sub: { fontSize: 16, color: theme.colors.textMuted, marginTop: 4 },
    weekSection: { marginBottom: 24 },
    weekTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary, marginBottom: 12 },
    daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    dayCard: {
      padding: 12,
      borderRadius: 8,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: '45%',
    },
    dayCardDone: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentMuted,
    },
    dayName: { fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary },
    dayTextDone: { color: theme.colors.textSecondary },
    completeBtn: { marginTop: 24, marginBottom: 40 },
  });
