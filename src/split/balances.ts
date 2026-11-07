export interface ExpenseShare {
  person_id: string;
  amount_paise: number;
}

export interface Expense {
  paid_by: string;
  amount_paise: number;
  shares: ExpenseShare[];
}

export interface Transfer {
  from_person: string;
  to_person: string;
  amount_paise: number;
}

export function computeBalances(
  expenses: Expense[],
  transfers: Transfer[]
): Map<string, number> {
  const balances = new Map<string, number>();

  function add(personId: string, delta: number) {
    balances.set(personId, (balances.get(personId) ?? 0) + delta);
  }

  for (const exp of expenses) {
    add(exp.paid_by, exp.amount_paise);
    for (const share of exp.shares) {
      add(share.person_id, -share.amount_paise);
    }
  }

  for (const tr of transfers) {
    add(tr.from_person, tr.amount_paise);
    add(tr.to_person, -tr.amount_paise);
  }

  return balances;
}
