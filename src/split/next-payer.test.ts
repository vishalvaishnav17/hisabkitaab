import { describe, expect, test } from 'bun:test';
import { suggestNextPayer } from './next-payer';

describe('Next Payer (next-payer.ts)', () => {
  test('returns participant with most negative balance', () => {
    const net = new Map([
      ['alice', -500],
      ['bob', -200],
      ['charlie', 700],
    ]);
    const lastPaidAt = {
      alice: '2026-02-01',
      bob: '2026-01-01',
      charlie: '2026-03-01',
    };

    expect(suggestNextPayer(net, ['alice', 'bob', 'charlie'], lastPaidAt)).toBe('alice');
  });

  test('returns null if no participant has a negative balance', () => {
    const net = new Map([
      ['alice', 0],
      ['bob', 200],
      ['charlie', 500],
    ]);
    const lastPaidAt = {};

    expect(suggestNextPayer(net, ['alice', 'bob', 'charlie'], lastPaidAt)).toBeNull();
  });

  test('returns null if participant list is empty', () => {
    const net = new Map([['alice', -500]]);
    expect(suggestNextPayer(net, [], {})).toBeNull();
  });

  test('ignores people not in participantIds even if they have more negative balance', () => {
    const net = new Map([
      ['alice', -1000],
      ['bob', -200],
      ['charlie', 1200],
    ]);
    const lastPaidAt = {};

    // Only bob and charlie are participating
    expect(suggestNextPayer(net, ['bob', 'charlie'], lastPaidAt)).toBe('bob');
  });

  test('tie-break: undefined in lastPaidAt counts as oldest', () => {
    const net = new Map([
      ['alice', -500],
      ['bob', -500],
    ]);
    const lastPaidAt = {
      alice: '2026-01-01',
      bob: undefined, // bob has never paid -> oldest
    };

    expect(suggestNextPayer(net, ['alice', 'bob'], lastPaidAt)).toBe('bob');
  });

  test('tie-break: earlier date in lastPaidAt is older', () => {
    const net = new Map([
      ['alice', -500],
      ['bob', -500],
    ]);
    const lastPaidAt = {
      alice: '2026-01-15T00:00:00Z', // older
      bob: '2026-02-15T00:00:00Z',
    };

    expect(suggestNextPayer(net, ['alice', 'bob'], lastPaidAt)).toBe('alice');
  });

  test('tie-break: lowest personId when balance and date tie', () => {
    const net = new Map([
      ['charlie', -500],
      ['alice', -500],
    ]);
    const lastPaidAt = {
      charlie: '2026-01-01',
      alice: '2026-01-01',
    };

    expect(suggestNextPayer(net, ['charlie', 'alice'], lastPaidAt)).toBe('alice');
  });

  test('tie-break: lowest personId when both have undefined lastPaidAt', () => {
    const net = new Map([
      ['user_z', -300],
      ['user_a', -300],
    ]);
    const lastPaidAt = {};

    expect(suggestNextPayer(net, ['user_z', 'user_a'], lastPaidAt)).toBe('user_a');
  });

  test('supports plain Record for net balances', () => {
    const net = {
      alice: -100,
      bob: 100,
    };
    expect(suggestNextPayer(net, ['alice', 'bob'], {})).toBe('alice');
  });
});
