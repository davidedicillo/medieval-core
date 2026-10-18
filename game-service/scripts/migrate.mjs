import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createPoolFromEnv } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../migrations');
const pool = createPoolFromEnv();
const timeoutMs = Number(process.env.DB_WAIT_TIMEOUT_MS ?? 60_000);
const intervalMs = Number(process.env.DB_WAIT_INTERVAL_MS ?? 1_500);

async function waitForDatabase() {
  const startedAt = Date.now();
  let attempt = 0;
  while (Date.now() - startedAt <= timeoutMs) {
    attempt += 1;
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      console.log(`database not ready for migration (${attempt}): ${error.message}`);
      await sleep(intervalMs);
    }
  }
  throw new Error(`Database was not reachable within ${timeoutMs}ms.`);
}

async function main() {
  await waitForDatabase();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const already = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
    if (already.rowCount > 0) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await pool.query('COMMIT');
      console.log(`applied ${filename}`);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  console.log(`migrations complete (${files.length} available)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
