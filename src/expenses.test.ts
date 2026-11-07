import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getPlatformProxy } from 'wrangler';
import app from './index';
import { applyAllMigrations } from './test-utils';

const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: 'wrangler.jsonc',
  remoteBindings: false,
  persist: false,
});

beforeAll(async () => {
  await applyAllMigrations(proxy.env.DB);
});

afterAll(() => proxy.dispose());

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

function localISODate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test('GET /api/expenses?date_range=this_month returns the ledger in paise', async () => {
  const first = await app.request(
    'http://localhost/api/expenses?date_range=this_month',
    { method: 'GET' },
    { DB: proxy.env.DB, CLERK_GATE: gate },
  );
  expect(first.status).toBe(200);
  const empty = await first.json() as {
    expenses: unknown[];
    stats: { monthSpend: number; dailyTrends: unknown[] };
  };
  expect(empty.expenses).toEqual([]);
  expect(empty.stats.monthSpend).toBe(0);
  expect(empty.stats.dailyTrends).toEqual([]);

  const today = localISODate();
  const now = new Date().toISOString();
  await proxy.env.DB
    .prepare(
      `INSERT INTO expenses (id, amount_paise, description, category, payment_method, date, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind('exp-today', 4200, 'Tea', 'Food', 'UPI', today, null, now, now)
    .run();
  await proxy.env.DB
    .prepare(
      `INSERT INTO expenses (id, amount_paise, description, category, payment_method, date, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind('exp-old', 9900, 'Old', 'Food', 'Cash', '2000-01-02', null, now, now)
    .run();

  const second = await app.request(
    'http://localhost/api/expenses?date_range=this_month',
    { method: 'GET' },
    { DB: proxy.env.DB, CLERK_GATE: gate },
  );
  expect(second.status).toBe(200);
  const body = await second.json() as {
    expenses: { id: string; amount_paise: number }[];
    stats: { totalSpend: number; monthSpend: number; count: number };
  };
  expect(body.expenses.map((row) => row.id)).toEqual(['exp-today']);
  expect(body.stats.totalSpend).toBe(4200);
  expect(body.stats.monthSpend).toBe(4200);
  expect(body.stats.count).toBe(1);
}, 30_000);

test('POST /api/expenses with amount_paise and amount_expr saves and returns in GET', async () => {
  const createRes = await app.request(
    'http://localhost/api/expenses',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount_paise: 417000,
        amount_expr: '50 × 83.4',
        description: 'US Software',
        category: 'Others',
        payment_method: 'Credit Card',
        date: localISODate(),
      }),
    },
    { DB: proxy.env.DB, CLERK_GATE: gate },
  );
  expect(createRes.status).toBe(201);
  const created = (await createRes.json()) as { success: boolean; id: string };
  expect(created.success).toBe(true);

  const getRes = await app.request(
    'http://localhost/api/expenses?date_range=this_month',
    { method: 'GET' },
    { DB: proxy.env.DB, CLERK_GATE: gate },
  );
  expect(getRes.status).toBe(200);
  const data = (await getRes.json()) as {
    expenses: { id: string; amount_paise: number; amount_expr: string | null }[];
  };
  const found = data.expenses.find((e) => e.id === created.id);
  expect(found).toBeDefined();
  expect(found?.amount_paise).toBe(417000);
  expect(found?.amount_expr).toBe('50 × 83.4');
});

describe('Chunk 08: Group Expenses Personal Integration & Transfers', () => {
  let friend1Id: string;
  let friend2Id: string;
  let groupId: string;
  let groupExpenseId: string;
  const today = localISODate();

  test('setup friends and group', async () => {
    // 1. Create friend 1
    const resF1 = await app.request(
      'http://localhost/api/people',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Rahul', upi_vpa: 'rahul@upi' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resF1.status).toBe(201);
    const f1 = (await resF1.json()) as { id: string };
    friend1Id = f1.id;

    // 2. Create friend 2
    const resF2 = await app.request(
      'http://localhost/api/people',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Sneha', phone: '9876543210' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resF2.status).toBe(201);
    const f2 = (await resF2.json()) as { id: string };
    friend2Id = f2.id;

    // 3. Create group with friend1, friend2 ('me' is automatically member) -> 3 members total
    const resGrp = await app.request(
      'http://localhost/api/groups',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Flatmates',
          emoji: '🏠',
          kind: 'home',
          member_ids: [friend1Id, friend2Id],
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resGrp.status).toBe(201);
    const grp = (await resGrp.json()) as { id: string; member_count: number };
    groupId = grp.id;
    expect(grp.member_count).toBe(3);
  });

  test('group expense of ₹3,000 paid by me, split 3 ways, adds ₹1,000 (100,000 paise) to monthSpend and category breakdown', async () => {
    // Check initial monthSpend before group expense
    const beforeRes = await app.request(
      'http://localhost/api/expenses?date_range=this_month',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const beforeData = (await beforeRes.json()) as { stats: { monthSpend: number } };
    const initialMonthSpend = beforeData.stats.monthSpend;

    // Create group expense: ₹3,000 (300,000 paise) paid by 'me', split equally 3 ways
    // My share is ₹1,000 (100,000 paise)
    const expRes = await app.request(
      `http://localhost/api/groups/${groupId}/expenses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Groceries & Provisions',
          amount_paise: 300000,
          paid_by: 'me',
          category: 'Groceries',
          date: today,
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(expRes.status).toBe(201);
    const expBody = (await expRes.json()) as { id: string; expense: any };
    groupExpenseId = expBody.id;

    // Check GET /api/expenses includes my share (100,000 paise)
    const afterRes = await app.request(
      'http://localhost/api/expenses?date_range=this_month',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(afterRes.status).toBe(200);
    const afterData = (await afterRes.json()) as {
      expenses: {
        id: string;
        amount_paise: number;
        source: string;
        group_id: string;
        group_name: string;
        group_expense_id: string;
        category: string;
      }[];
      stats: {
        monthSpend: number;
        categoryBreakdown: { category: string; total: number }[];
      };
    };

    // Personal spending goes up by ₹1,000 (100,000 paise)
    expect(afterData.stats.monthSpend).toBe(initialMonthSpend + 100000);

    // Category breakdown has Groceries with at least 100,000 paise
    const groceries = afterData.stats.categoryBreakdown.find((c) => c.category === 'Groceries');
    expect(groceries).toBeDefined();
    expect(groceries?.total).toBe(100000);

    // Group expense item is present with source: 'group' and proper metadata
    const item = afterData.expenses.find((e) => e.group_expense_id === groupExpenseId);
    expect(item).toBeDefined();
    expect(item?.source).toBe('group');
    expect(item?.amount_paise).toBe(100000);
    expect(item?.group_id).toBe(groupId);
    expect(item?.group_name).toBe('Flatmates');
  });

  test('include_groups=0 excludes group expenses from spending and list', async () => {
    const res = await app.request(
      'http://localhost/api/expenses?date_range=this_month&include_groups=0',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      expenses: { id: string; source: string; group_expense_id?: string }[];
      stats: { monthSpend: number; categoryBreakdown: { category: string; total: number }[] };
    };

    // The group expense item should not be in the list
    const foundGroupItem = data.expenses.find((e) => e.group_expense_id === groupExpenseId);
    expect(foundGroupItem).toBeUndefined();

    // Groceries category should not be present
    const groceries = data.stats.categoryBreakdown.find((c) => c.category === 'Groceries');
    expect(groceries).toBeUndefined();

    // Month spend should only be personal expenses (4200 + 417000 = 421200)
    expect(data.stats.monthSpend).toBe(421200);
  });

  test('a transfer adds nothing to personal spending', async () => {
    // Record current monthSpend
    const beforeRes = await app.request(
      'http://localhost/api/expenses?date_range=this_month',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const beforeData = (await beforeRes.json()) as {
      stats: { monthSpend: number; totalSpend: number };
    };
    const beforeMonthSpend = beforeData.stats.monthSpend;
    const beforeTotalSpend = beforeData.stats.totalSpend;

    // Friend 1 transfers ₹1,000 (100,000 paise) to me to settle up
    const transferRes = await app.request(
      `http://localhost/api/groups/${groupId}/transfers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_person: friend1Id,
          to_person: 'me',
          amount_paise: 100000,
          date: today,
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(transferRes.status).toBe(201);

    // Also me transferring to Friend 2 ₹500 (50,000 paise)
    const transfer2Res = await app.request(
      `http://localhost/api/groups/${groupId}/transfers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_person: 'me',
          to_person: friend2Id,
          amount_paise: 50000,
          date: today,
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(transfer2Res.status).toBe(201);

    // Check GET /api/expenses: monthSpend and totalSpend must remain unchanged
    const afterRes = await app.request(
      'http://localhost/api/expenses?date_range=this_month',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const afterData = (await afterRes.json()) as {
      stats: { monthSpend: number; totalSpend: number };
    };
    expect(afterData.stats.monthSpend).toBe(beforeMonthSpend);
    expect(afterData.stats.totalSpend).toBe(beforeTotalSpend);
  });
});
