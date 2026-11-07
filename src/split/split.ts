export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitError';
    Object.setPrototypeOf(this, SplitError.prototype);
  }
}

export interface Share {
  personId: string;
  amount_paise: number;
}

export type SplitInput =
  | { type: 'equal'; personIds: string[] }
  | { type: 'exact'; amounts: Record<string, number> };

export function splitAmount(totalPaise: number, input: SplitInput): Share[] {
  if (!Number.isInteger(totalPaise) || totalPaise < 0) {
    throw new SplitError(`Total amount must be a non-negative integer in paise: got ${totalPaise}`);
  }

  if (input.type === 'equal') {
    const { personIds } = input;
    if (!personIds || personIds.length === 0) {
      throw new SplitError('Person list cannot be empty');
    }

    const seen = new Set<string>();
    for (const id of personIds) {
      if (seen.has(id)) {
        throw new SplitError(`Duplicate person ID: "${id}"`);
      }
      seen.add(id);
    }

    const n = personIds.length;
    const baseShare = Math.floor(totalPaise / n);
    const remainder = totalPaise % n;

    // Ascending personId order gets the extra paise
    const sortedIds = [...personIds].sort();
    const shareMap = new Map<string, number>();

    for (let i = 0; i < sortedIds.length; i++) {
      const id = sortedIds[i];
      const extra = i < remainder ? 1 : 0;
      shareMap.set(id, baseShare + extra);
    }

    return personIds.map((personId) => ({
      personId,
      amount_paise: shareMap.get(personId)!,
    }));
  }

  if (input.type === 'exact') {
    const entries = Object.entries(input.amounts);
    if (entries.length === 0) {
      throw new SplitError('Person list cannot be empty');
    }

    let sum = 0;
    for (const [id, amt] of entries) {
      if (typeof amt !== 'number' || !Number.isInteger(amt) || amt < 0) {
        throw new SplitError(`Amount for person "${id}" must be a non-negative integer: got ${amt}`);
      }
      sum += amt;
    }

    if (sum !== totalPaise) {
      throw new SplitError(
        `Amounts sum to ${sum} paise, which does not match total ${totalPaise} paise`
      );
    }

    return entries.map(([personId, amount_paise]) => ({
      personId,
      amount_paise,
    }));
  }

  throw new SplitError(`Unknown split type: ${(input as any).type}`);
}
