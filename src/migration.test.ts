import { afterAll, expect, test } from 'bun:test';
import { getPlatformProxy } from 'wrangler';
import { applyFoundationMigration } from './test-utils';

test('migration 0001_foundation converts REAL amounts to INTEGER paise and seeds people', async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.jsonc',
    remoteBindings: false,
    persist: false,
  });

  try {
    const db = proxy.env.DB;

    // Simulate old pre-migration table shape
    await db.batch([
      db.prepare(`
        CREATE TABLE expenses (
          id TEXT PRIMARY KEY,
          amount REAL NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          payment_method TEXT NOT NULL DEFAULT 'UPI',
          date TEXT NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `),
      db.prepare(`
        INSERT INTO expenses (id, amount, description, category, payment_method, date, notes, created_at, updated_at)
        VALUES
          ('exp-1', 450.00, 'Zomato Biryani', 'Food & Dining', 'UPI', '2026-11-01', 'team lunch', '2026-11-01T12:00:00Z', '2026-11-01T12:00:00Z'),
          ('exp-2', 1599.99, 'Amazon Cable', 'Shopping', 'Credit Card', '2026-11-02', 'hub', '2026-11-02T12:00:00Z', '2026-11-02T12:00:00Z'),
          ('exp-3', 0.50, 'Chai', 'Food & Dining', 'Cash', '2026-11-03', null, '2026-11-03T12:00:00Z', '2026-11-03T12:00:00Z')
      `),
    ]);

    // Apply migration
    await applyFoundationMigration(db);

    // Verify converted rows in expenses
    const rows = await db.prepare('SELECT * FROM expenses ORDER BY id ASC').all<{
      id: string;
      amount_paise: number;
      amount_expr: string | null;
      description: string;
      deleted_at: string | null;
    }>();

    expect(rows.results.length).toBe(3);
    expect(rows.results[0]).toMatchObject({
      id: 'exp-1',
      amount_paise: 45000,
      amount_expr: null,
      description: 'Zomato Biryani',
      deleted_at: null,
    });
    expect(rows.results[1]).toMatchObject({
      id: 'exp-2',
      amount_paise: 159999,
      amount_expr: null,
      description: 'Amazon Cable',
      deleted_at: null,
    });
    expect(rows.results[2]).toMatchObject({
      id: 'exp-3',
      amount_paise: 50,
      amount_expr: null,
      description: 'Chai',
      deleted_at: null,
    });

    // Verify people table
    const people = await db.prepare('SELECT * FROM people').all<{
      id: string;
      name: string;
      is_me: number;
    }>();
    expect(people.results.length).toBe(1);
    expect(people.results[0].id).toBe('me');
    expect(people.results[0].name).toBe('Me');
    expect(people.results[0].is_me).toBe(1);

    // Verify partial unique index enforces single is_me = 1
    let threw = false;
    try {
      await db
        .prepare("INSERT INTO people (id, name, is_me, created_at) VALUES ('me2', 'Duplicate Me', 1, datetime('now'))")
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // Verify activity table exists and empty
    const activityCount = await db.prepare('SELECT COUNT(*) as c FROM activity').first<{ c: number }>();
    expect(activityCount?.c).toBe(0);
  } finally {
    await proxy.dispose();
  }
});

test('migration 0002_groups creates groups, members, expenses, shares, and transfers tables', async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.jsonc',
    remoteBindings: false,
    persist: false,
  });

  try {
    const db = proxy.env.DB;
    const { applyAllMigrations } = await import('./test-utils');
    await applyAllMigrations(db);

    // Verify groups table with check constraint on kind
    await db
      .prepare("INSERT INTO groups (id, name, kind, simplify_debts, created_at) VALUES ('g1', 'Trip 1', 'trip', 1, datetime('now'))")
      .run();

    let invalidKindThrew = false;
    try {
      await db
        .prepare("INSERT INTO groups (id, name, kind, created_at) VALUES ('g2', 'Bad Kind', 'invalid', datetime('now'))")
        .run();
    } catch {
      invalidKindThrew = true;
    }
    expect(invalidKindThrew).toBe(true);

    // Verify transfers check constraint: from_person <> to_person
    let samePersonThrew = false;
    try {
      await db
        .prepare("INSERT INTO transfers (id, group_id, from_person, to_person, amount_paise, date, created_at) VALUES ('t1', 'g1', 'me', 'me', 1000, '2026-11-01', datetime('now'))")
        .run();
    } catch {
      samePersonThrew = true;
    }
    expect(samePersonThrew).toBe(true);

    // Verify amount_paise > 0 check constraint
    let zeroAmountThrew = false;
    try {
      await db
        .prepare("INSERT INTO group_expenses (id, group_id, description, amount_paise, paid_by, split_type, date, created_at, updated_at) VALUES ('e1', 'g1', 'Zero Exp', 0, 'me', 'equal', '2026-11-01', datetime('now'), datetime('now'))")
        .run();
    } catch {
      zeroAmountThrew = true;
    }
    expect(zeroAmountThrew).toBe(true);
  } finally {
    await proxy.dispose();
  }
});

