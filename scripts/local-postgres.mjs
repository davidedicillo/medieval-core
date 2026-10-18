import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || `${path.basename(command)} failed.`);
  return result.stdout.trim();
}

export async function startLocalPostgres(directory) {
  const binaries = run('pg_config', ['--bindir']);
  const root = path.resolve(directory);
  const data = path.join(root, 'data');
  const socket = path.join(root, 'socket');
  await fs.mkdir(socket, { recursive: true, mode: 0o700 });
  let initialized = false;
  try { await fs.access(path.join(data, 'PG_VERSION')); initialized = true; } catch {}
  if (!initialized) run(path.join(binaries, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'medieval', '--no-locale', '--encoding=UTF8']);
  const status = spawnSync(path.join(binaries, 'pg_ctl'), ['-D', data, 'status'], { encoding: 'utf8' });
  const started = status.status !== 0;
  const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
  if (started) run(path.join(binaries, 'pg_ctl'), ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h '' -k ${quote(socket)} -p 55433`, '-w', 'start']);
  return {
    config: { host: socket, port: 55433, user: 'medieval', database: 'postgres' },
    stop() { if (started) run(path.join(binaries, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']); },
  };
}
