import { splitAmount, SplitError, Share } from '../split/split';
import { computeBalances, Expense, Transfer } from '../split/balances';
import { minimizeSettlements, pairwiseDebts, SettlementPayment } from '../split/settle';
import { suggestNextPayer } from '../split/next-payer';
import { formatPaise, logged } from '../db/activity';
import { formatISODate } from '../db/dates';

export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
  }
}

export interface GroupRow {
  id: string;
  name: string;
  emoji: string | null;
  kind: 'trip' | 'home' | 'couple' | 'other';
  simplify_debts: number;
  archived_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface GroupMemberRow {
  group_id: string;
  person_id: string;
  joined_at: string;
  left_at: string | null;
  name: string;
  upi_vpa: string | null;
  phone: string | null;
  is_me: number;
}

export interface ExpenseShareRow {
  expense_id: string;
  person_id: string;
  amount_paise: number;
  person_name?: string;
}

export interface GroupExpenseRow {
  id: string;
  group_id: string;
  description: string;
  category: string;
  amount_paise: number;
  amount_expr: string | null;
  paid_by: string;
  split_type: 'equal' | 'exact';
  date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  shares?: ExpenseShareRow[];
}

export interface TransferRow {
  id: string;
  group_id: string;
  from_person: string;
  to_person: string;
  amount_paise: number;
  amount_expr: string | null;
  date: string;
  method: string | null;
  note: string | null;
  created_at: string;
  deleted_at: string | null;
  from_name?: string;
  to_name?: string;
}

export interface GroupLedger {
  group: GroupRow;
  members: GroupMemberRow[];
  expenses: GroupExpenseRow[];
  transfers: TransferRow[];
}

export interface GroupBalancesResult {
  group: GroupRow;
  members: GroupMemberRow[];
  balances: Record<string, number>;
  settlements: SettlementPayment[];
  next_payer: string | null;
  my_net_paise: number;
}

export interface CreateGroupExpenseInput {
  group_id: string;
  description: string;
  amount_paise: number;
  amount_expr?: string | null;
  paid_by?: string;
  participant_ids?: string[];
  split?:
    | { type: 'equal'; personIds?: string[] }
    | { type: 'exact'; amounts: Record<string, number> };
  category?: string;
  date?: string;
  notes?: string | null;
}

export interface UpdateGroupExpenseInput {
  description?: string;
  amount_paise?: number;
  amount_expr?: string | null;
  paid_by?: string;
  participant_ids?: string[];
  split?:
    | { type: 'equal'; personIds?: string[] }
    | { type: 'exact'; amounts: Record<string, number> };
  category?: string;
  date?: string;
  notes?: string | null;
}

export async function getGroupLedger(db: D1Database, groupId: string): Promise<GroupLedger> {
  const group = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(groupId)
    .first<GroupRow>();

  if (!group) {
    throw new ServiceError('Group not found', 404);
  }

  const membersRes = await db
    .prepare(
      `SELECT m.group_id, m.person_id, m.joined_at, m.left_at, p.name, p.upi_vpa, p.phone, p.is_me
       FROM group_members m
       JOIN people p ON m.person_id = p.id
       WHERE m.group_id = ? AND p.deleted_at IS NULL
       ORDER BY p.name ASC`
    )
    .bind(groupId)
    .all<GroupMemberRow>();

  const expensesRes = await db
    .prepare(
      `SELECT * FROM group_expenses
       WHERE group_id = ? AND deleted_at IS NULL
       ORDER BY date DESC, created_at DESC`
    )
    .bind(groupId)
    .all<GroupExpenseRow>();

  const sharesRes = await db
    .prepare(
      `SELECT s.expense_id, s.person_id, s.amount_paise, p.name as person_name
       FROM expense_shares s
       JOIN group_expenses e ON s.expense_id = e.id
       JOIN people p ON s.person_id = p.id
       WHERE e.group_id = ? AND e.deleted_at IS NULL`
    )
    .bind(groupId)
    .all<ExpenseShareRow>();

  const transfersRes = await db
    .prepare(
      `SELECT t.*, p1.name as from_name, p2.name as to_name
       FROM transfers t
       JOIN people p1 ON t.from_person = p1.id
       JOIN people p2 ON t.to_person = p2.id
       WHERE t.group_id = ? AND t.deleted_at IS NULL
       ORDER BY t.date DESC, t.created_at DESC`
    )
    .bind(groupId)
    .all<TransferRow>();

  const sharesByExpense = new Map<string, ExpenseShareRow[]>();
  for (const s of sharesRes.results || []) {
    const list = sharesByExpense.get(s.expense_id) ?? [];
    list.push(s);
    sharesByExpense.set(s.expense_id, list);
  }

  const expenses = (expensesRes.results || []).map((e) => ({
    ...e,
    shares: sharesByExpense.get(e.id) ?? [],
  }));

  return {
    group,
    members: membersRes.results || [],
    expenses,
    transfers: transfersRes.results || [],
  };
}

export async function getGroupBalances(db: D1Database, groupId: string): Promise<GroupBalancesResult> {
  const ledger = await getGroupLedger(db, groupId);

  const expensesForBalances: Expense[] = ledger.expenses.map((e) => ({
    paid_by: e.paid_by,
    amount_paise: e.amount_paise,
    shares: (e.shares || []).map((s) => ({
      person_id: s.person_id,
      amount_paise: s.amount_paise,
    })),
  }));

  const transfersForBalances: Transfer[] = ledger.transfers.map((t) => ({
    from_person: t.from_person,
    to_person: t.to_person,
    amount_paise: t.amount_paise,
  }));

  const balancesMap = computeBalances(expensesForBalances, transfersForBalances);

  // Ensure all group members exist in balances map with at least 0
  for (const m of ledger.members) {
    if (!balancesMap.has(m.person_id)) {
      balancesMap.set(m.person_id, 0);
    }
  }

  const simplifyDebts = ledger.group.simplify_debts === 1;
  const settlements = simplifyDebts
    ? minimizeSettlements(balancesMap)
    : pairwiseDebts(expensesForBalances, transfersForBalances);

  const activeMembers = ledger.members.filter((m) => !m.left_at).map((m) => m.person_id);

  const lastPaidAt: Record<string, string | undefined> = {};
  for (const m of ledger.members) {
    lastPaidAt[m.person_id] = undefined;
  }
  for (const e of ledger.expenses) {
    const prevDate = lastPaidAt[e.paid_by];
    if (!prevDate || e.date > prevDate) {
      lastPaidAt[e.paid_by] = e.date;
    }
  }

  const next_payer = suggestNextPayer(balancesMap, activeMembers, lastPaidAt);
  const my_net_paise = balancesMap.get('me') ?? 0;

  return {
    group: ledger.group,
    members: ledger.members,
    balances: Object.fromEntries(balancesMap.entries()),
    settlements,
    next_payer,
    my_net_paise,
  };
}

export async function createGroupExpense(
  db: D1Database,
  input: CreateGroupExpenseInput
): Promise<{ id: string; activity_id: string; expense: GroupExpenseRow }> {
  const group = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(input.group_id)
    .first<GroupRow>();

  if (!group) {
    throw new ServiceError('Group not found', 404);
  }

  if (group.archived_at) {
    throw new ServiceError('Group is archived', 400);
  }

  const description = String(input.description || '').trim();
  if (!description) {
    throw new ServiceError('Description is required', 400);
  }

  const amount_paise = Number(input.amount_paise);
  if (!Number.isInteger(amount_paise) || amount_paise <= 0) {
    throw new ServiceError('Amount must be a positive integer in paise', 400);
  }

  const activeMembers = await db
    .prepare(
      `SELECT m.person_id, p.name FROM group_members m
       JOIN people p ON m.person_id = p.id
       WHERE m.group_id = ? AND m.left_at IS NULL AND p.deleted_at IS NULL`
    )
    .bind(input.group_id)
    .all<{ person_id: string; name: string }>();

  const activeMemberMap = new Map<string, string>();
  for (const m of activeMembers.results || []) {
    activeMemberMap.set(m.person_id, m.name);
  }
  const activeMemberIds = Array.from(activeMemberMap.keys());

  if (activeMemberIds.length === 0) {
    throw new ServiceError('Group has no active members', 400);
  }

  const paid_by = String(input.paid_by || 'me').trim();
  if (!activeMemberMap.has(paid_by)) {
    throw new ServiceError(`Payer "${paid_by}" must be an active member of the group`, 400);
  }

  let shares: Share[];
  let split_type: 'equal' | 'exact';

  try {
    if (input.split) {
      if (input.split.type === 'equal') {
        const pIds =
          input.split.personIds && input.split.personIds.length > 0
            ? input.split.personIds
            : input.participant_ids && input.participant_ids.length > 0
            ? input.participant_ids
            : activeMemberIds;

        for (const pid of pIds) {
          if (!activeMemberMap.has(pid)) {
            throw new ServiceError(`Participant "${pid}" must be an active member of the group`, 400);
          }
        }
        shares = splitAmount(amount_paise, { type: 'equal', personIds: pIds });
        split_type = 'equal';
      } else if (input.split.type === 'exact') {
        for (const pid of Object.keys(input.split.amounts || {})) {
          if (!activeMemberMap.has(pid)) {
            throw new ServiceError(`Participant "${pid}" must be an active member of the group`, 400);
          }
        }
        shares = splitAmount(amount_paise, { type: 'exact', amounts: input.split.amounts });
        split_type = 'exact';
      } else {
        throw new ServiceError('Unknown split type', 400);
      }
    } else {
      const pIds =
        input.participant_ids && input.participant_ids.length > 0
          ? input.participant_ids
          : activeMemberIds;

      for (const pid of pIds) {
        if (!activeMemberMap.has(pid)) {
          throw new ServiceError(`Participant "${pid}" must be an active member of the group`, 400);
        }
      }
      shares = splitAmount(amount_paise, { type: 'equal', personIds: pIds });
      split_type = 'equal';
    }
  } catch (err: any) {
    if (err instanceof SplitError) {
      throw new ServiceError(err.message, 400);
    }
    throw err;
  }

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const category = String(input.category || 'Others').trim();
  const date = String(input.date || formatISODate(new Date())).trim();
  const notes = input.notes ? String(input.notes).trim() : null;
  const amount_expr = input.amount_expr ? String(input.amount_expr).trim() : null;

  const expenseStmt = db
    .prepare(
      `INSERT INTO group_expenses (id, group_id, description, category, amount_paise, amount_expr, paid_by, split_type, date, notes, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .bind(id, input.group_id, description, category, amount_paise, amount_expr, paid_by, split_type, date, notes, nowIso, nowIso);

  const shareStmts = shares.map((s) =>
    db
      .prepare('INSERT INTO expense_shares (expense_id, person_id, amount_paise) VALUES (?, ?, ?)')
      .bind(id, s.personId, s.amount_paise)
  );

  const shareRows: ExpenseShareRow[] = shares.map((s) => ({
    expense_id: id,
    person_id: s.personId,
    amount_paise: s.amount_paise,
    person_name: activeMemberMap.get(s.personId),
  }));

  const expenseRow: GroupExpenseRow = {
    id,
    group_id: input.group_id,
    description,
    category,
    amount_paise,
    amount_expr,
    paid_by,
    split_type,
    date,
    notes,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    shares: shareRows,
  };

  const summary = `${group.name} · ${description}: ${formatPaise(amount_paise)}`;

  const activity_id = await logged(db, [expenseStmt, ...shareStmts], {
    entity_type: 'group_expense',
    entity_id: id,
    group_id: input.group_id,
    action: 'create',
    summary,
    before: null,
    after: expenseRow,
  });

  return { id, activity_id, expense: expenseRow };
}

export async function updateGroupExpense(
  db: D1Database,
  id: string,
  input: UpdateGroupExpenseInput
): Promise<{ activity_id: string; expense: GroupExpenseRow }> {
  const existing = await db
    .prepare('SELECT * FROM group_expenses WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<GroupExpenseRow>();

  if (!existing) {
    throw new ServiceError('Expense not found', 404);
  }

  const group = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(existing.group_id)
    .first<GroupRow>();

  if (!group) {
    throw new ServiceError('Group not found', 404);
  }

  if (group.archived_at) {
    throw new ServiceError('Group is archived', 400);
  }

  const existingSharesRes = await db
    .prepare(
      `SELECT s.expense_id, s.person_id, s.amount_paise, p.name as person_name
       FROM expense_shares s
       JOIN people p ON s.person_id = p.id
       WHERE s.expense_id = ?`
    )
    .bind(id)
    .all<ExpenseShareRow>();
  const existingShares = existingSharesRes.results || [];

  const activeMembers = await db
    .prepare(
      `SELECT m.person_id, p.name FROM group_members m
       JOIN people p ON m.person_id = p.id
       WHERE m.group_id = ? AND m.left_at IS NULL AND p.deleted_at IS NULL`
    )
    .bind(existing.group_id)
    .all<{ person_id: string; name: string }>();

  const activeMemberMap = new Map<string, string>();
  for (const m of activeMembers.results || []) {
    activeMemberMap.set(m.person_id, m.name);
  }
  const activeMemberIds = Array.from(activeMemberMap.keys());

  const description =
    input.description !== undefined ? String(input.description).trim() : existing.description;
  if (!description) {
    throw new ServiceError('Description is required', 400);
  }

  const amount_paise =
    input.amount_paise !== undefined ? Number(input.amount_paise) : existing.amount_paise;
  if (!Number.isInteger(amount_paise) || amount_paise <= 0) {
    throw new ServiceError('Amount must be a positive integer in paise', 400);
  }

  const paid_by =
    input.paid_by !== undefined ? String(input.paid_by).trim() : existing.paid_by;
  if (!activeMemberMap.has(paid_by)) {
    throw new ServiceError(`Payer "${paid_by}" must be an active member of the group`, 400);
  }

  const category =
    input.category !== undefined ? String(input.category).trim() : existing.category;
  const date =
    input.date !== undefined ? String(input.date).trim() : existing.date;
  const notes =
    input.notes !== undefined ? (input.notes ? String(input.notes).trim() : null) : existing.notes;
  const amount_expr =
    input.amount_expr !== undefined ? (input.amount_expr ? String(input.amount_expr).trim() : null) : existing.amount_expr;

  let shares: Share[];
  let split_type: 'equal' | 'exact' = existing.split_type;

  try {
    if (input.split) {
      if (input.split.type === 'equal') {
        const pIds =
          input.split.personIds && input.split.personIds.length > 0
            ? input.split.personIds
            : input.participant_ids && input.participant_ids.length > 0
            ? input.participant_ids
            : activeMemberIds;

        for (const pid of pIds) {
          if (!activeMemberMap.has(pid)) {
            throw new ServiceError(`Participant "${pid}" must be an active member of the group`, 400);
          }
        }
        shares = splitAmount(amount_paise, { type: 'equal', personIds: pIds });
        split_type = 'equal';
      } else if (input.split.type === 'exact') {
        for (const pid of Object.keys(input.split.amounts || {})) {
          if (!activeMemberMap.has(pid)) {
            throw new ServiceError(`Participant "${pid}" must be an active member of the group`, 400);
          }
        }
        shares = splitAmount(amount_paise, { type: 'exact', amounts: input.split.amounts });
        split_type = 'exact';
      } else {
        throw new ServiceError('Unknown split type', 400);
      }
    } else if (input.participant_ids) {
      for (const pid of input.participant_ids) {
        if (!activeMemberMap.has(pid)) {
          throw new ServiceError(`Participant "${pid}" must be an active member of the group`, 400);
        }
      }
      shares = splitAmount(amount_paise, { type: 'equal', personIds: input.participant_ids });
      split_type = 'equal';
    } else if (input.amount_paise !== undefined) {
      // Amount changed, re-split existing participants
      const prevIds = existingShares.map((s) => s.person_id);
      for (const pid of prevIds) {
        if (!activeMemberMap.has(pid)) {
          throw new ServiceError(`Participant "${pid}" is no longer an active member of the group`, 400);
        }
      }
      shares = splitAmount(amount_paise, { type: 'equal', personIds: prevIds });
      split_type = 'equal';
    } else {
      shares = existingShares.map((s) => ({
        personId: s.person_id,
        amount_paise: s.amount_paise,
      }));
    }
  } catch (err: any) {
    if (err instanceof SplitError) {
      throw new ServiceError(err.message, 400);
    }
    throw err;
  }

  const nowIso = new Date().toISOString();
  const updateStmt = db
    .prepare(
      `UPDATE group_expenses
       SET description = ?, category = ?, amount_paise = ?, amount_expr = ?, paid_by = ?, split_type = ?, date = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(description, category, amount_paise, amount_expr, paid_by, split_type, date, notes, nowIso, id);

  const deleteSharesStmt = db
    .prepare('DELETE FROM expense_shares WHERE expense_id = ?')
    .bind(id);

  const insertShareStmts = shares.map((s) =>
    db
      .prepare('INSERT INTO expense_shares (expense_id, person_id, amount_paise) VALUES (?, ?, ?)')
      .bind(id, s.personId, s.amount_paise)
  );

  const shareRows: ExpenseShareRow[] = shares.map((s) => ({
    expense_id: id,
    person_id: s.personId,
    amount_paise: s.amount_paise,
    person_name: activeMemberMap.get(s.personId),
  }));

  const updatedRow: GroupExpenseRow = {
    ...existing,
    description,
    category,
    amount_paise,
    amount_expr,
    paid_by,
    split_type,
    date,
    notes,
    updated_at: nowIso,
    shares: shareRows,
  };

  // Build diff summary
  const changes: string[] = [];
  if (existing.amount_paise !== amount_paise) {
    changes.push(`amount ${formatPaise(existing.amount_paise)} → ${formatPaise(amount_paise)}`);
  }
  if (existing.description !== description) {
    changes.push(`description ${existing.description} → ${description}`);
  }
  if (existing.category !== category) {
    changes.push(`category ${existing.category} → ${category}`);
  }
  if (existing.paid_by !== paid_by) {
    const oldName = activeMemberMap.get(existing.paid_by) || existing.paid_by;
    const newName = activeMemberMap.get(paid_by) || paid_by;
    changes.push(`paid_by ${oldName} → ${newName}`);
  }
  if (existing.date !== date) {
    changes.push(`date ${existing.date} → ${date}`);
  }

  // Participants diff
  const oldParticipants = new Set(existingShares.map((s) => s.person_id));
  const newParticipants = new Set(shares.map((s) => s.personId));
  for (const pid of newParticipants) {
    if (!oldParticipants.has(pid)) {
      const name = activeMemberMap.get(pid) || pid;
      changes.push(`+${name}`);
    }
  }
  for (const pid of oldParticipants) {
    if (!newParticipants.has(pid)) {
      const name = activeMemberMap.get(pid) || pid;
      changes.push(`-${name}`);
    }
  }

  const summary =
    changes.length > 0
      ? `${group.name} · ${description}: ${changes.join(', ')}`
      : `${group.name} · ${description}: no changes`;

  const activity_id = await logged(db, [updateStmt, deleteSharesStmt, ...insertShareStmts], {
    entity_type: 'group_expense',
    entity_id: id,
    group_id: existing.group_id,
    action: 'update',
    summary,
    before: { ...existing, shares: existingShares },
    after: updatedRow,
  });

  return { activity_id, expense: updatedRow };
}

export async function deleteGroupExpense(
  db: D1Database,
  id: string
): Promise<{ success: boolean; activity_id: string }> {
  const existing = await db
    .prepare('SELECT * FROM group_expenses WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<GroupExpenseRow>();

  if (!existing) {
    throw new ServiceError('Expense not found', 404);
  }

  const group = await db
    .prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL')
    .bind(existing.group_id)
    .first<GroupRow>();

  if (!group) {
    throw new ServiceError('Group not found', 404);
  }

  if (group.archived_at) {
    throw new ServiceError('Group is archived', 400);
  }

  const existingSharesRes = await db
    .prepare(
      `SELECT s.expense_id, s.person_id, s.amount_paise, p.name as person_name
       FROM expense_shares s
       JOIN people p ON s.person_id = p.id
       WHERE s.expense_id = ?`
    )
    .bind(id)
    .all<ExpenseShareRow>();
  const existingShares = existingSharesRes.results || [];

  const nowIso = new Date().toISOString();
  const deleteStmt = db
    .prepare('UPDATE group_expenses SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .bind(nowIso, nowIso, id);

  const summary = `Deleted ${group.name} · ${existing.description}`;

  const activity_id = await logged(db, [deleteStmt], {
    entity_type: 'group_expense',
    entity_id: id,
    group_id: existing.group_id,
    action: 'delete',
    summary,
    before: { ...existing, shares: existingShares },
    after: null,
  });

  return { success: true, activity_id };
}
