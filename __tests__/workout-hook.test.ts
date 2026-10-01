import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, createElement, type ReactElement } from 'react';

import { useWorkoutDraft } from '@/components/workout/useWorkoutDraft';
import {
  addExerciseToWorkout,
  addSetToWorkoutExercise,
  createEmptyWorkout,
  createExercise,
  getWorkoutDetail,
  getWorkoutDraft,
  removeLastSet,
  saveWorkoutDraft,
} from '@/lib/queries';
import { makeTestDb } from './helpers/db';

// The renderer is already a project dependency; no native components are used.
const { create } = require('react-test-renderer') as {
  create(element: ReactElement): { unmount(): void };
};
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const unmounts: Array<() => void> = [];
let sqlite: ReturnType<typeof makeTestDb>;

beforeEach(() => { sqlite = makeTestDb(); });
afterEach(() => {
  for (const unmount of unmounts.splice(0)) act(unmount);
});

function mountEditor(workoutId: string) {
  let hook: ReturnType<typeof useWorkoutDraft>;
  function Harness() {
    hook = useWorkoutDraft(workoutId);
    return null;
  }
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(createElement(Harness)); });
  let mounted = true;
  const unmount = () => {
    if (mounted) renderer.unmount();
    mounted = false;
  };
  unmounts.push(unmount);
  return { get hook() { return hook!; }, unmount };
}

function workout() {
  const exercise = createExercise('Squat');
  const session = createEmptyWorkout('Evening');
  const blockId = addExerciseToWorkout(session.id, exercise.id);
  const detail = getWorkoutDetail(session.id)!;
  return { workoutId: session.id, blockId, detail, setId: detail.blocks[0].sets[0].id };
}

describe('workout draft hook', () => {
  test('typing, checking and adding a set in one event batch uses the latest raw text', () => {
    const { workoutId, blockId, detail, setId } = workout();
    const editor = mountEditor(workoutId);
    act(() => editor.hook.load(detail));
    let nextSetId = '';
    act(() => {
      editor.hook.updateSet(setId, { reps: '12' });
      editor.hook.updateSet(setId, { weight: '.' });
      editor.hook.updateSet(setId, { completed: true });
      expect(editor.hook.getCurrent()!.sets[setId]).toEqual({ reps: '12', weight: '.', completed: true });
      nextSetId = addSetToWorkoutExercise(blockId);
      editor.hook.load(getWorkoutDetail(workoutId)!);
    });
    expect(editor.hook.draft!.sets[nextSetId]).toEqual({ reps: '12', weight: '.', completed: false });
    expect(getWorkoutDraft(workoutId)).toEqual(editor.hook.draft);
  });

  test('unmounting and reopening restores partial text, checked state and workout name', () => {
    const { workoutId, detail, setId } = workout();
    const first = mountEditor(workoutId);
    act(() => {
      first.hook.load(detail);
      first.hook.updateName('My workout ');
      first.hook.updateSet(setId, { reps: '', weight: '72.', completed: true });
    });
    act(first.unmount);
    const reopened = mountEditor(workoutId);
    act(() => reopened.hook.load(getWorkoutDetail(workoutId)!));
    expect(reopened.hook.draft!.name).toBe('My workout ');
    expect(reopened.hook.draft!.sets[setId]).toEqual({ reps: '', weight: '72.', completed: true });
  });

  test('structural reload keeps draft input and drops removed sets', () => {
    const { workoutId, blockId, detail, setId } = workout();
    const editor = mountEditor(workoutId);
    act(() => {
      editor.hook.load(detail);
      editor.hook.updateSet(setId, { reps: '9', weight: '.5' });
      addSetToWorkoutExercise(blockId);
      editor.hook.load(getWorkoutDetail(workoutId)!);
    });
    expect(Object.keys(editor.hook.draft!.sets)).toHaveLength(2);
    act(() => {
      removeLastSet(blockId);
      editor.hook.load(getWorkoutDetail(workoutId)!);
    });
    expect(Object.keys(editor.hook.draft!.sets)).toEqual([setId]);
    expect(editor.hook.draft!.sets[setId].weight).toBe('.5');
  });

  test('a failed save keeps local text visible and retry persists it', () => {
    const { workoutId, detail, setId } = workout();
    const editor = mountEditor(workoutId);
    act(() => editor.hook.load(detail));
    sqlite.exec("CREATE TRIGGER fail_draft_save BEFORE UPDATE ON workout_drafts BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
    act(() => editor.hook.updateSet(setId, { weight: '72.' }));
    expect(editor.hook.draft!.sets[setId].weight).toBe('72.');
    expect(editor.hook.saveError).not.toBeNull();
    expect(getWorkoutDraft(workoutId)!.sets[setId].weight).toBe('0');
    act(() => editor.hook.load(getWorkoutDetail(workoutId)!));
    expect(editor.hook.draft!.sets[setId].weight).toBe('72.');
    expect(editor.hook.saveError).not.toBeNull();
    sqlite.exec('DROP TRIGGER fail_draft_save;');
    act(() => editor.hook.retrySave());
    expect(editor.hook.saveError).toBeNull();
    expect(getWorkoutDraft(workoutId)!.sets[setId].weight).toBe('72.');
  });

  test('refresh prefers newer persisted edits when this editor has no unsaved changes', () => {
    const { workoutId, detail, setId } = workout();
    const editor = mountEditor(workoutId);
    act(() => editor.hook.load(detail));
    const saved = getWorkoutDraft(workoutId)!;
    saved.sets[setId].weight = '95';
    saved.name = 'Renamed in another editor';
    saveWorkoutDraft(workoutId, saved);
    act(() => editor.hook.load(getWorkoutDetail(workoutId)!));
    expect(editor.hook.draft!.sets[setId].weight).toBe('95');
    expect(editor.hook.draft!.name).toBe('Renamed in another editor');
  });
});
