import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings } from './env';
import { manifest, serviceWorker } from './pwa';
import expensesRouter from './routes/expenses';
import activityRouter from './routes/activity';
import peopleRouter from './routes/people';
import groupsRouter from './routes/groups';
import billsRouter from './routes/bills';

const app = new Hono<{ Bindings: Bindings }>();

// Home-screen install files stay public. They contain no expense data, and
// Safari requests the icon and manifest without the session cookie.
app.get('/manifest.webmanifest', () => {
  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

app.get('/sw.js', () => {
  return new Response(serviceWorker, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});

app.get('/icons/:name', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404) return c.notFound();
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'public, max-age=604800');
  return new Response(res.body, {
    status: res.status,
    headers,
  });
});

// Clerk session check lives in the clerk-gate worker. This app only serves
// traffic that worker has already accepted.
app.use('*', async (c, next) => {
  const gate = c.env.CLERK_GATE;
  if (!gate) {
    return c.json({ error: 'Authentication unavailable' }, 503);
  }

  let gateResponse: Response;
  try {
    gateResponse = await gate.fetch(c.req.raw.clone());
  } catch {
    return c.json({ error: 'Authentication unavailable' }, 503);
  }

  if (gateResponse.status === 204 && gateResponse.headers.get('x-clerk-gate') === 'ok') {
    await next();
    for (const cookie of gateResponse.headers.getSetCookie?.() ?? []) {
      c.res.headers.append('set-cookie', cookie);
    }
    return;
  }

  return new Response(gateResponse.body, gateResponse);
});

// Enable CORS
app.use('*', cors());

app.route('/', expensesRouter);
app.route('/', activityRouter);
app.route('/', peopleRouter);
app.route('/', groupsRouter);
app.route('/', billsRouter);

// Catch-all route to serve static assets from ASSETS behind Clerk gate
app.get('*', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const isHtml =
    c.req.path === '/' ||
    c.req.path.endsWith('.html') ||
    res.headers.get('content-type')?.includes('text/html');

  const headers = new Headers(res.headers);
  if (isHtml) {
    headers.set('Cache-Control', 'no-cache');
  } else if (res.ok) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }

  return new Response(res.body, {
    status: res.status,
    headers,
  });
});

export default app;
