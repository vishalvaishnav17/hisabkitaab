import { describe, expect, test } from 'bun:test';
import {
  computeFieldDiffs,
  formatFieldValue,
  formatPaise,
  getFieldDisplayName,
} from './client/diff';

describe('formatPaise', () => {
  test('formats whole rupee amounts without decimal places', () => {
    expect(formatPaise(10000)).toBe('₹100');
    expect(formatPaise(50000)).toBe('₹500');
    expect(formatPaise(0)).toBe('₹0');
  });

  test('formats fractional rupee amounts with up to 2 decimal places', () => {
    expect(formatPaise(10050)).toBe('₹100.50');
    expect(formatPaise(12345)).toBe('₹123.45');
    expect(formatPaise(50)).toBe('₹0.50');
  });

  test('formats negative amounts with minus sign before rupee symbol', () => {
    expect(formatPaise(-2500)).toBe('-₹25');
    expect(formatPaise(-2550)).toBe('-₹25.50');
  });
});

describe('getFieldDisplayName', () => {
  test('uses friendly names for common fields', () => {
    expect(getFieldDisplayName('description')).toBe('Description');
    expect(getFieldDisplayName('amount_paise')).toBe('Amount');
    expect(getFieldDisplayName('payment_method')).toBe('Payment Method');
  });

  test('formats unknown snake_case keys nicely', () => {
    expect(getFieldDisplayName('split_type')).toBe('Split Type');
    expect(getFieldDisplayName('total_paise')).toBe('Total');
  });
});

describe('formatFieldValue', () => {
  test('formats empty values as dash', () => {
    expect(formatFieldValue('notes', null)).toBe('—');
    expect(formatFieldValue('notes', undefined)).toBe('—');
    expect(formatFieldValue('notes', '')).toBe('—');
  });

  test('formats paise fields as currency', () => {
    expect(formatFieldValue('amount_paise', 25000)).toBe('₹250');
    expect(formatFieldValue('share_paise', 1550)).toBe('₹15.50');
  });

  test('formats booleans', () => {
    expect(formatFieldValue('is_settled', true)).toBe('Yes');
    expect(formatFieldValue('is_settled', false)).toBe('No');
  });

  test('formats primitives and objects', () => {
    expect(formatFieldValue('category', 'Food & Dining')).toBe('Food & Dining');
    expect(formatFieldValue('details', { a: 1 })).toBe('{"a":1}');
  });
});

describe('computeFieldDiffs', () => {
  test('excludes timestamps (created_at, updated_at, deleted_at, at) and id by default', () => {
    const before = {
      id: 'exp_1',
      description: 'Swiggy',
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
      deleted_at: null,
      at: '2026-11-01T00:00:00.000Z',
    };
    const after = {
      id: 'exp_1',
      description: 'Swiggy Lunch',
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-02T00:00:00.000Z',
      deleted_at: null,
      at: '2026-11-02T00:00:00.000Z',
    };

    const diffs = computeFieldDiffs(before, after);
    const keys = diffs.map((d) => d.key);

    expect(keys).toContain('description');
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('created_at');
    expect(keys).not.toContain('updated_at');
    expect(keys).not.toContain('deleted_at');
    expect(keys).not.toContain('at');
  });

  test('handles creation (before is null)', () => {
    const after = {
      description: 'Zomato Pizza',
      amount_paise: 45000,
      category: 'Food & Dining',
      payment_method: 'UPI',
    };

    const diffs = computeFieldDiffs(null, after);
    expect(diffs.length).toBe(4);

    const desc = diffs.find((d) => d.key === 'description')!;
    expect(desc.beforeVal).toBe('—');
    expect(desc.afterVal).toBe('Zomato Pizza');
    expect(desc.changed).toBe(true);

    const amt = diffs.find((d) => d.key === 'amount_paise')!;
    expect(amt.beforeVal).toBe('—');
    expect(amt.afterVal).toBe('₹450');
    expect(amt.changed).toBe(true);
  });

  test('handles deletion (after is null)', () => {
    const before = {
      description: 'Groceries',
      amount_paise: 120000,
      category: 'Groceries',
    };

    const diffs = computeFieldDiffs(before, null);
    expect(diffs.length).toBe(3);

    const desc = diffs.find((d) => d.key === 'description')!;
    expect(desc.beforeVal).toBe('Groceries');
    expect(desc.afterVal).toBe('—');
    expect(desc.changed).toBe(true);

    const amt = diffs.find((d) => d.key === 'amount_paise')!;
    expect(amt.beforeVal).toBe('₹1,200');
    expect(amt.afterVal).toBe('—');
    expect(amt.changed).toBe(true);
  });

  test('detects changed and unchanged fields in updates', () => {
    const before = {
      description: 'Swiggy',
      amount_paise: 20000,
      category: 'Food & Dining',
      notes: null,
    };
    const after = {
      description: 'Swiggy Dinner',
      amount_paise: 20000,
      category: 'Food & Dining',
      notes: 'Treat with family',
    };

    const diffs = computeFieldDiffs(before, after);

    const desc = diffs.find((d) => d.key === 'description')!;
    expect(desc.changed).toBe(true);
    expect(desc.beforeVal).toBe('Swiggy');
    expect(desc.afterVal).toBe('Swiggy Dinner');

    const amt = diffs.find((d) => d.key === 'amount_paise')!;
    expect(amt.changed).toBe(false);
    expect(amt.beforeVal).toBe('₹200');
    expect(amt.afterVal).toBe('₹200');

    const cat = diffs.find((d) => d.key === 'category')!;
    expect(cat.changed).toBe(false);

    const notes = diffs.find((d) => d.key === 'notes')!;
    expect(notes.changed).toBe(true);
    expect(notes.beforeVal).toBe('—');
    expect(notes.afterVal).toBe('Treat with family');
  });

  test('returns empty array when both before and after are null or empty', () => {
    expect(computeFieldDiffs(null, null)).toEqual([]);
    expect(computeFieldDiffs({}, {})).toEqual([]);
    expect(computeFieldDiffs(undefined, undefined)).toEqual([]);
  });

  test('orders preferred fields first', () => {
    const data = {
      notes: 'Some note',
      description: 'Test Item',
      date: '2026-11-07',
      category: 'Others',
      amount_paise: 1000,
    };
    const diffs = computeFieldDiffs(null, data);
    const keys = diffs.map((d) => d.key);
    expect(keys).toEqual(['description', 'amount_paise', 'category', 'date', 'notes']);
  });
});
