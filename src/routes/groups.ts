import { Hono } from 'hono';
import { Bindings } from '../env';
import { formatPaise, logged, diffSummary } from '../db/activity';
import { formatISODate } from '../db/dates';
import {
  createGroupExpense,
  deleteGroupExpense,
  getGroupBalances,
  getGroupLedger,
  getGroupStatement,
  GroupRow,
  ServiceError,
  updateGroupExpense,
} from '../services/groups';
import { computeBalances, Expense, Transfer } from '../split/balances';

const groupsRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/groups?archived=0|1 -> [{id,name,emoji,kind,member_count,my_net_paise,last_activity_at}]
groupsRouter.get('/api/groups', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const archivedParam = c.req.query('archived');
  const isArchived = archivedParam === '1' || archivedParam === 'true';

  const whereSql = isArchived
    ? 'WHERE deleted_at IS NULL AND archived_at IS NOT NULL'
    : 'WHERE deleted_at IS NULL AND archived_at IS NULL';

  // 1. Fetch groups
  const groupsRes = await db
    .prepare(`SELECT * FROM groups ${whereSql} ORDER BY created_at DESC`)
    .all<GroupRow>();
  const groups = groupsRes.results || [];

  if (groups.length === 0) {
    return c.json([]);
  }

  // 2. Active member counts per group
  const memberCountRes = await db
    .prepare(
      `SELECT m.group_id, COUNT(*) as count
       FROM group_members m
       JOIN people p ON m.person_id = p.id
       WHERE m.left_at IS NULL AND p.deleted_at IS NULL
       GROUP BY m.group_id`
    )
    .all<{ group_id: string; count: number }>();
  const memberCountMap = new Map<string, number>();
  for (const r of memberCountRes.results || []) {
    memberCountMap.set(r.group_id, r.count);
  }

  // 3. Expenses where 'me' is payer
  const mePaidRes = await db
    .prepare(
      `SELECT group_id, SUM(amount_paise) as total_paid
       FROM group_expenses
       WHERE paid_by = 'me' AND deleted_at IS NULL
       GROUP BY group_id`
    )
    .all<{ group_id: string; total_paid: number }>();
  const mePaidMap = new Map<string, number>();
  for (const r of mePaidRes.results || []) {
    mePaidMap.set(r.group_id, r.total_paid);
  }

  // 4. Expense shares where 'me' is participant
  const meShareRes = await db
    .prepare(
      `SELECT e.group_id, SUM(s.amount_paise) as total_share
       FROM expense_shares s
       JOIN group_expenses e ON s.expense_id = e.id
       WHERE s.person_id = 'me' AND e.deleted_at IS NULL
       GROUP BY e.group_id`
    )
    .all<{ group_id: string; total_share: number }>();
  const meShareMap = new Map<string, number>();
  for (const r of meShareRes.results || []) {
    meShareMap.set(r.group_id, r.total_share);
  }

  // 5. Transfers where 'me' sent money
  const meSentRes = await db
    .prepare(
      `SELECT group_id, SUM(amount_paise) as total_sent
       FROM transfers
       WHERE from_person = 'me' AND deleted_at IS NULL
       GROUP BY group_id`
    )
    .all<{ group_id: string; total_sent: number }>();
  const meSentMap = new Map<string, number>();
  for (const r of meSentRes.results || []) {
    meSentMap.set(r.group_id, r.total_sent);
  }

  // 6. Transfers where 'me' received money
  const meRecvRes = await db
    .prepare(
      `SELECT group_id, SUM(amount_paise) as total_received
       FROM transfers
       WHERE to_person = 'me' AND deleted_at IS NULL
       GROUP BY group_id`
    )
    .all<{ group_id: string; total_received: number }>();
  const meRecvMap = new Map<string, number>();
  for (const r of meRecvRes.results || []) {
    meRecvMap.set(r.group_id, r.total_received);
  }

  // 7. Last activity per group
  const activityRes = await db
    .prepare(
      `SELECT group_id, MAX(at) as last_activity_at
       FROM activity
       WHERE group_id IS NOT NULL
       GROUP BY group_id`
    )
    .all<{ group_id: string; last_activity_at: string }>();
  const activityMap = new Map<string, string>();
  for (const r of activityRes.results || []) {
    activityMap.set(r.group_id, r.last_activity_at);
  }

  const results = groups.map((g) => {
    const member_count = memberCountMap.get(g.id) ?? 0;
    const paid = mePaidMap.get(g.id) ?? 0;
    const share = meShareMap.get(g.id) ?? 0;
    const sent = meSentMap.get(g.id) ?? 0;
    const received = meRecvMap.get(g.id) ?? 0;
    const my_net_paise = paid - share + sent - received;
    const last_activity_at = activityMap.get(g.id) || g.created_at;

    return {
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      kind: g.kind,
      simplify_debts: g.simplify_debts,
      archived_at: g.archived_at,
      created_at: g.created_at,
      member_count,
      my_net_paise,
      last_activity_at,
    };
  });

  return c.json(results);
});

// POST /api/groups {name, emoji?, kind?, member_ids?} -> "Me" is always added as a member
groupsRouter.post('/api/groups', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  try {
    const body = await c.req.json();
    const name = String(body.name || '').trim();
    if (!name) {
      return c.json({ error: 'Group name is required' }, 400);
    }

    const emoji = body.emoji ? String(body.emoji).trim() : null;
    const kind = body.kind ? String(body.kind).trim() : 'other';
    const validKinds = ['trip', 'home', 'couple', 'other'];
    if (!validKinds.includes(kind)) {
      return c.json({ error: `Kind must be one of: ${validKinds.join(', ')}` }, 400);
    }

    const rawMemberIds: string[] = Array.isArray(body.member_ids) ? body.member_ids : [];
    const memberSet = new Set<string>(rawMemberIds);
    memberSet.add('me'); // "Me" is always added as a member

    // Verify all member IDs exist in people and are not deleted
    const memberIds = Array.from(memberSet);
    const found = await db
      .prepare(
        `SELECT id FROM people WHERE deleted_at IS NULL AND id IN (${memberIds.map(() => '?').join(',')})`
      )
      .bind(...memberIds)
      .all<{ id: string }>();
    const foundIds = new Set((found.results || []).map((r) => r.id));
    const missing = memberIds.find((pid) => !foundIds.has(pid));
    if (missing) {
      return c.json({ error: `Person "${missing}" not found` }, 400);
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const groupStmt = db
      .prepare(
        `INSERT INTO groups (id, name, emoji, kind, simplify_debts, archived_at, created_at, deleted_at)
         VALUES (?, ?, ?, ?, 1, NULL, ?, NULL)`
      )
      .bind(id, name, emoji, kind, nowIso);

    const memberStmts = memberIds.map((pid) =>
      db
        .prepare(
          `INSERT INTO group_members (group_id, person_id, joined_at, left_at)
           VALUES (?, ?, ?, NULL)`
        )
        .bind(id, pid, nowIso)
    );

    const groupRow: GroupRow = {
      id,
      name,
      emoji,
      kind: kind as any,
      simplify_debts: 1,
      archived_at: null,
      created_at: nowIso,
      deleted_at: null,
    };

    const activityId = await logged(db, [groupStmt, ...memberStmts], {
      entity_type: 'group',
      entity_id: id,
      group_id: id,
      action: 'create',
      summary: `Created group ${name}`,
      before: null,
      after: { ...groupRow, members: memberIds },
    });

    return c.json(
      {
        ...groupRow,
        member_count: memberIds.length,
        my_net_paise: 0,
        activity_id: activityId,
      },
      201
    );
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to create group' }, 500);
  }
});

// GET /api/groups/:id -> {group, members, balances, settlements, next_payer, my_net_paise}
groupsRouter.get('/api/groups/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  try {
    const res = await getGroupBalances(db, id);
    return c.json(res);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err.message || 'Failed to load group' }, 500);
  }
});

// GET /api/groups/:id/statement/:personId
groupsRouter.get('/api/groups/:id/statement/:personId', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const personId = c.req.param('personId');

  try {
    const res = await getGroupStatement(db, id, personId);
    return c.json(res);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err.message || 'Failed to get group statement' }, 500);
  }
});

// PATCH /api/groups/:id {name?, emoji?, kind?, simplify_debts?}
groupsRouter.patch('/api/groups/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const existing = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<GroupRow>();

  if (!existing) {
    return c.json({ error: 'Group not found' }, 404);
  }

  if (existing.archived_at) {
    return c.json({ error: 'Group is archived' }, 400);
  }

  try {
    const body = await c.req.json();
    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    if (!name) {
      return c.json({ error: 'Group name cannot be empty' }, 400);
    }

    const emoji = body.emoji !== undefined ? (body.emoji ? String(body.emoji).trim() : null) : existing.emoji;

    let kind = existing.kind;
    if (body.kind !== undefined) {
      const k = String(body.kind).trim();
      const validKinds = ['trip', 'home', 'couple', 'other'];
      if (!validKinds.includes(k)) {
        return c.json({ error: `Kind must be one of: ${validKinds.join(', ')}` }, 400);
      }
      kind = k as any;
    }

    let simplify_debts = existing.simplify_debts;
    if (body.simplify_debts !== undefined) {
      simplify_debts = body.simplify_debts === 1 || body.simplify_debts === true ? 1 : 0;
    }

    const stmt = db
      .prepare(
        `UPDATE groups
         SET name = ?, emoji = ?, kind = ?, simplify_debts = ?
         WHERE id = ?`
      )
      .bind(name, emoji, kind, simplify_debts, id);

    const updatedRow: GroupRow = {
      ...existing,
      name,
      emoji,
      kind,
      simplify_debts,
    };

    const summary = diffSummary(existing.name, existing, updatedRow, [
      'name',
      'emoji',
      'kind',
      'simplify_debts',
    ]);

    const activityId = await logged(db, [stmt], {
      entity_type: 'group',
      entity_id: id,
      group_id: id,
      action: 'update',
      summary,
      before: existing,
      after: updatedRow,
    });

    return c.json({ ...updatedRow, activity_id: activityId });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to update group' }, 500);
  }
});

// POST /api/groups/:id/archive
groupsRouter.post('/api/groups/:id/archive', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const existing = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<GroupRow>();

  if (!existing) {
    return c.json({ error: 'Group not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  const stmt = db
    .prepare('UPDATE groups SET archived_at = ? WHERE id = ?')
    .bind(nowIso, id);

  const updatedRow: GroupRow = { ...existing, archived_at: nowIso };

  const activityId = await logged(db, [stmt], {
    entity_type: 'group',
    entity_id: id,
    group_id: id,
    action: 'update',
    summary: `Archived group ${existing.name}`,
    before: existing,
    after: updatedRow,
  });

  return c.json({ success: true, activity_id: activityId, ...updatedRow });
});

// POST /api/groups/:id/unarchive
groupsRouter.post('/api/groups/:id/unarchive', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const existing = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<GroupRow>();

  if (!existing) {
    return c.json({ error: 'Group not found' }, 404);
  }

  const stmt = db
    .prepare('UPDATE groups SET archived_at = NULL WHERE id = ?')
    .bind(id);

  const updatedRow: GroupRow = { ...existing, archived_at: null };

  const activityId = await logged(db, [stmt], {
    entity_type: 'group',
    entity_id: id,
    group_id: id,
    action: 'update',
    summary: `Unarchived group ${existing.name}`,
    before: existing,
    after: updatedRow,
  });

  return c.json({ success: true, activity_id: activityId, ...updatedRow });
});

// DELETE /api/groups/:id -> soft delete; 400 unless every balance is 0
groupsRouter.delete('/api/groups/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const existing = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<GroupRow>();

  if (!existing) {
    return c.json({ error: 'Group not found' }, 404);
  }

  if (existing.archived_at) {
    return c.json({ error: 'Group is archived' }, 400);
  }

  // Calculate balances to ensure all are 0
  const balancesResult = await getGroupBalances(db, id);
  for (const [pid, bal] of Object.entries(balancesResult.balances)) {
    if (bal !== 0) {
      return c.json({ error: 'Cannot delete group with non-zero balances' }, 400);
    }
  }

  const nowIso = new Date().toISOString();
  const stmt = db
    .prepare('UPDATE groups SET deleted_at = ? WHERE id = ?')
    .bind(nowIso, id);

  const activityId = await logged(db, [stmt], {
    entity_type: 'group',
    entity_id: id,
    group_id: id,
    action: 'delete',
    summary: `Deleted group ${existing.name}`,
    before: existing,
    after: null,
  });

  return c.json({ success: true, activity_id: activityId });
});

// POST /api/groups/:id/members {person_id} | {name} -> {name} creates the person and adds them in one batch
groupsRouter.post('/api/groups/:id/members', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const groupId = c.req.param('id');
  const group = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(groupId)
    .first<GroupRow>();

  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  if (group.archived_at) {
    return c.json({ error: 'Group is archived' }, 400);
  }

  try {
    const body = await c.req.json();
    const nowIso = new Date().toISOString();

    if (body.person_id) {
      const personId = String(body.person_id).trim();
      const person = await db
        .prepare('SELECT * FROM people WHERE id = ? AND deleted_at IS NULL')
        .bind(personId)
        .first<{ id: string; name: string }>();

      if (!person) {
        return c.json({ error: 'Person not found' }, 404);
      }

      const existingMember = await db
        .prepare('SELECT * FROM group_members WHERE group_id = ? AND person_id = ?')
        .bind(groupId, personId)
        .first<{ group_id: string; person_id: string; left_at: string | null }>();

      let memberStmt: D1PreparedStatement;
      if (existingMember) {
        if (!existingMember.left_at) {
          return c.json({ error: 'Person is already an active member of this group' }, 400);
        }
        memberStmt = db
          .prepare('UPDATE group_members SET left_at = NULL WHERE group_id = ? AND person_id = ?')
          .bind(groupId, personId);
      } else {
        memberStmt = db
          .prepare('INSERT INTO group_members (group_id, person_id, joined_at, left_at) VALUES (?, ?, ?, NULL)')
          .bind(groupId, personId, nowIso);
      }

      const activityId = await logged(db, [memberStmt], {
        entity_type: 'group_member',
        entity_id: personId,
        group_id: groupId,
        action: 'create',
        summary: `Added ${person.name} to ${group.name}`,
        before: existingMember ?? null,
        after: { group_id: groupId, person_id: personId, joined_at: nowIso, left_at: null },
      });

      return c.json({ success: true, person_id: personId, name: person.name, activity_id: activityId }, 201);
    } else if (body.name) {
      const name = String(body.name).trim();
      if (!name) {
        return c.json({ error: 'Name cannot be empty' }, 400);
      }

      const personId = crypto.randomUUID();
      const personStmt = db
        .prepare('INSERT INTO people (id, name, upi_vpa, phone, is_me, created_at, deleted_at) VALUES (?, ?, NULL, NULL, 0, ?, NULL)')
        .bind(personId, name, nowIso);

      const memberStmt = db
        .prepare('INSERT INTO group_members (group_id, person_id, joined_at, left_at) VALUES (?, ?, ?, NULL)')
        .bind(groupId, personId, nowIso);

      const activityId = await logged(db, [personStmt, memberStmt], {
        entity_type: 'group_member',
        entity_id: personId,
        group_id: groupId,
        action: 'create',
        summary: `Added ${name} to ${group.name}`,
        before: null,
        after: { group_id: groupId, person_id: personId, name, joined_at: nowIso, left_at: null },
      });

      return c.json({ success: true, person_id: personId, name, activity_id: activityId }, 201);
    } else {
      return c.json({ error: 'Either person_id or name must be provided' }, 400);
    }
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to add member' }, 500);
  }
});

// DELETE /api/groups/:id/members/:personId -> sets left_at; 400 if their balance is non-zero; 400 for "me"
groupsRouter.delete('/api/groups/:id/members/:personId', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const groupId = c.req.param('id');
  const personId = c.req.param('personId');

  if (personId === 'me') {
    return c.json({ error: 'Cannot remove yourself from the group' }, 400);
  }

  const group = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(groupId)
    .first<GroupRow>();

  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  if (group.archived_at) {
    return c.json({ error: 'Group is archived' }, 400);
  }

  const member = await db
    .prepare(
      `SELECT m.*, p.name FROM group_members m
       JOIN people p ON m.person_id = p.id
       WHERE m.group_id = ? AND m.person_id = ? AND m.left_at IS NULL`
    )
    .bind(groupId, personId)
    .first<{ group_id: string; person_id: string; name: string }>();

  if (!member) {
    return c.json({ error: 'Member not found in group' }, 404);
  }

  // Check balance
  const balancesResult = await getGroupBalances(db, groupId);
  const bal = balancesResult.balances[personId] ?? 0;
  if (bal !== 0) {
    return c.json({ error: 'Cannot remove member with non-zero balance' }, 400);
  }

  const nowIso = new Date().toISOString();
  const stmt = db
    .prepare('UPDATE group_members SET left_at = ? WHERE group_id = ? AND person_id = ?')
    .bind(nowIso, groupId, personId);

  const activityId = await logged(db, [stmt], {
    entity_type: 'group_member',
    entity_id: personId,
    group_id: groupId,
    action: 'delete',
    summary: `Removed ${member.name} from ${group.name}`,
    before: member,
    after: { ...member, left_at: nowIso },
  });

  return c.json({ success: true, activity_id: activityId });
});

// GET /api/groups/:id/timeline?before=&limit=50 -> expenses and transfers merged, newest first, each with type
groupsRouter.get('/api/groups/:id/timeline', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const groupId = c.req.param('id');
  const group = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(groupId)
    .first<GroupRow>();

  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  const before = c.req.query('before')?.trim();
  const limitParam = parseInt(c.req.query('limit') || '50', 10);
  const limit = Math.max(1, Math.min(100, isNaN(limitParam) ? 50 : limitParam));

  const ledger = await getGroupLedger(db, groupId);

  const peopleMap = new Map<string, string>();
  for (const m of ledger.members) {
    peopleMap.set(m.person_id, m.name);
  }

  const expenseItems = ledger.expenses.map((e) => ({
    type: 'expense' as const,
    id: e.id,
    group_id: e.group_id,
    description: e.description,
    category: e.category,
    amount_paise: e.amount_paise,
    amount_expr: e.amount_expr,
    paid_by: e.paid_by,
    paid_by_name: peopleMap.get(e.paid_by) || e.paid_by,
    split_type: e.split_type,
    date: e.date,
    notes: e.notes,
    created_at: e.created_at,
    updated_at: e.updated_at,
    shares: (e.shares || []).map((s) => ({
      person_id: s.person_id,
      person_name: peopleMap.get(s.person_id) || s.person_id,
      amount_paise: s.amount_paise,
    })),
  }));

  const transferItems = ledger.transfers.map((t) => ({
    type: 'transfer' as const,
    id: t.id,
    group_id: t.group_id,
    from_person: t.from_person,
    from_name: peopleMap.get(t.from_person) || t.from_person,
    to_person: t.to_person,
    to_name: peopleMap.get(t.to_person) || t.to_person,
    amount_paise: t.amount_paise,
    amount_expr: t.amount_expr,
    date: t.date,
    method: t.method,
    note: t.note,
    created_at: t.created_at,
  }));

  const allItems = [...expenseItems, ...transferItems];

  // Sort newest first: compare date DESC, then created_at DESC
  allItems.sort((a, b) => {
    if (b.date !== a.date) {
      return b.date.localeCompare(a.date);
    }
    return b.created_at.localeCompare(a.created_at);
  });

  let filtered = allItems;
  if (before) {
    filtered = allItems.filter((i) => {
      if (before.includes('T')) {
        return i.created_at < before;
      }
      return i.date < before;
    });
  }

  const hasMore = filtered.length > limit;
  const items = hasMore ? filtered.slice(0, limit) : filtered;
  const next_cursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

  return c.json({ items, next_cursor });
});

// POST /api/groups/:id/expenses
groupsRouter.post('/api/groups/:id/expenses', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const groupId = c.req.param('id');
  try {
    const body = await c.req.json();
    const res = await createGroupExpense(db, {
      ...body,
      group_id: groupId,
    });
    return c.json(res, 201);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err.message || 'Failed to create group expense' }, 500);
  }
});

// PUT /api/groups/:id/expenses/:eid
groupsRouter.put('/api/groups/:id/expenses/:eid', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const eid = c.req.param('eid');
  try {
    const body = await c.req.json();
    const res = await updateGroupExpense(db, eid, body);
    return c.json(res);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err.message || 'Failed to update group expense' }, 500);
  }
});

// DELETE /api/groups/:id/expenses/:eid
groupsRouter.delete('/api/groups/:id/expenses/:eid', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const eid = c.req.param('eid');
  try {
    const res = await deleteGroupExpense(db, eid);
    return c.json(res);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err.message || 'Failed to delete group expense' }, 500);
  }
});

// POST /api/groups/:id/transfers {from_person, to_person, amount_paise, amount_expr?, method?, date?, note?}
groupsRouter.post('/api/groups/:id/transfers', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const groupId = c.req.param('id');
  const group = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(groupId)
    .first<GroupRow>();

  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  if (group.archived_at) {
    return c.json({ error: 'Group is archived' }, 400);
  }

  try {
    const body = await c.req.json();
    const from_person = String(body.from_person || '').trim();
    const to_person = String(body.to_person || '').trim();
    const amount_paise = Number(body.amount_paise);

    if (!from_person || !to_person) {
      return c.json({ error: 'from_person and to_person are required' }, 400);
    }

    if (from_person === to_person) {
      return c.json({ error: 'from_person and to_person must be different' }, 400);
    }

    if (!Number.isInteger(amount_paise) || amount_paise <= 0) {
      return c.json({ error: 'Amount must be a positive integer in paise' }, 400);
    }

    // Verify both are active members of the group
    const activeMembers = await db
      .prepare(
        `SELECT m.person_id, p.name FROM group_members m
         JOIN people p ON m.person_id = p.id
         WHERE m.group_id = ? AND m.left_at IS NULL AND p.deleted_at IS NULL`
      )
      .bind(groupId)
      .all<{ person_id: string; name: string }>();

    const memberMap = new Map<string, string>();
    for (const m of activeMembers.results || []) {
      memberMap.set(m.person_id, m.name);
    }

    if (!memberMap.has(from_person)) {
      return c.json({ error: `from_person "${from_person}" must be an active member of the group` }, 400);
    }
    if (!memberMap.has(to_person)) {
      return c.json({ error: `to_person "${to_person}" must be an active member of the group` }, 400);
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const date = body.date ? String(body.date).trim() : formatISODate(new Date());
    const method = body.method ? String(body.method).trim() : null;
    const note = body.note ? String(body.note).trim() : null;
    const amount_expr = body.amount_expr ? String(body.amount_expr).trim() : null;

    const stmt = db
      .prepare(
        `INSERT INTO transfers (id, group_id, from_person, to_person, amount_paise, amount_expr, date, method, note, created_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(id, groupId, from_person, to_person, amount_paise, amount_expr, date, method, note, nowIso);

    const fromDisplayName = from_person === 'me' ? 'Me' : memberMap.get(from_person) || from_person;
    const toDisplayName = to_person === 'me' ? 'Me' : memberMap.get(to_person) || to_person;
    const methodSuffix = method ? ` (${method})` : '';
    const summary = `${fromDisplayName} paid ${toDisplayName} ${formatPaise(amount_paise)}${methodSuffix}`;

    const transferRow = {
      id,
      group_id: groupId,
      from_person,
      to_person,
      amount_paise,
      amount_expr,
      date,
      method,
      note,
      created_at: nowIso,
      deleted_at: null,
    };

    const activityId = await logged(db, [stmt], {
      entity_type: 'transfer',
      entity_id: id,
      group_id: groupId,
      action: 'create',
      summary,
      before: null,
      after: transferRow,
    });

    return c.json({ success: true, id, activity_id: activityId, transfer: transferRow }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to create transfer' }, 500);
  }
});

// DELETE /api/groups/:id/transfers/:tid
groupsRouter.delete('/api/groups/:id/transfers/:tid', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const groupId = c.req.param('id');
  const tid = c.req.param('tid');

  const group = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(groupId)
    .first<GroupRow>();

  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  if (group.archived_at) {
    return c.json({ error: 'Group is archived' }, 400);
  }

  const existing = await db
    .prepare('SELECT * FROM transfers WHERE id = ? AND group_id = ? AND deleted_at IS NULL')
    .bind(tid, groupId)
    .first<any>();

  if (!existing) {
    return c.json({ error: 'Transfer not found' }, 404);
  }

  const peopleRes = await db
    .prepare('SELECT id, name FROM people WHERE id IN (?, ?)')
    .bind(existing.from_person, existing.to_person)
    .all<{ id: string; name: string }>();

  const pMap = new Map<string, string>();
  for (const p of peopleRes.results || []) {
    pMap.set(p.id, p.name);
  }

  const fromDisplayName = existing.from_person === 'me' ? 'Me' : pMap.get(existing.from_person) || existing.from_person;
  const toDisplayName = existing.to_person === 'me' ? 'Me' : pMap.get(existing.to_person) || existing.to_person;

  const nowIso = new Date().toISOString();
  const stmt = db
    .prepare('UPDATE transfers SET deleted_at = ? WHERE id = ?')
    .bind(nowIso, tid);

  const summary = `Deleted transfer: ${fromDisplayName} paid ${toDisplayName} ${formatPaise(existing.amount_paise)}`;

  const activityId = await logged(db, [stmt], {
    entity_type: 'transfer',
    entity_id: tid,
    group_id: groupId,
    action: 'delete',
    summary,
    before: existing,
    after: null,
  });

  return c.json({ success: true, activity_id: activityId });
});

// GET /api/groups/:id/export -> CSV of the timeline
groupsRouter.get('/api/groups/:id/export', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.text('D1 Database binding not configured', 500);
  }

  const groupId = c.req.param('id');
  const group = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(groupId)
    .first<GroupRow>();

  if (!group) {
    return c.text('Group not found', 404);
  }

  const ledger = await getGroupLedger(db, groupId);
  const peopleMap = new Map<string, string>();
  for (const m of ledger.members) {
    peopleMap.set(m.person_id, m.name);
  }

  const expenseItems = ledger.expenses.map((e) => ({
    type: 'Expense',
    id: e.id,
    date: e.date,
    description: e.description,
    category: e.category,
    amount: (e.amount_paise / 100).toFixed(2),
    payer: peopleMap.get(e.paid_by) || e.paid_by,
    details: `${e.split_type} split (${(e.shares || []).length} people)`,
    notes: e.notes || '',
    created_at: e.created_at,
  }));

  const transferItems = ledger.transfers.map((t) => {
    const fromName = peopleMap.get(t.from_person) || t.from_person;
    const toName = peopleMap.get(t.to_person) || t.to_person;
    return {
      type: 'Transfer',
      id: t.id,
      date: t.date,
      description: `${fromName} paid ${toName}`,
      category: 'Transfer',
      amount: (t.amount_paise / 100).toFixed(2),
      payer: fromName,
      details: `Paid to ${toName}`,
      notes: t.note || t.method || '',
      created_at: t.created_at,
    };
  });

  const allItems = [...expenseItems, ...transferItems];
  allItems.sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.created_at.localeCompare(a.created_at);
  });

  const headers = ['Type', 'ID', 'Date', 'Description', 'Category', 'Amount (INR)', 'Paid By', 'Details', 'Notes', 'Created At'];
  const escape = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;

  const rows = [headers.join(',')];
  for (const item of allItems) {
    rows.push(
      [
        escape(item.type),
        escape(item.id),
        escape(item.date),
        escape(item.description),
        escape(item.category),
        item.amount,
        escape(item.payer),
        escape(item.details),
        escape(item.notes),
        escape(item.created_at),
      ].join(',')
    );
  }

  return new Response(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${group.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-timeline.csv"`,
    },
  });
});

export default groupsRouter;
