import type { Expense, Transfer } from './balances';

export interface SettlementPayment {
  from: string;
  to: string;
  amount_paise: number;
}

export interface MinimizeSettlementsOptions {
  // Reserved for future options
}

function settleGroup(people: { personId: string; balance: number }[]): SettlementPayment[] {
  const payments: SettlementPayment[] = [];
  const creditors = people
    .filter((p) => p.balance > 0)
    .map((p) => ({ personId: p.personId, balance: p.balance }));
  const debtors = people
    .filter((p) => p.balance < 0)
    .map((p) => ({ personId: p.personId, balance: p.balance }));

  while (creditors.length > 0 && debtors.length > 0) {
    // Sort creditors: largest positive balance first; tie-break: lowest personId
    creditors.sort((a, b) => {
      if (b.balance !== a.balance) return b.balance - a.balance;
      return a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0;
    });

    // Sort debtors: largest debt (most negative balance) first; tie-break: lowest personId
    debtors.sort((a, b) => {
      const absA = Math.abs(a.balance);
      const absB = Math.abs(b.balance);
      if (absB !== absA) return absB - absA;
      return a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0;
    });

    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.balance, Math.abs(d.balance));

    payments.push({
      from: d.personId,
      to: c.personId,
      amount_paise: amount,
    });

    c.balance -= amount;
    d.balance += amount;

    if (c.balance === 0) creditors.shift();
    if (d.balance === 0) debtors.shift();
  }

  return payments;
}

export function minimizeSettlements(
  net: Map<string, number> | Record<string, number>,
  _opts?: MinimizeSettlementsOptions
): SettlementPayment[] {
  const map = net instanceof Map ? net : new Map(Object.entries(net));

  // Drop people with a zero balance
  const entries: { personId: string; balance: number }[] = [];
  for (const [personId, balance] of map.entries()) {
    if (balance !== 0) {
      entries.push({ personId, balance });
    }
  }

  const N = entries.length;
  if (N === 0) {
    return [];
  }

  // Balances must sum to zero
  const total = entries.reduce((acc, e) => acc + e.balance, 0);
  if (total !== 0) {
    throw new Error(`Net balances must sum to zero: sum is ${total}`);
  }

  // Deterministic ordering of people
  entries.sort((a, b) => (a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0));

  // If N > 12: greedy largest-creditor/largest-debtor matching across everyone
  if (N > 12) {
    return settleGroup(entries.map((e) => ({ personId: e.personId, balance: e.balance })));
  }

  // N <= 12: exact method via subset DP
  const numSubsets = 1 << N;
  const sum = new Float64Array(numSubsets);

  for (let mask = 1; mask < numSubsets; mask++) {
    const lowbit = mask & -mask;
    const bitIndex = 31 - Math.clz32(lowbit);
    sum[mask] = sum[mask ^ lowbit] + entries[bitIndex].balance;
  }

  // dp[mask] = max over p in mask of dp[mask without p], plus 1 if sum[mask] == 0
  const dp = new Uint8Array(numSubsets);
  for (let mask = 1; mask < numSubsets; mask++) {
    let maxPrev = 0;
    let m = mask;
    while (m > 0) {
      const lowbit = m & -m;
      const without = mask ^ lowbit;
      if (dp[without] > maxPrev) {
        maxPrev = dp[without];
      }
      m ^= lowbit;
    }
    dp[mask] = maxPrev + (sum[mask] === 0 ? 1 : 0);
  }

  // Rebuild the largest set of separate zero-sum subsets from the DP
  const subsets: number[] = [];
  let currentMask = (1 << N) - 1;

  while (currentMask > 0) {
    if (dp[currentMask] === 1) {
      subsets.push(currentMask);
      break;
    }

    let found = false;
    let sub = (currentMask - 1) & currentMask;
    while (sub > 0) {
      if (sum[sub] === 0 && dp[sub] === 1 && dp[currentMask ^ sub] === dp[currentMask] - 1) {
        subsets.push(sub);
        currentMask ^= sub;
        found = true;
        break;
      }
      sub = (sub - 1) & currentMask;
    }

    if (!found) {
      subsets.push(currentMask);
      break;
    }
  }

  // Sort subsets deterministically by lowest personId in each subset
  subsets.sort((maskA, maskB) => {
    const minBitA = 31 - Math.clz32(maskA & -maskA);
    const minBitB = 31 - Math.clz32(maskB & -maskB);
    return minBitA - minBitB;
  });

  const allPayments: SettlementPayment[] = [];
  for (const mask of subsets) {
    const group: { personId: string; balance: number }[] = [];
    for (let i = 0; i < N; i++) {
      if ((mask & (1 << i)) !== 0) {
        group.push({ personId: entries[i].personId, balance: entries[i].balance });
      }
    }
    allPayments.push(...settleGroup(group));
  }

  return allPayments;
}

export function pairwiseDebts(
  expenses: Expense[],
  transfers: Transfer[]
): SettlementPayment[] {
  // debt(A, B) is amount A owes B
  const debt = new Map<string, Map<string, number>>();

  function addDebt(from: string, to: string, amount: number) {
    if (from === to || amount === 0) return;
    if (!debt.has(from)) {
      debt.set(from, new Map());
    }
    const m = debt.get(from)!;
    m.set(to, (m.get(to) ?? 0) + amount);
  }

  for (const exp of expenses) {
    const payer = exp.paid_by;
    for (const share of exp.shares) {
      if (share.person_id !== payer) {
        addDebt(share.person_id, payer, share.amount_paise);
      }
    }
  }

  for (const tr of transfers) {
    if (tr.from_person !== tr.to_person) {
      // Transfer A -> B means A paid B, reducing what A owes B
      addDebt(tr.from_person, tr.to_person, -tr.amount_paise);
    }
  }

  // Collect all participants
  const allPeople = new Set<string>();
  for (const [from, targets] of debt.entries()) {
    allPeople.add(from);
    for (const to of targets.keys()) {
      allPeople.add(to);
    }
  }
  const people = Array.from(allPeople).sort();

  const results: SettlementPayment[] = [];

  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const p1 = people[i];
      const p2 = people[j];
      const p1OwesP2 = debt.get(p1)?.get(p2) ?? 0;
      const p2OwesP1 = debt.get(p2)?.get(p1) ?? 0;
      const netOwed = p1OwesP2 - p2OwesP1;

      if (netOwed > 0) {
        results.push({
          from: p1,
          to: p2,
          amount_paise: netOwed,
        });
      } else if (netOwed < 0) {
        results.push({
          from: p2,
          to: p1,
          amount_paise: -netOwed,
        });
      }
    }
  }

  // Deterministic order
  results.sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    return a.to < b.to ? -1 : 1;
  });

  return results;
}
