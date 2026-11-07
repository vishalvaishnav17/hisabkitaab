import { describe, expect, test } from 'bun:test';
import { minimizeSettlements, pairwiseDebts } from './settle';
import type { Expense, Transfer } from './balances';

// Helper: brute-force all set partitions to find maximum number of zero-sum subsets
function allPartitions<T>(arr: T[]): T[][][] {
  if (arr.length === 0) return [[]];
  const first = arr[0];
  const rest = arr.slice(1);
  const sub = allPartitions(rest);
  const res: T[][][] = [];
  for (const p of sub) {
    res.push([[first], ...p]);
    for (let i = 0; i < p.length; i++) {
      const copy = p.map((s) => [...s]);
      copy[i].push(first);
      res.push(copy);
    }
  }
  return res;
}

function bruteForceMinPayments(balances: number[]): number {
  const n = balances.length;
  if (n <= 1) return 0;
  const indices = Array.from({ length: n }, (_, i) => i);
  const partitions = allPartitions(indices);
  let maxZeroSumSubsets = 0;

  for (const part of partitions) {
    let allSubsetsZeroSum = true;
    for (const subset of part) {
      let sum = 0;
      for (const idx of subset) {
        sum += balances[idx];
      }
      if (sum !== 0) {
        allSubsetsZeroSum = false;
        break;
      }
    }
    if (allSubsetsZeroSum && part.length > maxZeroSumSubsets) {
      maxZeroSumSubsets = part.length;
    }
  }

  return n - maxZeroSumSubsets;
}

// Helper: simulate naive greedy largest-creditor/largest-debtor matching across everyone
function greedyAcrossEveryone(
  people: { personId: string; balance: number }[]
): { from: string; to: string; amount_paise: number }[] {
  const creditors = people.filter((p) => p.balance > 0).map((p) => ({ ...p }));
  const debtors = people.filter((p) => p.balance < 0).map((p) => ({ ...p }));
  const payments: { from: string; to: string; amount_paise: number }[] = [];

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort((a, b) => b.balance - a.balance);
    debtors.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.balance, Math.abs(d.balance));

    payments.push({ from: d.personId, to: c.personId, amount_paise: amount });
    c.balance -= amount;
    d.balance += amount;

    if (c.balance === 0) creditors.shift();
    if (d.balance === 0) debtors.shift();
  }

  return payments;
}

describe('Settlements (settle.ts)', () => {
  test('empty or single zero balance returns empty array', () => {
    expect(minimizeSettlements(new Map())).toEqual([]);
    expect(minimizeSettlements({ alice: 0, bob: 0 })).toEqual([]);
  });

  test('one hand-written case where greedy alone is not optimal but the exact method is', () => {
    // Subset 1: A (10), B (-6), C (-4) -> sum = 0 (can be settled in 2 payments)
    // Subset 2: D (9), E (8), F (-17)  -> sum = 0 (can be settled in 2 payments)
    // Total optimal payments: 2 + 2 = 4 payments
    // Greedy across everyone matches F (-17) with A (10), which crosses subsets and requires 5 payments!
    const people = [
      { personId: 'A', balance: 1000 },
      { personId: 'B', balance: -600 },
      { personId: 'C', balance: -400 },
      { personId: 'D', balance: 900 },
      { personId: 'E', balance: 800 },
      { personId: 'F', balance: -1700 },
    ];

    const net = new Map(people.map((p) => [p.personId, p.balance]));

    const greedyPayments = greedyAcrossEveryone(people);
    expect(greedyPayments.length).toBe(5);

    const exactPayments = minimizeSettlements(net);
    expect(exactPayments.length).toBe(4); // 4 < 5!
  });

  test('for N <= 8, the number of payments equals brute-force minimum', () => {
    // Test various small zero-sum configurations
    const testCases: number[][] = [
      [10, -10],
      [20, 30, -50],
      [10, -10, 20, -20],
      [10, 20, 30, -60],
      [10, -6, -4, 9, 8, -17],
      [100, -50, -50, 200, -100, -100],
      [15, -5, -10, 25, -20, -5, 30, -30],
    ];

    for (const balances of testCases) {
      const net = new Map<string, number>();
      balances.forEach((bal, idx) => net.set(`p_${idx}`, bal));

      const payments = minimizeSettlements(net);
      const expectedMin = bruteForceMinPayments(balances);

      expect(payments.length).toBe(expectedMin);
    }
  });

  test('over 500 random balance sets (N from 0 to 12): settles to zero, at most N-1 payments, all amounts > 0', () => {
    for (let run = 0; run < 500; run++) {
      const N = Math.floor(Math.random() * 13); // 0 to 12
      if (N === 0) {
        expect(minimizeSettlements(new Map())).toEqual([]);
        continue;
      }
      if (N === 1) {
        // Single non-zero person cannot have zero sum
        continue;
      }

      // Generate N non-zero balances that sum to 0
      const balances: number[] = [];
      let currentSum = 0;
      for (let i = 0; i < N - 1; i++) {
        // Random non-zero balance
        let val = Math.floor(Math.random() * 2000) - 1000;
        if (val === 0) val = 100;
        balances.push(val);
        currentSum += val;
      }
      const last = -currentSum;
      if (last === 0) {
        // Adjust to keep all non-zero
        balances[0] += 50;
        balances.push(-50);
      } else {
        balances.push(last);
      }

      const net = new Map<string, number>();
      balances.forEach((bal, idx) => net.set(`person_${idx}`, bal));

      const payments = minimizeSettlements(net);

      // 1. At most N - 1 payments
      expect(payments.length).toBeLessThanOrEqual(N - 1);

      // 2. Every payment amount is > 0
      for (const p of payments) {
        expect(p.amount_paise).toBeGreaterThan(0);
      }

      // 3. Payments bring every balance to zero
      const netCheck = new Map(net);
      for (const p of payments) {
        // 'from' pays 'to'
        netCheck.set(p.from, (netCheck.get(p.from) ?? 0) + p.amount_paise);
        netCheck.set(p.to, (netCheck.get(p.to) ?? 0) - p.amount_paise);
      }
      for (const bal of netCheck.values()) {
        expect(bal).toBe(0);
      }
    }
  });

  test('N > 12 path returns at most N - 1 payments and brings balances to zero', () => {
    // Generate N = 20 people
    const N = 20;
    const balances: number[] = [];
    let sum = 0;
    for (let i = 0; i < N - 1; i++) {
      let val = Math.floor(Math.random() * 2000) - 1000;
      if (val === 0) val = 100;
      balances.push(val);
      sum += val;
    }
    balances.push(-sum);

    const net = new Map<string, number>();
    balances.forEach((b, i) => net.set(`user_${i}`, b));

    const payments = minimizeSettlements(net);

    expect(payments.length).toBeLessThanOrEqual(N - 1);
    for (const p of payments) {
      expect(p.amount_paise).toBeGreaterThan(0);
    }

    const netCheck = new Map(net);
    for (const p of payments) {
      netCheck.set(p.from, (netCheck.get(p.from) ?? 0) + p.amount_paise);
      netCheck.set(p.to, (netCheck.get(p.to) ?? 0) - p.amount_paise);
    }
    for (const bal of netCheck.values()) {
      expect(bal).toBe(0);
    }
  });

  test('Performance: N = 12 runs in under 5 ms', () => {
    const net = new Map<string, number>();
    const vals = [100, 200, 300, 400, 500, 600, -100, -200, -300, -400, -500, -600];
    vals.forEach((v, i) => net.set(`p_${i}`, v));

    const t0 = performance.now();
    const payments = minimizeSettlements(net);
    const elapsed = performance.now() - t0;

    expect(payments.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(5);
  });

  describe('pairwiseDebts', () => {
    test('returns raw who-owes-whom netted per pair of people', () => {
      // Alice pays 3000 for Alice (1000), Bob (1000), Charlie (1000)
      // Bob owes Alice 1000. Charlie owes Alice 1000.
      const expenses: Expense[] = [
        {
          paid_by: 'alice',
          amount_paise: 3000,
          shares: [
            { person_id: 'alice', amount_paise: 1000 },
            { person_id: 'bob', amount_paise: 1000 },
            { person_id: 'charlie', amount_paise: 1000 },
          ],
        },
      ];

      // Bob transfers 300 to Alice
      const transfers: Transfer[] = [
        {
          from_person: 'bob',
          to_person: 'alice',
          amount_paise: 300,
        },
      ];

      const debts = pairwiseDebts(expenses, transfers);

      expect(debts).toEqual([
        { from: 'bob', to: 'alice', amount_paise: 700 }, // 1000 - 300 = 700
        { from: 'charlie', to: 'alice', amount_paise: 1000 },
      ]);
    });

    test('reverses direction when transfers exceed initial debt', () => {
      const expenses: Expense[] = [
        {
          paid_by: 'alice',
          amount_paise: 1000,
          shares: [{ person_id: 'bob', amount_paise: 1000 }],
        },
      ];

      // Bob gives Alice 1500 (overpays by 500)
      const transfers: Transfer[] = [
        {
          from_person: 'bob',
          to_person: 'alice',
          amount_paise: 1500,
        },
      ];

      const debts = pairwiseDebts(expenses, transfers);
      // Now Alice owes Bob 500
      expect(debts).toEqual([{ from: 'alice', to: 'bob', amount_paise: 500 }]);
    });
  });
});
