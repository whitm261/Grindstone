export type SetDraft = { reps: string; weight: string; completed: boolean };
export type SetInputErrors = { reps?: string; weight?: string };
export type WorkoutDraft = {
  version: 1;
  name: string;
  sets: Record<string, SetDraft>;
};

type WorkoutSource = {
  workout: { name: string };
  blocks: Array<{ sets: Array<{ id: string; reps: number; weight: number; completed: boolean }> }>;
};

/** Reconcile structural changes without replacing text the user is still editing. */
export function createWorkoutDraft(detail: WorkoutSource, previous?: WorkoutDraft | null): WorkoutDraft {
  const sets: WorkoutDraft['sets'] = {};
  for (const block of detail.blocks) {
    for (const set of block.sets) {
      sets[set.id] = previous?.sets[set.id] ?? {
        reps: String(set.reps),
        weight: String(set.weight),
        completed: set.completed,
      };
    }
  }
  return { version: 1, name: previous?.name ?? detail.workout.name, sets };
}

export function isWorkoutDraft(value: unknown): value is WorkoutDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<WorkoutDraft>;
  return draft.version === 1 && typeof draft.name === 'string' &&
    !!draft.sets && typeof draft.sets === 'object' && !Array.isArray(draft.sets) &&
    Object.values(draft.sets).every((set) => set && typeof set === 'object' &&
      typeof set.reps === 'string' && typeof set.weight === 'string' &&
      typeof set.completed === 'boolean');
}

/** Only call at an explicit save/finish boundary, never from input change or blur. */
export function parseSetInput(input: { reps: string; weight: string }) {
  const errors: SetInputErrors = {};
  const repsText = input.reps.trim();
  const weightText = input.weight.trim().replace(',', '.');
  const reps = Number(repsText);
  const weight = Number(weightText);
  if (!/^\d+$/.test(repsText) || !Number.isSafeInteger(reps) || reps <= 0) {
    errors.reps = 'Enter a whole number of reps greater than 0.';
  }
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(weightText) || !Number.isFinite(weight) || weight < 0) {
    errors.weight = 'Enter a weight of 0 or more. Use 0 for bodyweight.';
  }
  return { reps, weight, errors, valid: Object.keys(errors).length === 0 };
}

export function validateWorkoutDraft(draft: WorkoutDraft) {
  const errors: Record<string, SetInputErrors> = {};
  const completedSets: Array<{ id: string; reps: number; weight: number }> = [];
  let skippedCount = 0;
  for (const [id, set] of Object.entries(draft.sets)) {
    if (!set.completed) {
      skippedCount++;
      continue;
    }
    const result = parseSetInput(set);
    if (!result.valid) errors[id] = result.errors;
    else completedSets.push({ id, reps: result.reps, weight: result.weight });
  }
  return { errors, completedSets, skippedCount, valid: Object.keys(errors).length === 0 };
}
