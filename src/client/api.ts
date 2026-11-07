export interface Expense {
  id: string;
  amount: number;
  amount_expr?: string | null;
  description: string;
  category: string;
  payment_method: string;
  date: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Stats {
  totalSpend: number;
  count: number;
  monthSpend: number;
  dailyAverage: number;
  topCategory: { category: string; amount?: number; total?: number } | null;
  categoryBreakdown: { category: string; total: number }[];
  dailyTrends: { date: string; amount: number }[];
}

export interface ExpenseFilterParams {
  search?: string;
  category?: string;
  payment_method?: string;
  date_range?: string;
}

export interface ExpensePayload {
  amount: number;
  amount_expr?: string | null;
  description: string;
  category: string;
  payment_method: string;
  date: string;
  notes?: string | null;
}

export interface DeleteExpenseResult {
  success: boolean;
  activity_id?: string;
}

export interface ActivityItem {
  id: string;
  at: string;
  entity_type: string;
  entity_id: string;
  group_id: string | null;
  action: 'create' | 'update' | 'delete' | 'restore';
  summary: string;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
}

export interface ActivityFilterParams {
  group_id?: string;
  entity_type?: string;
  action?: string;
  before?: string;
  limit?: number;
}

export interface ActivityListResponse {
  items: ActivityItem[];
  next_cursor: string | null;
}

export function redirectIfSignedOut(res: Response): boolean {
  if (res.status === 401 || res.status === 403) {
    window.location.assign('/sign-in?reason=' + (res.status === 403 ? 'not-allowed' : 'signed-out'));
    return true;
  }
  return false;
}

export async function fetchExpensesApi(
  params: ExpenseFilterParams
): Promise<{ expenses: Expense[]; stats: Stats } | null> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.category) query.set('category', params.category);
  if (params.payment_method) query.set('payment_method', params.payment_method);
  if (params.date_range) query.set('date_range', params.date_range);

  const res = await fetch('/api/expenses?' + query.toString());
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) throw new Error('Failed to fetch expenses');
  return res.json();
}

export async function createExpenseApi(
  payload: ExpensePayload
): Promise<{ success: boolean; id: string } | null> {
  const res = await fetch('/api/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save expense');
  }
  return res.json();
}

export async function updateExpenseApi(
  id: string,
  payload: ExpensePayload
): Promise<{ success: boolean } | null> {
  const res = await fetch('/api/expenses/' + encodeURIComponent(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save expense');
  }
  return res.json();
}

export async function deleteExpenseApi(id: string): Promise<DeleteExpenseResult | null> {
  const res = await fetch('/api/expenses/' + encodeURIComponent(id), {
    method: 'DELETE',
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) throw new Error('Failed to delete expense');
  return res.json();
}

export async function fetchActivityApi(
  params: ActivityFilterParams
): Promise<ActivityListResponse | null> {
  const query = new URLSearchParams();
  if (params.group_id) query.set('group_id', params.group_id);
  if (params.entity_type) query.set('entity_type', params.entity_type);
  if (params.action) query.set('action', params.action);
  if (params.before) query.set('before', params.before);
  if (params.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const url = '/api/activity' + (qs ? `?${qs}` : '');
  const res = await fetch(url);
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) throw new Error('Failed to fetch activity');
  return res.json();
}

export async function fetchEntityActivityApi(
  entityType: string,
  entityId: string
): Promise<{ items: ActivityItem[] } | null> {
  const res = await fetch(
    `/api/activity/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`
  );
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) throw new Error('Failed to fetch entity activity');
  return res.json();
}

export async function restoreActivityApi(
  activityId: string
): Promise<{ success: boolean; activity_id: string } | null> {
  const res = await fetch(`/api/activity/${encodeURIComponent(activityId)}/restore`, {
    method: 'POST',
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to restore version');
  }
  return res.json();
}

export function getExportCsvUrl(dateRange: string): string {
  return '/api/export?date_range=' + encodeURIComponent(dateRange);
}
