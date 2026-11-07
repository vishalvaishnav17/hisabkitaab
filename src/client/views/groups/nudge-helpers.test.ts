import { describe, expect, test } from 'bun:test';
import { buildUpiUrl, truncateItems, wrapText } from './nudge-helpers';

describe('UPI URL Builder (buildUpiUrl)', () => {
  test('correctly encodes and formats URL with 2-decimal amount', () => {
    const url = buildUpiUrl({
      vpa: 'vishal@okhdfcbank',
      name: 'Vishal Vaishnav',
      amountPaise: 84000,
      note: 'Goa Trip',
    });

    expect(url).toBe('upi://pay?pa=vishal%40okhdfcbank&pn=Vishal%20Vaishnav&am=840.00&cu=INR&tn=Goa%20Trip');
  });

  test('formats fractional rupee amounts with exactly 2 decimal places', () => {
    const url = buildUpiUrl({
      vpa: 'user@upi',
      name: 'User Name',
      amountPaise: 84050, // 840.50
      note: 'Dinner & Drinks',
    });

    expect(url).toBe('upi://pay?pa=user%40upi&pn=User%20Name&am=840.50&cu=INR&tn=Dinner%20%26%20Drinks');
  });

  test('encodes special characters in note and name', () => {
    const url = buildUpiUrl({
      vpa: 'my-upi@bank',
      name: 'Name with / & ?',
      amountPaise: 125, // 1.25
      note: 'Test #1 / split',
    });

    expect(url).toContain('pn=Name%20with%20%2F%20%26%20%3F');
    expect(url).toContain('tn=Test%20%231%20%2F%20split');
    expect(url).toContain('am=1.25');
  });

  test('returns null when UPI ID is missing or whitespace', () => {
    expect(buildUpiUrl({ vpa: null, name: 'Vishal', amountPaise: 50000 })).toBeNull();
    expect(buildUpiUrl({ vpa: undefined, name: 'Vishal', amountPaise: 50000 })).toBeNull();
    expect(buildUpiUrl({ vpa: '', name: 'Vishal', amountPaise: 50000 })).toBeNull();
    expect(buildUpiUrl({ vpa: '   ', name: 'Vishal', amountPaise: 50000 })).toBeNull();
  });

  test('returns null when I owe them (negative amount) or settled up (zero amount)', () => {
    // Settled up (0 paise)
    expect(buildUpiUrl({ vpa: 'someone@upi', name: 'Vishal', amountPaise: 0 })).toBeNull();

    // I owe them (-84000 paise)
    expect(buildUpiUrl({ vpa: 'someone@upi', name: 'Vishal', amountPaise: -84000 })).toBeNull();
  });
});

describe('Item Truncation (truncateItems)', () => {
  test('returns all items when length <= limit (default 8)', () => {
    const items = [1, 2, 3, 4, 5];
    const result = truncateItems(items);
    expect(result.items).toEqual([1, 2, 3, 4, 5]);
    expect(result.remainingCount).toBe(0);
  });

  test('returns exactly 8 items and remaining count when length > 8', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']; // 11 items
    const result = truncateItems(items, 8);
    expect(result.items).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(result.remainingCount).toBe(3);
  });

  test('handles empty arrays', () => {
    const result = truncateItems([]);
    expect(result.items).toEqual([]);
    expect(result.remainingCount).toBe(0);
  });
});

describe('Text-wrap Helper (wrapText)', () => {
  test('returns single line when text fits within maxWidth', () => {
    // 1 char = 10px width
    const measure = (s: string) => s.length * 10;
    const lines = wrapText('Short text', 200, measure);
    expect(lines).toEqual(['Short text']);
  });

  test('wraps words across multiple lines when exceeding maxWidth', () => {
    const measure = (s: string) => s.length * 10;
    // 'The quick brown fox jumps over the lazy dog'
    // maxWidth = 150 -> max 15 chars per line
    const text = 'The quick brown fox jumps over the lazy dog';
    const lines = wrapText(text, 150, measure);
    for (const line of lines) {
      expect(measure(line)).toBeLessThanOrEqual(150);
    }
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(text);
  });

  test('preserves explicit newlines in text', () => {
    const measure = (s: string) => s.length * 10;
    const text = 'Line one\nLine two\nLine three';
    const lines = wrapText(text, 300, measure);
    expect(lines).toEqual(['Line one', 'Line two', 'Line three']);
  });

  test('handles empty text', () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapText('', 100, measure)).toEqual([]);
  });
});
