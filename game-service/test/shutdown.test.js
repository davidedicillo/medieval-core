import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { closeHttpServer, createGracefulShutdown } from '../src/shutdown.js';

test('closeHttpServer closes a listening server', async () => {
  const server = http.createServer((req, res) => {
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const before = await fetch(baseUrl);
  assert.equal(before.status, 200);

  await closeHttpServer(server, { timeoutMs: 100 });

  await assert.rejects(fetch(baseUrl), /fetch failed/);
});

test('createGracefulShutdown closes server and pool once', async () => {
  let closeCalls = 0;
  let poolEndCalls = 0;
  const exits = [];
  const logs = [];
  const server = {
    close(callback) {
      closeCalls += 1;
      callback();
    },
  };
  const pool = {
    async end() {
      poolEndCalls += 1;
    },
  };
  const shutdown = createGracefulShutdown({
    server,
    pool,
    timeoutMs: 100,
    logger: {
      log(message) { logs.push(message); },
      error(error) { logs.push(error.message); },
    },
    exit(code) { exits.push(code); },
  });

  await shutdown('SIGTERM');
  await shutdown('SIGINT');

  assert.equal(closeCalls, 1);
  assert.equal(poolEndCalls, 1);
  assert.deepEqual(exits, [0]);
  assert.match(logs[0], /SIGTERM/);
});

test('createGracefulShutdown fails fast when pool close times out', async () => {
  let poolEndCalls = 0;
  let slowPoolTimer;
  const exits = [];
  const logs = [];
  const server = {
    close(callback) {
      callback();
    },
  };
  const pool = {
    end() {
      poolEndCalls += 1;
      return new Promise((resolve) => {
        slowPoolTimer = setTimeout(resolve, 50);
      });
    },
  };
  const shutdown = createGracefulShutdown({
    server,
    pool,
    timeoutMs: 5,
    logger: {
      log(message) { logs.push(message); },
      error(error) { logs.push(error.message); },
    },
    exit(code) { exits.push(code); },
  });

  try {
    await shutdown('SIGTERM');
  } finally {
    clearTimeout(slowPoolTimer);
  }

  assert.equal(poolEndCalls, 1);
  assert.deepEqual(exits, [1]);
  assert.match(logs.at(-1), /Database pool did not close within 5ms/);
});
