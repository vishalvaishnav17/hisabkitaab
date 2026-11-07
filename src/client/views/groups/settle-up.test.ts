import { describe, expect, it } from 'bun:test';
import {
  computeBalanceBarWidth,
  computeMaxAbsBalance,
  settlementToTransferForm,
} from './helpers';
import { GroupDetailResponse, SettlementPayment } from './types';

describe('Settle up UI helpers & logic', () => {
  const mockGroupDetail: GroupDetailResponse = {
    group: {
      id: 'g1',
      name: 'Goa Trip',
      emoji: '🏖️',
      kind: 'trip',
      simplify_debts: 1,
      archived_at: null,
      created_at: '2026-11-01T00:00:00Z',
      deleted_at: null,
    },
    members: [
      {
        group_id: 'g1',
        person_id: 'me',
        name: 'Me',
        joined_at: '2026-11-01T00:00:00Z',
        left_at: null,
        upi_vpa: null,
        phone: null,
        is_me: 1,
      },
      {
        group_id: 'g1',
        person_id: 'p_rahul',
        name: 'Rahul',
        joined_at: '2026-11-01T00:00:00Z',
        left_at: null,
        upi_vpa: 'rahul@upi',
        phone: '9876543210',
        is_me: 0,
      },
      {
        group_id: 'g1',
        person_id: 'p_priya',
        name: 'Priya',
        joined_at: '2026-11-01T00:00:00Z',
        left_at: null,
        upi_vpa: 'priya@okhdfcbank',
        phone: null,
        is_me: 0,
      },
    ],
    balances: {
      me: 50000, // +₹500 (gets back)
      p_priya: 34000, // +₹340 (gets back)
      p_rahul: -84000, // -₹840 (owes)
    },
    settlements: [
      {
        from: 'p_rahul',
        to: 'me',
        amount_paise: 50000,
      },
      {
        from: 'p_rahul',
        to: 'p_priya',
        amount_paise: 34000,
      },
    ],
    next_payer: 'p_rahul',
    my_net_paise: 50000,
  };

  it('computes correct max absolute balance and member bar widths', () => {
    const maxAbs = computeMaxAbsBalance(mockGroupDetail.balances);
    expect(maxAbs).toBe(84000);

    // Rahul owes 840 -> 100% of max
    const rahulWidth = computeBalanceBarWidth(mockGroupDetail.balances.p_rahul, maxAbs);
    expect(rahulWidth).toBe(100);

    // Me gets back 500 -> 50000 / 84000 = ~60%
    const meWidth = computeBalanceBarWidth(mockGroupDetail.balances.me, maxAbs);
    expect(meWidth).toBe(60);

    // Priya gets back 340 -> 34000 / 84000 = ~40%
    const priyaWidth = computeBalanceBarWidth(mockGroupDetail.balances.p_priya, maxAbs);
    expect(priyaWidth).toBe(40);
  });

  it('pre-fills transfer form values accurately from suggested settlements', () => {
    const settlement: SettlementPayment = mockGroupDetail.settlements[0];
    const formValues = settlementToTransferForm(settlement, '2026-11-07');

    expect(formValues.from_person).toBe('p_rahul');
    expect(formValues.to_person).toBe('me');
    expect(formValues.amount_paise).toBe(50000);
    expect(formValues.method).toBe('UPI');
    expect(formValues.date).toBe('2026-11-07');
    expect(formValues.note).toBe('');
  });

  it('pre-fills transfer form for second settlement', () => {
    const settlement: SettlementPayment = mockGroupDetail.settlements[1];
    const formValues = settlementToTransferForm(settlement, '2026-11-07');

    expect(formValues.from_person).toBe('p_rahul');
    expect(formValues.to_person).toBe('p_priya');
    expect(formValues.amount_paise).toBe(34000);
  });

  it('identifies when all balances are settled up', () => {
    const settledBalances = {
      me: 0,
      p_rahul: 0,
      p_priya: 0,
    };
    const maxAbs = computeMaxAbsBalance(settledBalances);
    expect(maxAbs).toBe(0);

    const isAllSettled = Object.values(settledBalances).every((b) => b === 0);
    expect(isAllSettled).toBe(true);

    const barWidth = computeBalanceBarWidth(0, maxAbs);
    expect(barWidth).toBe(0);
  });
});
