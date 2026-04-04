import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { theme } from '@/constants/theme';
import type { Workout } from '@/db/schema';
import { createEmptyWorkout, getActiveWorkouts } from '@/lib/queries';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<Workout[]>([]);

  useFocusEffect(
    useCallback(() => {
      setActive(getActiveWorkouts());
    }, []),
  );

  const startEmpty = () => {
    const w = createEmptyWorkout();
    router.push(`/workout/${w.id}`);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <MotiView
        from={{ opacity: 0, translateY: 8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 320 }}>
        <Text style={styles.display}>MovingWeight</Text>
        <Text style={styles.sub}>Log lifts. Track progress. All on-device.</Text>
      </MotiView>

      <View style={styles.actions}>
        <Button onPress={startEmpty}>Start empty workout</Button>
        <Button variant="ghost" onPress={() => router.push('/templates')}>
          From template
        </Button>
      </View>

      {active.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>In progress</Text>
          {active.map((w, i) => (
            <MotiView
              key={w.id}
              from={{ opacity: 0, translateX: -12 }}
              animate={{ opacity: 1, translateX: 0 }}
              transition={{ type: 'timing', duration: 280, delay: i * 60 }}>
              <Link href={`/workout/${w.id}`} asChild>
                <Pressable>
                  <Card style={styles.activeCard}>
                    <View style={styles.activeRow}>
                      <FontAwesome name="bolt" size={20} color={theme.colors.accent} />
                      <View style={styles.activeText}>
                        <Text style={styles.activeName}>{w.name}</Text>
                        <Text style={styles.activeMeta}>
                          {new Date(w.startedAt).toLocaleString()}
                        </Text>
                      </View>
                      <FontAwesome name="chevron-right" size={16} color={theme.colors.textMuted} />
                    </View>
                  </Card>
                </Pressable>
              </Link>
            </MotiView>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Library</Text>
        <View style={styles.links}>
          <Link href="/exercises" asChild>
            <Pressable style={styles.linkCard}>
              <FontAwesome name="list" size={22} color={theme.colors.accent} />
              <Text style={styles.linkLabel}>All exercises</Text>
            </Pressable>
          </Link>
          <Link href="/history" asChild>
            <Pressable style={styles.linkCard}>
              <FontAwesome name="bar-chart" size={22} color={theme.colors.accent} />
              <Text style={styles.linkLabel}>Past sessions</Text>
            </Pressable>
          </Link>
        </View>
        <Button variant="ghost" onPress={() => router.push('/exercise/new')} style={styles.addExerciseRow}>
          <View style={styles.addExerciseRowInner}>
            <FontAwesome name="plus-circle" size={20} color={theme.colors.accent} />
            <Text style={styles.addExerciseRowLabel}>Add exercise</Text>
          </View>
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.space.md, paddingTop: theme.space.lg, gap: theme.space.lg },
  display: {
    fontSize: theme.fontSize.display,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
  },
  sub: {
    marginTop: theme.space.sm,
    fontSize: theme.fontSize.body,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  actions: { gap: theme.space.sm, marginTop: theme.space.md },
  section: { gap: theme.space.sm },
  sectionTitle: {
    fontSize: theme.fontSize.caption,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  activeCard: { marginBottom: theme.space.sm },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  activeText: { flex: 1 },
  activeName: { fontSize: theme.fontSize.title, fontWeight: '600', color: theme.colors.textPrimary },
  activeMeta: { fontSize: theme.fontSize.caption, color: theme.colors.textSecondary, marginTop: 2 },
  links: { flexDirection: 'row', gap: theme.space.sm },
  linkCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.space.md,
    gap: theme.space.sm,
  },
  linkLabel: { fontSize: theme.fontSize.body, color: theme.colors.textPrimary, fontWeight: '500' },
  addExerciseRow: { width: '100%' },
  addExerciseRowInner: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  addExerciseRowLabel: {
    fontSize: theme.fontSize.body,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
});
