import { beforeEach, describe, expect, test } from 'bun:test';

import {
  createExercise,
  createTemplate,
  getTemplateDetail,
  replaceTemplateStructure,
  saveTemplate,
} from '@/lib/queries';
import { makeTestDb } from './helpers/db';

beforeEach(() => { makeTestDb(); });

describe('atomic template save', () => {
  test('saves metadata and decimal or bodyweight defaults together', () => {
    const exercise = createExercise('Press');
    const template = createTemplate('Original', 'Old notes');

    saveTemplate(template.id, ' Updated ', ' New notes ', [{
      exerciseId: exercise.id,
      sets: [{ reps: 5, weight: 72.5 }, { reps: 12, weight: 0 }, { reps: 20, weight: 0.5 }],
    }]);

    const saved = getTemplateDetail(template.id)!;
    expect(saved.template).toMatchObject({ name: 'Updated', notes: 'New notes' });
    expect(saved.items[0].sets.map((set) => ({ reps: set.targetReps, weight: set.targetWeight }))).toEqual([
      { reps: 5, weight: 72.5 }, { reps: 12, weight: 0 }, { reps: 20, weight: 0.5 },
    ]);
  });

  test('failed structure write restores original metadata, exercise rows, and defaults', () => {
    const exercise = createExercise('Row');
    const template = createTemplate('Original', 'Keep these notes');
    replaceTemplateStructure(template.id, [{ exerciseId: exercise.id, sets: [{ reps: 8, weight: 40 }] }]);
    const before = getTemplateDetail(template.id);

    expect(() => saveTemplate(template.id, 'Unsaved', 'Unsaved notes', [
      { exerciseId: exercise.id, sets: [{ reps: 5, weight: 60 }] },
      { exerciseId: 'missing-exercise', sets: [{ reps: 10, weight: 20 }] },
    ])).toThrow();

    expect(getTemplateDetail(template.id)).toEqual(before);
  });

  test('explicitly removing every exercise saves an empty template', () => {
    const exercise = createExercise('Squat');
    const template = createTemplate('Legs');
    replaceTemplateStructure(template.id, [{ exerciseId: exercise.id, sets: [{ reps: 5, weight: 100 }] }]);

    saveTemplate(template.id, 'New plan', 'Ready to rebuild', []);

    const saved = getTemplateDetail(template.id)!;
    expect(saved.items).toEqual([]);
    expect(saved.template).toMatchObject({ name: 'New plan', notes: 'Ready to rebuild' });
  });

  test('invalid defaults or blank names leave the existing template unchanged', () => {
    const exercise = createExercise('Bench');
    const template = createTemplate('Keep me');
    replaceTemplateStructure(template.id, [{ exerciseId: exercise.id, sets: [{ reps: 5, weight: 80 }] }]);
    const before = getTemplateDetail(template.id);

    for (const invalidSet of [
      { reps: 0, weight: 100 },
      { reps: 1.5, weight: 100 },
      { reps: 5, weight: -1 },
      { reps: 5, weight: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => saveTemplate(template.id, 'Unsaved', '', [{ exerciseId: exercise.id, sets: [invalidSet] }])).toThrow();
      expect(getTemplateDetail(template.id)).toEqual(before);
    }
    expect(() => saveTemplate(template.id, ' ', '', [])).toThrow();
    expect(getTemplateDetail(template.id)).toEqual(before);
  });
});
