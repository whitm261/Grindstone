import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { theme } from '@/constants/theme';
import type { WorkoutTemplate } from '@/db/schema';
import { deleteTemplate, listTemplates, startWorkoutFromTemplate } from '@/lib/queries';

export default function TemplatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<WorkoutTemplate[]>([]);

  useFocusEffect(
    useCallback(() => {
      setData(listTemplates());
    }, []),
  );

  const onStart = (id: string) => {
    const w = startWorkoutFromTemplate(id);
    if (!w) {
      Alert.alert('Template empty', 'Add exercises and sets to this template first.');
      return;
    }
    router.push(`/workout/${w.id}`);
  };

  const onDelete = (id: string, name: string) => {
    Alert.alert('Delete template', `Remove “${name}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTemplate(id);
          setData(listTemplates());
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <View style={styles.toolbar}>
        <Button onPress={() => router.push('/template/new')}>New template</Button>
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No templates. Create a reusable workout layout with default sets.
          </Text>
        }
        renderItem={({ item, index }) => (
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 240, delay: Math.min(index * 40, 500) }}>
            <Card style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardTitleRow}>
                  <FontAwesome name="clipboard" size={18} color={theme.colors.accent} />
                  <Text style={styles.cardName}>{item.name}</Text>
                </View>
                {item.notes ? (
                  <Text style={styles.cardNotes} numberOfLines={2}>
                    {item.notes}
                  </Text>
                ) : null}
              </View>
              <View style={styles.cardActions}>
                <Pressable style={styles.actionBtn} onPress={() => onStart(item.id)}>
                  <FontAwesome name="play" size={14} color={theme.colors.background} />
                  <Text style={styles.actionStart}>Start</Text>
                </Pressable>
                <Link href={`/template/${item.id}`} asChild>
                  <Pressable style={styles.actionGhost}>
                    <Text style={styles.actionGhostText}>Edit</Text>
                  </Pressable>
                </Link>
                <Pressable onPress={() => onDelete(item.id, item.name)} hitSlop={8}>
                  <FontAwesome name="trash" size={18} color={theme.colors.danger} />
                </Pressable>
              </View>
            </Card>
          </MotiView>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  toolbar: { paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm },
  list: { padding: theme.space.md, paddingTop: 0, gap: theme.space.md },
  card: { gap: theme.space.md },
  cardTop: { gap: theme.space.xs },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  cardName: { fontSize: theme.fontSize.title, fontWeight: '700', color: theme.colors.textPrimary },
  cardNotes: { fontSize: theme.fontSize.body, color: theme.colors.textSecondary, lineHeight: 20 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.md,
  },
  actionStart: { color: theme.colors.background, fontWeight: '700', fontSize: theme.fontSize.body },
  actionGhost: {
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionGhostText: { color: theme.colors.textPrimary, fontWeight: '600' },
  empty: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    marginTop: 32,
    paddingHorizontal: theme.space.lg,
    lineHeight: 22,
  },
});
