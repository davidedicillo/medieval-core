#!/usr/bin/env node
import { Pool } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startPlatform } from '../services/platform/server.mjs';
import { startLocalPostgres } from './local-postgres.mjs';

const dataDir = path.resolve('.runtime', 'platform-demo');
await fs.mkdir(dataDir, { recursive: true });
const secretFile = path.join(dataDir, 'auth-secret');
let secret;
try { secret = await fs.readFile(secretFile, 'utf8'); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  secret = randomBytes(48).toString('base64url');
  await fs.writeFile(secretFile, secret, { mode: 0o600, flag: 'wx' });
}
let databaseUrl = process.env.DATABASE_URL;
let pool;
let localPostgres;
if (!databaseUrl) {
  try { localPostgres = await startLocalPostgres(path.join(dataDir, 'postgres')); }
  catch (error) { console.error('Install PostgreSQL with pg_config on PATH, or set DATABASE_URL. ' + error.message); process.exit(1); }
  const admin = new Pool(localPostgres.config);
  try {
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname = 'medieval_platform_demo'")).rowCount) await admin.query('CREATE DATABASE medieval_platform_demo');
  } catch {
    console.error('Start local PostgreSQL or set DATABASE_URL, then run npm run demo:accounts again.');
    await admin.end();
    process.exit(1);
  }
  await admin.end();
  pool = new Pool({ ...localPostgres.config, database: 'medieval_platform_demo' });
}
try {
  const port = Number(process.env.MEDIEVAL_PLATFORM_DEMO_PORT || 5183);
  const platform = await startPlatform({ pool, databaseUrl, port, host: '127.0.0.1', baseURL: `http://127.0.0.1:${port}`, secret, dataDir, localMail: true });
  console.log(`MediEval accounts demo: http://127.0.0.1:${port}`);
  console.log(`Development inbox: http://127.0.0.1:${port}/dev/inbox`);
  console.log('Sign in with a sample email address to create a workspace and invite reviewers.');
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await platform.close(); if(pool)await pool.end(); localPostgres?.stop(); process.exit(0); });
} catch (error) { if(pool)await pool.end(); localPostgres?.stop(); console.error(error.message); process.exitCode = 1; }
