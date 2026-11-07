import { afterAll, beforeAll, expect, test } from 'bun:test';
import { getPlatformProxy } from 'wrangler';
import app from './index';
import { applyAllMigrations } from './test-utils';

const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: 'wrangler.jsonc',
  remoteBindings: false,
  persist: false,
});
beforeAll(() => applyAllMigrations(proxy.env.DB));
afterAll(() => proxy.dispose());

const gate = {
  fetch: async () => new Response(null, { status: 204, headers: { 'x-clerk-gate': 'ok' } }),
  connect: () => {
    throw new Error('not used');
  },
} as Fetcher;

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(
    `http://localhost${path}`,
    { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined },
    { DB: proxy.env.DB, CLERK_GATE: gate } as any,
  );
  return { status: res.status, body: (await res.json()) as any };
}

test('balances stay consistent after a settled-up person is deleted', async () => {
  const ravi = (await call('POST', '/api/people', { name: 'Ravi' })).body.id;
  const asha = (await call('POST', '/api/people', { name: 'Asha' })).body.id;
  const g = (await call('POST', '/api/groups', { name: 'Flat', member_ids: [ravi, asha] })).body.id;

  // Ravi pays 300 split three ways and owes nothing after paying for himself.
  await call('POST', `/api/groups/${g}/expenses`, { description: 'Milk', amount_paise: 30000, paid_by: ravi });
  await call('POST', `/api/groups/${g}/transfers`, { from_person: 'me', to_person: ravi, amount_paise: 10000 });
  await call('POST', `/api/groups/${g}/transfers`, { from_person: asha, to_person: ravi, amount_paise: 10000 });

  const before = (await call('GET', `/api/groups/${g}`)).body;
  expect(before.balances[ravi]).toBe(0);

  await call('DELETE', `/api/groups/${g}/members/${ravi}`);
  expect((await call('DELETE', `/api/people/${ravi}`)).status).toBe(200);

  const after = (await call('GET', `/api/groups/${g}`)).body;
  const total = Object.values(after.balances as Record<string, number>).reduce((a, b) => a + b, 0);
  expect(total).toBe(0);
  expect(after.my_net_paise).toBe(before.my_net_paise);
});

test('changing the amount of an exact split without new amounts is rejected', async () => {
  const g = (await call('POST', '/api/groups', { name: 'Solo' })).body.id;
  const e = await call('POST', `/api/groups/${g}/expenses`, {
    description: 'Cab',
    amount_paise: 1000,
    split: { type: 'exact', amounts: { me: 1000 } },
  });
  expect(e.status).toBe(201);
  const put = await call('PUT', `/api/groups/${g}/expenses/${e.body.id}`, { amount_paise: 2000 });
  expect(put.status).toBe(400);
});

test('creating a group with an unknown member is rejected', async () => {
  const res = await call('POST', '/api/groups', { name: 'Bad', member_ids: ['nobody'] });
  expect(res.status).toBe(400);
});
