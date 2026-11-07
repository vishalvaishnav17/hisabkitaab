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
