import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
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

describe('Activity log & expenses lifecycle', () => {
  let createdExpenseId: string;
  let createActivityId: string;
  let updateActivityId: string;
  let deleteActivityId: string;

  test('POST /api/expenses creates expense and writes create activity entry', async () => {
    const res = await app.request(
      'http://localhost/api/expenses',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 2400,
          amount_expr: '2000 + 400',
          description: 'Dinner',
          category: 'Food',
          payment_method: 'UPI',
          date: new Date().toISOString().split('T')[0],
          notes: 'Dinner with team',
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; id: string; activity_id: string };
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
    expect(body.activity_id).toBeDefined();

    createdExpenseId = body.id;
    createActivityId = body.activity_id;

    // Check expense row in DB
    const expense = await proxy.env.DB
      .prepare('SELECT * FROM expenses WHERE id = ?')
      .bind(createdExpenseId)
      .first<{
        id: string;
        amount_paise: number;
        amount_expr: string;
        description: string;
        deleted_at: string | null;
      }>();
    expect(expense?.amount_paise).toBe(240000);
    expect(expense?.amount_expr).toBe('2000 + 400');
    expect(expense?.deleted_at).toBeNull();

    // Check activity row in DB
    const activity = await proxy.env.DB
      .prepare('SELECT * FROM activity WHERE id = ?')
      .bind(createActivityId)
      .first<{
        id: string;
        action: string;
        summary: string;
        before_json: string | null;
        after_json: string;
      }>();
    expect(activity?.action).toBe('create');
    expect(activity?.summary).toBe('Added Dinner');
    expect(activity?.before_json).toBeNull();
    const after = JSON.parse(activity!.after_json);
    expect(after.id).toBe(createdExpenseId);
    expect(after.amount_paise).toBe(240000);
    expect(after.category).toBe('Food');
  });

  test('PUT /api/expenses/:id updates expense and writes diff activity entry with ₹ formatting', async () => {
    const res = await app.request(
      `http://localhost/api/expenses/${createdExpenseId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 2700,
          description: 'Dinner',
          category: 'Travel',
          payment_method: 'Credit Card',
          date: new Date().toISOString().split('T')[0],
          notes: 'Dinner and taxi',
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; activity_id: string };
    expect(body.success).toBe(true);
    expect(body.activity_id).toBeDefined();

    updateActivityId = body.activity_id;

    const activity = await proxy.env.DB
      .prepare('SELECT * FROM activity WHERE id = ?')
      .bind(updateActivityId)
      .first<{
        id: string;
        action: string;
        summary: string;
        before_json: string;
        after_json: string;
      }>();

    expect(activity?.action).toBe('update');
    // Summary should format amount_paise as ₹ (en-IN): amount ₹2,400 → ₹2,700
    expect(activity?.summary).toContain('Dinner:');
    expect(activity?.summary).toContain('amount ₹2,400 → ₹2,700');
    expect(activity?.summary).toContain('category Food → Travel');

    const before = JSON.parse(activity!.before_json);
    const after = JSON.parse(activity!.after_json);
    expect(before.amount_paise).toBe(240000);
    expect(after.amount_paise).toBe(270000);
    expect(before.category).toBe('Food');
    expect(after.category).toBe('Travel');
  });

  test('DELETE /api/expenses/:id soft-deletes and writes delete activity entry', async () => {
    const res = await app.request(
      `http://localhost/api/expenses/${createdExpenseId}`,
      { method: 'DELETE' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; activity_id: string };
    expect(body.success).toBe(true);
    expect(body.activity_id).toBeDefined();

    deleteActivityId = body.activity_id;

    // Verify row is soft deleted in DB
    const row = await proxy.env.DB
      .prepare('SELECT deleted_at FROM expenses WHERE id = ?')
      .bind(createdExpenseId)
      .first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).not.toBeNull();

    // Verify row is not returned by GET /api/expenses
    const listRes = await app.request(
      'http://localhost/api/expenses?date_range=all',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );
    const list = (await listRes.json()) as { expenses: { id: string }[] };
    expect(list.expenses.find((e) => e.id === createdExpenseId)).toBeUndefined();

    // Verify activity entry
    const activity = await proxy.env.DB
      .prepare('SELECT * FROM activity WHERE id = ?')
      .bind(deleteActivityId)
      .first<{
        id: string;
        action: string;
        summary: string;
        before_json: string;
        after_json: string | null;
      }>();
    expect(activity?.action).toBe('delete');
    expect(activity?.summary).toBe('Deleted Dinner');
    expect(activity?.after_json).toBeNull();
    const before = JSON.parse(activity!.before_json);
    expect(before.id).toBe(createdExpenseId);
  });

  test('POST /api/activity/:id/restore restores a soft-deleted expense', async () => {
    // Restore using the delete activity entry
    const res = await app.request(
      `http://localhost/api/activity/${deleteActivityId}/restore`,
      { method: 'POST' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; activity_id: string };
    expect(body.success).toBe(true);
    expect(body.activity_id).toBeDefined();

    // Verify deleted_at is cleared in expenses
    const row = await proxy.env.DB
      .prepare('SELECT deleted_at, amount_paise FROM expenses WHERE id = ?')
      .bind(createdExpenseId)
      .first<{ deleted_at: string | null; amount_paise: number }>();
    expect(row?.deleted_at).toBeNull();
    expect(row?.amount_paise).toBe(270000);

    // Verify it appears in GET /api/expenses
    const listRes = await app.request(
      'http://localhost/api/expenses?date_range=all',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );
    const list = (await listRes.json()) as { expenses: { id: string; amount: number }[] };
    const found = list.expenses.find((e) => e.id === createdExpenseId);
    expect(found).toBeDefined();
    expect(found?.amount).toBe(2700);

    // Verify restore activity row
    const restoreActivity = await proxy.env.DB
      .prepare('SELECT * FROM activity WHERE id = ?')
      .bind(body.activity_id)
      .first<{ action: string; summary: string }>();
    expect(restoreActivity?.action).toBe('restore');
    expect(restoreActivity?.summary).toBe('Restored Dinner');
  });

  test('POST /api/activity/:id/restore reverts an older version', async () => {
    // Currently amount is 2700. Restore using the createActivityId where amount was 2400.
    const res = await app.request(
      `http://localhost/api/activity/${createActivityId}/restore`,
      { method: 'POST' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; activity_id: string };
    expect(body.success).toBe(true);

    // Verify amount_paise in expenses is reverted to 240000 (₹2400) and category back to Food
    const row = await proxy.env.DB
      .prepare('SELECT amount_paise, category, deleted_at FROM expenses WHERE id = ?')
      .bind(createdExpenseId)
      .first<{ amount_paise: number; category: string; deleted_at: string | null }>();
    expect(row?.amount_paise).toBe(240000);
    expect(row?.category).toBe('Food');
    expect(row?.deleted_at).toBeNull();
  });

  test('GET /api/activity lists entries with cursor pagination & parsed before/after JSON', async () => {
    const res = await app.request(
      'http://localhost/api/activity?entity_type=expense&limit=2',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: {
        id: string;
        at: string;
        entity_type: string;
        action: string;
        summary: string;
        before: any;
        after: any;
      }[];
      next_cursor: string | null;
    };

    expect(body.items.length).toBe(2);
    expect(body.next_cursor).not.toBeNull();
    expect(body.items[0].before).toBeDefined();
    expect(body.items[0].after).toBeDefined();

    // Fetch page 2 using cursor
    const resPage2 = await app.request(
      `http://localhost/api/activity?entity_type=expense&limit=2&before=${encodeURIComponent(body.next_cursor!)}`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );
    expect(resPage2.status).toBe(200);
    const bodyPage2 = (await resPage2.json()) as {
      items: { id: string }[];
    };
    expect(bodyPage2.items.length).toBeGreaterThan(0);
    expect(bodyPage2.items.map((i) => i.id)).not.toContain(body.items[0].id);
  });

  test('GET /api/activity/entity/:type/:id returns full entity history', async () => {
    const res = await app.request(
      `http://localhost/api/activity/entity/expense/${createdExpenseId}`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { id: string; action: string; summary: string }[];
    };
    // Should have create, update, delete, restore, restore
    expect(body.items.length).toBeGreaterThanOrEqual(5);
    const actions = body.items.map((i) => i.action);
    expect(actions).toContain('create');
    expect(actions).toContain('update');
    expect(actions).toContain('delete');
    expect(actions).toContain('restore');
  });

  test('date range filters and CSV export behave correctly', async () => {
    // Insert expenses in different months
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const thisMonthDate = `${currentYear}-${currentMonth}-15`;

    const lastMonthDateObj = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const lastMonthStr = `${lastMonthDateObj.getFullYear()}-${String(lastMonthDateObj.getMonth() + 1).padStart(2, '0')}-15`;

    const nowIso = new Date().toISOString();

    await proxy.env.DB.batch([
      proxy.env.DB.prepare(
        'INSERT INTO expenses (id, amount_paise, description, category, payment_method, date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind('range-this-month', 10000, 'Current Month Item', 'Food', 'UPI', thisMonthDate, null, nowIso, nowIso),
      proxy.env.DB.prepare(
        'INSERT INTO expenses (id, amount_paise, description, category, payment_method, date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind('range-last-month', 20000, 'Last Month Item', 'Shopping', 'UPI', lastMonthStr, null, nowIso, nowIso),
    ]);

    // Test this_month filter
    const thisMonthRes = await app.request(
      'http://localhost/api/expenses?date_range=this_month',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );
    expect(thisMonthRes.status).toBe(200);
    const thisMonthData = (await thisMonthRes.json()) as { expenses: { id: string }[] };
    const idsThisMonth = thisMonthData.expenses.map((e) => e.id);
    expect(idsThisMonth).toContain('range-this-month');
    expect(idsThisMonth).not.toContain('range-last-month');

    // Test last_month filter
    const lastMonthRes = await app.request(
      'http://localhost/api/expenses?date_range=last_month',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );
    expect(lastMonthRes.status).toBe(200);
    const lastMonthData = (await lastMonthRes.json()) as { expenses: { id: string }[] };
    const idsLastMonth = lastMonthData.expenses.map((e) => e.id);
    expect(idsLastMonth).toContain('range-last-month');
    expect(idsLastMonth).not.toContain('range-this-month');

    // Test CSV export
    const csvRes = await app.request(
      'http://localhost/api/export?date_range=all',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('content-type')).toContain('text/csv');
    const csvText = await csvRes.text();
    expect(csvText).toContain('ID,Date,Amount (INR),Description,Category,Payment Method,Notes,Created At');
    expect(csvText).toContain('100.00'); // 10000 paise formatted as 100.00
    expect(csvText).toContain('200.00'); // 20000 paise formatted as 200.00
  });

  test('restoring an unregistered entity type returns 400', async () => {
    // Insert a dummy activity entry with unregistered entity type
    const dummyId = crypto.randomUUID();
    await proxy.env.DB
      .prepare(
        "INSERT INTO activity (id, at, entity_type, entity_id, action, summary) VALUES (?, datetime('now'), 'unknown_type', '123', 'create', 'Unknown')"
      )
      .bind(dummyId)
      .run();

    const res = await app.request(
      `http://localhost/api/activity/${dummyId}/restore`,
      { method: 'POST' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('No restorer registered');
  });

  test('restoring non-existent activity id returns 404', async () => {
    const res = await app.request(
      'http://localhost/api/activity/non-existent-id/restore',
      { method: 'POST' },
      { DB: proxy.env.DB, CLERK_GATE: gate },
    );
    expect(res.status).toBe(404);
  });
});
