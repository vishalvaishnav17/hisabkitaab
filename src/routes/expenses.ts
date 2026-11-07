import { Hono } from 'hono';
import { Bindings } from '../env';
import { getDateRangeClause, getThisMonthRange } from '../db/dates';
import { diffSummary, logged } from '../db/activity';

export interface ExpenseRow {
  id: string;
  amount_paise: number;
  amount_expr: string | null;
  description: string;
  category: string;
  payment_method: string;
  date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  source?: 'personal' | 'group';
  group_id?: string | null;
  group_name?: string | null;
  group_expense_id?: string | null;
}

const expensesRouter = new Hono<{ Bindings: Bindings }>();

async function hasGroupTables(db: D1Database): Promise<boolean> {
  try {
    const res = await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='expense_shares'").first();
    return !!res;
  } catch {
    return false;
  }
}

// API: List Expenses with Filters and Stats
expensesRouter.get('/api/expenses', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const search = c.req.query('search')?.trim();
  const category = c.req.query('category')?.trim();
  const paymentMethod = c.req.query('payment_method')?.trim();
  const dateRange = c.req.query('date_range') || 'this_month';
  const includeGroupsParam = c.req.query('include_groups');
  const userWantsGroups = includeGroupsParam === undefined || (includeGroupsParam !== '0' && includeGroupsParam !== 'false');
  const includeGroups = userWantsGroups && (await hasGroupTables(db));

  // Build Filter Clauses for personal expenses
  const personalWhere: string[] = ['deleted_at IS NULL'];
  const personalParams: any[] = [];

  // Build Filter Clauses for group expenses
  const groupWhere: string[] = ["s.person_id = 'me'", 'ge.deleted_at IS NULL', 'g.deleted_at IS NULL'];
  const groupParams: any[] = [];

  if (search) {
    personalWhere.push('(description LIKE ? OR notes LIKE ? OR category LIKE ?)');
    personalParams.push(`%${search}%`, `%${search}%`, `%${search}%`);

    groupWhere.push('(ge.description LIKE ? OR ge.notes LIKE ? OR ge.category LIKE ?)');
    groupParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category) {
    personalWhere.push('category = ?');
    personalParams.push(category);

    groupWhere.push('ge.category = ?');
    groupParams.push(category);
  }

  if (paymentMethod) {
    personalWhere.push('payment_method = ?');
    personalParams.push(paymentMethod);

    if (paymentMethod === 'Group') {
      // Matches group expenses
    } else {
      groupWhere.push('1 = 0');
    }
  }

  const { clause: dateClause, params: dateParams } = getDateRangeClause(dateRange);
  if (dateClause) {
    personalWhere.push(dateClause);
    personalParams.push(...dateParams);

    groupWhere.push(dateClause.replace(/\bdate\b/g, 'ge.date'));
    groupParams.push(...dateParams);
  }

  // 1. Fetch expenses
  let rawExpenses: ExpenseRow[] = [];
  if (includeGroups) {
    const unionSql = `
      SELECT 
        id,
        amount_paise,
        amount_expr,
        description,
        category,
        payment_method,
        date,
        notes,
        created_at,
        updated_at,
        'personal' AS source,
        NULL AS group_id,
        NULL AS group_name,
        NULL AS group_expense_id
      FROM expenses
      WHERE ${personalWhere.join(' AND ')}

      UNION ALL

      SELECT
        ge.id AS id,
        s.amount_paise AS amount_paise,
        ge.amount_expr AS amount_expr,
        ge.description AS description,
        ge.category AS category,
        'Group' AS payment_method,
        ge.date AS date,
        ge.notes AS notes,
        ge.created_at AS created_at,
        ge.updated_at AS updated_at,
        'group' AS source,
        g.id AS group_id,
        g.name AS group_name,
        ge.id AS group_expense_id
      FROM expense_shares s
      JOIN group_expenses ge ON s.expense_id = ge.id
      JOIN groups g ON ge.group_id = g.id
      WHERE ${groupWhere.join(' AND ')}

      ORDER BY date DESC, created_at DESC
      LIMIT 500
    `;
    const res = await db.prepare(unionSql).bind(...personalParams, ...groupParams).all<ExpenseRow>();
    rawExpenses = res.results || [];
  } else {
    const sql = `
      SELECT 
        id,
        amount_paise,
        amount_expr,
        description,
        category,
        payment_method,
        date,
        notes,
        created_at,
        updated_at,
        'personal' AS source,
        NULL AS group_id,
        NULL AS group_name,
        NULL AS group_expense_id
      FROM expenses
      WHERE ${personalWhere.join(' AND ')}
      ORDER BY date DESC, created_at DESC
      LIMIT 500
    `;
    const res = await db.prepare(sql).bind(...personalParams).all<ExpenseRow>();
    rawExpenses = res.results || [];
  }

  // 2. Compute Filtered Stats (all in integer paise)
  let totalSpend = 0;
  const categoryMap: Record<string, number> = {};
  const activeDays = new Set<string>();

  const expenses = rawExpenses.map((e) => {
    const amount_paise = e.amount_paise;
    totalSpend += amount_paise;
    categoryMap[e.category] = (categoryMap[e.category] || 0) + amount_paise;
    activeDays.add(e.date);

    return {
      id: e.id,
      amount_paise,
      amount: amount_paise / 100, // legacy alias in rupees for activity tests
      amount_expr: e.amount_expr,
      description: e.description,
      category: e.category,
      payment_method: e.payment_method,
      date: e.date,
      notes: e.notes,
      created_at: e.created_at,
      updated_at: e.updated_at,
      source: (e.source || 'personal') as 'personal' | 'group',
      group_id: e.group_id ?? null,
      group_name: e.group_name ?? null,
      group_expense_id: e.group_expense_id ?? null,
    };
  });

  const categoryBreakdown = Object.entries(categoryMap)
    .map(([cat, total]) => ({
      category: cat,
      total,
      amount: total,
      total_paise: total,
      amount_paise: total,
    }))
    .sort((a, b) => b.total - a.total);

  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;
  const dailyAverage = activeDays.size > 0 ? Math.round(totalSpend / activeDays.size) : 0;

  // 3. Compute Current Month Spend (Absolute)
  const { start: thisMonthStart, end: nextMonthStart } = getThisMonthRange();
  let monthSpend = 0;
  if (includeGroups) {
    const monthRes = await db
      .prepare(`
        SELECT (
          (SELECT COALESCE(SUM(amount_paise), 0) FROM expenses WHERE date >= ? AND date < ? AND deleted_at IS NULL)
          +
          (SELECT COALESCE(SUM(s.amount_paise), 0)
           FROM expense_shares s
           JOIN group_expenses ge ON s.expense_id = ge.id
           JOIN groups g ON ge.group_id = g.id
           WHERE s.person_id = 'me' AND ge.deleted_at IS NULL AND g.deleted_at IS NULL
             AND ge.date >= ? AND ge.date < ?)
        ) AS monthSpendPaise
      `)
      .bind(thisMonthStart, nextMonthStart, thisMonthStart, nextMonthStart)
      .first<{ monthSpendPaise: number | null }>();
    monthSpend = monthRes?.monthSpendPaise || 0;
  } else {
    const monthRes = await db
      .prepare('SELECT COALESCE(SUM(amount_paise), 0) AS monthSpendPaise FROM expenses WHERE date >= ? AND date < ? AND deleted_at IS NULL')
      .bind(thisMonthStart, nextMonthStart)
      .first<{ monthSpendPaise: number | null }>();
    monthSpend = monthRes?.monthSpendPaise || 0;
  }

  // 4. Compute Daily Trends for Last 14 days
  let trendsRes: { results?: { date: string; amount_paise: number }[] };
  if (includeGroups) {
    trendsRes = await db
      .prepare(`
        SELECT date, SUM(amount_paise) as amount_paise 
        FROM (
          SELECT date, amount_paise 
          FROM expenses 
          WHERE date >= date('now', '-14 days') AND deleted_at IS NULL
          UNION ALL
          SELECT ge.date, s.amount_paise 
          FROM expense_shares s
          JOIN group_expenses ge ON s.expense_id = ge.id
          JOIN groups g ON ge.group_id = g.id
          WHERE s.person_id = 'me' AND ge.deleted_at IS NULL AND g.deleted_at IS NULL
            AND ge.date >= date('now', '-14 days')
        )
        GROUP BY date 
        ORDER BY date ASC
      `)
      .all<{ date: string; amount_paise: number }>();
  } else {
    trendsRes = await db
      .prepare(`
        SELECT date, SUM(amount_paise) as amount_paise 
        FROM expenses 
        WHERE date >= date('now', '-14 days') AND deleted_at IS NULL
        GROUP BY date 
        ORDER BY date ASC
      `)
      .all<{ date: string; amount_paise: number }>();
  }

  const dailyTrends = (trendsRes.results || []).map((r) => ({
    date: r.date,
    amount: r.amount_paise,
    amount_paise: r.amount_paise,
  }));

  return c.json({
    expenses,
    stats: {
      totalSpend,
      total_spend_paise: totalSpend,
      count: expenses.length,
      monthSpend,
      month_spend_paise: monthSpend,
      dailyAverage,
      daily_average_paise: dailyAverage,
      topCategory,
      categoryBreakdown,
      dailyTrends,
    },
  });
});

// API: Create Expense
expensesRouter.post('/api/expenses', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  try {
    const body = await c.req.json();
    let amount_paise: number;
    if (body.amount_paise !== undefined) {
      amount_paise = Number(body.amount_paise);
    } else if (body.amount !== undefined) {
      amount_paise = Math.round(Number(body.amount) * 100);
    } else {
      return c.json({ error: 'Amount must be greater than 0' }, 400);
    }

    const amount_expr = body.amount_expr ? String(body.amount_expr).trim() : null;
    const description = String(body.description || '').trim();
    const category = String(body.category || 'Others').trim();
    const paymentMethod = String(body.payment_method || 'UPI').trim();
    const date = String(body.date || new Date().toISOString().split('T')[0]).trim();
    const notes = body.notes ? String(body.notes).trim() : null;

    if (isNaN(amount_paise) || amount_paise <= 0 || !Number.isInteger(amount_paise)) {
      return c.json({ error: 'Amount must be greater than 0' }, 400);
    }
    if (!description) {
      return c.json({ error: 'Description is required' }, 400);
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const stmt = db
      .prepare(`
        INSERT INTO expenses (id, amount_paise, amount_expr, description, category, payment_method, date, notes, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `)
      .bind(id, amount_paise, amount_expr, description, category, paymentMethod, date, notes, nowIso, nowIso);

    const newRow = {
      id,
      amount_paise,
      amount_expr,
      description,
      category,
      payment_method: paymentMethod,
      date,
      notes,
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: null,
    };

    const activityId = await logged(db, [stmt], {
      entity_type: 'expense',
      entity_id: id,
      action: 'create',
      summary: diffSummary(description, null, newRow),
      before: null,
      after: newRow,
    });

    return c.json({ success: true, activity_id: activityId, ...newRow }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to create expense' }, 500);
  }
});

// API: Update Expense
expensesRouter.put('/api/expenses/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const existing = await db
    .prepare('SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<ExpenseRow>();

  if (!existing) {
    return c.json({ error: 'Expense not found' }, 404);
  }

  try {
    const body = await c.req.json();
    let amount_paise: number;
    if (body.amount_paise !== undefined) {
      amount_paise = Number(body.amount_paise);
    } else if (body.amount !== undefined) {
      amount_paise = Math.round(Number(body.amount) * 100);
    } else {
      return c.json({ error: 'Amount must be greater than 0' }, 400);
    }

    const description = String(body.description || '').trim();
    const category = String(body.category || 'Others').trim();
    const paymentMethod = String(body.payment_method || 'UPI').trim();
    const date = String(body.date || existing.date).trim();
    const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing.notes;
    const amount_expr = body.amount_expr !== undefined ? (body.amount_expr ? String(body.amount_expr).trim() : null) : existing.amount_expr;

    if (isNaN(amount_paise) || amount_paise <= 0 || !Number.isInteger(amount_paise)) {
      return c.json({ error: 'Amount must be greater than 0' }, 400);
    }
    if (!description) {
      return c.json({ error: 'Description is required' }, 400);
    }

    const nowIso = new Date().toISOString();

    const stmt = db
      .prepare(`
        UPDATE expenses 
        SET amount_paise = ?, amount_expr = ?, description = ?, category = ?, payment_method = ?, date = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `)
      .bind(amount_paise, amount_expr, description, category, paymentMethod, date, notes, nowIso, id);

    const updatedRow = {
      ...existing,
      amount_paise,
      amount_expr,
      description,
      category,
      payment_method: paymentMethod,
      date,
      notes,
      updated_at: nowIso,
    };

    const summary = diffSummary(description, existing, updatedRow, [
      'amount_paise',
      'amount_expr',
      'description',
      'category',
      'payment_method',
      'date',
      'notes',
    ]);

    const activityId = await logged(db, [stmt], {
      entity_type: 'expense',
      entity_id: id,
      action: 'update',
      summary,
      before: existing,
      after: updatedRow,
    });

    return c.json({ success: true, activity_id: activityId, ...updatedRow });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to update expense' }, 500);
  }
});

// API: Delete Expense
expensesRouter.delete('/api/expenses/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  const existing = await db
    .prepare('SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<ExpenseRow>();

  if (!existing) {
    return c.json({ error: 'Expense not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  const stmt = db
    .prepare('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .bind(nowIso, nowIso, id);

  const activityId = await logged(db, [stmt], {
    entity_type: 'expense',
    entity_id: id,
    action: 'delete',
    summary: diffSummary(existing.description, existing, null),
    before: existing,
    after: null,
  });

  return c.json({ success: true, activity_id: activityId });
});

// API: Export to CSV
expensesRouter.get('/api/export', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.text('D1 Database not configured', 500);
  }

  const dateRange = c.req.query('date_range') || 'all';
  const includeGroupsParam = c.req.query('include_groups');
  const userWantsGroups = includeGroupsParam === undefined || (includeGroupsParam !== '0' && includeGroupsParam !== 'false');
  const includeGroups = userWantsGroups && (await hasGroupTables(db));

  const personalWhere: string[] = ['deleted_at IS NULL'];
  const personalParams: any[] = [];
  const groupWhere: string[] = ["s.person_id = 'me'", 'ge.deleted_at IS NULL', 'g.deleted_at IS NULL'];
  const groupParams: any[] = [];

  const { clause: dateClause, params: dateParams } = getDateRangeClause(dateRange);
  if (dateClause) {
    personalWhere.push(dateClause);
    personalParams.push(...dateParams);

    groupWhere.push(dateClause.replace(/\bdate\b/g, 'ge.date'));
    groupParams.push(...dateParams);
  }

  let sql = '';
  let params: any[] = [];

  if (includeGroups) {
    sql = `
      SELECT 
        id, amount_paise, description, category, payment_method, date, notes, created_at, 'personal' AS source
      FROM expenses
      WHERE ${personalWhere.join(' AND ')}

      UNION ALL

      SELECT 
        ge.id AS id, s.amount_paise AS amount_paise, ge.description AS description, ge.category AS category,
        'Group' AS payment_method, ge.date AS date, ge.notes AS notes, ge.created_at AS created_at, 'group' AS source
      FROM expense_shares s
      JOIN group_expenses ge ON s.expense_id = ge.id
      JOIN groups g ON ge.group_id = g.id
      WHERE ${groupWhere.join(' AND ')}

      ORDER BY date DESC, created_at DESC
    `;
    params = [...personalParams, ...groupParams];
  } else {
    sql = `
      SELECT 
        id, amount_paise, description, category, payment_method, date, notes, created_at, 'personal' AS source
      FROM expenses
      WHERE ${personalWhere.join(' AND ')}
      ORDER BY date DESC, created_at DESC
    `;
    params = personalParams;
  }

  const { results: expenses } = await db.prepare(sql).bind(...params).all<{
    id: string;
    amount_paise: number;
    description: string;
    category: string;
    payment_method: string;
    date: string;
    notes: string | null;
    created_at: string;
    source: string;
  }>();

  // Generate CSV Header & Rows
  const csvHeaders = ['ID', 'Date', 'Amount (INR)', 'Description', 'Category', 'Payment Method', 'Notes', 'Created At', 'Source'];
  const csvRows = [csvHeaders.join(',')];

  (expenses || []).forEach((item) => {
    const escape = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
    csvRows.push([
      escape(item.id),
      escape(item.date),
      (item.amount_paise / 100).toFixed(2),
      escape(item.description),
      escape(item.category),
      escape(item.payment_method),
      escape(item.notes || ''),
      escape(item.created_at),
      escape(item.source),
    ].join(','));
  });

  return new Response(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="hisabkitaab-expenses.csv"',
    },
  });
});

export default expensesRouter;
