#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const serviceDir = path.resolve(process.env.MEDIEVAL_GAME_SERVICE_DIR ?? path.join(appDir, 'game-service'));
const distDir = path.join(appDir, 'dist');

const smokeResults = [];

function haveCommand(command) {
  return spawnSync('sh', ['-lc', `command -v ${command} >/dev/null 2>&1`]).status === 0;
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function newestBundle(prefix) {
  if (!(await exists(distDir))) return null;
  const entries = await fs.readdir(distDir, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(`${prefix}-`) || !entry.name.endsWith('.zip')) {
      continue;
    }
    const fullPath = path.join(distDir, entry.name);
    const stats = await fs.stat(fullPath);
    matches.push({ name: entry.name, fullPath, mtimeMs: stats.mtimeMs });
  }
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  return matches[0] ?? null;
}

function runCheck({ title, cwd, command, optional = false }) {
  const result = spawnSync('sh', ['-lc', command], { cwd, encoding: 'utf8' });
  const ok = result.status === 0;
  smokeResults.push({
    title,
    status: ok ? 'pass' : optional ? 'skip' : 'fail',
    command,
    cwd,
    detail: ok ? '' : (result.stderr || result.stdout || '').split('\n').slice(-12).join('\n').trim(),
  });
  if (!ok && !optional) {
    throw new Error(`${title} failed.`);
  }
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('Could not reserve a local port.'));
        }
      });
    });
  });
}

async function waitForReady(url, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }
  throw lastError ?? new Error(`${url} did not become ready.`);
}

async function runExtractedDemoSmoke(cwd) {
  const port = await findOpenPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = 'demo-token';
  const reviewer = `Bundle Smoke ${Date.now()}`;
  let output = '';
  const child = spawn(process.execPath, ['scripts/demo-server.mjs'], {
    cwd,
    env: {
      ...process.env,
      MEDIEVAL_DEMO_PORT: String(port),
      MEDIEVAL_DEMO_TOKEN: token,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  try {
    await waitForReady(`${baseUrl}/ready`);
    const result = spawnSync(process.execPath, ['scripts/demo-smoke.mjs'], {
      cwd,
      env: {
        ...process.env,
        MEDIEVAL_DEMO_BASE_URL: baseUrl,
        MEDIEVAL_DEMO_TOKEN: token,
        MEDIEVAL_DEMO_REVIEWER: reviewer,
      },
      encoding: 'utf8',
    });
    const ok = result.status === 0;
    smokeResults.push({
      title: 'extracted iOS demo backend smoke',
      status: ok ? 'pass' : 'fail',
      command: `MEDIEVAL_DEMO_BASE_URL=${baseUrl} node scripts/demo-smoke.mjs`,
      cwd,
      detail: ok ? '' : (result.stderr || result.stdout || output).split('\n').slice(-12).join('\n').trim(),
    });
    if (!ok) throw new Error('extracted iOS demo backend smoke failed.');
  } finally {
    child.kill();
  }
}

function unzip(bundle, destination) {
  const result = spawnSync('unzip', ['-q', bundle.fullPath, '-d', destination], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Could not extract ${bundle.name}: ${result.stderr || result.stdout}`);
  }
}

async function main() {
  if (!haveCommand('unzip')) throw new Error('unzip is required for bundle smoke verification.');

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'medieval-release-smoke-'));
  try {
    const appBundle = await newestBundle('MediEval-iOS');
    if (!appBundle) throw new Error(`No MediEval-iOS bundle found in ${distDir}.`);

    const appExtractDir = path.join(tempRoot, appBundle.name.replace(/\.zip$/, ''));
    await fs.mkdir(appExtractDir, { recursive: true });
    unzip(appBundle, appExtractDir);

    runCheck({
      title: 'extracted iOS helper syntax',
      cwd: appExtractDir,
      command: [
        'node --check scripts/demo-server.mjs',
        'node --check scripts/demo-smoke.mjs',
        'node --check scripts/eval-api-smoke.mjs',
        'node --check scripts/live-integration-smoke.mjs',
        'node --check scripts/local-integration-smoke.mjs',
        'node --check scripts/create-release-bundle.mjs',
        'node --check scripts/verify-release-bundle.mjs',
        'node --check scripts/smoke-release-bundle.mjs',
        'node --check scripts/verify-xcode-project.mjs',
        'node --check packages/schema/index.mjs',
        'node --check packages/schema/card-generator.mjs',
        'node --check packages/cli/medieval-eval.mjs',
        'node --check services/eval-api/store.mjs',
        'node --check services/eval-api/dashboard.mjs',
        'node --check services/eval-api/server.mjs',
        'bash -n scripts/xcode-simulator-smoke.sh',
      ].join(' && '),
    });
    runCheck({
      title: 'extracted open-source eval API smoke',
      cwd: appExtractDir,
      command: 'npm run oss:check',
    });
    runCheck({
      title: 'extracted iOS project verifier',
      cwd: appExtractDir,
      command: 'npm run verify:xcode',
    });

    if (haveCommand('xcrun')) {
      runCheck({
        title: 'extracted iOS Swift smoke checks',
        cwd: appExtractDir,
        command: [
          'tmp="${TMPDIR:-/tmp}/medieval-url-smoke-$$"',
          'xcrun swiftc ListingEvalApp/Models.swift ListingEvalApp/APIClient.swift scripts/url-normalization-smoke.swift -o "$tmp" && "$tmp"',
          'rc=$?; rm -f "$tmp"; test "$rc" = 0',
          'tmp="${TMPDIR:-/tmp}/medieval-settings-smoke-$$"',
          'xcrun swiftc ListingEvalApp/Models.swift ListingEvalApp/APIClient.swift ListingEvalApp/OutboxStore.swift ListingEvalApp/ContentView.swift scripts/settings-validation-smoke.swift -o "$tmp" && "$tmp"',
          'rc=$?; rm -f "$tmp"; test "$rc" = 0',
          'tmp="${TMPDIR:-/tmp}/medieval-payload-smoke-$$"',
          'xcrun swiftc ListingEvalApp/Models.swift ListingEvalApp/APIClient.swift scripts/payload-contract-smoke.swift -o "$tmp" && "$tmp"',
          'rc=$?; rm -f "$tmp"; test "$rc" = 0',
          'tmp="${TMPDIR:-/tmp}/medieval-deck-paging-smoke-$$"',
          'xcrun swiftc ListingEvalApp/Models.swift scripts/deck-paging-smoke.swift -o "$tmp" && "$tmp"',
          'rc=$?; rm -f "$tmp"; test "$rc" = 0',
          'tmp="${TMPDIR:-/tmp}/medieval-reward-smoke-$$"',
          'xcrun swiftc ListingEvalApp/Models.swift scripts/reward-scoring-smoke.swift -o "$tmp" && "$tmp"',
          'rc=$?; rm -f "$tmp"; test "$rc" = 0',
          'tmp="${TMPDIR:-/tmp}/medieval-outbox-smoke-$$"',
          'xcrun swiftc ListingEvalApp/Models.swift ListingEvalApp/APIClient.swift ListingEvalApp/OutboxStore.swift scripts/outbox-storage-smoke.swift -o "$tmp" && "$tmp"',
          'rc=$?; rm -f "$tmp"; exit "$rc"',
        ].join('; '),
      });
    } else {
      smokeResults.push({
        title: 'extracted iOS Swift smoke checks',
        status: 'skip',
        command: 'xcrun swiftc ...',
        cwd: appExtractDir,
        detail: 'xcrun not found',
      });
    }

    await runExtractedDemoSmoke(appExtractDir);

    if (await exists(path.join(serviceDir, 'package.json'))) {
      const serviceBundle = await newestBundle('MediEvalGameService');
      if (!serviceBundle) throw new Error(`No MediEvalGameService bundle found in ${distDir}.`);

      const serviceExtractDir = path.join(tempRoot, serviceBundle.name.replace(/\.zip$/, ''));
      await fs.mkdir(serviceExtractDir, { recursive: true });
      unzip(serviceBundle, serviceExtractDir);

      runCheck({
        title: 'extracted game service helper syntax',
        cwd: serviceExtractDir,
        command: [
          'node --check src/*.js',
          'node --check scripts/*.mjs',
          'node --check test/*.test.js',
        ].join(' && '),
      });
      runCheck({
        title: 'extracted game service deployment verifier',
        cwd: serviceExtractDir,
        command: 'node scripts/verify-deployment.mjs',
      });
    }

    const ok = smokeResults.every((result) => result.status !== 'fail');
    console.log(JSON.stringify({
      ok,
      distDir,
      tempRoot,
      results: smokeResults,
    }, null, 2));
    if (!ok) process.exit(1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
