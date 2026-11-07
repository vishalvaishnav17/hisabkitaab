import { redirectIfSignedOut } from '../../api';
import {
  CreateGroupExpensePayload,
  CreateGroupPayload,
  GroupDetailResponse,
  GroupListItem,
  PersonItem,
  TimelineResponse,
  UpdateGroupExpensePayload,
  UpdateGroupPayload,
} from './types';

export async function fetchGroupsApi(archived = false): Promise<GroupListItem[] | null> {
  const res = await fetch(`/api/groups?archived=${archived ? '1' : '0'}`);
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch groups');
  }
  return res.json();
}

export async function createGroupApi(
  payload: CreateGroupPayload
): Promise<(GroupListItem & { activity_id: string }) | null> {
  const res = await fetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create group');
  }
  return res.json();
}

export async function fetchGroupDetailApi(groupId: string): Promise<GroupDetailResponse | null> {
  const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`);
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch group details');
  }
  return res.json();
}

export async function updateGroupApi(
  groupId: string,
  payload: UpdateGroupPayload
): Promise<any | null> {
  const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update group');
  }
  return res.json();
}

export async function archiveGroupApi(
  groupId: string
): Promise<{ success: boolean; activity_id: string } | null> {
  const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/archive`, {
    method: 'POST',
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to archive group');
  }
  return res.json();
}

export async function unarchiveGroupApi(
  groupId: string
): Promise<{ success: boolean; activity_id: string } | null> {
  const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/unarchive`, {
    method: 'POST',
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to unarchive group');
  }
  return res.json();
}

export async function deleteGroupApi(
  groupId: string
): Promise<{ success: boolean; activity_id: string } | null> {
  const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete group');
  }
  return res.json();
}

export async function fetchPeopleApi(): Promise<PersonItem[] | null> {
  const res = await fetch('/api/people');
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch people');
  }
  return res.json();
}

export async function createPersonApi(
  name: string
): Promise<{ id: string; name: string; activity_id: string } | null> {
  const res = await fetch('/api/people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create person');
  }
  return res.json();
}

export async function addGroupMemberApi(
  groupId: string,
  payload: { person_id?: string; name?: string }
): Promise<{ success: boolean; person_id: string; name: string; activity_id: string } | null> {
  const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add member to group');
  }
  return res.json();
}

export async function removeGroupMemberApi(
  groupId: string,
  personId: string
): Promise<{ success: boolean; activity_id: string } | null> {
  const res = await fetch(
    `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(personId)}`,
    {
      method: 'DELETE',
    }
  );
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to remove member from group');
  }
  return res.json();
}

export async function fetchGroupTimelineApi(
  groupId: string,
  before?: string,
  limit = 50
): Promise<TimelineResponse | null> {
  const query = new URLSearchParams();
  if (before) query.set('before', before);
  query.set('limit', String(limit));

  const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/timeline?${query.toString()}`);
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch timeline');
  }
  return res.json();
}

export async function createGroupExpenseApi(
  groupId: string,
  payload: CreateGroupExpensePayload
): Promise<{ id: string; activity_id: string; expense: any } | null> {
  const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save group expense');
  }
  return res.json();
}

export async function updateGroupExpenseApi(
  groupId: string,
  expenseId: string,
  payload: UpdateGroupExpensePayload
): Promise<{ activity_id: string; expense: any } | null> {
  const res = await fetch(
    `/api/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update group expense');
  }
  return res.json();
}

export async function deleteGroupExpenseApi(
  groupId: string,
  expenseId: string
): Promise<{ success: boolean; activity_id: string } | null> {
  const res = await fetch(
    `/api/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`,
    {
      method: 'DELETE',
    }
  );
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete expense');
  }
  return res.json();
}

export async function deleteGroupTransferApi(
  groupId: string,
  transferId: string
): Promise<{ success: boolean; activity_id: string } | null> {
  const res = await fetch(
    `/api/groups/${encodeURIComponent(groupId)}/transfers/${encodeURIComponent(transferId)}`,
    {
      method: 'DELETE',
    }
  );
  if (redirectIfSignedOut(res)) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete transfer');
  }
  return res.json();
}
