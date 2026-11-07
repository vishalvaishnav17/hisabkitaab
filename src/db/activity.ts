export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  const isWhole = Number.isInteger(rupees);
  const formatted = Math.abs(rupees).toLocaleString('en-IN', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${rupees < 0 ? '-' : ''}₹${formatted}`;
}

export function diffSummary(
  label: string,
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
  fields?: string[],
): string {
  if (!before && after) {
    return `Added ${label}`;
  }
  if (before && !after) {
    return `Deleted ${label}`;
  }
  if (!before && !after) {
    return label;
  }

  const b = before!;
  const a = after!;

  const candidateFields = fields ?? Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  const ignoredFields = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);

  const changes: string[] = [];

  for (const field of candidateFields) {
    if (ignoredFields.has(field)) continue;

    const valBefore = b[field];
    const valAfter = a[field];

    if (valBefore === valAfter) continue;
    // Also handle null vs undefined equivalence
    if ((valBefore === null || valBefore === undefined) && (valAfter === null || valAfter === undefined)) {
      continue;
    }

    const isPaise = field.endsWith('_paise');
    const displayField = isPaise ? field.replace(/_paise$/, '') : field;

    const formatVal = (v: any) => {
      if (v === null || v === undefined) return '';
      if (isPaise) return formatPaise(Number(v));
      return String(v);
    };

    changes.push(`${displayField} ${formatVal(valBefore)} → ${formatVal(valAfter)}`);
  }

  if (changes.length === 0) {
    return `${label}: no changes`;
  }

  return `${label}: ${changes.join(', ')}`;
}

export interface ActivityEntryInput {
  entity_type: string;
  entity_id: string;
  group_id?: string | null;
  action: 'create' | 'update' | 'delete' | 'restore';
  summary: string;
  before?: any;
  after?: any;
}

export async function logged(
  db: D1Database,
  statements: D1PreparedStatement[],
  entry: ActivityEntryInput,
): Promise<string> {
  const id = crypto.randomUUID();
  const at = new Date().toISOString();
  const beforeJson = entry.before !== undefined && entry.before !== null
    ? (typeof entry.before === 'string' ? entry.before : JSON.stringify(entry.before))
    : null;
  const afterJson = entry.after !== undefined && entry.after !== null
    ? (typeof entry.after === 'string' ? entry.after : JSON.stringify(entry.after))
    : null;

  const activityStmt = db
    .prepare(
      `INSERT INTO activity (id, at, entity_type, entity_id, group_id, action, summary, before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      at,
      entry.entity_type,
      entry.entity_id,
      entry.group_id ?? null,
      entry.action,
      entry.summary,
      beforeJson,
      afterJson,
    );

  await db.batch([...statements, activityStmt]);
  return id;
}

export type Restorer = (
  db: D1Database,
  snapshot: any,
) => D1PreparedStatement[] | Promise<D1PreparedStatement[]>;

const restorerRegistry = new Map<string, Restorer>();

export function registerRestorer(entity_type: string, restorer: Restorer): void {
  restorerRegistry.set(entity_type, restorer);
}

export function getRestorer(entity_type: string): Restorer | undefined {
  return restorerRegistry.get(entity_type);
}

// Register personal expense restorer
registerRestorer('expense', (db: D1Database, snapshot: any) => {
  const nowIso = new Date().toISOString();
  const stmt = db
    .prepare(
      `INSERT INTO expenses (id, amount_paise, amount_expr, description, category, payment_method, date, notes, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET
         amount_paise = excluded.amount_paise,
         amount_expr = excluded.amount_expr,
         description = excluded.description,
         category = excluded.category,
         payment_method = excluded.payment_method,
         date = excluded.date,
         notes = excluded.notes,
         updated_at = excluded.updated_at,
         deleted_at = NULL`
    )
    .bind(
      snapshot.id,
      snapshot.amount_paise,
      snapshot.amount_expr ?? null,
      snapshot.description,
      snapshot.category,
      snapshot.payment_method ?? 'UPI',
      snapshot.date,
      snapshot.notes ?? null,
      snapshot.created_at || nowIso,
      nowIso,
    );
  return [stmt];
});

// Register group_expense restorer (rebuilds the shares)
registerRestorer('group_expense', (db: D1Database, snapshot: any) => {
  const nowIso = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    db
      .prepare(
        `INSERT INTO group_expenses (id, group_id, description, category, amount_paise, amount_expr, paid_by, split_type, date, notes, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           group_id = excluded.group_id,
           description = excluded.description,
           category = excluded.category,
           amount_paise = excluded.amount_paise,
           amount_expr = excluded.amount_expr,
           paid_by = excluded.paid_by,
           split_type = excluded.split_type,
           date = excluded.date,
           notes = excluded.notes,
           updated_at = excluded.updated_at,
           deleted_at = NULL`
      )
      .bind(
        snapshot.id,
        snapshot.group_id,
        snapshot.description,
        snapshot.category ?? 'Others',
        snapshot.amount_paise,
        snapshot.amount_expr ?? null,
        snapshot.paid_by,
        snapshot.split_type ?? 'equal',
        snapshot.date,
        snapshot.notes ?? null,
        snapshot.created_at || nowIso,
        nowIso,
      )
  );

  stmts.push(
    db.prepare('DELETE FROM expense_shares WHERE expense_id = ?').bind(snapshot.id)
  );

  if (Array.isArray(snapshot.shares)) {
    for (const share of snapshot.shares) {
      stmts.push(
        db
          .prepare(
            'INSERT INTO expense_shares (expense_id, person_id, amount_paise) VALUES (?, ?, ?)'
          )
          .bind(snapshot.id, share.person_id || share.personId, share.amount_paise)
      );
    }
  }

  return stmts;
});

// Register transfer restorer
registerRestorer('transfer', (db: D1Database, snapshot: any) => {
  const nowIso = new Date().toISOString();
  const stmt = db
    .prepare(
      `INSERT INTO transfers (id, group_id, from_person, to_person, amount_paise, amount_expr, date, method, note, created_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET
         group_id = excluded.group_id,
         from_person = excluded.from_person,
         to_person = excluded.to_person,
         amount_paise = excluded.amount_paise,
         amount_expr = excluded.amount_expr,
         date = excluded.date,
         method = excluded.method,
         note = excluded.note,
         deleted_at = NULL`
    )
    .bind(
      snapshot.id,
      snapshot.group_id,
      snapshot.from_person,
      snapshot.to_person,
      snapshot.amount_paise,
      snapshot.amount_expr ?? null,
      snapshot.date,
      snapshot.method ?? null,
      snapshot.note ?? null,
      snapshot.created_at || nowIso,
    );
  return [stmt];
});

// Register group restorer
registerRestorer('group', (db: D1Database, snapshot: any) => {
  const nowIso = new Date().toISOString();
  const stmt = db
    .prepare(
      `INSERT INTO groups (id, name, emoji, kind, simplify_debts, archived_at, created_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         emoji = excluded.emoji,
         kind = excluded.kind,
         simplify_debts = excluded.simplify_debts,
         archived_at = excluded.archived_at,
         deleted_at = NULL`
    )
    .bind(
      snapshot.id,
      snapshot.name,
      snapshot.emoji ?? null,
      snapshot.kind ?? 'other',
      snapshot.simplify_debts ?? 1,
      snapshot.archived_at ?? null,
      snapshot.created_at || nowIso,
    );
  return [stmt];
});

// Register person restorer
registerRestorer('person', (db: D1Database, snapshot: any) => {
  const nowIso = new Date().toISOString();
  const stmt = db
    .prepare(
      `INSERT INTO people (id, name, upi_vpa, phone, is_me, created_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         upi_vpa = excluded.upi_vpa,
         phone = excluded.phone,
         is_me = excluded.is_me,
         deleted_at = NULL`
    )
    .bind(
      snapshot.id,
      snapshot.name,
      snapshot.upi_vpa ?? null,
      snapshot.phone ?? null,
      snapshot.is_me ?? 0,
      snapshot.created_at || nowIso,
    );
  return [stmt];
});

