import { redirectIfSignedOut } from './api';
import { setTabBadge } from './components/tab-bar';

export interface RecurringBillItem {
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
  group_name: string | null;
  paid_by: string | null;
  active: number;
  created_at: string;
  kind: 'personal' | 'shared';
  participant_ids: string[];
  periods_due: number;
  is_overdue: boolean;
}

export interface BillsResponse {
  due: RecurringBillItem[];
  upcoming: RecurringBillItem[];
}

export interface CreateBillPayload {
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

export interface UpdateBillPayload {
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

export interface PayBillPayload {
  amount_paise?: number;
  amount_expr?: string | null;
  date?: string;
  participant_ids?: string[];
  paid_by?: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  emoji: string | null;
  kind: string;
}

export interface GroupMember {
  person_id: string;
  name: string;
  is_me: number;
}

export async function fetchBillsApi(): Promise<BillsResponse | null> {
  const res = await fetch('/api/bills');
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) throw new Error('Failed to fetch bills');
  return res.json();
}

export async function fetchBillsDueCountApi(): Promise<number> {
  try {
    const res = await fetch('/api/bills/due-count');
    if (redirectIfSignedOut(res)) return 0;
    if (!res.ok) return 0;
    const data = (await res.json()) as { count: number };
    return data.count || 0;
  } catch {
    return 0;
  }
}

export async function updateBillsTabBadge(): Promise<void> {
  const count = await fetchBillsDueCountApi();
  setTabBadge('bills', count > 0 ? count : null);
}

export async function createBillApi(
  payload: CreateBillPayload
): Promise<{ success: boolean; id: string; activity_id: string } | null> {
  const res = await fetch('/api/bills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create bill');
  }
  return res.json();
}

export async function updateBillApi(
  id: string,
  payload: UpdateBillPayload
): Promise<{ success: boolean; activity_id: string } | null> {
  const res = await fetch(`/api/bills/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update bill');
  }
  return res.json();
}

export async function deleteBillApi(
  id: string
): Promise<{ success: boolean; activity_id: string } | null> {
  const res = await fetch(`/api/bills/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete bill');
  }
  return res.json();
}

export async function payBillApi(
  id: string,
  payload: PayBillPayload
): Promise<{ success: boolean; expense_id: string; next_due: string; activity_id: string } | null> {
  const res = await fetch(`/api/bills/${encodeURIComponent(id)}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to pay bill');
  }
  return res.json();
}

export async function skipBillApi(
  id: string
): Promise<{ success: boolean; next_due: string; activity_id: string } | null> {
  const res = await fetch(`/api/bills/${encodeURIComponent(id)}/skip`, {
    method: 'POST',
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to skip bill');
  }
  return res.json();
}

export async function fetchGroupsForBillsApi(): Promise<GroupSummary[]> {
  try {
    const res = await fetch('/api/groups');
    if (redirectIfSignedOut(res)) return [];
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchGroupMembersForBillsApi(groupId: string): Promise<GroupMember[]> {
  try {
    const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`);
    if (redirectIfSignedOut(res)) return [];
    if (!res.ok) return [];
    const data = (await res.json()) as { members?: GroupMember[] };
    return data.members || [];
  } catch {
    return [];
  }
}
