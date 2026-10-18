#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const evalAdapterDir = process.env.MEDIEVAL_EVAL_ADAPTER_DIR ?? process.env.MEDIEVAL_DASHBOARD_DIR ?? '';
const dashboardDir = evalAdapterDir ? path.resolve(evalAdapterDir) : '';
const gameServiceDir = path.resolve(process.env.MEDIEVAL_GAME_SERVICE_DIR ?? path.join(appDir, 'game-service'));
const liveSmokePath = path.join(appDir, 'scripts/live-integration-smoke.mjs');

async function exists(targetPath) {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function requireFile(targetPath, label) {
  try {
    await access(targetPath, fsConstants.F_OK);
  } catch {
    throw new Error(`${label} was not found at ${targetPath}. Set MEDIEVAL_EVAL_ADAPTER_DIR to an external adapter repo and MEDIEVAL_GAME_SERVICE_DIR if your game service lives elsewhere.`);
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function startDashboardFixture() {
  if (!dashboardDir) {
    throw new Error('Set MEDIEVAL_EVAL_ADAPTER_DIR to an external eval adapter repo before running local integration.');
  }
  const modulePath = path.join(dashboardDir, 'scripts/daily-sales-pipeline-dashboard.mjs');
  await requireFile(modulePath, 'External eval adapter module');
  const { DailySalesPipelineDashboard } = await import(pathToFileURL(modulePath).href);
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'medieval-local-dashboard-'));
  const token = String(process.env.EVAL_MOBILE_TOKEN ?? process.env.MEDIEVAL_DASHBOARD_TOKEN ?? '').trim() || 'local-dashboard-token';
  const dashboard = new DailySalesPipelineDashboard({
    runtimeRoot,
    runId: 'daily-sales-medieval-local-integration',
    shardCount: 1,
    evalMobileToken: token,
  });
  const shard = dashboard.state.shards[0];
  await mkdir(path.dirname(shard.analysis.analysisJsonlPath), { recursive: true });
  await writeFile(shard.analysis.analysisJsonlPath, [
    {
      sourceKey: 'dailySale:ebyUS:local-integration-title',
      provider: 'openai',
      model: 'gpt-local-integration',
      generatedAt: '2026-06-23T00:00:00.000Z',
      listing: {
        title: 'MediEval local integration cartridge',
        listingUrl: 'https://example.test/local-integration-title',
        price: { text: '$31.00' },
      },
      images: [{ sourceImageUrl: 'https://example.test/local-integration-title.jpg', position: 1 }],
      analysis: {
        summary: 'Synthetic local integration row for the external eval adapter.',
        pricingUse: 'clean_variant_price',
        pricingNotes: 'Image-backed title with one low-confidence variant clue.',
        humanReview: { priority: 'high', modelWarnings: ['Local integration fixture.'] },
        components: [{
          componentType: 'game_media',
          titleOrLabel: 'MediEval Quest cartridge',
          gameTitle: 'MediEval Quest',
          variantSignals: ['Gold seal visible on front label'],
          confidence: 0.37,
          evidence: [{
            source: 'image',
            detail: 'Front label text and gold seal are visible in the listing image.',
            confidence: 0.72,
            imagePositions: ['1'],
          }],
        }],
      },
    },
    {
      sourceKey: 'dailySale:ebyUS:local-integration-accessory',
      provider: 'openai',
      model: 'gpt-local-integration',
      generatedAt: '2026-06-23T00:00:00.000Z',
      listing: {
        title: 'MediEval local bundle with charger',
        listingUrl: 'https://example.test/local-integration-accessory',
        price: { text: '$19.00' },
      },
      images: [{ sourceImageUrl: 'https://example.test/local-integration-accessory.jpg', position: 1 }],
      analysis: {
        summary: 'Synthetic accessory row for item-label integration coverage.',
        humanReview: { priority: 'medium', modelWarnings: [] },
        components: [{
          componentType: 'accessory',
          titleOrLabel: 'Charging cable',
          confidence: 0.54,
          evidence: [{
            source: 'image',
            detail: 'A bundled cable is visible next to the console.',
            confidence: 0.66,
            imagePositions: ['1'],
          }],
        }],
      },
    },
  ].map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');

  const server = http.createServer((req, res) => dashboard.handle(req, res));
  const address = await listen(server);
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    token,
    async cleanup() {
      await closeServer(server);
      await rm(runtimeRoot, { recursive: true, force: true });
    },
  };
}

async function startGameServiceMemory() {
  const appModulePath = path.join(gameServiceDir, 'src/app.js');
  const memoryStorePath = path.join(gameServiceDir, 'src/memoryStore.js');
  const shutdownPath = path.join(gameServiceDir, 'src/shutdown.js');
  await requireFile(appModulePath, 'Game service app module');
  await requireFile(memoryStorePath, 'Game service memory store module');
  await requireFile(shutdownPath, 'Game service shutdown module');
  const [{ createGameApp }, { createMemoryStore }, { closeHttpServer }] = await Promise.all([
    import(pathToFileURL(appModulePath).href),
    import(pathToFileURL(memoryStorePath).href),
    import(pathToFileURL(shutdownPath).href),
  ]);
  const token = String(process.env.MEDIEVAL_GAME_TOKEN ?? '').trim() || 'local-game-token';
  const server = http.createServer(createGameApp({
    store: createMemoryStore(),
    token,
    corsOrigin: '*',
  }));
  const address = await listen(server);
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    token,
    cleanup: () => closeHttpServer(server),
  };
}

function runLiveIntegrationSmoke({ dashboard, game }) {
  return new Promise((resolve, reject) => {
    const reviewer = String(process.env.MEDIEVAL_EVAL_REVIEWER ?? 'MediEval Local Integration').trim();
    const child = spawn(process.execPath, [liveSmokePath], {
      cwd: appDir,
      env: {
        ...process.env,
        MEDIEVAL_DASHBOARD_BASE_URL: dashboard.baseUrl,
        EVAL_MOBILE_TOKEN: dashboard.token,
        MEDIEVAL_GAME_BASE_URL: game.baseUrl,
        MEDIEVAL_GAME_TOKEN: game.token,
        MEDIEVAL_EVAL_REVIEWER: reviewer,
        MEDIEVAL_EVAL_CARD_LIMIT: process.env.MEDIEVAL_EVAL_CARD_LIMIT ?? '10',
        MEDIEVAL_REQUIRE_PENDING_CARDS: 'true',
        MEDIEVAL_LIVE_WRITE_SMOKE: process.env.MEDIEVAL_LIVE_WRITE_SMOKE ?? 'true',
        MEDIEVAL_LIVE_WRITE_ANSWER: process.env.MEDIEVAL_LIVE_WRITE_ANSWER ?? 'skip',
        MEDIEVAL_LIVE_EVENT_ID: process.env.MEDIEVAL_LIVE_EVENT_ID ?? `medieval-local-integration:${Date.now()}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr || stdout || `live-integration-smoke exited with ${code}`));
    });
  });
}

async function main() {
  if (!(await exists(liveSmokePath))) {
    throw new Error(`Live integration smoke script was not found at ${liveSmokePath}.`);
  }

  const resources = [];
  try {
    const dashboard = await startDashboardFixture();
    resources.push(dashboard);
    const game = await startGameServiceMemory();
    resources.push(game);
    const stdout = await runLiveIntegrationSmoke({ dashboard, game });
    if (stdout) console.log(stdout);
  } finally {
    while (resources.length) {
      const resource = resources.pop();
      await resource.cleanup();
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
