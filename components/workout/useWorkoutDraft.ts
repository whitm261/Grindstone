import { useCallback, useRef, useState } from 'react';

import { getWorkoutDraft, saveWorkoutDraft, type WorkoutDetail } from '@/lib/queries';
import { createWorkoutDraft, type SetDraft, type WorkoutDraft } from '@/lib/workoutDraft';

export function useWorkoutDraft(workoutId: string) {
  const current = useRef<{ workoutId: string; draft: WorkoutDraft } | null>(null);
  const unsaved = useRef(false);
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const persist = useCallback((next: WorkoutDraft) => {
    current.current = { workoutId, draft: next };
    unsaved.current = true;
    setDraft(next);
    try {
      saveWorkoutDraft(workoutId, next);
      unsaved.current = false;
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save this workout on your device.');
    }
  }, [workoutId]);

  const load = useCallback((detail: WorkoutDetail) => {
    const saved = getWorkoutDraft(workoutId);
    const local = unsaved.current && current.current?.workoutId === workoutId ? current.current.draft : null;
    const previous = local ? { ...local, sets: { ...saved?.sets, ...local.sets } } : saved;
    // Structural changes may add new drafts (for example +Set copying partial text).
    persist(createWorkoutDraft(detail, previous));
  }, [workoutId, persist]);

  const updateSet = useCallback((setId: string, patch: Partial<SetDraft>) => {
    const entry = current.current;
    if (!entry || entry.workoutId !== workoutId || !entry.draft.sets[setId]) return;
    persist({ ...entry.draft, sets: {
      ...entry.draft.sets,
      [setId]: { ...entry.draft.sets[setId], ...patch },
    } });
  }, [workoutId, persist]);

  const updateName = useCallback((name: string) => {
    const entry = current.current;
    if (entry?.workoutId === workoutId) persist({ ...entry.draft, name });
  }, [workoutId, persist]);

  const getCurrent = useCallback(() => current.current?.workoutId === workoutId ? current.current.draft : null, [workoutId]);
  const retrySave = useCallback(() => {
    const value = getCurrent();
    if (value) persist(value);
  }, [getCurrent, persist]);

  return { draft, load, updateSet, updateName, getCurrent, saveError, retrySave };
}
