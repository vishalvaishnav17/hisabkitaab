import { Hono } from 'hono';
import { Bindings } from '../env';
import { getRestorer, logged } from '../db/activity';

interface ActivityRow {
  id: string;
  at: string;
  entity_type: string;
  entity_id: string;
  group_id: string | null;
  action: 'create' | 'update' | 'delete' | 'restore';
  summary: string;
  before_json: string | null;
  after_json: string | null;
}

const activityRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/activity?group_id=&entity_type=&action=&before=<iso>&limit=50
activityRouter.get('/api/activity', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const groupId = c.req.query('group_id')?.trim();
  const entityType = c.req.query('entity_type')?.trim();
  const action = c.req.query('action')?.trim();
  const before = c.req.query('before')?.trim();
  const limitParam = parseInt(c.req.query('limit') || '50', 10);
  const limit = Math.max(1, Math.min(100, isNaN(limitParam) ? 50 : limitParam));

  const whereClauses: string[] = [];
  const params: any[] = [];

  if (groupId) {
    whereClauses.push('group_id = ?');
    params.push(groupId);
  }

  if (entityType) {
    whereClauses.push('entity_type = ?');
    params.push(entityType);
  }

  if (action) {
    whereClauses.push('action = ?');
    params.push(action);
  }

  if (before) {
    whereClauses.push('at < ?');
    params.push(before);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const sql = `SELECT * FROM activity ${whereSql} ORDER BY at DESC LIMIT ?`;
  params.push(limit + 1);

  const { results: rawRows } = await db.prepare(sql).bind(...params).all<ActivityRow>();

  const hasMore = rawRows.length > limit;
  const rows = hasMore ? rawRows.slice(0, limit) : rawRows;
  const next_cursor = hasMore && rows.length > 0 ? rows[rows.length - 1].at : null;

  const items = rows.map((r) => ({
    id: r.id,
    at: r.at,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    group_id: r.group_id,
    action: r.action,
    summary: r.summary,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
  }));

  return c.json({ items, next_cursor });
});

// GET /api/activity/entity/:type/:id
activityRouter.get('/api/activity/entity/:type/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const entityType = c.req.param('type');
  const entityId = c.req.param('id');

  const { results: rawRows } = await db
    .prepare('SELECT * FROM activity WHERE entity_type = ? AND entity_id = ? ORDER BY at DESC')
    .bind(entityType, entityId)
    .all<ActivityRow>();

  const items = rawRows.map((r) => ({
    id: r.id,
    at: r.at,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    group_id: r.group_id,
    action: r.action,
    summary: r.summary,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
  }));

  return c.json({ items });
});

// POST /api/activity/:id/restore
activityRouter.post('/api/activity/:id/restore', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const entry = await db
    .prepare('SELECT * FROM activity WHERE id = ?')
    .bind(id)
    .first<ActivityRow>();

  if (!entry) {
    return c.json({ error: 'Activity entry not found' }, 404);
  }

  const restorer = getRestorer(entry.entity_type);
  if (!restorer) {
    return c.json({ error: `No restorer registered for entity type '${entry.entity_type}'` }, 400);
  }

  let snapshot: any = null;
  if (entry.action === 'delete' || !entry.after_json) {
    const prev = await db
      .prepare(
        'SELECT after_json FROM activity WHERE entity_type = ? AND entity_id = ? AND after_json IS NOT NULL ORDER BY at DESC LIMIT 1'
      )
      .bind(entry.entity_type, entry.entity_id)
      .first<{ after_json: string }>();

    if (!prev?.after_json) {
      return c.json({ error: 'No snapshot available to restore' }, 400);
    }
    snapshot = JSON.parse(prev.after_json);
  } else {
    snapshot = JSON.parse(entry.after_json);
  }

  // Clear deleted_at
  snapshot.deleted_at = null;

  // Snapshot before state
  let current: any = null;
  if (entry.entity_type === 'expense') {
    current = await db
      .prepare('SELECT * FROM expenses WHERE id = ?')
      .bind(entry.entity_id)
      .first();
  } else if (entry.entity_type === 'group_expense') {
    current = await db
      .prepare('SELECT * FROM group_expenses WHERE id = ?')
      .bind(entry.entity_id)
      .first();
    if (current) {
      const { results: shares } = await db
        .prepare('SELECT person_id, amount_paise FROM expense_shares WHERE expense_id = ?')
        .bind(entry.entity_id)
        .all();
      current.shares = shares;
    }
  } else if (entry.entity_type === 'transfer') {
    current = await db
      .prepare('SELECT * FROM transfers WHERE id = ?')
      .bind(entry.entity_id)
      .first();
  } else if (entry.entity_type === 'group') {
    current = await db
      .prepare('SELECT * FROM groups WHERE id = ?')
      .bind(entry.entity_id)
      .first();
  } else if (entry.entity_type === 'person') {
    current = await db
      .prepare('SELECT * FROM people WHERE id = ?')
      .bind(entry.entity_id)
      .first();
  }

  const stmts = await restorer(db, snapshot);

  const label = snapshot.description || snapshot.name || entry.entity_type;
  const summary = `Restored ${label}`;

  const restoreActivityId = await logged(db, stmts, {
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    group_id: entry.group_id,
    action: 'restore',
    summary,
    before: current ?? null,
    after: snapshot,
  });

  return c.json({ success: true, activity_id: restoreActivityId });
});

export default activityRouter;
