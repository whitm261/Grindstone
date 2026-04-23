import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '@/components/theme/useThemedStyles';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import type { AppTheme } from '@/constants/theme';
import { createTemplate } from '@/lib/queries';

export default function NewTemplateScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [name, setName] = useState('');

  const save = () => {
    const n = name.trim() || 'New template';
    const t = createTemplate(n);
    router.replace(`/template/${t.id}`);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={styles.label}>Template name</Text>
        <TextField
          value={name}
          onChangeText={setName}
          placeholder="e.g. Upper day A"
          autoFocus
        />
        <View style={styles.actions}>
          <Button onPress={save}>Create &amp; edit layout</Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.space.md },
    label: {
      fontSize: theme.fontSize.caption,
      fontWeight: '600',
      color: theme.colors.textMuted,
      marginBottom: theme.space.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    actions: { marginTop: theme.space.lg },
  });
