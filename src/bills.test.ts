import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getPlatformProxy } from 'wrangler';
import app from './index';
import { applyAllMigrations } from './test-utils';
import {
  computePeriodsDue,
  getDayOfYear,
  getLastDayOfMonth,
  isLeapYear,
  nextDueAfter,
} from './services/bills';

describe('nextDueAfter unit tests', () => {
  test('isLeapYear and getLastDayOfMonth', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);

    expect(getLastDayOfMonth(2024, 2)).toBe(29);
    expect(getLastDayOfMonth(2025, 2)).toBe(28);
    expect(getLastDayOfMonth(2026, 4)).toBe(30);
    expect(getLastDayOfMonth(2026, 12)).toBe(31);
  });

  describe('weekly cadence', () => {
    // 2026-11-07 is Saturday (day 6)
    test('same weekday advances 7 days', () => {
      expect(nextDueAfter('2026-11-07', 'weekly', 6)).toBe('2026-11-14');
    });

    test('weekday later in the week', () => {
      // 2026-11-02 is Monday (day 1); target Wednesday (day 3)
      expect(nextDueAfter('2026-11-02', 'weekly', 3)).toBe('2026-11-04');
    });

    test('weekday earlier in the week rolls over to next week', () => {
      // 2026-11-05 is Thursday (day 4); target Tuesday (day 2)
      expect(nextDueAfter('2026-11-05', 'weekly', 2)).toBe('2026-11-10');
    });

    test('sunday anchor (day 0)', () => {
      // 2026-11-07 is Saturday (6); target Sunday (0)
      expect(nextDueAfter('2026-11-07', 'weekly', 0)).toBe('2026-11-08');
      // Sunday to next Sunday
      expect(nextDueAfter('2026-11-08', 'weekly', 0)).toBe('2026-11-15');
    });
  });

  describe('monthly cadence with month-end and leap years', () => {
    test('standard monthly advance', () => {
      expect(nextDueAfter('2026-05-15', 'monthly', 15)).toBe('2026-06-15');
    });

    test('candidate in same month if date is before anchor day', () => {
      expect(nextDueAfter('2026-05-10', 'monthly', 15)).toBe('2026-05-15');
    });

    test('month-end clamping: 31st to 30 Apr', () => {
      expect(nextDueAfter('2026-03-31', 'monthly', 31)).toBe('2026-04-30');
    });

    test('month-end clamping: 30 Apr to 31 May', () => {
      expect(nextDueAfter('2026-04-30', 'monthly', 31)).toBe('2026-05-31');
    });

    test('month-end clamping: 31 Jan to 28 Feb in non-leap year', () => {
      expect(nextDueAfter('2025-01-31', 'monthly', 31)).toBe('2025-02-28');
    });

    test('month-end clamping: 31 Jan to 29 Feb in leap year', () => {
      expect(nextDueAfter('2024-01-31', 'monthly', 31)).toBe('2024-02-29');
    });

    test('month-end advancing from 28 Feb (with anchor 31) to 31 Mar', () => {
      expect(nextDueAfter('2025-02-28', 'monthly', 31)).toBe('2025-03-31');
    });

    test('month-end advancing from 29 Feb (with anchor 31) to 31 Mar in leap year', () => {
      expect(nextDueAfter('2024-02-29', 'monthly', 31)).toBe('2024-03-31');
    });

    test('year rollover: 31 Dec to 31 Jan', () => {
      expect(nextDueAfter('2026-12-31', 'monthly', 31)).toBe('2027-01-31');
    });
  });

  describe('yearly cadence', () => {
    test('regular yearly advance', () => {
      const doy = getDayOfYear('2026-11-07');
      expect(nextDueAfter('2026-11-07', 'yearly', doy)).toBe('2027-11-07');
    });

    test('candidate in current year if date is earlier', () => {
      const doy = getDayOfYear('2026-11-07');
      expect(nextDueAfter('2026-10-01', 'yearly', doy)).toBe('2026-11-07');
    });

    test('leap year day 366 (Dec 31) in non-leap year clamps to Dec 31', () => {
      expect(nextDueAfter('2024-12-31', 'yearly', 366)).toBe('2025-12-31');
    });

    test('yearly Feb 29 clamps to Feb 28 in non-leap years and returns in leap years', () => {
      const doy = getDayOfYear('2024-02-29');
      expect(nextDueAfter('2024-02-29', 'yearly', doy)).toBe('2025-02-28');
      expect(nextDueAfter('2027-02-28', 'yearly', doy)).toBe('2028-02-29');
    });

    test('yearly anchor does not drift across leap years', () => {
      const doy = getDayOfYear('2026-11-07');
      expect(nextDueAfter('2027-11-07', 'yearly', doy)).toBe('2028-11-07');
      expect(nextDueAfter('2028-11-07', 'yearly', doy)).toBe('2029-11-07');
      expect(nextDueAfter('2027-03-01', 'yearly', getDayOfYear('2027-03-01'))).toBe('2028-03-01');
    });
  });

  describe('computePeriodsDue', () => {
    test('upcoming bill returns 0', () => {
      expect(computePeriodsDue('2026-11-10', 'monthly', 10, '2026-11-07')).toBe(0);
    });

    test('bill due today returns 1', () => {
      expect(computePeriodsDue('2026-11-07', 'monthly', 7, '2026-11-07')).toBe(1);
    });

    test('bill 1 period overdue returns 1', () => {
      expect(computePeriodsDue('2026-10-25', 'monthly', 25, '2026-11-07')).toBe(1);
    });

    test('bill 3 periods overdue returns 3', () => {
      // Due Aug 1, Sept 1, Oct 1 (as of Oct 15)
      expect(computePeriodsDue('2026-08-01', 'monthly', 1, '2026-10-15')).toBe(3);
    });
  });
});

const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: 'wrangler.jsonc',
  remoteBindings: false,
  persist: false,
});

describe('Recurring Bills API', () => {
  const gate = {
    fetch: async () =>
      new Response(null, {
        status: 204,
        headers: { 'x-clerk-gate': 'ok' },
      }),
    connect: () => {
      throw new Error('not used');
    },
  } as Fetcher;

  const env = { DB: proxy.env.DB, CLERK_GATE: gate };

  beforeAll(async () => {
    await applyAllMigrations(proxy.env.DB);
  });

  afterAll(() => proxy.dispose());

  let personalBillId: string;
  let sharedBillId: string;
  let varyingBillId: string;
  let testGroupId: string;
  let aliceId: string;

  test('setup test person and group for shared bills', async () => {
    // 1. Create Alice
    const resA = await app.request(
      'http://localhost/api/people',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice Walker', upi_vpa: 'alice@okhdfc' }),
      },
      env
    );
    expect(resA.status).toBe(201);
    const alice = (await resA.json()) as { id: string };
    aliceId = alice.id;

    // 2. Create Group with 'me' and Alice
    const resG = await app.request(
      'http://localhost/api/groups',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Flat 402',
          kind: 'home',
          member_ids: [aliceId],
        }),
      },
      env
    );
    expect(resG.status).toBe(201);
    const group = (await resG.json()) as { id: string };
    testGroupId = group.id;
  });

  test('POST /api/bills creates personal bill', async () => {
    const res = await app.request(
      'http://localhost/api/bills',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Electricity Bill',
          amount_paise: 250000, // ₹2,500
          category: 'Bills & Utilities',
          payment_method: 'UPI',
          cadence: 'monthly',
          anchor_day: 10,
          first_due_date: '2026-11-10',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; success: boolean };
    expect(body.success).toBe(true);
    personalBillId = body.id;

    // Check in database
    const row = await proxy.env.DB.prepare('SELECT * FROM recurring_bills WHERE id = ?')
      .bind(personalBillId)
      .first<{ title: string; amount_paise: number; group_id: string | null }>();
    expect(row?.title).toBe('Electricity Bill');
    expect(row?.amount_paise).toBe(250000);
    expect(row?.group_id).toBeNull();
  });

  test('POST /api/bills creates shared bill with participants', async () => {
    const res = await app.request(
      'http://localhost/api/bills',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Wi-Fi Internet',
          amount_paise: 119900, // ₹1,199
          category: 'Bills & Utilities',
          cadence: 'monthly',
          anchor_day: 5,
          first_due_date: '2026-11-05',
          group_id: testGroupId,
          paid_by: 'me',
          participant_ids: ['me', aliceId],
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; success: boolean };
    expect(body.success).toBe(true);
    sharedBillId = body.id;

    const participants = await proxy.env.DB.prepare(
      'SELECT person_id FROM recurring_bill_participants WHERE bill_id = ? ORDER BY person_id ASC'
    )
      .bind(sharedBillId)
      .all<{ person_id: string }>();

    const pIds = (participants.results || []).map((p) => p.person_id).sort();
    expect(pIds).toEqual(['aliceId', 'me'].map((x) => (x === 'aliceId' ? aliceId : 'me')).sort());
  });

  test('POST /api/bills creates bill whose amount varies (amount_paise: null)', async () => {
    const res = await app.request(
      'http://localhost/api/bills',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Credit Card Bill',
          amount_paise: null,
          cadence: 'monthly',
          anchor_day: 20,
          first_due_date: '2026-11-20',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    varyingBillId = body.id;

    const row = await proxy.env.DB.prepare('SELECT amount_paise FROM recurring_bills WHERE id = ?')
      .bind(varyingBillId)
      .first<{ amount_paise: number | null }>();
    expect(row?.amount_paise).toBeNull();
  });

  test('GET /api/bills and GET /api/bills/due-count', async () => {
    const resList = await app.request('http://localhost/api/bills', { method: 'GET' }, env);
    expect(resList.status).toBe(200);
    const list = (await resList.json()) as {
      due: any[];
      upcoming: any[];
    };

    // As of 2026-11-07:
    // Wi-Fi (due 2026-11-05) is <= 2026-11-07 -> due
    // Electricity (due 2026-11-10) is > 2026-11-07 -> upcoming
    // Credit Card (due 2026-11-20) is > 2026-11-07 -> upcoming
    const wifi = list.due.find((b) => b.id === sharedBillId);
    expect(wifi).toBeDefined();
    expect(wifi.kind).toBe('shared');
    expect(wifi.group_name).toBe('Flat 402');
    expect(wifi.is_overdue).toBe(true);

    const electricity = list.upcoming.find((b) => b.id === personalBillId);
    expect(electricity).toBeDefined();
    expect(electricity.kind).toBe('personal');
    expect(electricity.is_overdue).toBe(false);

    const resCount = await app.request('http://localhost/api/bills/due-count', { method: 'GET' }, env);
    expect(resCount.status).toBe(200);
    const countBody = (await resCount.json()) as { count: number };
    expect(countBody.count).toBe(list.due.length);
  });

  test('paying a personal bill creates an expense and moves next_due in one batch', async () => {
    const res = await app.request(
      `http://localhost/api/bills/${personalBillId}/pay`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      expense_id: string;
      next_due: string;
    };
    expect(data.success).toBe(true);
    expect(data.next_due).toBe('2026-12-10'); // moved from 2026-11-10 to 2026-12-10

    // Check expense created in expenses table
    const expense = await proxy.env.DB.prepare('SELECT * FROM expenses WHERE id = ?')
      .bind(data.expense_id)
      .first<{ description: string; amount_paise: number; category: string }>();
    expect(expense?.description).toBe('Electricity Bill');
    expect(expense?.amount_paise).toBe(250000);
    expect(expense?.category).toBe('Bills & Utilities');

    // Check next_due updated in recurring_bills
    const bill = await proxy.env.DB.prepare('SELECT next_due FROM recurring_bills WHERE id = ?')
      .bind(personalBillId)
      .first<{ next_due: string }>();
    expect(bill?.next_due).toBe('2026-12-10');
  });

  test('paying a shared bill creates a group expense with correct shares and moves next_due', async () => {
    const res = await app.request(
      `http://localhost/api/bills/${sharedBillId}/pay`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      expense_id: string;
      next_due: string;
    };
    expect(data.success).toBe(true);
    expect(data.next_due).toBe('2026-12-05'); // moved from 2026-11-05

    // Check group expense created
    const groupExpense = await proxy.env.DB.prepare('SELECT * FROM group_expenses WHERE id = ?')
      .bind(data.expense_id)
      .first<{ group_id: string; description: string; amount_paise: number; paid_by: string }>();
    expect(groupExpense?.group_id).toBe(testGroupId);
    expect(groupExpense?.description).toBe('Wi-Fi Internet');
    expect(groupExpense?.amount_paise).toBe(119900);
    expect(groupExpense?.paid_by).toBe('me');

    // Check expense shares: ₹1,199 (119900 paise) split 2 ways: 59950 each
    const shares = await proxy.env.DB.prepare(
      'SELECT person_id, amount_paise FROM expense_shares WHERE expense_id = ?'
    )
      .bind(data.expense_id)
      .all<{ person_id: string; amount_paise: number }>();

    expect(shares.results?.length).toBe(2);
    const totalShares = (shares.results || []).reduce((sum, s) => sum + s.amount_paise, 0);
    expect(totalShares).toBe(119900);
  });

  test('a bill whose amount varies needs an amount', async () => {
    // 1. Pay without amount -> fails 400
    const resFail = await app.request(
      `http://localhost/api/bills/${varyingBillId}/pay`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      env
    );
    expect(resFail.status).toBe(400);

    // 2. Pay with amount -> succeeds
    const resOk = await app.request(
      `http://localhost/api/bills/${varyingBillId}/pay`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_paise: 843200 }), // ₹8,432
      },
      env
    );
    expect(resOk.status).toBe(200);
    const data = (await resOk.json()) as { expense_id: string; next_due: string };
    expect(data.next_due).toBe('2026-12-20');

    const exp = await proxy.env.DB.prepare('SELECT amount_paise FROM expenses WHERE id = ?')
      .bind(data.expense_id)
      .first<{ amount_paise: number }>();
    expect(exp?.amount_paise).toBe(843200);
  });

  test('skip moves next_due and logs activity', async () => {
    // Current next_due for personalBillId is 2026-12-10
    const res = await app.request(
      `http://localhost/api/bills/${personalBillId}/skip`,
      { method: 'POST' },
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; next_due: string; activity_id: string };
    expect(data.success).toBe(true);
    expect(data.next_due).toBe('2027-01-10');

    // Verify activity entry summary format: "Skipped Electricity Bill (Dec 2026)"
    const activity = await proxy.env.DB.prepare('SELECT summary FROM activity WHERE id = ?')
      .bind(data.activity_id)
      .first<{ summary: string }>();
    expect(activity?.summary).toBe('Skipped Electricity Bill (Dec 2026)');
  });

  test('restoring a deleted bill', async () => {
    // 1. Delete the bill
    const resDel = await app.request(
      `http://localhost/api/bills/${personalBillId}`,
      { method: 'DELETE' },
      env
    );
    expect(resDel.status).toBe(200);
    const delBody = (await resDel.json()) as { activity_id: string };

    // Confirm soft-deleted
    const deletedRow = await proxy.env.DB.prepare('SELECT deleted_at FROM recurring_bills WHERE id = ?')
      .bind(personalBillId)
      .first<{ deleted_at: string | null }>();
    expect(deletedRow?.deleted_at).not.toBeNull();

    // 2. Restore via POST /api/activity/:id/restore
    const resRestore = await app.request(
      `http://localhost/api/activity/${delBody.activity_id}/restore`,
      { method: 'POST' },
      env
    );
    expect(resRestore.status).toBe(200);

    // 3. Confirm bill is restored
    const restoredRow = await proxy.env.DB.prepare('SELECT deleted_at, title FROM recurring_bills WHERE id = ?')
      .bind(personalBillId)
      .first<{ deleted_at: string | null; title: string }>();
    expect(restoredRow?.deleted_at).toBeNull();
    expect(restoredRow?.title).toBe('Electricity Bill');
  });
});
