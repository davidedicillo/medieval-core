import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/001_init.sql'), 'utf8');

test('initial migration defines the durable game schema', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS reviewers/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS reviewer_progress/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS verdict_events/i);
  assert.match(migration, /answer TEXT NOT NULL CHECK/i);
  assert.match(migration, /confidence NUMERIC CHECK/i);
  assert.match(migration, /duration_ms INTEGER CHECK/i);
  assert.match(migration, /reviewer_progress_leaderboard_idx/i);
});
