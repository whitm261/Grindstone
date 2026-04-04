import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, useFocusEffect } from 'expo-router';
import { MotiView } from 'moti';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { theme } from '@/constants/theme';
import type { Workout } from '@/db/schema';
import { listWorkoutHistory } from '@/lib/queries';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Workout[]>([]);

  useFocusEffect(
    useCallback(() => {
      setData(listWorkoutHistory());
    }, []),
  );

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Complete a workout to see it listed here.</Text>
        }
        renderItem={({ item, index }) => (
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 240, delay: index * 35 }}>
            <Link href={`/session/${item.id}`} asChild>
              <Pressable>
                <Card>
                  <View style={styles.row}>
                    <View style={styles.check}>
                      <FontAwesome name="check" size={14} color={theme.colors.success} />
                    </View>
                    <View style={styles.text}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.meta}>
                        {item.completedAt
                          ? new Date(item.completedAt).toLocaleString()
                          : ''}
                      </Text>
                    </View>
                    <FontAwesome name="chevron-right" size={14} color={theme.colors.textMuted} />
                  </View>
                </Card>
              </Pressable>
            </Link>
          </MotiView>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  list: { padding: theme.space.md, gap: theme.space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  check: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.successMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  name: { fontSize: theme.fontSize.title, fontWeight: '600', color: theme.colors.textPrimary },
  meta: { fontSize: theme.fontSize.caption, color: theme.colors.textSecondary, marginTop: 2 },
  empty: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    marginTop: 48,
    paddingHorizontal: theme.space.lg,
  },
});
