#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceDir = path.resolve(__dirname, '..');

async function readText(relativePath) {
  return fs.readFile(path.join(serviceDir, relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

function assertIncludes(text, expected, label) {
  assert.ok(text.includes(expected), `${label} must include ${expected}`);
}

function assertMatches(text, pattern, label) {
  assert.match(text, pattern, `${label} must match ${pattern}`);
}

const packageJson = await readJson('package.json');
const packageLock = await readJson('package-lock.json');
assert.equal(packageJson.type, 'module', 'package.json must use ESM.');
assert.equal(packageLock.name, packageJson.name, 'package-lock.json must match package.json name.');
for (const script of ['start', 'migrate', 'smoke', 'smoke:memory', 'smoke:postgres', 'test', 'lint', 'preflight', 'verify:deploy']) {
  assert.equal(typeof packageJson.scripts?.[script], 'string', `Missing npm script: ${script}`);
}
assert.ok(packageJson.dependencies?.pg, 'pg must be a production dependency.');
assert.ok(packageJson.dependencies?.dotenv, 'dotenv must be a production dependency.');

const dockerfile = await readText('Dockerfile');
assertIncludes(dockerfile, 'FROM node:22-alpine', 'Dockerfile');
assertIncludes(dockerfile, 'npm ci --omit=dev', 'Dockerfile');
assertIncludes(dockerfile, 'ENV NODE_ENV=production', 'Dockerfile');
assertIncludes(dockerfile, 'EXPOSE 8080', 'Dockerfile');
assertIncludes(dockerfile, 'HEALTHCHECK', 'Dockerfile');
assertIncludes(dockerfile, '/ready', 'Dockerfile');
assertIncludes(dockerfile, 'node scripts/wait-for-db.mjs && npm run migrate && npm start', 'Dockerfile');

const compose = await readText('docker-compose.yml');
assertIncludes(compose, 'postgres:16-alpine', 'docker-compose.yml');
assertIncludes(compose, 'DATABASE_URL: postgres://medieval:medieval@db:5432/medieval', 'docker-compose.yml');
assertIncludes(compose, 'MEDIEVAL_GAME_TOKEN: local-dev-token', 'docker-compose.yml');
assertIncludes(compose, 'pg_isready -U medieval -d medieval', 'docker-compose.yml');
assertIncludes(compose, 'condition: service_healthy', 'docker-compose.yml');
assertIncludes(compose, 'http://127.0.0.1:8080/ready', 'docker-compose.yml');
assertIncludes(compose, 'start_period: 30s', 'docker-compose.yml');
assertIncludes(compose, '54329:5432', 'docker-compose.yml');

const envExample = await readText('.env.example');
for (const name of [
  'PORT=8080',
  'DATABASE_URL=',
  'MEDIEVAL_GAME_TOKEN=',
  'MEDIEVAL_ALLOW_UNAUTHENTICATED=false',
  'CORS_ORIGIN=*',
  'DB_WAIT_TIMEOUT_MS=',
  'DB_WAIT_INTERVAL_MS=',
  'SHUTDOWN_TIMEOUT_MS=',
]) {
  assertIncludes(envExample, name, '.env.example');
}

const migration = await readText('migrations/001_init.sql');
for (const table of ['reviewers', 'reviewer_progress', 'verdict_events']) {
  assertMatches(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), 'migrations/001_init.sql');
}
assertIncludes(migration, 'UNIQUE', 'migrations/001_init.sql');

const migrator = await readText('scripts/migrate.mjs');
assertIncludes(migrator, 'CREATE TABLE IF NOT EXISTS schema_migrations', 'scripts/migrate.mjs');
assertIncludes(migrator, 'INSERT INTO schema_migrations', 'scripts/migrate.mjs');

const server = await readText('src/server.js');
assertIncludes(server, 'requireProductionToken', 'src/server.js');
assertIncludes(server, 'requireProductionDatabase', 'src/server.js');
assertIncludes(server, 'createPostgresStore', 'src/server.js');

const config = await readText('src/config.js');
assertIncludes(config, 'MEDIEVAL_GAME_TOKEN is required', 'src/config.js');
assertIncludes(config, 'DATABASE_URL is required', 'src/config.js');

const coolify = await readText('docs/COOLIFY.md');
for (const expected of [
  'DATABASE_URL=<Coolify Postgres internal connection string>',
  'MEDIEVAL_GAME_TOKEN=<long random shared secret>',
  '/ready',
  'npm run smoke',
]) {
  assertIncludes(coolify, expected, 'docs/COOLIFY.md');
}

const workflow = await readText('.github/workflows/ci.yml');
assertIncludes(workflow, 'postgres:16-alpine', '.github/workflows/ci.yml');
assertIncludes(workflow, 'npm run migrate', '.github/workflows/ci.yml');
assertIncludes(workflow, 'npm run smoke', '.github/workflows/ci.yml');
assertIncludes(workflow, 'docker build -t medieval-game-service:ci .', '.github/workflows/ci.yml');

const smoke = await readText('scripts/smoke.mjs');
assertIncludes(smoke, 'MEDIEVAL_GAME_EXPECT_AUTH', 'scripts/smoke.mjs');
assertIncludes(smoke, 'unauthenticated profile request should return 401', 'scripts/smoke.mjs');

const postgresSmoke = await readText('scripts/smoke-postgres-local.mjs');
assertIncludes(postgresSmoke, 'MEDIEVAL_POSTGRES_SMOKE_READY_TIMEOUT_MS', 'scripts/smoke-postgres-local.mjs');
assertIncludes(postgresSmoke, "spawn('node', ['src/server.js']", 'scripts/smoke-postgres-local.mjs');
assertIncludes(postgresSmoke, 'scripts/smoke.mjs', 'scripts/smoke-postgres-local.mjs');

console.log(JSON.stringify({
  ok: true,
  checked: [
    'package.json',
    'package-lock.json',
    'Dockerfile',
    'docker-compose.yml',
    '.env.example',
    'migrations/001_init.sql',
    'scripts/migrate.mjs',
    'src/server.js',
    'src/config.js',
    'scripts/smoke.mjs',
    'scripts/smoke-postgres-local.mjs',
    'docs/COOLIFY.md',
    '.github/workflows/ci.yml',
  ],
}, null, 2));
