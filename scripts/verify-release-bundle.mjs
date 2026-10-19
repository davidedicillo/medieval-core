#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const serviceDir = path.resolve(process.env.MEDIEVAL_GAME_SERVICE_DIR ?? path.join(appDir, 'game-service'));
const distDir = path.join(appDir, 'dist');
const requireGameServiceBundle = /^(1|true|yes)$/i.test(String(process.env.MEDIEVAL_REQUIRE_GAME_SERVICE_BUNDLE ?? ''));

const requiredEntries = {
  'MediEval-iOS': [
    'ListingEvalApp.xcodeproj/project.pbxproj',
    'ListingEvalApp.xcodeproj/xcshareddata/xcschemes/ListingEvalApp.xcscheme',
    'ListingEvalApp/ContentView.swift',
    'ListingEvalApp/APIClient.swift',
    'ListingEvalApp/Models.swift',
    'ListingEvalApp/OutboxStore.swift',
    'ListingEvalApp/PlatformAccount.swift',
    'ListingEvalApp/Info.plist',
    'ListingEvalApp/Assets.xcassets/AppIcon.appiconset/Contents.json',
    'scripts/demo-server.mjs',
    'scripts/demo-smoke.mjs',
    'scripts/live-integration-smoke.mjs',
    'scripts/local-integration-smoke.mjs',
    'scripts/eval-api-smoke.mjs',
    'scripts/preflight.sh',
    'scripts/url-normalization-smoke.swift',
    'scripts/settings-validation-smoke.swift',
    'scripts/payload-contract-smoke.swift',
    'scripts/deck-paging-smoke.swift',
    'scripts/reward-scoring-smoke.swift',
    'scripts/outbox-storage-smoke.swift',
    'scripts/smoke-release-bundle.mjs',
    'scripts/verify-xcode-project.mjs',
    'scripts/xcode-simulator-smoke.sh',
    '.github/workflows/ci.yml',
    'package.json',
    'package-lock.json',
    'LICENSE',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'CODE_OF_CONDUCT.md',
    'ROADMAP.md',
    'HANDOFF.md',
    'README.md',
    'VERIFY.md',
    'docs/EVAL_API.md',
    'docs/OPEN_CORE.md',
    'docs/SELF_HOSTING.md',
    'docs/ADAPTER_GUIDE.md',
    'docs/CARD_SCHEMA.md',
    'examples/cards.jsonl',
    'examples/myfire-rating.csv',
    'packages/schema/card-generator.mjs',
    'packages/schema/index.mjs',
    'packages/cli/medieval-eval.mjs',
    'services/eval-api/README.md',
    'services/eval-api/dashboard.mjs',
    'services/eval-api/server.mjs',
    'services/eval-api/store.mjs',
    'services/eval-api/demo-reviewer.mjs',
    'services/platform/server.mjs',
    'services/platform/auth.mjs',
    'services/platform/access.mjs',
    'services/platform/schema.sql',
    'services/platform/platform.js',
    'services/platform/platform.css',
    'ios/Art/Generated/Logo/medieval-logo-transparent-v1.png',
  ],
  MediEvalGameService: [
    '.github/workflows/ci.yml',
    'Dockerfile',
    'docker-compose.yml',
    'package.json',
    'package-lock.json',
    'migrations/001_init.sql',
    'src/server.js',
    'src/app.js',
    'src/store.js',
    'src/scoring.js',
    'src/config.js',
    'src/db.js',
    'scripts/preflight.sh',
    'scripts/migrate.mjs',
    'scripts/smoke.mjs',
    'scripts/smoke-memory.mjs',
    'scripts/smoke-postgres-local.mjs',
    'scripts/verify-deployment.mjs',
    'docs/API.md',
    'docs/COOLIFY.md',
  ],
};

const forbiddenPatterns = [
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.codex-tmp(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.env(?:\.(?!example$)[^/]+)?$/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)DerivedData(\/|$)/,
  /(^|\/)build(\/|$)/,
  /(^|\/)xcuserdata(\/|$)/,
  /\.xcuserstate$/,
  /\.xcscmblueprint$/,
];

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

function zipEntries(bundle) {
  const result = spawnSync('zipinfo', ['-1', bundle.fullPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`zipinfo failed for ${bundle.name}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim().split('\n').filter(Boolean);
}

function verifyBundle(prefix, bundle) {
  const entries = zipEntries(bundle);
  const entrySet = new Set(entries);
  const missing = requiredEntries[prefix].filter((entry) => !entrySet.has(entry));
  const forbidden = entries.filter((entry) => forbiddenPatterns.some((pattern) => pattern.test(entry)));
  return {
    bundle: bundle.name,
    entries: entries.length,
    missing,
    forbidden,
  };
}

const prefixes = ['MediEval-iOS'];
if (requireGameServiceBundle || await exists(path.join(serviceDir, 'package.json'))) {
  prefixes.push('MediEvalGameService');
}
const results = [];

for (const prefix of prefixes) {
  const bundle = await newestBundle(prefix);
  if (!bundle) {
    results.push({
      bundle: `${prefix}-*.zip`,
      entries: 0,
      missing: requiredEntries[prefix],
      forbidden: [],
      error: `No ${prefix} bundle found in ${distDir}`,
    });
    continue;
  }
  results.push(verifyBundle(prefix, bundle));
}

const ok = results.every((result) => (
  !result.error
  && result.missing.length === 0
  && result.forbidden.length === 0
));

console.log(JSON.stringify({ ok, distDir, results }, null, 2));

if (!ok) {
  process.exit(1);
}
