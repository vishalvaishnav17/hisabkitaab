import { describe, expect, test } from 'bun:test';
import { computeBalances, type Expense, type Transfer } from './balances';

describe('Balances (balances.ts)', () => {
  test('single expense computes correct net balances', () => {
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

    const balances = computeBalances(expenses, []);
    expect(balances.get('alice')).toBe(2000); // paid 3000, consumed 1000 -> +2000
    expect(balances.get('bob')).toBe(-1000); // consumed 1000 -> -1000
    expect(balances.get('charlie')).toBe(-1000); // consumed 1000 -> -1000

    const sum = Array.from(balances.values()).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
  });

  test('includes people with a zero balance if they appear in any input', () => {
    const expenses: Expense[] = [
      {
        paid_by: 'alice',
        amount_paise: 2000,
        shares: [
          { person_id: 'alice', amount_paise: 1000 },
          { person_id: 'bob', amount_paise: 1000 },
        ],
      },
      {
        paid_by: 'bob',
        amount_paise: 2000,
        shares: [
          { person_id: 'alice', amount_paise: 1000 },
          { person_id: 'bob', amount_paise: 1000 },
        ],
      },
    ];

    const balances = computeBalances(expenses, []);
    // Both alice and bob netted to 0
    expect(balances.has('alice')).toBe(true);
    expect(balances.has('bob')).toBe(true);
    expect(balances.get('alice')).toBe(0);
    expect(balances.get('bob')).toBe(0);
  });

  test('transfers move balances in the right direction', () => {
    // Alice paid 2000 for Bob
    const expenses: Expense[] = [
      {
        paid_by: 'alice',
        amount_paise: 2000,
        shares: [{ person_id: 'bob', amount_paise: 2000 }],
      },
    ];

    const before = computeBalances(expenses, []);
    expect(before.get('alice')).toBe(2000); // alice is owed 2000
    expect(before.get('bob')).toBe(-2000); // bob owes 2000

    // Bob settles by transferring 2000 to Alice
    // A transfer from Bob to Alice increases Bob's balance and decreases Alice's balance
    const transfers: Transfer[] = [
      {
        from_person: 'bob',
        to_person: 'alice',
        amount_paise: 2000,
      },
    ];

    const after = computeBalances(expenses, transfers);
    expect(after.get('alice')).toBe(0);
    expect(after.get('bob')).toBe(0);
  });

  test('balances always add up to zero over 1,000 random cases', () => {
    const peoplePool = ['alice', 'bob', 'charlie', 'dave', 'eve', 'frank', 'grace', 'heidi'];

    for (let run = 0; run < 1000; run++) {
      const numExpenses = Math.floor(Math.random() * 10) + 1;
      const numTransfers = Math.floor(Math.random() * 5);

      const expenses: Expense[] = [];
      for (let e = 0; e < numExpenses; e++) {
        const payer = peoplePool[Math.floor(Math.random() * peoplePool.length)];
        const numSharers = Math.floor(Math.random() * 5) + 1;
        const sharers = [...peoplePool]
          .sort(() => Math.random() - 0.5)
          .slice(0, numSharers);

        let total = 0;
        const shares = sharers.map((person_id) => {
          const share = Math.floor(Math.random() * 5000) + 10;
          total += share;
          return { person_id, amount_paise: share };
        });

        expenses.push({
          paid_by: payer,
          amount_paise: total,
          shares,
        });
      }

      const transfers: Transfer[] = [];
      for (let t = 0; t < numTransfers; t++) {
        const from = peoplePool[Math.floor(Math.random() * peoplePool.length)];
        let to = peoplePool[Math.floor(Math.random() * peoplePool.length)];
        while (to === from) {
          to = peoplePool[Math.floor(Math.random() * peoplePool.length)];
        }
        const amt = Math.floor(Math.random() * 5000) + 10;
        transfers.push({
          from_person: from,
          to_person: to,
          amount_paise: amt,
        });
      }

      const balances = computeBalances(expenses, transfers);

      // Verify all participants are in the map
      for (const exp of expenses) {
        expect(balances.has(exp.paid_by)).toBe(true);
        for (const s of exp.shares) {
          expect(balances.has(s.person_id)).toBe(true);
        }
      }
      for (const tr of transfers) {
        expect(balances.has(tr.from_person)).toBe(true);
        expect(balances.has(tr.to_person)).toBe(true);
      }

      // Sum of all balances must be exactly zero
      const sum = Array.from(balances.values()).reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    }
  });
});
