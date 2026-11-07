export interface Expense {
  id: string;
  amount_paise: number;
  amount?: number;
  amount_expr?: string | null;
  description: string;
  category: string;
  payment_method: string;
  date: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  source?: 'personal' | 'group';
  group_id?: string | null;
  group_name?: string | null;
  group_expense_id?: string | null;
}

export interface Stats {
  totalSpend: number;
  total_spend_paise?: number;
  count: number;
  monthSpend: number;
  month_spend_paise?: number;
  dailyAverage: number;
  daily_average_paise?: number;
  topCategory: { category: string; amount?: number; total?: number; amount_paise?: number; total_paise?: number } | null;
  categoryBreakdown: { category: string; total: number; amount?: number; total_paise?: number; amount_paise?: number }[];
  dailyTrends: { date: string; amount: number; amount_paise?: number }[];
}

export interface ExpenseFilterParams {
  search?: string;
  category?: string;
  payment_method?: string;
  date_range?: string;
  include_groups?: string;
}

export interface ExpensePayload {
  amount_paise: number;
  amount?: number;
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

export interface FriendBalanceGroup {
  group_id: string;
  group_name: string;
  name: string;
  net_paise: number;
}

export interface FriendBalance {
  id: string;
  name: string;
  upi_vpa: string | null;
  phone: string | null;
  net_paise: number;
  groups: FriendBalanceGroup[];
}

export interface GroupItem {
  id: string;
  name: string;
  emoji: string | null;
  kind: string;
  member_count: number;
  my_net_paise: number;
  last_activity_at: string;
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
  if (params.include_groups !== undefined) query.set('include_groups', params.include_groups);

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

export async function fetchFriendsBalancesApi(): Promise<FriendBalance[] | null> {
  const res = await fetch('/api/friends/balances');
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) throw new Error('Failed to fetch friends balances');
  return res.json();
}

export async function fetchGroupsApi(): Promise<GroupItem[] | null> {
  const res = await fetch('/api/groups');
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) throw new Error('Failed to fetch groups');
  return res.json();
}

export async function updatePersonApi(
  id: string,
  payload: { name?: string; upi_vpa?: string | null; phone?: string | null }
): Promise<{ success: boolean } | null> {
  const res = await fetch('/api/people/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update person');
  }
  return res.json();
}

export async function createPersonApi(payload: {
  name: string;
  upi_vpa?: string | null;
  phone?: string | null;
}): Promise<{ success: boolean; id: string } | null> {
  const res = await fetch('/api/people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add friend');
  }
  return res.json();
}

export function getExportCsvUrl(dateRange: string, includeGroups = true): string {
  const query = new URLSearchParams();
  query.set('date_range', dateRange);
  query.set('include_groups', includeGroups ? '1' : '0');
  return '/api/export?' + query.toString();
}
