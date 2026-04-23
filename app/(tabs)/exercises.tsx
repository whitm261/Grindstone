import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { AppTheme } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { deleteExercise, listExercises } from '@/lib/queries';

export default function ExercisesScreen() {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [data, setData] = useState<Exercise[]>([]);

  const refresh = useCallback(() => {
    setData(listExercises());
  }, []);

  useFocusEffect(refresh);

  const confirmDelete = (item: Exercise) => {
    Alert.alert('Delete Exercise', `Are you sure you want to delete "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteExercise(item.id);
          refresh();
        },
      },
    ]);
  };

  const fabBottom = Math.max(insets.bottom, theme.space.md) + theme.space.md;

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.empty}>No exercises yet. Add your first movement.</Text>
          <Button style={styles.emptyCta} onPress={() => router.push('/exercise/new')}>
            Add exercise
          </Button>
        </View>
      ) : (
        <FlatList
          style={styles.listFlex}
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 240, delay: Math.min(index * 40, 500) }}>
              <Link href={`/exercise/${item.id}`} asChild>
                <Pressable onLongPress={() => confirmDelete(item)}>
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
      )}
      <Link href="/exercise/new" asChild>
        <Pressable
          style={[styles.fab, { bottom: fabBottom }]}
          accessibilityLabel="Add exercise"
          accessibilityRole="button">
          <FontAwesome name="plus" size={22} color={theme.colors.background} />
        </Pressable>
      </Link>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    listFlex: { flex: 1 },
    list: { padding: theme.space.md, paddingBottom: 120, gap: theme.space.sm },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: theme.space.lg,
      paddingBottom: 100,
      gap: theme.space.md,
    },
    emptyCta: { minWidth: 220 },
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
      zIndex: 10,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    },
  });
