import { Hono } from 'hono';
import { Bindings } from '../env';
import { getSettings, updateSettings, ServiceError } from '../services/settings';

const settingsRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/settings
settingsRouter.get('/api/settings', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  try {
    const settings = await getSettings(db);
    return c.json(settings);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err.message || 'Failed to fetch settings' }, 500);
  }
});

// PUT /api/settings
settingsRouter.put('/api/settings', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 Database binding not configured' }, 500);
  }

  try {
    const body = await c.req.json();
    const result = await updateSettings(db, body);
    return c.json(result);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as any);
    }
    return c.json({ error: err.message || 'Failed to update settings' }, 500);
  }
});

export default settingsRouter;
