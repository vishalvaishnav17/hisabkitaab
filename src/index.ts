import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings } from './env';
import { renderHtml } from './frontend';
import { manifest, pngResponse, serviceWorker } from './pwa';
import expensesRouter from './routes/expenses';
import activityRouter from './routes/activity';

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

app.get('/icons/:name', (c) => {
  return pngResponse(c.req.param('name')) ?? c.notFound();
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

// Serve Frontend UI
app.get('/', (c) => {
  return c.html(renderHtml());
});

app.route('/', expensesRouter);
app.route('/', activityRouter);

export default app;
