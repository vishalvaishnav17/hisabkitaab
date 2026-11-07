import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { manifest, serviceWorker } from './pwa';

type Bindings = {
  DB: D1Database;
  CLERK_GATE: Fetcher;
  ASSETS: Fetcher;
};

interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  payment_method: string;
  date: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

const app = new Hono<{ Bindings: Bindings }>();

// Home-screen install files stay public. They contain no expense data, and
// Safari requests the icon and manifest without the session cookie.
app.get('/manifest.webmanifest', () => {
  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

app.get('/sw.js', () => {
  return new Response(serviceWorker, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});

app.get('/icons/:name', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404) return c.notFound();
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'public, max-age=604800');
  return new Response(res.body, {
    status: res.status,
    headers,
  });
});

// Clerk session check lives in the clerk-gate worker. This app only serves
// traffic that worker has already accepted.
app.use('*', async (c, next) => {
  const gate = c.env.CLERK_GATE;
  if (!gate) {
    return c.json({ error: 'Authentication unavailable' }, 503);
  }

  let gateResponse: Response;
  try {
    gateResponse = await gate.fetch(c.req.raw.clone());
  } catch {
    return c.json({ error: 'Authentication unavailable' }, 503);
  }

  if (gateResponse.status === 204 && gateResponse.headers.get('x-clerk-gate') === 'ok') {
    await next();
    for (const cookie of gateResponse.headers.getSetCookie?.() ?? []) {
      c.res.headers.append('set-cookie', cookie);
    }
    return;
  }

  return new Response(gateResponse.body, gateResponse);
});

// Enable CORS
app.use('*', cors());

// D1's exec() runs each physical line as its own statement. A CREATE TABLE
// split across lines throws "incomplete input" and the list route 500s.
async function ensureTables(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'UPI',
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)'),
  ]);
}


// API: List Expenses with Filters and Stats
app.get('/api/expenses', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  await ensureTables(db);

  const search = c.req.query('search')?.trim();
  const category = c.req.query('category')?.trim();
  const paymentMethod = c.req.query('payment_method')?.trim();
  const dateRange = c.req.query('date_range') || 'this_month';

  // Build Filter Clauses
  const whereClauses: string[] = [];
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

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const thisMonthPrefix = `${currentYear}-${currentMonth}`;

  if (dateRange === 'this_month') {
    whereClauses.push('date LIKE ?');
    params.push(`${thisMonthPrefix}%`);
  } else if (dateRange === 'last_month') {
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonthStr = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
    whereClauses.push('date LIKE ?');
    params.push(`${lastMonthYear}-${lastMonthStr}%`);
  } else if (dateRange === 'last_30') {
    const past30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    whereClauses.push('date >= ?');
    params.push(past30);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // 1. Fetch expenses
  const sql = `SELECT * FROM expenses ${whereSql} ORDER BY date DESC, created_at DESC LIMIT 500`;
  const { results: expenses } = await db.prepare(sql).bind(...params).all<Expense>();

  // 2. Compute Filtered Stats
  let totalSpend = 0;
  const categoryMap: Record<string, number> = {};
  const activeDays = new Set<string>();

  expenses.forEach((e) => {
    totalSpend += e.amount;
    categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount;
    activeDays.add(e.date);
  });

  const categoryBreakdown = Object.entries(categoryMap)
    .map(([cat, total]) => ({ category: cat, total }))
    .sort((a, b) => b.total - a.total);

  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;
  const dailyAverage = activeDays.size > 0 ? Math.round(totalSpend / activeDays.size) : 0;

  // 3. Compute Current Month Spend (Absolute)
  const monthRes = await db
    .prepare('SELECT SUM(amount) as monthSpend FROM expenses WHERE date LIKE ?')
    .bind(`${thisMonthPrefix}%`)
    .first<{ monthSpend: number | null }>();
  const monthSpend = monthRes?.monthSpend || 0;

  // 4. Compute Daily Trends for Last 14 days
  const trendsRes = await db
    .prepare(`
      SELECT date, SUM(amount) as amount 
      FROM expenses 
      WHERE date >= date('now', '-14 days')
      GROUP BY date 
      ORDER BY date ASC
    `)
    .all<{ date: string; amount: number }>();

  return c.json({
    expenses,
    stats: {
      totalSpend,
      count: expenses.length,
      monthSpend,
      dailyAverage,
      topCategory,
      categoryBreakdown,
      dailyTrends: trendsRes.results || []
    }
  });
});

// API: Create Expense
app.post('/api/expenses', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  await ensureTables(db);

  try {
    const body = await c.req.json();
    const amount = Number(body.amount);
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
    const nowIso = new Date().toISOString();

    await db
      .prepare(`
        INSERT INTO expenses (id, amount, description, category, payment_method, date, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(id, amount, description, category, paymentMethod, date, notes, nowIso, nowIso)
      .run();

    return c.json({ success: true, id }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to create expense' }, 500);
  }
});

// API: Update Expense
app.put('/api/expenses/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const amount = Number(body.amount);
    const description = String(body.description || '').trim();
    const category = String(body.category || 'Others').trim();
    const paymentMethod = String(body.payment_method || 'UPI').trim();
    const date = String(body.date || '').trim();
    const notes = body.notes ? String(body.notes).trim() : null;

    if (isNaN(amount) || amount <= 0) {
      return c.json({ error: 'Amount must be greater than 0' }, 400);
    }
    if (!description) {
      return c.json({ error: 'Description is required' }, 400);
    }

    const nowIso = new Date().toISOString();

    const res = await db
      .prepare(`
        UPDATE expenses 
        SET amount = ?, description = ?, category = ?, payment_method = ?, date = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `)
      .bind(amount, description, category, paymentMethod, date, notes, nowIso, id)
      .run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to update expense' }, 500);
  }
});

// API: Delete Expense
app.delete('/api/expenses/:id', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  const id = c.req.param('id');
  await db.prepare('DELETE FROM expenses WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// API: Export to CSV
app.get('/api/export', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.text('D1 Database not configured', 500);
  }

  await ensureTables(db);

  const dateRange = c.req.query('date_range') || 'all';
  let whereSql = '';
  const params: any[] = [];

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const thisMonthPrefix = `${currentYear}-${currentMonth}`;

  if (dateRange === 'this_month') {
    whereSql = 'WHERE date LIKE ?';
    params.push(`${thisMonthPrefix}%`);
  } else if (dateRange === 'last_month') {
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonthStr = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
    whereSql = 'WHERE date LIKE ?';
    params.push(`${lastMonthYear}-${lastMonthStr}%`);
  } else if (dateRange === 'last_30') {
    const past30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    whereSql = 'WHERE date >= ?';
    params.push(past30);
  }

  const sql = `SELECT * FROM expenses ${whereSql} ORDER BY date DESC, created_at DESC`;
  const { results: expenses } = await db.prepare(sql).bind(...params).all<Expense>();

  // Generate CSV Header & Rows
  const csvHeaders = ['ID', 'Date', 'Amount (INR)', 'Description', 'Category', 'Payment Method', 'Notes', 'Created At'];
  const csvRows = [csvHeaders.join(',')];

  expenses.forEach((item) => {
    const escape = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
    csvRows.push([
      escape(item.id),
      escape(item.date),
      item.amount.toFixed(2),
      escape(item.description),
      escape(item.category),
      escape(item.payment_method),
      escape(item.notes || ''),
      escape(item.created_at)
    ].join(','));
  });

  return new Response(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="hisabkitaab-expenses.csv"'
    }
  });
});

// Catch-all route to serve static assets from ASSETS behind Clerk gate
app.get('*', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const isHtml =
    c.req.path === '/' ||
    c.req.path.endsWith('.html') ||
    res.headers.get('content-type')?.includes('text/html');

  const headers = new Headers(res.headers);
  if (isHtml) {
    headers.set('Cache-Control', 'no-cache');
  } else if (res.ok) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }

  return new Response(res.body, {
    status: res.status,
    headers,
  });
});

export default app;
