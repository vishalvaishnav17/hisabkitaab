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

describe('Groups, People, Group Expenses & Transfers API', () => {
  let aliceId: string;
  let bobId: string;
  let charlieId: string;
  let tripGroupId: string;
  let exp1Id: string;
  let exp2Id: string;
  let tr1Id: string;
  let tr2Id: string;

  test('Create people and setup initial group', async () => {
    // 1. Create Alice
    const resA = await app.request(
      'http://localhost/api/people',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice', upi_vpa: 'alice@upi' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resA.status).toBe(201);
    const alice = (await resA.json()) as { id: string; name: string };
    aliceId = alice.id;
    expect(alice.name).toBe('Alice');

    // 2. Create Bob
    const resB = await app.request(
      'http://localhost/api/people',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bob', phone: '9876543210' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resB.status).toBe(201);
    const bob = (await resB.json()) as { id: string; name: string };
    bobId = bob.id;

    // 3. Create Charlie
    const resC = await app.request(
      'http://localhost/api/people',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Charlie' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resC.status).toBe(201);
    const charlie = (await resC.json()) as { id: string; name: string };
    charlieId = charlie.id;

    // 4. Create Goa Trip group with Alice, Bob, Charlie (Me is automatically added)
    const resGroup = await app.request(
      'http://localhost/api/groups',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Goa Trip',
          emoji: '🌴',
          kind: 'trip',
          member_ids: [aliceId, bobId, charlieId],
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resGroup.status).toBe(201);
    const group = (await resGroup.json()) as { id: string; name: string; member_count: number };
    tripGroupId = group.id;
    expect(group.name).toBe('Goa Trip');
    expect(group.member_count).toBe(4);

    // Verify GET /api/groups lists Goa Trip
    const resList = await app.request(
      'http://localhost/api/groups?archived=0',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resList.status).toBe(200);
    const list = (await resList.json()) as any[];
    const found = list.find((g) => g.id === tripGroupId);
    expect(found).toBeDefined();
    expect(found.member_count).toBe(4);
    expect(found.my_net_paise).toBe(0);
  });

  test('Balances: 4-person trip with mixed equal and exact expenses and two transfers', async () => {
    // Expense 1: 'me' pays ₹400 (40,000 paise) equally split among all 4 members
    // Each share: 10,000 paise
    const resExp1 = await app.request(
      `http://localhost/api/groups/${tripGroupId}/expenses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Resort Stay',
          amount_paise: 40000,
          paid_by: 'me',
          category: 'Hotel',
          date: '2026-11-01',
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resExp1.status).toBe(201);
    const bodyExp1 = (await resExp1.json()) as { id: string; expense: any };
    exp1Id = bodyExp1.id;
    expect(bodyExp1.expense.shares.length).toBe(4);
    for (const s of bodyExp1.expense.shares) {
      expect(s.amount_paise).toBe(10000);
    }

    // Expense 2: Alice pays ₹300 (30,000 paise), exact split:
    // Alice: 5,000, Bob: 15,000, Charlie: 10,000
    const resExp2 = await app.request(
      `http://localhost/api/groups/${tripGroupId}/expenses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Seafood Feast',
          amount_paise: 30000,
          paid_by: aliceId,
          split: {
            type: 'exact',
            amounts: {
              [aliceId]: 5000,
              [bobId]: 15000,
              [charlieId]: 10000,
            },
          },
          category: 'Food',
          date: '2026-11-02',
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resExp2.status).toBe(201);
    const bodyExp2 = (await resExp2.json()) as { id: string };
    exp2Id = bodyExp2.id;

    // Transfer 1: Bob pays Me ₹150 (15,000 paise) via UPI
    const resTr1 = await app.request(
      `http://localhost/api/groups/${tripGroupId}/transfers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_person: bobId,
          to_person: 'me',
          amount_paise: 15000,
          method: 'UPI',
          date: '2026-11-03',
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resTr1.status).toBe(201);
    const bodyTr1 = (await resTr1.json()) as { id: string };
    tr1Id = bodyTr1.id;

    // Transfer 2: Charlie pays Alice ₹50 (5,000 paise) via Cash
    const resTr2 = await app.request(
      `http://localhost/api/groups/${tripGroupId}/transfers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_person: charlieId,
          to_person: aliceId,
          amount_paise: 5000,
          method: 'Cash',
          date: '2026-11-04',
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resTr2.status).toBe(201);
    const bodyTr2 = (await resTr2.json()) as { id: string };
    tr2Id = bodyTr2.id;

    // Check balances
    // Expected balances:
    // Me: paid 40000 - share 10000 - received 15000 = +15000
    // Alice: paid 30000 - share 10000 (exp 1) - share 5000 (exp 2) - received 5000 = +10000
    // Bob: -10000 (exp 1) - 15000 (exp 2) + sent 15000 = -10000
    // Charlie: -10000 (exp 1) - 10000 (exp 2) + sent 5000 = -15000
    const resBal = await app.request(
      `http://localhost/api/groups/${tripGroupId}`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resBal.status).toBe(200);
    const balData = (await resBal.json()) as {
      balances: Record<string, number>;
      settlements: { from: string; to: string; amount_paise: number }[];
      next_payer: string | null;
      my_net_paise: number;
    };

    expect(balData.balances['me']).toBe(15000);
    expect(balData.balances[aliceId]).toBe(10000);
    expect(balData.balances[bobId]).toBe(-10000);
    expect(balData.balances[charlieId]).toBe(-15000);
    expect(balData.my_net_paise).toBe(15000);

    // Simplified settlements:
    // Charlie (-15000) pays Me (+15000) 15000
    // Bob (-10000) pays Alice (+10000) 10000
    expect(balData.settlements.length).toBe(2);
    expect(balData.settlements).toContainEqual({
      from: charlieId,
      to: 'me',
      amount_paise: 15000,
    });
    expect(balData.settlements).toContainEqual({
      from: bobId,
      to: aliceId,
      amount_paise: 10000,
    });

    // Next payer: Charlie has the most negative balance (-15000)
    expect(balData.next_payer).toBe(charlieId);
  });

  test('Validation: reject invalid shares, non-members, removing member with balance', async () => {
    // 1. Shares that don't add up
    const badSharesRes = await app.request(
      `http://localhost/api/groups/${tripGroupId}/expenses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Mismatched split',
          amount_paise: 10000,
          paid_by: 'me',
          split: {
            type: 'exact',
            amounts: {
              [aliceId]: 4000,
              [bobId]: 5000, // sums to 9000, not 10000
            },
          },
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(badSharesRes.status).toBe(400);

    // 2. Non-member payer
    const nonMemberRes = await app.request(
      `http://localhost/api/groups/${tripGroupId}/expenses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Ghost payer',
          amount_paise: 5000,
          paid_by: 'unknown-person-id',
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(nonMemberRes.status).toBe(400);

    // 3. Non-member in transfer
    const badTransferRes = await app.request(
      `http://localhost/api/groups/${tripGroupId}/transfers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_person: 'me',
          to_person: 'unknown-person-id',
          amount_paise: 1000,
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(badTransferRes.status).toBe(400);

    // 4. Same person transfer
    const selfTransferRes = await app.request(
      `http://localhost/api/groups/${tripGroupId}/transfers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_person: 'me',
          to_person: 'me',
          amount_paise: 1000,
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(selfTransferRes.status).toBe(400);

    // 5. Removing a member with non-zero balance is blocked
    // Bob has balance -10,000 paise
    const removeBobRes = await app.request(
      `http://localhost/api/groups/${tripGroupId}/members/${bobId}`,
      { method: 'DELETE' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(removeBobRes.status).toBe(400);

    // 6. Removing "me" is blocked
    const removeMeRes = await app.request(
      `http://localhost/api/groups/${tripGroupId}/members/me`,
      { method: 'DELETE' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(removeMeRes.status).toBe(400);

    // 7. Deleting group with non-zero balances is blocked
    const delGroupRes = await app.request(
      `http://localhost/api/groups/${tripGroupId}`,
      { method: 'DELETE' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(delGroupRes.status).toBe(400);
  });

  test('Restore: restoring a deleted group expense brings back its shares and the balances', async () => {
    // Soft delete exp2 (Seafood Feast)
    const delRes = await app.request(
      `http://localhost/api/groups/${tripGroupId}/expenses/${exp2Id}`,
      { method: 'DELETE' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(delRes.status).toBe(200);

    // Verify exp2 shares are excluded from balances
    const balAfterDel = await app.request(
      `http://localhost/api/groups/${tripGroupId}`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const dataAfterDel = (await balAfterDel.json()) as { balances: Record<string, number> };
    // Without exp2:
    // Me: paid 40000 - 10000 - 15000 = +15000
    // Alice: -10000 (exp 1) - 5000 (tr 2) = -15000
    // Bob: -10000 (exp 1) + 15000 (tr 1) = +5000
    // Charlie: -10000 (exp 1) + 5000 (tr 2) = -5000
    expect(dataAfterDel.balances[aliceId]).toBe(-15000);
    expect(dataAfterDel.balances[bobId]).toBe(5000);

    // Find the delete activity entry
    const actRes = await app.request(
      `http://localhost/api/activity?group_id=${tripGroupId}&entity_type=group_expense&action=delete&limit=1`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(actRes.status).toBe(200);
    const actData = (await actRes.json()) as { items: { id: string }[] };
    expect(actData.items.length).toBeGreaterThan(0);
    const delActId = actData.items[0].id;

    // Restore exp2
    const restoreRes = await app.request(
      `http://localhost/api/activity/${delActId}/restore`,
      { method: 'POST' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(restoreRes.status).toBe(200);

    // Verify balances are back to original
    const balRestored = await app.request(
      `http://localhost/api/groups/${tripGroupId}`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const restoredData = (await balRestored.json()) as { balances: Record<string, number> };
    expect(restoredData.balances[aliceId]).toBe(10000);
    expect(restoredData.balances[bobId]).toBe(-10000);
    expect(restoredData.balances[charlieId]).toBe(-15000);
    expect(restoredData.balances['me']).toBe(15000);
  });

  test('Simplify setting: simplify_debts = 0 returns pairwise debts', async () => {
    // Update group to disable simplify_debts
    const patchRes = await app.request(
      `http://localhost/api/groups/${tripGroupId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simplify_debts: 0 }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(patchRes.status).toBe(200);

    // Fetch group details
    const res = await app.request(
      `http://localhost/api/groups/${tripGroupId}`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      settlements: { from: string; to: string; amount_paise: number }[];
    };

    // Pairwise debts:
    // Alice owes Me 10,000
    // Charlie owes Me 10,000
    // Me owes Bob 5,000
    // Bob owes Alice 15,000
    // Charlie owes Alice 5,000
    expect(data.settlements.length).toBe(5);
    expect(data.settlements).toContainEqual({ from: aliceId, to: 'me', amount_paise: 10000 });
    expect(data.settlements).toContainEqual({ from: charlieId, to: 'me', amount_paise: 10000 });
    expect(data.settlements).toContainEqual({ from: 'me', to: bobId, amount_paise: 5000 });
    expect(data.settlements).toContainEqual({ from: bobId, to: aliceId, amount_paise: 15000 });
    expect(data.settlements).toContainEqual({ from: charlieId, to: aliceId, amount_paise: 5000 });

    // Restore simplify_debts = 1
    await app.request(
      `http://localhost/api/groups/${tripGroupId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simplify_debts: 1 }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
  });

  test('Friends: /api/friends/balances across two groups', async () => {
    // Create second group: "Flat 402" with Bob only
    const resG2 = await app.request(
      'http://localhost/api/groups',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Flat 402',
          kind: 'home',
          member_ids: [bobId],
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resG2.status).toBe(201);
    const g2 = (await resG2.json()) as { id: string };

    // In Flat 402, Bob pays ₹200 (20,000 paise) for Bob & Me equally (10,000 each)
    // In Flat 402, Bob's balance is +10,000 paise
    // In Goa Trip, Bob's balance is -10,000 paise
    // Net across both groups for Bob = 0 paise
    const resExpFlat = await app.request(
      `http://localhost/api/groups/${g2.id}/expenses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Groceries',
          amount_paise: 20000,
          paid_by: bobId,
          category: 'Food',
        }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resExpFlat.status).toBe(201);

    // Query /api/friends/balances
    const resFriends = await app.request(
      'http://localhost/api/friends/balances',
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resFriends.status).toBe(200);
    const friends = (await resFriends.json()) as any[];

    // Ensure 'me' is NOT in friends
    expect(friends.find((f) => f.id === 'me')).toBeUndefined();

    // Check Bob's net balance across both groups
    const bobFriend = friends.find((f) => f.id === bobId);
    expect(bobFriend).toBeDefined();
    expect(bobFriend.net_paise).toBe(0); // -10000 + 10000 = 0

    const goaBreakdown = bobFriend.groups.find((g: any) => g.group_id === tripGroupId);
    expect(goaBreakdown).toBeDefined();
    expect(goaBreakdown.net_paise).toBe(-10000);

    const flatBreakdown = bobFriend.groups.find((g: any) => g.group_id === g2.id);
    expect(flatBreakdown).toBeDefined();
    expect(flatBreakdown.net_paise).toBe(10000);
  });

  test('Query count: GET /api/groups/:id runs a fixed number of queries regardless of expense count', async () => {
    let prepareCount = 0;
    const trackedDb = new Proxy(proxy.env.DB, {
      get(target, prop, receiver) {
        if (prop === 'prepare') {
          return (query: string) => {
            prepareCount++;
            return target.prepare(query);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    // 1. Measure query count with current expenses
    prepareCount = 0;
    const res1 = await app.request(
      `http://localhost/api/groups/${tripGroupId}`,
      { method: 'GET' },
      { DB: trackedDb, CLERK_GATE: gate }
    );
    expect(res1.status).toBe(200);
    const count1 = prepareCount;

    // 2. Add 5 more expenses to the group
    for (let i = 1; i <= 5; i++) {
      await app.request(
        `http://localhost/api/groups/${tripGroupId}/expenses`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: `Extra Expense ${i}`,
            amount_paise: 4000,
            paid_by: 'me',
          }),
        },
        { DB: proxy.env.DB, CLERK_GATE: gate }
      );
    }

    // 3. Measure query count again
    prepareCount = 0;
    const res2 = await app.request(
      `http://localhost/api/groups/${tripGroupId}`,
      { method: 'GET' },
      { DB: trackedDb, CLERK_GATE: gate }
    );
    expect(res2.status).toBe(200);
    const count2 = prepareCount;

    // Assert that the number of queries is identical (fixed count)
    expect(count2).toBe(count1);
    expect(count1).toBe(5); // Exactly 5 queries!
  });

  test('Timeline and CSV export endpoints', async () => {
    // 1. Timeline
    const resTimeline = await app.request(
      `http://localhost/api/groups/${tripGroupId}/timeline?limit=10`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resTimeline.status).toBe(200);
    const timeline = (await resTimeline.json()) as { items: any[]; next_cursor: string | null };
    expect(timeline.items.length).toBeGreaterThan(0);
    // Ensure both types are present
    const hasExpense = timeline.items.some((i) => i.type === 'expense');
    const hasTransfer = timeline.items.some((i) => i.type === 'transfer');
    expect(hasExpense).toBe(true);
    expect(hasTransfer).toBe(true);

    // 2. CSV Export
    const resExport = await app.request(
      `http://localhost/api/groups/${tripGroupId}/export`,
      { method: 'GET' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(resExport.status).toBe(200);
    expect(resExport.headers.get('content-type')).toContain('text/csv');
    const csv = await resExport.text();
    expect(csv).toContain('Type,ID,Date,Description,Category,Amount (INR)');
    expect(csv).toContain('Resort Stay');
    expect(csv).toContain('Transfer');
  });

  test('Group members: add by name in one batch and re-joining', async () => {
    // Add Dave by name
    const res = await app.request(
      `http://localhost/api/groups/${tripGroupId}/members`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Dave' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; person_id: string; name: string };
    expect(body.success).toBe(true);
    expect(body.name).toBe('Dave');

    // Dave has 0 balance, removing Dave succeeds
    const removeRes = await app.request(
      `http://localhost/api/groups/${tripGroupId}/members/${body.person_id}`,
      { method: 'DELETE' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(removeRes.status).toBe(200);

    // Re-adding Dave with person_id unsets left_at
    const reAddRes = await app.request(
      `http://localhost/api/groups/${tripGroupId}/members`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: body.person_id }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(reAddRes.status).toBe(201);
  });

  test('Archived groups are read-only: writes return 400', async () => {
    // Create temporary group to archive
    const resG = await app.request(
      'http://localhost/api/groups',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Archived Trip', kind: 'trip' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    const g = (await resG.json()) as { id: string };

    // Archive it
    const archRes = await app.request(
      `http://localhost/api/groups/${g.id}/archive`,
      { method: 'POST' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(archRes.status).toBe(200);

    // Attempt to write an expense -> 400
    const expRes = await app.request(
      `http://localhost/api/groups/${g.id}/expenses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Blocked Exp', amount_paise: 5000 }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(expRes.status).toBe(400);

    // Attempt to add member -> 400
    const memRes = await app.request(
      `http://localhost/api/groups/${g.id}/members`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Eve' }),
      },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(memRes.status).toBe(400);

    // Unarchive it
    const unarchRes = await app.request(
      `http://localhost/api/groups/${g.id}/unarchive`,
      { method: 'POST' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(unarchRes.status).toBe(200);

    // Delete empty group -> 200
    const delRes = await app.request(
      `http://localhost/api/groups/${g.id}`,
      { method: 'DELETE' },
      { DB: proxy.env.DB, CLERK_GATE: gate }
    );
    expect(delRes.status).toBe(200);
  });
});
