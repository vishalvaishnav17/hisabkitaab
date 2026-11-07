import { describe, expect, test } from 'bun:test';
import {
  insertAtCursor,
  deleteAtCursor,
  isPlainNumber,
  extractMultiplier,
  getLastMultiplier,
  setLastMultiplier,
  saveMultiplierFromExpr,
  LAST_MULTIPLIER_KEY,
} from './amount-input';

describe('amount-input: insertAtCursor', () => {
  test('inserts into empty text', () => {
    const res = insertAtCursor('', 0, 0, '5');
    expect(res).toEqual({ text: '5', cursor: 1 });
  });

  test('inserts at end of text', () => {
    const res = insertAtCursor('50', 2, 2, '+');
    expect(res).toEqual({ text: '50+', cursor: 3 });
  });

  test('inserts in middle of text', () => {
    const res = insertAtCursor('502', 2, 2, '+');
    expect(res).toEqual({ text: '50+2', cursor: 3 });
  });

  test('inserts operator symbol ×', () => {
    const res = insertAtCursor('50', 2, 2, '×');
    expect(res).toEqual({ text: '50×', cursor: 3 });
  });

  test('replaces selected text', () => {
    const res = insertAtCursor('50+10', 2, 5, '×83.4');
    expect(res).toEqual({ text: '50×83.4', cursor: 7 });
  });

  test('handles out of bounds indices safely', () => {
    const res1 = insertAtCursor('123', -5, -2, 'A');
    expect(res1).toEqual({ text: 'A123', cursor: 1 });

    const res2 = insertAtCursor('123', 10, 20, 'B');
    expect(res2).toEqual({ text: '123B', cursor: 4 });
  });
});

describe('amount-input: deleteAtCursor', () => {
  test('deletes previous character at cursor', () => {
    const res = deleteAtCursor('50+', 3, 3);
    expect(res).toEqual({ text: '50', cursor: 2 });
  });

  test('deletes in the middle', () => {
    const res = deleteAtCursor('50+2', 3, 3);
    expect(res).toEqual({ text: '502', cursor: 2 });
  });

  test('does nothing when cursor is at 0', () => {
    const res = deleteAtCursor('50', 0, 0);
    expect(res).toEqual({ text: '50', cursor: 0 });
  });

  test('does nothing on empty string', () => {
    const res = deleteAtCursor('', 0, 0);
    expect(res).toEqual({ text: '', cursor: 0 });
  });

  test('deletes selected range of text', () => {
    const res = deleteAtCursor('50+20', 2, 5);
    expect(res).toEqual({ text: '50', cursor: 2 });
  });

  test('handles out of bounds indices safely', () => {
    const res = deleteAtCursor('123', 10, 10);
    expect(res).toEqual({ text: '12', cursor: 2 });
  });
});

describe('amount-input: isPlainNumber', () => {
  test('identifies plain integer and decimal numbers', () => {
    expect(isPlainNumber('100')).toBe(true);
    expect(isPlainNumber('100.50')).toBe(true);
    expect(isPlainNumber('0.75')).toBe(true);
    expect(isPlainNumber('.5')).toBe(true);
    expect(isPlainNumber('  4170  ')).toBe(true);
  });

  test('identifies expressions as non-plain', () => {
    expect(isPlainNumber('50*83.4')).toBe(false);
    expect(isPlainNumber('50 * 83.4')).toBe(false);
    expect(isPlainNumber('50 × 83.4')).toBe(false);
    expect(isPlainNumber('50+10')).toBe(false);
    expect(isPlainNumber('(50)')).toBe(false);
    expect(isPlainNumber('-50')).toBe(false);
    expect(isPlainNumber('+50')).toBe(false);
    expect(isPlainNumber('')).toBe(false);
    expect(isPlainNumber('abc')).toBe(false);
  });
});

describe('amount-input: extractMultiplier', () => {
  test('extracts multiplier from * n and × n expressions', () => {
    expect(extractMultiplier('50*83.4')).toBe('83.4');
    expect(extractMultiplier('50 * 83.4')).toBe('83.4');
    expect(extractMultiplier('50 × 83.4')).toBe('83.4');
    expect(extractMultiplier('50\u00D783.4')).toBe('83.4');
    expect(extractMultiplier('(10 + 20) * 83.4')).toBe('83.4');
    expect(extractMultiplier('2 * 3 * 83.4')).toBe('83.4');
  });

  test('returns null for plain numbers and non-multiplication expressions', () => {
    expect(extractMultiplier('100')).toBe(null);
    expect(extractMultiplier('100 + 50')).toBe(null);
    expect(extractMultiplier('100 / 2')).toBe(null);
    expect(extractMultiplier('')).toBe(null);
    expect(extractMultiplier(null)).toBe(null);
    expect(extractMultiplier(undefined)).toBe(null);
  });

  test('returns null for non-positive or invalid multiplier', () => {
    expect(extractMultiplier('50 * 0')).toBe(null);
    expect(extractMultiplier('50 * -1')).toBe(null);
    expect(extractMultiplier('50 * abc')).toBe(null);
  });
});

describe('amount-input: multiplier memory storage', () => {
  function createMockStorage(): Storage {
    const store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const k in store) delete store[k];
      },
      key: (i: number) => Object.keys(store)[i] || null,
      get length() {
        return Object.keys(store).length;
      },
    } as Storage;
  }

  test('saves and retrieves multiplier in storage', () => {
    const storage = createMockStorage();
    expect(getLastMultiplier(storage)).toBe(null);

    const saved = saveMultiplierFromExpr('50*83.4', storage);
    expect(saved).toBe('83.4');
    expect(storage.getItem(LAST_MULTIPLIER_KEY)).toBe('83.4');
    expect(getLastMultiplier(storage)).toBe('83.4');
  });

  test('saveMultiplierFromExpr does not overwrite when expr has no multiplier', () => {
    const storage = createMockStorage();
    setLastMultiplier('83.4', storage);
    expect(getLastMultiplier(storage)).toBe('83.4');

    const res = saveMultiplierFromExpr('500', storage);
    expect(res).toBe(null);
    expect(getLastMultiplier(storage)).toBe('83.4');
  });

  test('gracefully handles storage throws', () => {
    const brokenStorage = {
      getItem: () => {
        throw new Error('Storage disabled');
      },
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    } as unknown as Storage;

    expect(() => getLastMultiplier(brokenStorage)).not.toThrow();
    expect(getLastMultiplier(brokenStorage)).toBe(null);

    expect(() => setLastMultiplier('83.4', brokenStorage)).not.toThrow();
    expect(() => saveMultiplierFromExpr('50*83.4', brokenStorage)).not.toThrow();
  });
});
