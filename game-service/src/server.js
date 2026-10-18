import 'dotenv/config';
import http from 'node:http';
import { createGameApp } from './app.js';
import { requireProductionDatabase, requireProductionToken } from './config.js';
import { createPoolFromEnv } from './db.js';
import { createGracefulShutdown } from './shutdown.js';
import { createPostgresStore } from './store.js';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST || '0.0.0.0';
const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000);
const gameToken = process.env.MEDIEVAL_GAME_TOKEN || '';
requireProductionToken({
  token: gameToken,
  nodeEnv: process.env.NODE_ENV,
  allowUnauthenticated: process.env.MEDIEVAL_ALLOW_UNAUTHENTICATED,
});
requireProductionDatabase({
  env: process.env,
  nodeEnv: process.env.NODE_ENV,
});
const pool = createPoolFromEnv();
const store = createPostgresStore(pool);
const app = createGameApp({
  store,
  token: gameToken,
  corsOrigin: process.env.CORS_ORIGIN || '*',
});

const server = http.createServer(app);

server.listen(port, host, () => {
  console.log(`MediEval game service listening on http://${host}:${port}`);
});

const shutdown = createGracefulShutdown({
  server,
  pool,
  timeoutMs: shutdownTimeoutMs,
});

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
