import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack, type Href } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import { useAppTheme } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { Button } from '@/components/ui/Button';
import type { AppTheme } from '@/constants/theme';
import { getActiveMesocycleDetail, startWorkoutFromMesocycleDay, completeActiveMesocycle, type ActiveMesocycleDetail } from '@/lib/queries';

export default function ActiveMesocycleScreen() {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ActiveMesocycleDetail | null>(null);

  const load = useCallback(() => {
    setData(getActiveMesocycleDetail(id));
  }, [id]);

  useFocusEffect(load);

  if (!data) return null;

  const { active, mesoDetail, workoutsCompleted, workoutsInProgress } = data;
  const totalWeeks = mesoDetail.mesocycle.weeks;
  const sessions = [...workoutsCompleted, ...workoutsInProgress];
  const completedCount = workoutsCompleted.filter((session) => session.mesocycleSlotId !== null).length;
  const unmatchedCount = workoutsCompleted.length - completedCount;

  const startWorkout = (mwId: string, week: number) => {
    try {
      const workout = startWorkoutFromMesocycleDay(id, mwId, week);
      if (workout) {
        router.push(workout.completedAt ? `/session/${workout.id}` : `/workout/${workout.id}`);
      } else {
        load();
        Alert.alert('Workout unavailable', 'This training block or workout is no longer available.');
      }
    } catch {
      Alert.alert('Could not open workout', 'Your block is unchanged. Please try again.');
    }
  };

  const handleComplete = () => {
    completeActiveMesocycle(id);
    router.replace('/(tabs)/mesocycles' as Href);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Training Block' }} />
      <View style={styles.header}>
        <Text style={styles.title}>{active.name}</Text>
        <Text style={styles.sub}>Progress: {completedCount} of {totalWeeks * mesoDetail.workouts.length} sessions done</Text>
        {unmatchedCount > 0 && <Text style={styles.sub}>{unmatchedCount} earlier sessions are in History but could not be matched to a workout here.</Text>}
      </View>

      {Array.from({ length: totalWeeks }).map((_, i) => {
        const week = i + 1;
        return (
          <View key={week} style={styles.weekSection}>
            <Text style={styles.weekTitle}>Week {week}</Text>
            <View style={styles.daysGrid}>
              {mesoDetail.workouts.map((mw) => {
                const session = sessions.find((workout) => workout.mesocycleSlotId === mw.workout.id
                  && workout.mesocycleWeek === week);
                const done = !!session?.completedAt;
                const inProgress = !!session && !done;
                return (
                  <Pressable 
                    key={mw.workout.id} 
                    style={[styles.dayCard, done && styles.dayCardDone]}
                    accessibilityRole="button"
                    accessibilityLabel={`${mw.workout.name}, week ${week}, ${done ? 'completed, view workout' : inProgress ? 'resume workout' : 'start workout'}`}
                    disabled={!!active.completedAt && !session}
                    onPress={() => {
                      if (session) {
                        router.push(done ? `/session/${session.id}` : `/workout/${session.id}`);
                      } else {
                        startWorkout(mw.workout.id, week);
                      }
                    }}
                  >
                    <View style={styles.dayLabel}>
                      <Text style={[styles.dayName, done && styles.dayTextDone]}>{mw.workout.name}</Text>
                      {inProgress && <Text style={styles.resume}>Resume workout</Text>}
                    </View>
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

      {!active.completedAt && <Button
        onPress={handleComplete} 
        variant="ghost"
        style={styles.completeBtn}>
        Complete Entire Block
      </Button>}
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
      minHeight: 52,
      flexShrink: 1,
    },
    dayCardDone: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentMuted,
    },
    dayName: { fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary },
    dayLabel: { flexShrink: 1 },
    resume: { fontSize: 12, color: theme.colors.accent, marginTop: 4 },
    dayTextDone: { color: theme.colors.textSecondary },
    completeBtn: { marginTop: 24, marginBottom: 40 },
  });
