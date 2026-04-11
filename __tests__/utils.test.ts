import { describe, expect, test } from 'bun:test';

import { fmtSet, formatRelDate } from '@/lib/utils';

// Build an ISO string that is exactly `n` whole days in the past.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe('formatRelDate', () => {
  test('today', () => {
    expect(formatRelDate(daysAgo(0))).toBe('today');
  });

  test('yesterday', () => {
    expect(formatRelDate(daysAgo(1))).toBe('yesterday');
  });

  test('days ago (2–6)', () => {
    expect(formatRelDate(daysAgo(3))).toBe('3d ago');
    expect(formatRelDate(daysAgo(6))).toBe('6d ago');
  });

  test('switches to weeks at 7 days', () => {
    expect(formatRelDate(daysAgo(7))).toBe('1w ago');
    expect(formatRelDate(daysAgo(14))).toBe('2w ago');
    expect(formatRelDate(daysAgo(20))).toBe('2w ago');
  });

  test('switches to months at 30 days', () => {
    expect(formatRelDate(daysAgo(30))).toBe('1mo ago');
    expect(formatRelDate(daysAgo(60))).toBe('2mo ago');
    expect(formatRelDate(daysAgo(90))).toBe('3mo ago');
  });
});

describe('fmtSet', () => {
  test('formats weight × reps for weighted sets', () => {
    expect(fmtSet({ reps: 8, weight: 135 })).toBe('8×135');
    expect(fmtSet({ reps: 3, weight: 225 })).toBe('3×225');
  });

  test('uses one decimal place for fractional weights', () => {
    expect(fmtSet({ reps: 5, weight: 52.5 })).toBe('5×52.5');
    expect(fmtSet({ reps: 10, weight: 17.5 })).toBe('10×17.5');
  });

  test('omits trailing .0 for whole-number weights', () => {
    expect(fmtSet({ reps: 8, weight: 100 })).toBe('8×100');
  });

  test('formats bodyweight sets (weight = 0) as "N reps"', () => {
    expect(fmtSet({ reps: 10, weight: 0 })).toBe('10 reps');
    expect(fmtSet({ reps: 1, weight: 0 })).toBe('1 reps');
  });
});
