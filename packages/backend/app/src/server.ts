import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { createUsersUseCases } from '@cf-tamac-backend/app';
import { openApiApp, type AppVariables } from '@cf-tamac-backend/http';
import type { Bindings } from '@cf-tamac-backend/types';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

// Middleware
app.use('*', logger());
app.use('*', async (c, next) => {
  c.set('usersUseCases', createUsersUseCases(c.env));
  await next();
});
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);

// Routes
app.route('/', openApiApp);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(`Error: ${err.message}`);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

/** Hono app configured with middleware and routes. */
export default app;
