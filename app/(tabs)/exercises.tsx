import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, useFocusEffect } from 'expo-router';
import { MotiView } from 'moti';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { theme } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { listExercises } from '@/lib/queries';

export default function ExercisesScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Exercise[]>([]);

  useFocusEffect(
    useCallback(() => {
      setData(listExercises());
    }, []),
  );

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No exercises yet. Add your first movement.</Text>
        }
        renderItem={({ item, index }) => (
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 240, delay: index * 40 }}>
            <Link href={`/exercise/${item.id}`} asChild>
              <Pressable>
                <Card style={styles.row}>
                  <View style={styles.rowInner}>
                    <View style={styles.iconWrap}>
                      <FontAwesome name="circle" size={10} color={theme.colors.accent} />
                    </View>
                    <View style={styles.textWrap}>
                      <Text style={styles.name}>{item.name}</Text>
                      {item.notes ? (
                        <Text style={styles.notes} numberOfLines={1}>
                          {item.notes}
                        </Text>
                      ) : null}
                    </View>
                    <FontAwesome name="angle-right" size={20} color={theme.colors.textMuted} />
                  </View>
                </Card>
              </Pressable>
            </Link>
          </MotiView>
        )}
      />
      <Link href="/exercise/new" asChild>
        <Pressable style={[styles.fab, { bottom: insets.bottom + 20 }]}>
          <FontAwesome name="plus" size={22} color={theme.colors.background} />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  list: { padding: theme.space.md, paddingBottom: 100, gap: theme.space.sm },
  row: { marginBottom: 0 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  name: { fontSize: theme.fontSize.title, fontWeight: '600', color: theme.colors.textPrimary },
  notes: { fontSize: theme.fontSize.caption, color: theme.colors.textSecondary, marginTop: 2 },
  empty: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    marginTop: 48,
    paddingHorizontal: theme.space.lg,
    fontSize: theme.fontSize.body,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
