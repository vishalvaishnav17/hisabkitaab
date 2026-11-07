import { Hono } from 'hono';
import { Bindings } from '../env';
import { diffSummary, formatPaise, logged } from '../db/activity';
import { formatISODate } from '../db/dates';
import {
  computePeriodsDue,
  CreateBillInput,
  getDayOfYear,
  getBillWithParticipants,
  payBill,
  RecurringBillItem,
  RecurringBillRow,
  skipBill,
  UpdateBillInput,
} from '../services/bills';
import { ServiceError } from '../services/groups';

const billsRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/bills -> { due: [...], upcoming: [...] }
billsRouter.get('/api/bills', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const today = formatISODate(new Date());

  const billsRes = await db
    .prepare(
      `SELECT b.*, g.name as group_name
       FROM recurring_bills b
       LEFT JOIN groups g ON b.group_id = g.id
       WHERE b.deleted_at IS NULL AND b.active = 1
       ORDER BY b.next_due ASC, b.created_at DESC`
    )
    .all<RecurringBillRow & { group_name: string | null }>();

  const allBills = billsRes.results || [];

  const participantsRes = await db
    .prepare('SELECT bill_id, person_id FROM recurring_bill_participants')
    .all<{ bill_id: string; person_id: string }>();

  const participantsByBill = new Map<string, string[]>();
  for (const p of participantsRes.results || []) {
    const list = participantsByBill.get(p.bill_id) ?? [];
    list.push(p.person_id);
    participantsByBill.set(p.bill_id, list);
  }

  const due: RecurringBillItem[] = [];
  const upcoming: RecurringBillItem[] = [];

  for (const b of allBills) {
    const participant_ids = participantsByBill.get(b.id) ?? [];
    const is_overdue = b.next_due < today;
    const periods_due = computePeriodsDue(b.next_due, b.cadence, b.anchor_day, today);

    const item: RecurringBillItem = {
      ...b,
      kind: b.group_id ? 'shared' : 'personal',
      group_name: b.group_name ?? null,
      participant_ids,
      periods_due,
      is_overdue,
    };

    if (b.next_due <= today) {
      due.push(item);
    } else {
      upcoming.push(item);
    }
  }

  return c.json({ due, upcoming });
});

// GET /api/bills/due-count -> { count }
billsRouter.get('/api/bills/due-count', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const today = formatISODate(new Date());
  const res = await db
    .prepare(
      'SELECT COUNT(*) as count FROM recurring_bills WHERE deleted_at IS NULL AND active = 1 AND next_due <= ?'
    )
    .bind(today)
    .first<{ count: number }>();

  return c.json({ count: res?.count ?? 0 });
});

// POST /api/bills -> create bill
billsRouter.post('/api/bills', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  try {
    const body = await c.req.json<CreateBillInput>();
    const title = String(body.title || '').trim();
    if (!title) {
      return c.json({ error: 'Title is required' }, 400);
    }

    const cadence = body.cadence;
    if (!['weekly', 'monthly', 'yearly'].includes(cadence)) {
      return c.json({ error: 'Cadence must be one of weekly, monthly, yearly' }, 400);
    }

    const firstDue = body.next_due || body.first_due_date;
    if (!firstDue || !/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) {
      return c.json({ error: 'A valid first due date (YYYY-MM-DD) is required' }, 400);
    }

    let anchorDay: number;
    if (body.anchor_day !== undefined && body.anchor_day !== null) {
      anchorDay = Number(body.anchor_day);
    } else {
      const [y, m, d] = firstDue.split('-').map(Number);
      if (cadence === 'weekly') {
        anchorDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      } else if (cadence === 'monthly') {
        anchorDay = d;
      } else {
        anchorDay = getDayOfYear(firstDue);
      }
    }

    let amount_paise: number | null = null;
    if (body.amount_paise !== undefined && body.amount_paise !== null) {
      amount_paise = Number(body.amount_paise);
      if (!Number.isInteger(amount_paise) || amount_paise <= 0) {
        return c.json({ error: 'Amount must be a positive integer in paise or null' }, 400);
      }
    }

    const amount_expr = body.amount_expr ? String(body.amount_expr).trim() : null;
    const category = String(body.category || 'Bills & Utilities').trim();
    const payment_method = body.payment_method ? String(body.payment_method).trim() : null;
    const group_id = body.group_id ? String(body.group_id).trim() : null;

    let paid_by: string | null = null;
    let participantIds: string[] = [];

    if (group_id) {
      const group = await db
        .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
        .bind(group_id)
        .first();

      if (!group) {
        return c.json({ error: 'Group not found' }, 404);
      }
      if ((group as any).archived_at) {
        return c.json({ error: 'Group is archived' }, 400);
      }

      const activeMembers = await db
        .prepare(
          `SELECT m.person_id FROM group_members m
           JOIN people p ON m.person_id = p.id
           WHERE m.group_id = ? AND m.left_at IS NULL AND p.deleted_at IS NULL`
        )
        .bind(group_id)
        .all<{ person_id: string }>();

      const activeMemberIds = new Set((activeMembers.results || []).map((m) => m.person_id));
      if (activeMemberIds.size === 0) {
        return c.json({ error: 'Group has no active members' }, 400);
      }

      paid_by = String(body.paid_by || 'me').trim();
      if (!activeMemberIds.has(paid_by)) {
        return c.json({ error: `Payer "${paid_by}" must be an active member of the group` }, 400);
      }

      if (body.participant_ids && body.participant_ids.length > 0) {
        for (const pid of body.participant_ids) {
          if (!activeMemberIds.has(pid)) {
            return c.json({ error: `Participant "${pid}" must be an active member of the group` }, 400);
          }
        }
        participantIds = body.participant_ids;
      } else {
        participantIds = Array.from(activeMemberIds);
      }
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const active = body.active !== undefined ? (body.active ? 1 : 0) : 1;

    const insertBillStmt = db
      .prepare(
        `INSERT INTO recurring_bills (id, title, amount_paise, amount_expr, category, payment_method, cadence, anchor_day, next_due, group_id, paid_by, active, created_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        id,
        title,
        amount_paise,
        amount_expr,
        category,
        payment_method,
        cadence,
        anchorDay,
        firstDue,
        group_id,
        paid_by,
        active,
        nowIso
      );

    const participantStmts = participantIds.map((pid) =>
      db
        .prepare('INSERT INTO recurring_bill_participants (bill_id, person_id) VALUES (?, ?)')
        .bind(id, pid)
    );

    const newRow = {
      id,
      title,
      amount_paise,
      amount_expr,
      category,
      payment_method,
      cadence,
      anchor_day: anchorDay,
      next_due: firstDue,
      group_id,
      paid_by,
      active,
      created_at: nowIso,
      deleted_at: null,
      participant_ids: participantIds,
    };

    const summary = amount_paise
      ? `Added bill ${title}: ${formatPaise(amount_paise)}`
      : `Added bill ${title}`;

    const activity_id = await logged(db, [insertBillStmt, ...participantStmts], {
      entity_type: 'bill',
      entity_id: id,
      group_id,
      action: 'create',
      summary,
      before: null,
      after: newRow,
    });

    return c.json({ success: true, id, activity_id, bill: newRow }, 201);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err.message || 'Failed to create bill' }, 500);
  }
});

// PUT /api/bills/:id -> update bill
billsRouter.put('/api/bills/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const existing = await getBillWithParticipants(db, id);
  if (!existing) {
    return c.json({ error: 'Bill not found' }, 404);
  }

  try {
    const body = await c.req.json<UpdateBillInput>();
    const title = body.title !== undefined ? String(body.title).trim() : existing.title;
    if (!title) {
      return c.json({ error: 'Title is required' }, 400);
    }

    const cadence = body.cadence !== undefined ? body.cadence : existing.cadence;
    if (!['weekly', 'monthly', 'yearly'].includes(cadence)) {
      return c.json({ error: 'Cadence must be one of weekly, monthly, yearly' }, 400);
    }

    let next_due = body.next_due !== undefined ? body.next_due : existing.next_due;
    if (!next_due || !/^\d{4}-\d{2}-\d{2}$/.test(next_due)) {
      return c.json({ error: 'A valid next due date (YYYY-MM-DD) is required' }, 400);
    }

    let anchorDay = body.anchor_day !== undefined ? Number(body.anchor_day) : existing.anchor_day;
    if (body.anchor_day === undefined && body.cadence !== undefined && body.cadence !== existing.cadence) {
      const [y, m, d] = next_due.split('-').map(Number);
      if (cadence === 'weekly') {
        anchorDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      } else if (cadence === 'monthly') {
        anchorDay = d;
      } else {
        anchorDay = getDayOfYear(next_due);
      }
    }

    let amount_paise = existing.amount_paise;
    if (body.amount_paise !== undefined) {
      if (body.amount_paise === null) {
        amount_paise = null;
      } else {
        const p = Number(body.amount_paise);
        if (!Number.isInteger(p) || p <= 0) {
          return c.json({ error: 'Amount must be a positive integer in paise or null' }, 400);
        }
        amount_paise = p;
      }
    }

    const amount_expr =
      body.amount_expr !== undefined
        ? body.amount_expr ? String(body.amount_expr).trim() : null
        : existing.amount_expr;
    const category =
      body.category !== undefined ? String(body.category).trim() : existing.category;
    const payment_method =
      body.payment_method !== undefined
        ? body.payment_method ? String(body.payment_method).trim() : null
        : existing.payment_method;
    const group_id =
      body.group_id !== undefined
        ? body.group_id ? String(body.group_id).trim() : null
        : existing.group_id;
    const active =
      body.active !== undefined ? (body.active ? 1 : 0) : existing.active;

    let paid_by = existing.paid_by;
    let participantIds = existing.participant_ids;

    if (group_id) {
      const group = await db
        .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
        .bind(group_id)
        .first();

      if (!group) {
        return c.json({ error: 'Group not found' }, 404);
      }
      if ((group as any).archived_at) {
        return c.json({ error: 'Group is archived' }, 400);
      }

      const activeMembers = await db
        .prepare(
          `SELECT m.person_id FROM group_members m
           JOIN people p ON m.person_id = p.id
           WHERE m.group_id = ? AND m.left_at IS NULL AND p.deleted_at IS NULL`
        )
        .bind(group_id)
        .all<{ person_id: string }>();

      const activeMemberIds = new Set((activeMembers.results || []).map((m) => m.person_id));

      if (body.paid_by !== undefined) {
        paid_by = String(body.paid_by || 'me').trim();
      } else if (!paid_by) {
        paid_by = 'me';
      }

      if (!activeMemberIds.has(paid_by)) {
        return c.json({ error: `Payer "${paid_by}" must be an active member of the group` }, 400);
      }

      if (body.participant_ids !== undefined) {
        for (const pid of body.participant_ids) {
          if (!activeMemberIds.has(pid)) {
            return c.json({ error: `Participant "${pid}" must be an active member of the group` }, 400);
          }
        }
        participantIds = body.participant_ids;
      }
    } else {
      paid_by = null;
      participantIds = [];
    }

    const updateBillStmt = db
      .prepare(
        `UPDATE recurring_bills
         SET title = ?, amount_paise = ?, amount_expr = ?, category = ?, payment_method = ?,
             cadence = ?, anchor_day = ?, next_due = ?, group_id = ?, paid_by = ?, active = ?
         WHERE id = ?`
      )
      .bind(
        title,
        amount_paise,
        amount_expr,
        category,
        payment_method,
        cadence,
        anchorDay,
        next_due,
        group_id,
        paid_by,
        active,
        id
      );

    const deleteParticipantsStmt = db
      .prepare('DELETE FROM recurring_bill_participants WHERE bill_id = ?')
      .bind(id);

    const insertParticipantStmts = participantIds.map((pid) =>
      db
        .prepare('INSERT INTO recurring_bill_participants (bill_id, person_id) VALUES (?, ?)')
        .bind(id, pid)
    );

    const updatedRow = {
      ...existing,
      title,
      amount_paise,
      amount_expr,
      category,
      payment_method,
      cadence,
      anchor_day: anchorDay,
      next_due,
      group_id,
      paid_by,
      active,
      participant_ids: participantIds,
    };

    const summary = diffSummary(title, existing, updatedRow);

    const activity_id = await logged(
      db,
      [updateBillStmt, deleteParticipantsStmt, ...insertParticipantStmts],
      {
        entity_type: 'bill',
        entity_id: id,
        group_id,
        action: 'update',
        summary,
        before: existing,
        after: updatedRow,
      }
    );

    return c.json({ success: true, activity_id, bill: updatedRow });
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err.message || 'Failed to update bill' }, 500);
  }
});

// DELETE /api/bills/:id -> soft-delete bill
billsRouter.delete('/api/bills/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const existing = await getBillWithParticipants(db, id);
  if (!existing) {
    return c.json({ error: 'Bill not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  const deleteStmt = db
    .prepare('UPDATE recurring_bills SET deleted_at = ? WHERE id = ?')
    .bind(nowIso, id);

  const summary = `Deleted bill ${existing.title}`;

  const activity_id = await logged(db, [deleteStmt], {
    entity_type: 'bill',
    entity_id: id,
    group_id: existing.group_id,
    action: 'delete',
    summary,
    before: existing,
    after: null,
  });

  return c.json({ success: true, activity_id });
});

// POST /api/bills/:id/pay
billsRouter.post('/api/bills/:id/pay', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  try {
    const body = await c.req.json().catch(() => ({}));
    const res = await payBill(db, id, body);
    return c.json(res);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err.message || 'Failed to pay bill' }, 500);
  }
});

// POST /api/bills/:id/skip
billsRouter.post('/api/bills/:id/skip', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  try {
    const res = await skipBill(db, id);
    return c.json(res);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err.message || 'Failed to skip bill' }, 500);
  }
});

export default billsRouter;
