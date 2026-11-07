import { formatPaise, logged, registerRestorer, diffSummary, ActivityEntryInput } from '../db/activity';
import { formatISODate } from '../db/dates';
import { buildGroupExpense, ServiceError } from './groups';

export interface RecurringBillRow {
  id: string;
  title: string;
  amount_paise: number | null;
  amount_expr: string | null;
  category: string;
  payment_method: string | null;
  cadence: 'weekly' | 'monthly' | 'yearly';
  anchor_day: number;
  next_due: string;
  group_id: string | null;
  paid_by: string | null;
  active: number;
  created_at: string;
  deleted_at: string | null;
}

export interface RecurringBillItem extends RecurringBillRow {
  kind: 'personal' | 'shared';
  group_name: string | null;
  participant_ids: string[];
  periods_due: number;
  is_overdue: boolean;
}

export interface CreateBillInput {
  title: string;
  amount_paise?: number | null;
  amount_expr?: string | null;
  category?: string;
  payment_method?: string | null;
  cadence: 'weekly' | 'monthly' | 'yearly';
  anchor_day?: number;
  next_due?: string;
  first_due_date?: string;
  group_id?: string | null;
  paid_by?: string | null;
  participant_ids?: string[];
  active?: number;
}

export interface UpdateBillInput {
  title?: string;
  amount_paise?: number | null;
  amount_expr?: string | null;
  category?: string;
  payment_method?: string | null;
  cadence?: 'weekly' | 'monthly' | 'yearly';
  anchor_day?: number;
  next_due?: string;
  group_id?: string | null;
  paid_by?: string | null;
  participant_ids?: string[];
  active?: number;
}

export interface PayBillInput {
  amount_paise?: number;
  amount_expr?: string | null;
  date?: string;
  participant_ids?: string[];
  paid_by?: string;
}

import { nextDueAfter } from './bills-dates';
export * from './bills-dates';

// Register restorer for bill entity type
registerRestorer('bill', async (db: D1Database, snapshot: any) => {
  const nowIso = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    db
      .prepare(
        `INSERT INTO recurring_bills (id, title, amount_paise, amount_expr, category, payment_method, cadence, anchor_day, next_due, group_id, paid_by, active, created_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           amount_paise = excluded.amount_paise,
           amount_expr = excluded.amount_expr,
           category = excluded.category,
           payment_method = excluded.payment_method,
           cadence = excluded.cadence,
           anchor_day = excluded.anchor_day,
           next_due = excluded.next_due,
           group_id = excluded.group_id,
           paid_by = excluded.paid_by,
           active = excluded.active,
           deleted_at = NULL`
      )
      .bind(
        snapshot.id,
        snapshot.title,
        snapshot.amount_paise ?? null,
        snapshot.amount_expr ?? null,
        snapshot.category ?? 'Bills & Utilities',
        snapshot.payment_method ?? null,
        snapshot.cadence,
        snapshot.anchor_day,
        snapshot.next_due,
        snapshot.group_id ?? null,
        snapshot.paid_by ?? null,
        snapshot.active ?? 1,
        snapshot.created_at || nowIso,
      )
  );

  stmts.push(
    db.prepare('DELETE FROM recurring_bill_participants WHERE bill_id = ?').bind(snapshot.id)
  );

  const participantIds: string[] = snapshot.participant_ids || snapshot.participants || [];
  for (const pid of participantIds) {
    stmts.push(
      db
        .prepare('INSERT INTO recurring_bill_participants (bill_id, person_id) VALUES (?, ?)')
        .bind(snapshot.id, pid)
    );
  }

  return stmts;
});

export async function getBillWithParticipants(
  db: D1Database,
  id: string
): Promise<(RecurringBillRow & { participant_ids: string[] }) | null> {
  const bill = await db
    .prepare('SELECT * FROM recurring_bills WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<RecurringBillRow>();

  if (!bill) return null;

  const { results: participants } = await db
    .prepare('SELECT person_id FROM recurring_bill_participants WHERE bill_id = ?')
    .bind(id)
    .all<{ person_id: string }>();

  return {
    ...bill,
    participant_ids: (participants || []).map((p: { person_id: string }) => p.person_id),
  };
}

export async function payBill(
  db: D1Database,
  billId: string,
  input: PayBillInput
): Promise<{ success: boolean; expense_id: string; next_due: string; activity_id: string }> {
  const bill = await getBillWithParticipants(db, billId);
  if (!bill) {
    throw new ServiceError('Bill not found', 404);
  }

  const amount_paise =
    input.amount_paise !== undefined ? Number(input.amount_paise) : bill.amount_paise;

  if (amount_paise === null || amount_paise === undefined || !Number.isInteger(amount_paise) || amount_paise <= 0) {
    throw new ServiceError('Amount is required and must be a positive integer in paise', 400);
  }

  const date = input.date ? String(input.date).trim() : bill.next_due;
  const amount_expr = input.amount_expr !== undefined ? input.amount_expr : bill.amount_expr;
  const nextDue = nextDueAfter(bill.next_due, bill.cadence, bill.anchor_day);

  const updateBillStmt = db
    .prepare('UPDATE recurring_bills SET next_due = ? WHERE id = ?')
    .bind(nextDue, bill.id);

  const updatedBill = { ...bill, next_due: nextDue };

  const billActivityEntry: ActivityEntryInput = {
    entity_type: 'bill',
    entity_id: bill.id,
    group_id: bill.group_id,
    action: 'update',
    summary: `Paid ${bill.title}`,
    before: bill,
    after: updatedBill,
  };

  if (bill.group_id) {
    // Shared bill: build group expense
    const payer = input.paid_by || bill.paid_by || 'me';
    const participant_ids =
      input.participant_ids && input.participant_ids.length > 0
        ? input.participant_ids
        : bill.participant_ids;

    const built = await buildGroupExpense(db, {
      group_id: bill.group_id,
      description: bill.title,
      category: bill.category,
      amount_paise,
      amount_expr,
      paid_by: payer,
      participant_ids,
      date,
      notes: null,
    });

    const activity_id = await logged(
      db,
      [...built.statements, updateBillStmt],
      [built.activityEntry, billActivityEntry]
    );

    return {
      success: true,
      expense_id: built.id,
      next_due: nextDue,
      activity_id,
    };
  } else {
    // Personal bill: insert into expenses table
    const expenseId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const paymentMethod = bill.payment_method || 'UPI';

    const expenseStmt = db
      .prepare(
        `INSERT INTO expenses (id, amount_paise, amount_expr, description, category, payment_method, date, notes, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        expenseId,
        amount_paise,
        amount_expr ?? null,
        bill.title,
        bill.category,
        paymentMethod,
        date,
        null,
        nowIso,
        nowIso
      );

    const expenseRow = {
      id: expenseId,
      amount_paise,
      amount_expr: amount_expr ?? null,
      description: bill.title,
      category: bill.category,
      payment_method: paymentMethod,
      date,
      notes: null,
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: null,
    };

    const expenseActivityEntry: ActivityEntryInput = {
      entity_type: 'expense',
      entity_id: expenseId,
      action: 'create',
      summary: diffSummary(bill.title, null, expenseRow),
      before: null,
      after: expenseRow,
    };

    const activity_id = await logged(
      db,
      [expenseStmt, updateBillStmt],
      [expenseActivityEntry, billActivityEntry]
    );

    return {
      success: true,
      expense_id: expenseId,
      next_due: nextDue,
      activity_id,
    };
  }
}

export async function skipBill(
  db: D1Database,
  billId: string
): Promise<{ success: true; next_due: string; activity_id: string }> {
  const bill = await getBillWithParticipants(db, billId);
  if (!bill) {
    throw new ServiceError('Bill not found', 404);
  }

  const [y, m, d] = bill.next_due.split('-').map(Number);
  const periodDate = new Date(Date.UTC(y, m - 1, d));
  const periodLabel = periodDate.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const nextDue = nextDueAfter(bill.next_due, bill.cadence, bill.anchor_day);
  const updateStmt = db
    .prepare('UPDATE recurring_bills SET next_due = ? WHERE id = ?')
    .bind(nextDue, bill.id);

  const updatedBill = { ...bill, next_due: nextDue };

  const summary = `Skipped ${bill.title} (${periodLabel})`;

  const activity_id = await logged(db, [updateStmt], {
    entity_type: 'bill',
    entity_id: bill.id,
    group_id: bill.group_id,
    action: 'update',
    summary,
    before: bill,
    after: updatedBill,
  });

  return {
    success: true,
    next_due: nextDue,
    activity_id,
  };
}
