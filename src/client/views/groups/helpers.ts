/**
 * Formats integer paise into a formatted INR currency string.
 * Whole rupee amounts are formatted without decimals (e.g. ₹2,340, ₹500).
 * Fractional rupee amounts show up to 2 decimal places (e.g. ₹916.67).
 * Negative amounts include a minus sign before the symbol (-₹500).
 */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  const isWhole = Number.isInteger(rupees);
  const formatted = Math.abs(rupees).toLocaleString('en-IN', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${rupees < 0 ? '-' : ''}₹${formatted}`;
}

export interface SummaryLineParams {
  totalPaise: number;
  splitType: 'equal' | 'exact';
  participantCount: number;
  payerName: string;
}

/**
 * Computes the live summary line for the expense sheet.
 * Example outputs:
 * - "₹916.67 each · paid by Me ▾"
 * - "₹500 each · paid by Rahul ▾"
 * - "₹1,200 exact split · paid by Me ▾"
 */
export function computeSummaryLine({
  totalPaise,
  splitType,
  participantCount,
  payerName,
}: SummaryLineParams): string {
  const payer = payerName.trim() || 'Me';

  if (totalPaise <= 0 || participantCount <= 0) {
    return `₹0 · paid by ${payer} ▾`;
  }

  if (splitType === 'exact') {
    return `${formatPaise(totalPaise)} exact split · paid by ${payer} ▾`;
  }

  // Equal split
  const perPersonRupees = totalPaise / (100 * participantCount);
  const isWhole = Number.isInteger(perPersonRupees);
  const formattedShare = Math.abs(perPersonRupees).toLocaleString('en-IN', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  });

  return `₹${formattedShare} each · paid by ${payer} ▾`;
}

/**
 * Calculates remaining unassigned paise for an exact split.
 * Positive number: paise left to assign.
 * Negative number: paise over assigned.
 * Zero: perfectly balanced.
 */
export function computeExactRemainingPaise(
  totalPaise: number,
  assignedAmounts: Record<string, number>,
  participantIds?: string[]
): number {
  const ids = participantIds ?? Object.keys(assignedAmounts);
  const assigned = ids.reduce((sum, id) => {
    const val = Number(assignedAmounts[id]) || 0;
    return sum + val;
  }, 0);
  return totalPaise - assigned;
}

export interface RemainingMessageResult {
  text: string;
  status: 'ok' | 'under' | 'over';
}

/**
 * Formats the live message for exact split remaining amount.
 * Examples:
 * - "₹40 left to assign" (when remaining > 0)
 * - "₹40 over assigned" (when remaining < 0)
 * - "Exact match" (when remaining === 0)
 */
export function formatRemainingMessage(remainingPaise: number): RemainingMessageResult {
  if (remainingPaise > 0) {
    return {
      text: `${formatPaise(remainingPaise)} left to assign`,
      status: 'under',
    };
  }
  if (remainingPaise < 0) {
    return {
      text: `${formatPaise(Math.abs(remainingPaise))} over assigned`,
      status: 'over',
    };
  }
  return {
    text: 'Exact match',
    status: 'ok',
  };
}

export interface NetBalanceResult {
  text: string;
  colorClass: string;
  badgeClass: string;
}

/**
 * Formats net balance for list cards and headers:
 * - "you are owed ₹2,340" in emerald
 * - "you owe ₹500" in rose
 * - "settled up" in zinc
 */
export function formatNetBalance(netPaise: number): NetBalanceResult {
  if (netPaise > 0) {
    return {
      text: `you are owed ${formatPaise(netPaise)}`,
      colorClass: 'text-emerald-400',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    };
  }
  if (netPaise < 0) {
    return {
      text: `you owe ${formatPaise(Math.abs(netPaise))}`,
      colorClass: 'text-rose-400',
      badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };
  }
  return {
    text: 'settled up',
    colorClass: 'text-zinc-500',
    badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700/50',
  };
}
