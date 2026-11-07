import { beforeAll, describe, expect, test } from 'bun:test';
import app from './index';
import { Database } from 'bun:sqlite';

function createMockD1() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      is_user INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE expenses (
      id TEXT PRIMARY KEY,
      amount_paise INTEGER NOT NULL,
      amount_expr TEXT,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE activity (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      group_id TEXT,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT
    );
  `);

  return {
    prepare: (query: string) => {
      let boundParams: any[] = [];
      const stmt = {
        bind: (...params: any[]) => {
          boundParams = params;
          return stmt;
        },
        first: async <T = unknown>(): Promise<T | null> => {
          const s = db.prepare(query);
          const res = s.get(...boundParams);
          return (res as T) ?? null;
        },
        all: async <T = unknown>(): Promise<{ results: T[] }> => {
          const s = db.prepare(query);
          const results = s.all(...boundParams);
          return { results: (results as T[]) ?? [] };
        },
        run: async (): Promise<{ success: boolean }> => {
          const s = db.prepare(query);
          s.run(...boundParams);
          return { success: true };
        },
      };
      return stmt;
    },
    batch: async (statements: any[]): Promise<any[]> => {
      for (const st of statements) {
        await st.run();
      }
      return statements.map(() => ({ success: true }));
    },
  };
}

const mockGate = {
  fetch: async () =>
    new Response(null, {
      status: 204,
      headers: { 'x-clerk-gate': 'ok' },
    }),
  connect: () => {
    throw new Error('not used');
  },
} as unknown as Fetcher;

describe('Activity & Undo E2E Flow', () => {
  let mockD1: any;

  beforeAll(() => {
    mockD1 = createMockD1();
  });

  test('full lifecycle: create -> update -> delete -> undo -> restore old version', async () => {
    // 1. Create expense
    const createRes = await app.request(
      'http://localhost/api/expenses',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 250,
          description: 'Team Lunch',
          category: 'Food & Dining',
          payment_method: 'UPI',
          date: '2026-11-07',
          notes: 'Initial order',
        }),
      },
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    expect(createRes.status).toBe(201);
    const { id: expenseId } = (await createRes.json()) as { id: string };
    expect(expenseId).toBeTruthy();

    await Bun.sleep(15);

    // 2. Update expense
    const updateRes = await app.request(
      `http://localhost/api/expenses/${expenseId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 300,
          description: 'Team Lunch & Desserts',
          category: 'Food & Dining',
          payment_method: 'Credit Card',
          date: '2026-11-07',
          notes: 'Added ice creams',
        }),
      },
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    expect(updateRes.status).toBe(200);

    // 3. Verify activity feed lists both create and update
    const actRes1 = await app.request(
      'http://localhost/api/activity',
      {},
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    expect(actRes1.status).toBe(200);
    const actData1 = (await actRes1.json()) as { items: any[] };
    expect(actData1.items.length).toBe(2);

    const updateAct = actData1.items.find((i) => i.action === 'update');
    const createAct = actData1.items.find((i) => i.action === 'create');
    expect(updateAct).toBeTruthy();
    expect(createAct).toBeTruthy();
    expect(updateAct!.summary).toContain('₹250 → ₹300');
    expect(createAct!.summary).toBe('Added Team Lunch');

    // 4. Delete expense
    const deleteRes = await app.request(
      `http://localhost/api/expenses/${expenseId}`,
      { method: 'DELETE' },
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    expect(deleteRes.status).toBe(200);
    const deleteJson = (await deleteRes.json()) as { success: boolean; activity_id: string };
    expect(deleteJson.success).toBe(true);
    expect(deleteJson.activity_id).toBeTruthy();

    // Verify it is soft-deleted (does not show in active expenses list)
    const listAfterDelete = await app.request(
      'http://localhost/api/expenses?date_range=all',
      {},
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    const { expenses: expList1 } = (await listAfterDelete.json()) as { expenses: any[] };
    expect(expList1.some((e) => e.id === expenseId)).toBe(false);

    // 5. Undo deletion using the returned activity_id
    const undoRes = await app.request(
      `http://localhost/api/activity/${deleteJson.activity_id}/restore`,
      { method: 'POST' },
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    expect(undoRes.status).toBe(200);
    const undoJson = (await undoRes.json()) as { success: boolean };
    expect(undoJson.success).toBe(true);

    // Verify expense is restored
    const listAfterUndo = await app.request(
      'http://localhost/api/expenses?date_range=all',
      {},
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    const { expenses: expList2 } = (await listAfterUndo.json()) as { expenses: any[] };
    const restoredExp = expList2.find((e) => e.id === expenseId);
    expect(restoredExp).toBeTruthy();
    expect(restoredExp.description).toBe('Team Lunch & Desserts');
    expect(restoredExp.amount).toBe(300);

    // 6. Restore back to original create version (v1 where amount was ₹250)
    const restoreV1Res = await app.request(
      `http://localhost/api/activity/${createAct.id}/restore`,
      { method: 'POST' },
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    expect(restoreV1Res.status).toBe(200);

    // Verify expense fields reverted back to version 1
    const listAfterV1Restore = await app.request(
      'http://localhost/api/expenses?date_range=all',
      {},
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    const { expenses: expList3 } = (await listAfterV1Restore.json()) as { expenses: any[] };
    const v1Exp = expList3.find((e) => e.id === expenseId);
    expect(v1Exp).toBeTruthy();
    expect(v1Exp.description).toBe('Team Lunch');
    expect(v1Exp.amount).toBe(250);

    // 7. Verify entity history endpoint
    const entityHistRes = await app.request(
      `http://localhost/api/activity/entity/expense/${expenseId}`,
      {},
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    expect(entityHistRes.status).toBe(200);
    const { items: entityHist } = (await entityHistRes.json()) as { items: any[] };
    expect(entityHist.length).toBe(5); // create, update, delete, restore (undo), restore (v1)

    // 8. Filters test
    const deleteFilterRes = await app.request(
      'http://localhost/api/activity?action=delete',
      {},
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    const { items: deleteOnly } = (await deleteFilterRes.json()) as { items: any[] };
    expect(deleteOnly.length).toBe(1);
    expect(deleteOnly[0].action).toBe('delete');

    const expenseFilterRes = await app.request(
      'http://localhost/api/activity?entity_type=expense',
      {},
      { DB: mockD1, CLERK_GATE: mockGate }
    );
    const { items: expenseOnly } = (await expenseFilterRes.json()) as { items: any[] };
    expect(expenseOnly.length).toBe(5);
  });
});
