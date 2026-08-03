import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';

import { installAsyncErrorHandling } from '../src/middleware/async-errors';
import { serviceGuard } from '../src/middleware/service-guard';
import { runtimeStatus } from '../src/config/env';

// The three things that made a failing deployment indistinguishable from a
// wrong password: a rejected async handler never answering at all, no signal
// that required configuration is absent, and preview mode having no discoverable
// credentials.

installAsyncErrorHandling();

/** Start an app on an ephemeral port and return a fetch bound to its origin. */
async function serve(app: express.Express) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (p: string) => `http://127.0.0.1:${port}${p}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Run `fn` with the given env applied, restoring the previous values after. */
async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const previous = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of previous) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('a rejected async handler produces a response instead of hanging', async () => {
  const app = express();
  app.get('/boom', async () => {
    throw new Error('database is not configured');
  });
  app.use((_err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  });

  const s = await serve(app);
  try {
    // Without the patch this never settles; the timeout is what fails the test.
    const res = await fetch(s.url('/boom'), { signal: AbortSignal.timeout(4000) });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { success: false, error: 'INTERNAL_ERROR' });
  } finally {
    await s.close();
  }
});

test('a synchronous throw still reaches the error handler', async () => {
  const app = express();
  app.get('/sync-boom', () => {
    throw new Error('nope');
  });
  app.use((_err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false });
  });

  const s = await serve(app);
  try {
    const res = await fetch(s.url('/sync-boom'), { signal: AbortSignal.timeout(4000) });
    assert.equal(res.status, 500);
  } finally {
    await s.close();
  }
});

test('mounted sub-routers still work after the patch', async () => {
  const app = express();
  const router = express.Router();
  router.get('/ok', (_req, res) => {
    res.json({ success: true });
  });
  app.use('/api', router);

  const s = await serve(app);
  try {
    const res = await fetch(s.url('/api/ok'), { signal: AbortSignal.timeout(4000) });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { success: true });
  } finally {
    await s.close();
  }
});

test('runtimeStatus reports preview mode as ready with no database', async () => {
  await withEnv({ DEMO_MODE: '1', DATABASE_URL: undefined, JWT_SECRET: undefined, REFRESH_TOKEN_SECRET: undefined }, async () => {
    assert.deepEqual(runtimeStatus(), { mode: 'preview', ready: true, missing: [] });
  });
});

test('runtimeStatus names the missing variables when running live', async () => {
  await withEnv({ DEMO_MODE: undefined, DATABASE_URL: undefined, JWT_SECRET: 's'.repeat(30), REFRESH_TOKEN_SECRET: undefined }, async () => {
    const status = runtimeStatus();
    assert.equal(status.mode, 'live');
    assert.equal(status.ready, false);
    assert.deepEqual(status.missing, ['DATABASE_URL', 'REFRESH_TOKEN_SECRET']);
  });
});

test('the service guard answers 503 with the missing names, and never a value', async () => {
  await withEnv({ DEMO_MODE: undefined, DATABASE_URL: undefined, JWT_SECRET: 'super-secret-value', REFRESH_TOKEN_SECRET: undefined }, async () => {
    const app = express();
    app.use('/api', serviceGuard);
    app.get('/api/auth/login', (_req, res) => {
      res.json({ success: true });
    });

    const s = await serve(app);
    try {
      const res = await fetch(s.url('/api/auth/login'), { signal: AbortSignal.timeout(4000) });
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error, 'NOT_CONFIGURED');
      assert.deepEqual(body.missing, ['DATABASE_URL', 'REFRESH_TOKEN_SECRET']);
      // Names only — a secret that happens to be set must not be echoed back.
      assert.ok(!JSON.stringify(body).includes('super-secret-value'));
    } finally {
      await s.close();
    }
  });
});

test('the service guard lets requests through once configuration is complete', async () => {
  await withEnv(
    { DEMO_MODE: undefined, DATABASE_URL: 'mysql://u:p@127.0.0.1:3306/db', JWT_SECRET: 'a'.repeat(30), REFRESH_TOKEN_SECRET: 'b'.repeat(30) },
    async () => {
      const app = express();
      app.use('/api', serviceGuard);
      app.get('/api/ping', (_req, res) => {
        res.json({ success: true });
      });

      const s = await serve(app);
      try {
        const res = await fetch(s.url('/api/ping'), { signal: AbortSignal.timeout(4000) });
        assert.equal(res.status, 200);
      } finally {
        await s.close();
      }
    },
  );
});

test('preview credentials are published so the preview can actually be opened', async () => {
  const { demoAccountHints } = await import('../src/demo/demo.router');
  const accounts = demoAccountHints();
  assert.ok(accounts.length > 0);
  for (const account of accounts) {
    assert.match(account.email, /@/);
    assert.ok(account.password.length > 0);
    assert.ok(account.role.length > 0);
  }
  assert.ok(accounts.some((a) => a.role === 'SUPERADMIN'));
});
