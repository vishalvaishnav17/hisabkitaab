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
  deleted_at: string | null;
}

const expensesRouter = new Hono<{ Bindings: Bindings }>();

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

  // Build Filter Clauses
  const whereClauses: string[] = ['deleted_at IS NULL'];
  const params: any[] = [];

  if (search) {
    whereClauses.push('(description LIKE ? OR notes LIKE ? OR category LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category) {
    whereClauses.push('category = ?');
    params.push(category);
  }

  if (paymentMethod) {
    whereClauses.push('payment_method = ?');
    params.push(paymentMethod);
  }

  const { clause: dateClause, params: dateParams } = getDateRangeClause(dateRange);
  if (dateClause) {
    whereClauses.push(dateClause);
    params.push(...dateParams);
  }

  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

  // 1. Fetch expenses
  const sql = `SELECT * FROM expenses ${whereSql} ORDER BY date DESC, created_at DESC LIMIT 500`;
  const { results: rawExpenses } = await db.prepare(sql).bind(...params).all<ExpenseRow>();

  // 2. Compute Filtered Stats
  let totalSpend = 0;
  const categoryMap: Record<string, number> = {};
  const activeDays = new Set<string>();

  const expenses = rawExpenses.map((e) => {
    const amount = e.amount_paise / 100;
    totalSpend += amount;
    categoryMap[e.category] = (categoryMap[e.category] || 0) + amount;
    activeDays.add(e.date);

    return {
      id: e.id,
      amount,
      amount_expr: e.amount_expr,
      description: e.description,
      category: e.category,
      payment_method: e.payment_method,
      date: e.date,
      notes: e.notes,
      created_at: e.created_at,
      updated_at: e.updated_at,
    };
  });

  const categoryBreakdown = Object.entries(categoryMap)
    .map(([cat, total]) => ({ category: cat, total, amount: total }))
    .sort((a, b) => b.total - a.total);

  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;
  const dailyAverage = activeDays.size > 0 ? Math.round(totalSpend / activeDays.size) : 0;

  // 3. Compute Current Month Spend (Absolute)
  const { start: thisMonthStart, end: nextMonthStart } = getThisMonthRange();
  const monthRes = await db
    .prepare('SELECT SUM(amount_paise) as monthSpendPaise FROM expenses WHERE date >= ? AND date < ? AND deleted_at IS NULL')
    .bind(thisMonthStart, nextMonthStart)
    .first<{ monthSpendPaise: number | null }>();
  const monthSpend = (monthRes?.monthSpendPaise || 0) / 100;

  // 4. Compute Daily Trends for Last 14 days
  const trendsRes = await db
    .prepare(`
      SELECT date, SUM(amount_paise) as amount_paise 
      FROM expenses 
      WHERE date >= date('now', '-14 days') AND deleted_at IS NULL
      GROUP BY date 
      ORDER BY date ASC
    `)
    .all<{ date: string; amount_paise: number }>();

  const dailyTrends = (trendsRes.results || []).map((r) => ({
    date: r.date,
    amount: r.amount_paise / 100,
  }));

  return c.json({
    expenses,
    stats: {
      totalSpend,
      count: expenses.length,
      monthSpend,
      dailyAverage,
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
    const amount = Number(body.amount);
    const amount_expr = body.amount_expr ? String(body.amount_expr).trim() : null;
    const description = String(body.description || '').trim();
    const category = String(body.category || 'Others').trim();
    const paymentMethod = String(body.payment_method || 'UPI').trim();
    const date = String(body.date || new Date().toISOString().split('T')[0]).trim();
    const notes = body.notes ? String(body.notes).trim() : null;

    if (isNaN(amount) || amount <= 0) {
      return c.json({ error: 'Amount must be greater than 0' }, 400);
    }
    if (!description) {
      return c.json({ error: 'Description is required' }, 400);
    }

    const id = crypto.randomUUID();
    const amount_paise = Math.round(amount * 100);
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

    return c.json({ success: true, id, activity_id: activityId }, 201);
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
    const amount = Number(body.amount);
    const description = String(body.description || '').trim();
    const category = String(body.category || 'Others').trim();
    const paymentMethod = String(body.payment_method || 'UPI').trim();
    const date = String(body.date || existing.date).trim();
    const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing.notes;
    const amount_expr = body.amount_expr !== undefined ? (body.amount_expr ? String(body.amount_expr).trim() : null) : existing.amount_expr;

    if (isNaN(amount) || amount <= 0) {
      return c.json({ error: 'Amount must be greater than 0' }, 400);
    }
    if (!description) {
      return c.json({ error: 'Description is required' }, 400);
    }

    const amount_paise = Math.round(amount * 100);
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

    return c.json({ success: true, activity_id: activityId });
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
  const whereClauses: string[] = ['deleted_at IS NULL'];
  const params: any[] = [];

  const { clause: dateClause, params: dateParams } = getDateRangeClause(dateRange);
  if (dateClause) {
    whereClauses.push(dateClause);
    params.push(...dateParams);
  }

  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
  const sql = `SELECT * FROM expenses ${whereSql} ORDER BY date DESC, created_at DESC`;
  const { results: expenses } = await db.prepare(sql).bind(...params).all<ExpenseRow>();

  // Generate CSV Header & Rows
  const csvHeaders = ['ID', 'Date', 'Amount (INR)', 'Description', 'Category', 'Payment Method', 'Notes', 'Created At'];
  const csvRows = [csvHeaders.join(',')];

  expenses.forEach((item) => {
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
