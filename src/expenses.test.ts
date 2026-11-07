import { afterAll, beforeAll, expect, test } from 'bun:test';
import { getPlatformProxy } from 'wrangler';
import app from './index';
import { applyFoundationMigration } from './test-utils';

const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: 'wrangler.jsonc',
  remoteBindings: false,
  persist: false,
});

beforeAll(async () => {
  await applyFoundationMigration(proxy.env.DB);
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

test('GET /api/expenses?date_range=this_month returns the ledger', async () => {
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
    expenses: { id: string; amount: number }[];
    stats: { totalSpend: number; monthSpend: number; count: number };
  };
  expect(body.expenses.map((row) => row.id)).toEqual(['exp-today']);
  expect(body.stats.totalSpend).toBe(42);
  expect(body.stats.monthSpend).toBe(42);
  expect(body.stats.count).toBe(1);
}, 30_000);
