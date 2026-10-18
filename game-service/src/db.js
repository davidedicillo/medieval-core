import pg from 'pg';

const { Pool } = pg;

export function createPoolFromEnv(env = process.env) {
  const connectionString = env.DATABASE_URL;
  return new Pool({
    connectionString,
    host: connectionString ? undefined : env.POSTGRES_HOST,
    port: connectionString ? undefined : Number(env.POSTGRES_PORT ?? 5432),
    database: connectionString ? undefined : env.POSTGRES_DB,
    user: connectionString ? undefined : env.POSTGRES_USER,
    password: connectionString ? undefined : env.POSTGRES_PASSWORD,
    ssl: env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: Number(env.POSTGRES_POOL_SIZE ?? 10),
  });
}

export async function closePool(pool) {
  if (pool?.end) await pool.end();
}
