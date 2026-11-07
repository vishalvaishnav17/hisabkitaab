import { describe, expect, test } from 'bun:test';
import { splitAmount, SplitError } from './split';

describe('Split (split.ts)', () => {
  describe('equal split', () => {
    test('₹100 split 3 ways gives 3334, 3333, 3333 and extra paisa goes to lowest id', () => {
      // ₹100 = 10000 paise
      const res = splitAmount(10000, {
        type: 'equal',
        personIds: ['p1', 'p2', 'p3'],
      });

      expect(res).toEqual([
        { personId: 'p1', amount_paise: 3334 },
        { personId: 'p2', amount_paise: 3333 },
        { personId: 'p3', amount_paise: 3333 },
      ]);
      expect(res.reduce((s, r) => s + r.amount_paise, 0)).toBe(10000);
    });

    test('extra paisa goes to lowest id regardless of input array order', () => {
      const res = splitAmount(10000, {
        type: 'equal',
        personIds: ['charlie', 'bob', 'alice'],
      });

      const alice = res.find((r) => r.personId === 'alice')!;
      const bob = res.find((r) => r.personId === 'bob')!;
      const charlie = res.find((r) => r.personId === 'charlie')!;

      expect(alice.amount_paise).toBe(3334);
      expect(bob.amount_paise).toBe(3333);
      expect(charlie.amount_paise).toBe(3333);
    });

    test('multiple leftover paise distributed in ascending personId order', () => {
      // 100 paise split 3 ways: 33 each, remainder 1 -> p1 gets 34
      // 101 paise split 3 ways: 33 each, remainder 2 -> p1 and p2 get 34, p3 gets 33
      const res = splitAmount(101, {
        type: 'equal',
        personIds: ['p2', 'p3', 'p1'],
      });

      const p1 = res.find((r) => r.personId === 'p1')!;
      const p2 = res.find((r) => r.personId === 'p2')!;
      const p3 = res.find((r) => r.personId === 'p3')!;

      expect(p1.amount_paise).toBe(34);
      expect(p2.amount_paise).toBe(34);
      expect(p3.amount_paise).toBe(33);
    });

    test('throws on empty person list or duplicate ids', () => {
      expect(() => splitAmount(1000, { type: 'equal', personIds: [] })).toThrow(SplitError);
      expect(() =>
        splitAmount(1000, { type: 'equal', personIds: ['alice', 'bob', 'alice'] })
      ).toThrow(SplitError);
    });

    test('throws on invalid total amount', () => {
      expect(() => splitAmount(-100, { type: 'equal', personIds: ['p1'] })).toThrow(SplitError);
      expect(() => splitAmount(100.5, { type: 'equal', personIds: ['p1'] })).toThrow(SplitError);
    });
  });

  describe('exact split', () => {
    test('valid exact split returns shares', () => {
      const res = splitAmount(10000, {
        type: 'exact',
        amounts: {
          alice: 4000,
          bob: 3500,
          charlie: 2500,
        },
      });

      expect(res).toEqual([
        { personId: 'alice', amount_paise: 4000 },
        { personId: 'bob', amount_paise: 3500 },
        { personId: 'charlie', amount_paise: 2500 },
      ]);
    });

    test('each exact-mode error', () => {
      // Empty person list
      expect(() => splitAmount(1000, { type: 'exact', amounts: {} })).toThrow(SplitError);

      // Amounts sum does not match total
      expect(() =>
        splitAmount(1000, { type: 'exact', amounts: { p1: 500, p2: 400 } })
      ).toThrow(SplitError);
      expect(() =>
        splitAmount(1000, { type: 'exact', amounts: { p1: 600, p2: 500 } })
      ).toThrow(SplitError);

      // Negative amount
      expect(() =>
        splitAmount(1000, { type: 'exact', amounts: { p1: 1500, p2: -500 } })
      ).toThrow(SplitError);

      // Non-integer amount
      expect(() =>
        splitAmount(1000, { type: 'exact', amounts: { p1: 500.5, p2: 499.5 } })
      ).toThrow(SplitError);
    });
  });

  describe('property-based random tests', () => {
    test('shares always add up to the total over 1,000 random cases', () => {
      for (let run = 0; run < 1000; run++) {
        const totalPaise = Math.floor(Math.random() * 1_000_000); // 0 to ₹10,000
        const n = Math.floor(Math.random() * 20) + 1; // 1 to 20 people
        const personIds = Array.from({ length: n }, (_, i) => `person_${i}`);

        // Shuffle personIds to ensure order-independence
        for (let i = personIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [personIds[i], personIds[j]] = [personIds[j], personIds[i]];
        }

        const shares = splitAmount(totalPaise, { type: 'equal', personIds });

        expect(shares.length).toBe(n);

        const sum = shares.reduce((acc, s) => acc + s.amount_paise, 0);
        expect(sum).toBe(totalPaise);

        // Check fair distribution: difference between max and min share is <= 1
        const amounts = shares.map((s) => s.amount_paise);
        const minAmt = Math.min(...amounts);
        const maxAmt = Math.max(...amounts);
        expect(maxAmt - minAmt).toBeLessThanOrEqual(1);

        // Check non-negative
        expect(minAmt).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
