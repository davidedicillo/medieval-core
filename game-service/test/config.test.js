import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasDatabaseConfig,
  parseBoolean,
  requireProductionDatabase,
  requireProductionToken,
} from '../src/config.js';

test('parseBoolean accepts explicit truthy values', () => {
  for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
    assert.equal(parseBoolean(value), true);
  }
  for (const value of ['', '0', 'false', 'no', undefined]) {
    assert.equal(parseBoolean(value), false);
  }
});

test('production requires a game token unless explicitly public', () => {
  assert.doesNotThrow(() => requireProductionToken({ nodeEnv: 'development', token: '' }));
  assert.doesNotThrow(() => requireProductionToken({ nodeEnv: 'production', token: 'secret' }));
  assert.doesNotThrow(() => requireProductionToken({
    nodeEnv: 'production',
    token: '',
    allowUnauthenticated: 'true',
  }));
  assert.throws(
    () => requireProductionToken({ nodeEnv: 'production', token: '' }),
    /MEDIEVAL_GAME_TOKEN is required/,
  );
});

test('database config accepts DATABASE_URL or split Postgres variables', () => {
  assert.equal(hasDatabaseConfig({ DATABASE_URL: 'postgres://db' }), true);
  assert.equal(hasDatabaseConfig({
    POSTGRES_HOST: 'db',
    POSTGRES_DB: 'medieval',
    POSTGRES_USER: 'medieval',
  }), true);
  assert.equal(hasDatabaseConfig({
    POSTGRES_HOST: 'db',
    POSTGRES_DB: 'medieval',
  }), false);
  assert.equal(hasDatabaseConfig({ DATABASE_URL: '   ' }), false);
});

test('production requires database configuration', () => {
  assert.doesNotThrow(() => requireProductionDatabase({
    nodeEnv: 'development',
    env: {},
  }));
  assert.doesNotThrow(() => requireProductionDatabase({
    nodeEnv: 'production',
    env: { DATABASE_URL: 'postgres://medieval:secret@db:5432/medieval' },
  }));
  assert.doesNotThrow(() => requireProductionDatabase({
    nodeEnv: 'production',
    env: {
      POSTGRES_HOST: 'db',
      POSTGRES_DB: 'medieval',
      POSTGRES_USER: 'medieval',
    },
  }));
  assert.throws(
    () => requireProductionDatabase({ nodeEnv: 'production', env: {} }),
    /DATABASE_URL is required/,
  );
});
