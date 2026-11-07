import { readFileSync } from 'node:fs';

export async function applyFoundationMigration(db: D1Database): Promise<void> {
  const sql = readFileSync('migrations/0001_foundation.sql', 'utf-8');
  const cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const stmts = cleaned
    .split('\n')
    .map((l) => (l.trim().startsWith('--') ? '' : l))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await db.batch(stmts.map((s) => db.prepare(s)));
}

export async function applyGroupsMigration(db: D1Database): Promise<void> {
  const sql = readFileSync('migrations/0002_groups.sql', 'utf-8');
  const cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const stmts = cleaned
    .split('\n')
    .map((l) => (l.trim().startsWith('--') ? '' : l))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await db.batch(stmts.map((s) => db.prepare(s)));
}

export async function applyBillsMigration(db: D1Database): Promise<void> {
  const sql = readFileSync('migrations/0003_bills.sql', 'utf-8');
  const cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const stmts = cleaned
    .split('\n')
    .map((l) => (l.trim().startsWith('--') ? '' : l))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await db.batch(stmts.map((s) => db.prepare(s)));
}

export async function applySettingsMigration(db: D1Database): Promise<void> {
  const sql = readFileSync('migrations/0004_settings.sql', 'utf-8');
  const cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const stmts = cleaned
    .split('\n')
    .map((l) => (l.trim().startsWith('--') ? '' : l))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await db.batch(stmts.map((s) => db.prepare(s)));
}

export async function applyAllMigrations(db: D1Database): Promise<void> {
  await applyFoundationMigration(db);
  await applyGroupsMigration(db);
  await applyBillsMigration(db);
  await applySettingsMigration(db);
}

