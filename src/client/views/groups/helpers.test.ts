import { describe, expect, it } from 'bun:test';
import {
  computeBalanceBarWidth,
  computeExactRemainingPaise,
  computeMaxAbsBalance,
  computeSummaryLine,
  formatNetBalance,
  formatPaise,
  formatRemainingMessage,
  settlementToTransferForm,
} from './helpers';

describe('formatPaise', () => {
  it('formats whole rupee amounts without decimal places', () => {
    expect(formatPaise(234000)).toBe('₹2,340');
    expect(formatPaise(50000)).toBe('₹500');
    expect(formatPaise(0)).toBe('₹0');
  });

  it('formats fractional rupee amounts with up to 2 decimal places', () => {
    expect(formatPaise(91667)).toBe('₹916.67');
    expect(formatPaise(1050)).toBe('₹10.50');
    expect(formatPaise(33)).toBe('₹0.33');
  });

  it('formats negative amounts with minus sign before rupee symbol', () => {
    expect(formatPaise(-50000)).toBe('-₹500');
    expect(formatPaise(-124000)).toBe('-₹1,240');
    expect(formatPaise(-1250)).toBe('-₹12.50');
  });
});

describe('computeSummaryLine', () => {
  it('formats equal split with whole rupees', () => {
    const line = computeSummaryLine({
      totalPaise: 150000, // ₹1,500
      splitType: 'equal',
      participantCount: 3,
      payerName: 'Me',
    });
    expect(line).toBe('₹500 each · paid by Me ▾');
  });

  it('formats equal split with fractional rupees (spec example ₹916.67 each)', () => {
    const line = computeSummaryLine({
      totalPaise: 275000, // ₹2,750 / 3 = 916.666...
      splitType: 'equal',
      participantCount: 3,
      payerName: 'Me',
    });
    expect(line).toBe('₹916.67 each · paid by Me ▾');
  });

  it('formats equal split with other payer name', () => {
    const line = computeSummaryLine({
      totalPaise: 100000,
      splitType: 'equal',
      participantCount: 2,
      payerName: 'Rahul',
    });
    expect(line).toBe('₹500 each · paid by Rahul ▾');
  });

  it('formats exact split summary line', () => {
    const line = computeSummaryLine({
      totalPaise: 300000,
      splitType: 'exact',
      participantCount: 3,
      payerName: 'Me',
    });
    expect(line).toBe('₹3,000 exact split · paid by Me ▾');
  });

  it('handles zero or invalid participant count or amount', () => {
    expect(
      computeSummaryLine({
        totalPaise: 0,
        splitType: 'equal',
        participantCount: 2,
        payerName: 'Me',
      })
    ).toBe('₹0 · paid by Me ▾');

    expect(
      computeSummaryLine({
        totalPaise: 1000,
        splitType: 'equal',
        participantCount: 0,
        payerName: '',
      })
    ).toBe('₹0 · paid by Me ▾');
  });
});

describe('computeExactRemainingPaise', () => {
  it('returns positive remaining paise when under-assigned', () => {
    const totalPaise = 10000; // ₹100
    const assigned = {
      me: 3000, // ₹30
      rahul: 3000, // ₹30
    };
    const remaining = computeExactRemainingPaise(totalPaise, assigned);
    expect(remaining).toBe(4000); // ₹40 left to assign
  });

  it('returns zero when exactly balanced', () => {
    const totalPaise = 10000;
    const assigned = {
      me: 5000,
      rahul: 5000,
    };
    expect(computeExactRemainingPaise(totalPaise, assigned)).toBe(0);
  });

  it('returns negative remaining paise when over-assigned', () => {
    const totalPaise = 10000;
    const assigned = {
      me: 6000,
      rahul: 5000,
    };
    expect(computeExactRemainingPaise(totalPaise, assigned)).toBe(-1000); // ₹10 over
  });

  it('respects participantIds filter if provided', () => {
    const totalPaise = 10000;
    const assigned = {
      me: 5000,
      rahul: 5000,
      ignored_person: 9000,
    };
    const remaining = computeExactRemainingPaise(totalPaise, assigned, ['me', 'rahul']);
    expect(remaining).toBe(0);
  });
});

describe('formatRemainingMessage', () => {
  it('formats under-assigned remaining message', () => {
    const res = formatRemainingMessage(4000); // ₹40
    expect(res.text).toBe('₹40 left to assign');
    expect(res.status).toBe('under');
  });

  it('formats over-assigned remaining message', () => {
    const res = formatRemainingMessage(-1500); // ₹15 over
    expect(res.text).toBe('₹15 over assigned');
    expect(res.status).toBe('over');
  });

  it('formats exact match message', () => {
    const res = formatRemainingMessage(0);
    expect(res.text).toBe('Exact match');
    expect(res.status).toBe('ok');
  });
});

describe('formatNetBalance', () => {
  it('formats positive balance as you are owed in emerald', () => {
    const res = formatNetBalance(234000);
    expect(res.text).toBe('you are owed ₹2,340');
    expect(res.colorClass).toContain('emerald');
  });

  it('formats negative balance as you owe in rose', () => {
    const res = formatNetBalance(-50000);
    expect(res.text).toBe('you owe ₹500');
    expect(res.colorClass).toContain('rose');
  });

  it('formats zero balance as settled up in zinc', () => {
    const res = formatNetBalance(0);
    expect(res.text).toBe('settled up');
    expect(res.colorClass).toContain('zinc');
  });
});

describe('computeBalanceBarWidth', () => {
  it('returns 0 when maxAbsPaise is 0 or negative', () => {
    expect(computeBalanceBarWidth(5000, 0)).toBe(0);
    expect(computeBalanceBarWidth(5000, -100)).toBe(0);
  });

  it('returns 0 when netPaise is 0', () => {
    expect(computeBalanceBarWidth(0, 10000)).toBe(0);
  });

  it('computes correct percentage for positive net balance', () => {
    expect(computeBalanceBarWidth(50000, 100000)).toBe(50);
    expect(computeBalanceBarWidth(25000, 100000)).toBe(25);
    expect(computeBalanceBarWidth(100000, 100000)).toBe(100);
  });

  it('computes correct percentage for negative net balance using absolute value', () => {
    expect(computeBalanceBarWidth(-80000, 100000)).toBe(80);
    expect(computeBalanceBarWidth(-100000, 100000)).toBe(100);
  });

  it('caps at 100 if net exceeds max', () => {
    expect(computeBalanceBarWidth(150000, 100000)).toBe(100);
    expect(computeBalanceBarWidth(-150000, 100000)).toBe(100);
  });
});

describe('computeMaxAbsBalance', () => {
  it('returns 0 for empty balances', () => {
    expect(computeMaxAbsBalance({})).toBe(0);
    expect(computeMaxAbsBalance([])).toBe(0);
  });

  it('finds the maximum absolute value from record or array', () => {
    expect(computeMaxAbsBalance({ p1: 5000, p2: -12000, p3: 8000 })).toBe(12000);
    expect(computeMaxAbsBalance([5000, -15000, 2000])).toBe(15000);
  });
});

describe('settlementToTransferForm', () => {
  it('maps settlement debtor to from_person and creditor to to_person', () => {
    const settlement = {
      from: 'person_rahul',
      to: 'person_priya',
      amount_paise: 84000,
    };
    const formValues = settlementToTransferForm(settlement, '2026-11-07');
    expect(formValues.from_person).toBe('person_rahul');
    expect(formValues.to_person).toBe('person_priya');
    expect(formValues.amount_paise).toBe(84000);
    expect(formValues.method).toBe('UPI');
    expect(formValues.date).toBe('2026-11-07');
    expect(formValues.note).toBe('');
    expect(formValues.amount_expr).toBeNull();
  });

  it('handles settlements involving "me"', () => {
    const settlement = {
      from: 'me',
      to: 'person_vikram',
      amount_paise: 150000,
    };
    const formValues = settlementToTransferForm(settlement, '2026-11-07');
    expect(formValues.from_person).toBe('me');
    expect(formValues.to_person).toBe('person_vikram');
    expect(formValues.amount_paise).toBe(150000);
  });

  it('uses default date if none provided', () => {
    const settlement = {
      from: 'p1',
      to: 'p2',
      amount_paise: 5000,
    };
    const formValues = settlementToTransferForm(settlement);
    expect(typeof formValues.date).toBe('string');
    expect(formValues.date.length).toBe(10);
  });
});

