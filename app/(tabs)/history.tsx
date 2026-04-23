import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, useFocusEffect } from 'expo-router';
import { MotiView } from 'moti';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { Card } from '@/components/ui/Card';
import type { AppTheme } from '@/constants/theme';
import type { Workout } from '@/db/schema';
import { abandonWorkout, listWorkoutHistory } from '@/lib/queries';

export default function HistoryScreen() {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Workout[]>([]);

  const refresh = useCallback(() => {
    setData(listWorkoutHistory());
  }, []);

  useFocusEffect(refresh);

  const confirmDelete = (item: Workout) => {
    Alert.alert('Delete Workout', 'Are you sure you want to delete this session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          abandonWorkout(item.id);
          refresh();
        },
      },
    ]);
  };

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
            transition={{ type: 'timing', duration: 240, delay: Math.min(index * 35, 500) }}>
            <Link href={`/session/${item.id}`} asChild>
              <Pressable onLongPress={() => confirmDelete(item)}>
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

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
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
