import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { createPoolFromEnv } from '../src/db.js';

const timeoutMs = Number(process.env.DB_WAIT_TIMEOUT_MS ?? 60_000);
const intervalMs = Number(process.env.DB_WAIT_INTERVAL_MS ?? 1_500);
const startedAt = Date.now();
const pool = createPoolFromEnv();

async function main() {
  let attempt = 0;
  while (Date.now() - startedAt <= timeoutMs) {
    attempt += 1;
    try {
      await pool.query('SELECT 1');
      console.log(`database reachable after ${attempt} attempt(s)`);
      return;
    } catch (error) {
      console.log(`database not ready (${attempt}): ${error.message}`);
      await sleep(intervalMs);
    }
  }
  throw new Error(`Database was not reachable within ${timeoutMs}ms.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
