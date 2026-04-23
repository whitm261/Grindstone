import { FontAwesome } from '@expo/vector-icons';
import { Link, useRouter, useFocusEffect, type Href } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/components/theme/AppThemeProvider';
import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { Card } from '@/components/ui/Card';
import type { AppTheme } from '@/constants/theme';
import { deleteActiveMesocycle, deleteMesocycle, listActiveMesocycles, listMesocycles } from '@/lib/queries';
import type { ActiveMesocycle, Mesocycle } from '@/db/schema';

export default function MesocyclesScreen() {
  const theme = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [mesos, setMesos] = useState<Mesocycle[]>([]);
  const [activeMesos, setActiveMesos] = useState<ActiveMesocycle[]>([]);
  const router = useRouter();

  const load = useCallback(() => {
    setMesos(listMesocycles());
    setActiveMesos(listActiveMesocycles());
  }, []);

  useFocusEffect(load);

  const confirmDeleteActive = (item: ActiveMesocycle) => {
    Alert.alert('Delete Active Block', `Are you sure you want to delete "${item.name}"? This will not delete completed workouts.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteActiveMesocycle(item.id);
          load();
        },
      },
    ]);
  };

  const confirmDeleteMeso = (item: Mesocycle) => {
    Alert.alert('Delete Mesocycle', `Are you sure you want to delete the definition for "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteMesocycle(item.id);
          load();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={activeMesos}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {activeMesos.length > 0 && (
              <Text style={styles.sectionTitle}>Active Blocks</Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <Pressable 
            onPress={() => router.push(`/mesocycle/active/${item.id}` as Href)}
            onLongPress={() => confirmDeleteActive(item)}
          >
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <FontAwesome name="chevron-right" size={14} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.cardSub}>Started: {new Date(item.startedAt).toLocaleDateString()}</Text>
            </Card>
          </Pressable>
        )}
        ListFooterComponent={
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Mesocycles</Text>
              <Link href={'/mesocycle/new' as Href} asChild>
                <Pressable hitSlop={12} style={styles.addButton}>
                  <FontAwesome name="plus" size={18} color={theme.colors.accent} />
                  <Text style={styles.addButtonText}>New</Text>
                </Pressable>
              </Link>
            </View>
            {mesos.map((item) => (
              <Pressable 
                key={item.id} 
                onPress={() => router.push(`/mesocycle/${item.id}` as Href)}
                onLongPress={() => confirmDeleteMeso(item)}
              >
                <Card style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <FontAwesome name="chevron-right" size={14} color={theme.colors.textMuted} />
                  </View>
                  <Text style={styles.cardSub}>{item.weeks} weeks</Text>
                </Card>
              </Pressable>
            ))}
            {mesos.length === 0 && (
              <Text style={styles.emptyText}>No mesocycles created yet.</Text>
            )}
          </>
        }
      />
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      padding: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 24,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.colors.textPrimary,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    addButtonText: {
      color: theme.colors.accent,
      marginLeft: 6,
      fontWeight: '600',
    },
    card: {
      marginBottom: 12,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    cardSub: {
      fontSize: 14,
      color: theme.colors.textMuted,
      marginTop: 4,
    },
    emptyText: {
      color: theme.colors.textMuted,
      textAlign: 'center',
      marginTop: 24,
      fontStyle: 'italic',
    },
  });
