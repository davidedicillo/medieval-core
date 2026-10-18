#!/usr/bin/env node

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameApp } from '../src/app.js';
import { createMemoryStore } from '../src/memoryStore.js';
import { closeHttpServer } from '../src/shutdown.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceDir = path.resolve(__dirname, '..');
const token = process.env.MEDIEVAL_GAME_TOKEN || 'local-memory-token';
const reviewer = process.env.MEDIEVAL_GAME_REVIEWER || 'MediEval Memory Smoke';
const eventId = process.env.MEDIEVAL_GAME_SMOKE_EVENT_ID || `memory-smoke-${Date.now()}`;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

function runSmoke(baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/smoke.mjs'], {
      cwd: serviceDir,
      env: {
        ...process.env,
        MEDIEVAL_GAME_BASE_URL: baseUrl,
        MEDIEVAL_GAME_TOKEN: token,
        MEDIEVAL_GAME_REVIEWER: reviewer,
        MEDIEVAL_GAME_SMOKE_EVENT_ID: eventId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr || stdout || `smoke.mjs exited with ${code}`));
    });
  });
}

const server = http.createServer(createGameApp({
  store: createMemoryStore(),
  token,
  corsOrigin: '*',
}));

try {
  const address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const stdout = await runSmoke(baseUrl);
  if (stdout) console.log(stdout);
} finally {
  await closeHttpServer(server);
}
