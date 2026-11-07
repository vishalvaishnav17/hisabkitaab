import { Hono } from 'hono';
import { Bindings } from '../env';
import { diffSummary, logged } from '../db/activity';
import { computeBalances, Expense, Transfer } from '../split/balances';

interface PersonRow {
  id: string;
  name: string;
  upi_vpa: string | null;
  phone: string | null;
  is_me: number;
  created_at: string;
  deleted_at: string | null;
}

const peopleRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/people -> all non-deleted people, with is_me
peopleRouter.get('/api/people', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const { results: people } = await db
    .prepare('SELECT id, name, upi_vpa, phone, is_me, created_at FROM people WHERE deleted_at IS NULL ORDER BY is_me DESC, name ASC')
    .all<PersonRow>();

  return c.json(people);
});

// POST /api/people {name, upi_vpa?, phone?}
peopleRouter.post('/api/people', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  try {
    const body = await c.req.json();
    const name = String(body.name || '').trim();
    if (!name) {
      return c.json({ error: 'Name is required' }, 400);
    }

    const upi_vpa = body.upi_vpa ? String(body.upi_vpa).trim() : null;
    const phone = body.phone ? String(body.phone).trim() : null;
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const stmt = db
      .prepare('INSERT INTO people (id, name, upi_vpa, phone, is_me, created_at, deleted_at) VALUES (?, ?, ?, ?, 0, ?, NULL)')
      .bind(id, name, upi_vpa, phone, nowIso);

    const personRow: PersonRow = {
      id,
      name,
      upi_vpa,
      phone,
      is_me: 0,
      created_at: nowIso,
      deleted_at: null,
    };

    const activityId = await logged(db, [stmt], {
      entity_type: 'person',
      entity_id: id,
      action: 'create',
      summary: `Added ${name}`,
      before: null,
      after: personRow,
    });

    return c.json({ success: true, activity_id: activityId, ...personRow }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to create person' }, 500);
  }
});

// PATCH /api/people/:id
peopleRouter.patch('/api/people/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const existing = await db
    .prepare('SELECT * FROM people WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<PersonRow>();

  if (!existing) {
    return c.json({ error: 'Person not found' }, 404);
  }

  try {
    const body = await c.req.json();
    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    if (!name) {
      return c.json({ error: 'Name cannot be empty' }, 400);
    }
    const upi_vpa =
      body.upi_vpa !== undefined ? (body.upi_vpa ? String(body.upi_vpa).trim() : null) : existing.upi_vpa;
    const phone =
      body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : existing.phone;

    const stmt = db
      .prepare('UPDATE people SET name = ?, upi_vpa = ?, phone = ? WHERE id = ?')
      .bind(name, upi_vpa, phone, id);

    const updatedRow: PersonRow = {
      ...existing,
      name,
      upi_vpa,
      phone,
    };

    const summary = diffSummary(existing.name, existing, updatedRow, ['name', 'upi_vpa', 'phone']);

    const activityId = await logged(db, [stmt], {
      entity_type: 'person',
      entity_id: id,
      action: 'update',
      summary,
      before: existing,
      after: updatedRow,
    });

    return c.json({ success: true, activity_id: activityId, ...updatedRow });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to update person' }, 500);
  }
});

// DELETE /api/people/:id -> 400 if they have a non-zero balance in any group; 400 for is_me
peopleRouter.delete('/api/people/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const existing = await db
    .prepare('SELECT * FROM people WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<PersonRow>();

  if (!existing) {
    return c.json({ error: 'Person not found' }, 404);
  }

  if (existing.is_me === 1) {
    return c.json({ error: 'Cannot delete yourself' }, 400);
  }

  // Check if they have a non-zero balance in any group
  const groupIdsRes = await db
    .prepare(
      `SELECT DISTINCT group_id FROM (
         SELECT group_id FROM group_members WHERE person_id = ?
         UNION
         SELECT group_id FROM group_expenses WHERE paid_by = ? AND deleted_at IS NULL
         UNION
         SELECT e.group_id FROM expense_shares s JOIN group_expenses e ON s.expense_id = e.id WHERE s.person_id = ? AND e.deleted_at IS NULL
         UNION
         SELECT group_id FROM transfers WHERE (from_person = ? OR to_person = ?) AND deleted_at IS NULL
       )`
    )
    .bind(id, id, id, id, id)
    .all<{ group_id: string }>();

  const groupIds = (groupIdsRes.results || []).map((r) => r.group_id);

  if (groupIds.length > 0) {
    // Check balances in these groups
    const expensesRes = await db
      .prepare('SELECT id, group_id, paid_by, amount_paise FROM group_expenses WHERE deleted_at IS NULL')
      .all<{ id: string; group_id: string; paid_by: string; amount_paise: number }>();

    const sharesRes = await db
      .prepare(
        'SELECT s.expense_id, e.group_id, s.person_id, s.amount_paise FROM expense_shares s JOIN group_expenses e ON s.expense_id = e.id WHERE e.deleted_at IS NULL'
      )
      .all<{ expense_id: string; group_id: string; person_id: string; amount_paise: number }>();

    const transfersRes = await db
      .prepare('SELECT group_id, from_person, to_person, amount_paise FROM transfers WHERE deleted_at IS NULL')
      .all<{ group_id: string; from_person: string; to_person: string; amount_paise: number }>();

    const sharesByExpense = new Map<string, { person_id: string; amount_paise: number }[]>();
    for (const s of sharesRes.results || []) {
      const list = sharesByExpense.get(s.expense_id) ?? [];
      list.push(s);
      sharesByExpense.set(s.expense_id, list);
    }

    const expensesByGroup = new Map<string, Expense[]>();
    for (const e of expensesRes.results || []) {
      const list = expensesByGroup.get(e.group_id) ?? [];
      list.push({
        paid_by: e.paid_by,
        amount_paise: e.amount_paise,
        shares: sharesByExpense.get(e.id) ?? [],
      });
      expensesByGroup.set(e.group_id, list);
    }

    const transfersByGroup = new Map<string, Transfer[]>();
    for (const t of transfersRes.results || []) {
      const list = transfersByGroup.get(t.group_id) ?? [];
      list.push(t);
      transfersByGroup.set(t.group_id, list);
    }

    for (const gid of groupIds) {
      const exps = expensesByGroup.get(gid) ?? [];
      const trs = transfersByGroup.get(gid) ?? [];
      const balances = computeBalances(exps, trs);
      const bal = balances.get(id) ?? 0;
      if (bal !== 0) {
        return c.json({ error: 'Cannot delete person with non-zero balance in groups' }, 400);
      }
    }
  }

  const nowIso = new Date().toISOString();
  const stmt = db
    .prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
    .bind(nowIso, id);

  const activityId = await logged(db, [stmt], {
    entity_type: 'person',
    entity_id: id,
    action: 'delete',
    summary: `Deleted ${existing.name}`,
    before: existing,
    after: null,
  });

  return c.json({ success: true, activity_id: activityId });
});

// GET /api/friends/balances -> per person (not me): net across all groups plus a per-group breakdown
peopleRouter.get('/api/friends/balances', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const peopleRes = await db
    .prepare('SELECT id, name, upi_vpa, phone FROM people WHERE is_me = 0 AND deleted_at IS NULL ORDER BY name ASC')
    .all<{ id: string; name: string; upi_vpa: string | null; phone: string | null }>();

  const groupsRes = await db
    .prepare('SELECT id, name FROM groups WHERE deleted_at IS NULL')
    .all<{ id: string; name: string }>();

  const membersRes = await db
    .prepare('SELECT group_id, person_id FROM group_members WHERE left_at IS NULL')
    .all<{ group_id: string; person_id: string }>();

  const expensesRes = await db
    .prepare('SELECT id, group_id, paid_by, amount_paise FROM group_expenses WHERE deleted_at IS NULL')
    .all<{ id: string; group_id: string; paid_by: string; amount_paise: number }>();

  const sharesRes = await db
    .prepare(
      'SELECT s.expense_id, e.group_id, s.person_id, s.amount_paise FROM expense_shares s JOIN group_expenses e ON s.expense_id = e.id WHERE e.deleted_at IS NULL'
    )
    .all<{ expense_id: string; group_id: string; person_id: string; amount_paise: number }>();

  const transfersRes = await db
    .prepare('SELECT group_id, from_person, to_person, amount_paise FROM transfers WHERE deleted_at IS NULL')
    .all<{ group_id: string; from_person: string; to_person: string; amount_paise: number }>();

  const sharesByExpense = new Map<string, { person_id: string; amount_paise: number }[]>();
  for (const s of sharesRes.results || []) {
    const list = sharesByExpense.get(s.expense_id) ?? [];
    list.push(s);
    sharesByExpense.set(s.expense_id, list);
  }

  const expensesByGroup = new Map<string, Expense[]>();
  for (const e of expensesRes.results || []) {
    const list = expensesByGroup.get(e.group_id) ?? [];
    list.push({
      paid_by: e.paid_by,
      amount_paise: e.amount_paise,
      shares: sharesByExpense.get(e.id) ?? [],
    });
    expensesByGroup.set(e.group_id, list);
  }

  const transfersByGroup = new Map<string, Transfer[]>();
  for (const t of transfersRes.results || []) {
    const list = transfersByGroup.get(t.group_id) ?? [];
    list.push(t);
    transfersByGroup.set(t.group_id, list);
  }

  const memberGroupSet = new Set<string>(); // "group_id:person_id"
  for (const m of membersRes.results || []) {
    memberGroupSet.add(`${m.group_id}:${m.person_id}`);
  }

  // Pre-calculate balances for each group
  const groupBalances = new Map<string, Map<string, number>>();
  for (const g of groupsRes.results || []) {
    const exps = expensesByGroup.get(g.id) ?? [];
    const trs = transfersByGroup.get(g.id) ?? [];
    groupBalances.set(g.id, computeBalances(exps, trs));
  }

  const friends = (peopleRes.results || []).map((p) => {
    let totalNetPaise = 0;
    const groupsBreakdown: { group_id: string; group_name: string; name: string; net_paise: number }[] = [];

    for (const g of groupsRes.results || []) {
      const isMember = memberGroupSet.has(`${g.id}:${p.id}`);
      const balMap = groupBalances.get(g.id);
      const bal = balMap?.get(p.id) ?? 0;

      if (isMember || bal !== 0) {
        groupsBreakdown.push({
          group_id: g.id,
          group_name: g.name,
          name: g.name,
          net_paise: bal,
        });
        totalNetPaise += bal;
      }
    }

    return {
      person: {
        id: p.id,
        name: p.name,
        upi_vpa: p.upi_vpa,
        phone: p.phone,
      },
      id: p.id,
      name: p.name,
      upi_vpa: p.upi_vpa,
      phone: p.phone,
      net_paise: totalNetPaise,
      groups: groupsBreakdown,
    };
  });

  return c.json(friends);
});

export default peopleRouter;
