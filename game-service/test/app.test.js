import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createGameApp } from '../src/app.js';
import { createMemoryStore } from '../src/memoryStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runNodeScript(scriptPath, env = {}) {
  const child = spawn(process.execPath, [scriptPath], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code !== 0) {
    throw new Error(stderr || stdout || `Script failed with exit code ${code}`);
  }
  return stdout;
}

test('game API requires token when configured', async () => {
  await withServer(createGameApp({ store: createMemoryStore(), token: 'secret' }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/game/profile?reviewer=Davide`);
    assert.equal(response.status, 401);
  });
});

test('game API accepts x-medieval-game-token authentication', async () => {
  await withServer(createGameApp({ store: createMemoryStore(), token: 'secret' }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/game/profile?reviewer=Davide`, {
      headers: { 'x-medieval-game-token': 'secret' },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).profile.reviewer, 'Davide');
  });
});

test('game API answers browser CORS preflight for authenticated routes', async () => {
  await withServer(createGameApp({
    store: createMemoryStore(),
    token: 'secret',
    corsOrigin: 'https://medieval.example',
  }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/game/verdicts`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://medieval.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://medieval.example');
    assert.match(response.headers.get('access-control-allow-methods'), /POST/);
    assert.match(response.headers.get('access-control-allow-headers'), /authorization/);
    assert.match(response.headers.get('access-control-allow-headers'), /content-type/);
  });
});

test('health endpoint is public and profile normalizes blank reviewers', async () => {
  await withServer(createGameApp({ store: createMemoryStore(), token: 'secret' }), async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.service, 'medieval-game-service');
    assert.equal(typeof healthBody.version, 'string');
    assert.equal(typeof healthBody.uptimeSeconds, 'number');
    assert.match(healthBody.checkedAt, /^\d{4}-\d{2}-\d{2}T/);

    const ready = await fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 200);
    const readyBody = await ready.json();
    assert.equal(readyBody.ok, true);
    assert.equal(readyBody.service, 'medieval-game-service');
    assert.equal(typeof readyBody.version, 'string');
    assert.equal(typeof readyBody.uptimeSeconds, 'number');
    assert.match(readyBody.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(readyBody.database, 'memory');

    const profile = await fetch(`${baseUrl}/api/game/profile?reviewer=%20%20`, {
      headers: { authorization: 'Bearer secret' },
    });
    assert.equal(profile.status, 200);
    const body = await profile.json();
    assert.equal(body.profile.reviewer, 'anonymous');
  });
});

test('ready endpoint reports dependency failures', async () => {
  const failingStore = {
    async health() {
      throw new Error('database unavailable');
    },
    async getProfile() {},
    async recordVerdict() {},
    async leaderboard() {},
  };

  await withServer(createGameApp({ store: failingStore }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ready`);
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /database unavailable/);
  });
});

test('game API records idempotent verdicts and returns profile progress', async () => {
  await withServer(createGameApp({ store: createMemoryStore(), token: 'secret' }), async (baseUrl) => {
    const payload = {
      eventId: 'event-1',
      reviewer: 'Davide',
      cardId: 'card-1',
      answer: 'no',
      correction: { correctAnswer: 'Charging cable', reasonTags: ['wrong_item'] },
      priority: 'high',
      confidence: 0.2,
      clientGeneratedAt: new Date().toISOString(),
    };

    const first = await fetch(`${baseUrl}/api/game/verdicts`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.duplicate, false);
    assert.equal(firstBody.awarded.xp, 5);
    assert.equal(firstBody.profile.xp, 5);
    assert.equal(firstBody.profile.gold, 1);

    const duplicate = await fetch(`${baseUrl}/api/game/verdicts`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const duplicateBody = await duplicate.json();
    assert.equal(duplicateBody.duplicate, true);
    assert.equal(duplicateBody.awarded.xp, 0);
    assert.equal(duplicateBody.profile.xp, 5);
  });
});

test('game API rejects malformed verdict payloads', async () => {
  await withServer(createGameApp({ store: createMemoryStore(), token: 'secret' }), async (baseUrl) => {
    const badJson = await fetch(`${baseUrl}/api/game/verdicts`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: '{not-json',
    });
    assert.equal(badJson.status, 400);
    assert.match((await badJson.json()).error, /Invalid JSON/);

    const missingCard = await fetch(`${baseUrl}/api/game/verdicts`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reviewer: 'Davide', answer: 'yes' }),
    });
    assert.equal(missingCard.status, 400);
    assert.match((await missingCard.json()).error, /Missing cardId/);

    const badConfidence = await fetch(`${baseUrl}/api/game/verdicts`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reviewer: 'Davide', cardId: 'card-1', answer: 'yes', confidence: 4 }),
    });
    assert.equal(badConfidence.status, 400);
    assert.match((await badConfidence.json()).error, /Invalid confidence/);
  });
});

test('leaderboard ranks reviewers by xp', async () => {
  const store = createMemoryStore();
  await store.recordVerdict({
    eventId: 'low-score',
    reviewer: 'Page',
    cardId: 'card-a',
    answer: 'skip',
  });
  await store.recordVerdict({
    eventId: 'high-score',
    reviewer: 'Knight',
    cardId: 'card-b',
    answer: 'no',
    correction: { correctAnswer: 'Truth', reasonTags: ['wrong_item'] },
    priority: 'high',
    confidence: 0.1,
  });

  const leaderboard = await store.leaderboard();

  assert.equal(leaderboard[0].reviewer, 'Knight');
  assert.equal(leaderboard[0].place, 1);
  assert.equal(leaderboard[1].reviewer, 'Page');
});

test('leaderboard endpoint returns ranked profiles', async () => {
  const store = createMemoryStore();
  await store.recordVerdict({
    eventId: 'endpoint-low-score',
    reviewer: 'Page',
    cardId: 'card-c',
    answer: 'skip',
  });
  await store.recordVerdict({
    eventId: 'endpoint-high-score',
    reviewer: 'Knight',
    cardId: 'card-d',
    answer: 'yes',
    priority: 'high',
    confidence: 0.1,
  });

  await withServer(createGameApp({ store, token: 'secret' }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/game/leaderboard?limit=5`, {
      headers: { authorization: 'Bearer secret' },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.leaderboard[0].reviewer, 'Knight');
    assert.equal(body.leaderboard[0].place, 1);
    assert.equal(body.leaderboard[1].reviewer, 'Page');
  });
});

test('smoke script verifies game API contract', async () => {
  await withServer(createGameApp({ store: createMemoryStore(), token: 'secret' }), async (baseUrl) => {
    const stdout = await runNodeScript('scripts/smoke.mjs', {
      MEDIEVAL_GAME_BASE_URL: baseUrl,
      MEDIEVAL_GAME_TOKEN: 'secret',
      MEDIEVAL_GAME_REVIEWER: 'Davide',
      MEDIEVAL_GAME_SMOKE_EVENT_ID: 'contract-smoke-event',
    });
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.duplicateProtected, true);
    assert.equal(result.leaderboardSize, 1);
  });
});
