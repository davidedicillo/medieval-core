#!/usr/bin/env node

import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import { hasDatabaseConfig } from '../src/config.js';

const token = String(process.env.MEDIEVAL_GAME_TOKEN || 'local-postgres-smoke-token');
const reviewer = String(process.env.MEDIEVAL_GAME_REVIEWER || 'MediEval Postgres Smoke');
const readyTimeoutMs = Number(process.env.MEDIEVAL_POSTGRES_SMOKE_READY_TIMEOUT_MS || 60_000);

function requireDatabaseConfig() {
  if (!hasDatabaseConfig(process.env)) {
    throw new Error('Set DATABASE_URL, or POSTGRES_HOST + POSTGRES_DB + POSTGRES_USER, before running the Postgres smoke.');
  }
}

function childEnv(extra = {}) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    MEDIEVAL_GAME_TOKEN: token,
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    ...extra,
  };
}

function tail(text, lineCount = 80) {
  return text.split('\n').slice(-lineCount).join('\n').trim();
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: childEnv(options.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error([
        `${command} ${args.join(' ')} exited with ${code}`,
        tail(stdout),
        tail(stderr),
      ].filter(Boolean).join('\n')));
    });
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForReady(baseUrl, serverLogs) {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt < readyTimeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/ready`);
      if (response.ok) {
        const body = await response.json();
        if (body.ok) return body;
      }
      lastError = `ready returned ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error([
    `Postgres-backed service did not become ready at ${baseUrl}/ready: ${lastError}`,
    tail(serverLogs.stdout),
    tail(serverLogs.stderr),
  ].filter(Boolean).join('\n'));
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function main() {
  requireDatabaseConfig();

  await run('node', ['scripts/migrate.mjs']);

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverLogs = { stdout: '', stderr: '' };
  const server = spawn('node', ['src/server.js'], {
    cwd: process.cwd(),
    env: childEnv({ PORT: String(port) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { serverLogs.stdout += chunk; });
  server.stderr.on('data', (chunk) => { serverLogs.stderr += chunk; });

  try {
    const ready = await waitForReady(baseUrl, serverLogs);
    const smoke = await run('node', ['scripts/smoke.mjs'], {
      env: {
        MEDIEVAL_GAME_BASE_URL: baseUrl,
        MEDIEVAL_GAME_TOKEN: token,
        MEDIEVAL_GAME_REVIEWER: reviewer,
        MEDIEVAL_GAME_SMOKE_EVENT_ID: `postgres-smoke-${Date.now()}`,
      },
    });

    console.log(JSON.stringify({
      ok: true,
      service: baseUrl,
      database: ready.database ?? 'postgres',
      migrated: true,
      smoke: JSON.parse(smoke.stdout),
    }, null, 2));
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
