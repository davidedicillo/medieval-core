export function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function text(value) {
  return String(value ?? '').trim();
}

function isProduction(nodeEnv) {
  return text(nodeEnv).toLowerCase() === 'production';
}

export function requireProductionToken({
  token,
  nodeEnv = process.env.NODE_ENV,
  allowUnauthenticated = process.env.MEDIEVAL_ALLOW_UNAUTHENTICATED,
} = {}) {
  const hasToken = Boolean(text(token));
  if (isProduction(nodeEnv) && !hasToken && !parseBoolean(allowUnauthenticated)) {
    throw new Error('MEDIEVAL_GAME_TOKEN is required when NODE_ENV=production. Set MEDIEVAL_ALLOW_UNAUTHENTICATED=true only for an intentionally public non-production deployment.');
  }
}

export function hasDatabaseConfig(env = process.env) {
  if (text(env.DATABASE_URL)) return true;
  return Boolean(text(env.POSTGRES_HOST) && text(env.POSTGRES_DB) && text(env.POSTGRES_USER));
}

export function requireProductionDatabase({
  env = process.env,
  nodeEnv = env.NODE_ENV,
} = {}) {
  if (isProduction(nodeEnv) && !hasDatabaseConfig(env)) {
    throw new Error('DATABASE_URL is required when NODE_ENV=production, or set POSTGRES_HOST, POSTGRES_DB, and POSTGRES_USER.');
  }
}
