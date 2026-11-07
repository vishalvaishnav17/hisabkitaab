import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getPlatformProxy } from 'wrangler';
import app from './index';
import { applyAllMigrations } from './test-utils';

const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: 'wrangler.jsonc',
  remoteBindings: false,
  persist: false,
});

beforeAll(async () => {
  await applyAllMigrations(proxy.env.DB);
});

afterAll(() => proxy.dispose());

const gate = {
  fetch: async () =>
    new Response(null, {
      status: 204,
      headers: { 'x-clerk-gate': 'ok' },
    }),
  connect: () => {
    throw new Error('not used');
  },
} as Fetcher;

describe('Settings API & Activity Logging', () => {
  test('GET /api/settings returns defaults when settings are not set', async () => {
    const res = await app.request(
      'http://localhost/api/settings',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { my_name: string; my_upi_vpa: string };
    expect(data.my_name).toBe('Me');
    expect(data.my_upi_vpa).toBe('');
  });

  test('PUT /api/settings validates UPI ID format', async () => {
    // 1. Invalid UPI formats
    const badUpis = ['invalid-upi', 'abc@', '@okhdfc', 'a@b', 'test@@okaxis'];
    for (const bad of badUpis) {
      const res = await app.request(
        'http://localhost/api/settings',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ my_upi_vpa: bad }),
        },
        { DB: proxy.env.DB, CLERK_GATE: gate }
      );
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('Invalid UPI ID format');
    }

    // 2. Empty name fails validation
    const emptyNameRes = await app.request(
      'http://localhost/api/settings',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ my_name: '   ' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(emptyNameRes.status).toBe(400);
  });

  test('PUT /api/settings successfully updates settings and logs activity', async () => {
    const updateRes = await app.request(
      'http://localhost/api/settings',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          my_name: 'Vishal Vaishnav',
          my_upi_vpa: 'vishal@okaxis',
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );

    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as { my_name: string; my_upi_vpa: string };
    expect(updated.my_name).toBe('Vishal Vaishnav');
    expect(updated.my_upi_vpa).toBe('vishal@okaxis');

    // Verify GET /api/settings returns new values
    const getRes = await app.request(
      'http://localhost/api/settings',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const fetched = (await getRes.json()) as { my_name: string; my_upi_vpa: string };
    expect(fetched.my_name).toBe('Vishal Vaishnav');
    expect(fetched.my_upi_vpa).toBe('vishal@okaxis');

    // Check activity table contains setting activity
    const actRes = await app.request(
      'http://localhost/api/activity?entity_type=setting',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(actRes.status).toBe(200);
    const { items: actItems } = (await actRes.json()) as { items: any[] };
    expect(actItems.length).toBeGreaterThanOrEqual(2);
    const nameAct = actItems.find((i) => i.entity_id === 'my_name');
    const upiAct = actItems.find((i) => i.entity_id === 'my_upi_vpa');
    expect(nameAct).toBeDefined();
    expect(upiAct).toBeDefined();
    expect(nameAct.entity_type).toBe('setting');
    expect(upiAct.entity_type).toBe('setting');
  });

  test('POST /api/activity/:id/restore can restore a setting change', async () => {
    // Change name to 'Vishal Temp'
    await app.request(
      'http://localhost/api/settings',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ my_name: 'Vishal Temp' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );

    // Get the activity id for this update
    const actRes = await app.request(
      'http://localhost/api/activity?entity_type=setting',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const { items } = (await actRes.json()) as { items: any[] };
    const latest = items[0];
    expect(latest.entity_id).toBe('my_name');

    // Restore to previous snapshot
    // First, make another update
    await app.request(
      'http://localhost/api/settings',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ my_name: 'Vishal Changed Again' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );

    // Now restore `latest`
    const restoreRes = await app.request(
      `http://localhost/api/activity/${latest.id}/restore`,
      { method: 'POST' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(restoreRes.status).toBe(200);

    const checkRes = await app.request(
      'http://localhost/api/settings',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const current = (await checkRes.json()) as { my_name: string };
    expect(current.my_name).toBe('Vishal Temp');
  });
});

describe('Group Statement Endpoint (GET /api/groups/:id/statement/:personId)', () => {
  let groupId: string;
  let rahulId: string;
  let priyaId: string;

  beforeAll(async () => {
    // 1. Create Rahul and Priya
    const resR = await app.request(
      'http://localhost/api/people',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Rahul', upi_vpa: 'rahul@okaxis' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const rahul = (await resR.json()) as { id: string };
    rahulId = rahul.id;

    const resP = await app.request(
      'http://localhost/api/people',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Priya', upi_vpa: 'priya@okhdfc' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const priya = (await resP.json()) as { id: string };
    priyaId = priya.id;

    // 2. Create Group
    const resG = await app.request(
      'http://localhost/api/groups',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Weekend Trip',
          emoji: '🏖️',
          kind: 'trip',
          member_ids: [rahulId, priyaId],
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const group = (await resG.json()) as { id: string };
    groupId = group.id;

    // 3. Add Expense 1: ₹1,500 paid by 'me', split equally among me, rahul, priya (₹500 each)
    await app.request(
      `/api/groups/${groupId}/expenses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Resort Stay',
          amount_paise: 150000,
          paid_by: 'me',
          date: '2026-11-01',
          participant_ids: ['me', rahulId, priyaId],
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );

    // 4. Add Expense 2: ₹600 paid by rahul, split equally between rahul and 'me' (₹300 each)
    await app.request(
      `/api/groups/${groupId}/expenses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Dinner',
          amount_paise: 60000,
          paid_by: rahulId,
          date: '2026-11-02',
          participant_ids: ['me', rahulId],
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );

    // 5. Transfer: Rahul pays ₹100 to 'me'
    await app.request(
      `/api/groups/${groupId}/transfers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_person: rahulId,
          to_person: 'me',
          amount_paise: 10000,
          date: '2026-11-03',
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
  });

  test('statement endpoint returns exact numbers matching group balances and settlements', async () => {
    // Get master group balances
    const groupRes = await app.request(
      `/api/groups/${groupId}`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(groupRes.status).toBe(200);
    const groupBalances = (await groupRes.json()) as {
      balances: Record<string, number>;
      settlements: any[];
    };

    // Get statement for Rahul
    const stmtRes = await app.request(
      `/api/groups/${groupId}/statement/${rahulId}`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(stmtRes.status).toBe(200);
    const stmt = (await stmtRes.json()) as any;

    // Check Person & Group
    expect(stmt.group.name).toBe('Weekend Trip');
    expect(stmt.group_name).toBe('Weekend Trip');
    expect(stmt.person.name).toBe('Rahul');
    expect(stmt.person.id).toBe(rahulId);

    // Verify statement net balance exactly matches group balances for Rahul!
    expect(stmt.net_balance_paise).toBe(groupBalances.balances[rahulId]);

    // Check Expenses: Rahul participated in both Resort Stay (share 50000) and Dinner (share 30000)
    expect(stmt.expenses.length).toBe(2);
    const resortExp = stmt.expenses.find((e: any) => e.description === 'Resort Stay');
    expect(resortExp).toBeDefined();
    expect(resortExp.total_paise).toBe(150000);
    expect(resortExp.share_paise).toBe(50000);

    const dinnerExp = stmt.expenses.find((e: any) => e.description === 'Dinner');
    expect(dinnerExp).toBeDefined();
    expect(dinnerExp.total_paise).toBe(60000);
    expect(dinnerExp.share_paise).toBe(30000);
    expect(dinnerExp.paid_by).toBe(rahulId);

    // Check Transfers: includes the transfer of 10000 paise from Rahul to 'me'
    expect(stmt.transfers.length).toBe(1);
    expect(stmt.transfers[0].amount_paise).toBe(10000);
    expect(stmt.transfers[0].from_person).toBe(rahulId);
    expect(stmt.transfers[0].to_person).toBe('me');

    // Check Settlements: only settlements involving Rahul are included
    for (const s of stmt.settlements) {
      expect(s.from === rahulId || s.to === rahulId).toBe(true);
    }
  });

  test('statement endpoint returns 404 for unknown group or person not in group', async () => {
    // Unknown group
    const unknownGroupRes = await app.request(
      `/api/groups/non-existent-group-id/statement/${rahulId}`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(unknownGroupRes.status).toBe(404);

    // Unknown person in valid group
    const unknownPersonRes = await app.request(
      `/api/groups/${groupId}/statement/non-existent-person-id`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(unknownPersonRes.status).toBe(404);
  });
});
