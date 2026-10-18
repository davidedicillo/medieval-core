#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalApiServer } from '../services/eval-api/server.mjs';
import { renderDashboardPage } from '../services/eval-api/dashboard.mjs';
import { renderDemoReviewer } from '../services/eval-api/demo-reviewer.mjs';
import { EvalFileStore } from '../services/eval-api/store.mjs';
import { previewCardsFromText } from '../packages/schema/card-generator.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
export const demoContext = { projectId: 'myfire-rating', batchId: 'property-review', reviewer: 'Davide' };

export async function seedWebDemo(store) {
  const marker = path.join(store.dataDir, 'web-demo-seeded-v1');
  try {
    await fs.access(marker);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const fireSource = await fs.readFile(new URL('../examples/myfire-rating.csv', import.meta.url), 'utf8');
  const fireCards = previewCardsFromText(fireSource, { ...demoContext, adapter: 'myfire-rating', format: 'csv' }).cards;
  const catalogSource = await fs.readFile(new URL('../examples/cards.jsonl', import.meta.url), 'utf8');
  const catalogCards = catalogSource.trim().split('\n').map((line) => JSON.parse(line));
  const batches = [
    { ...demoContext, projectName: 'MyFireRating', name: 'Property review', description: 'Synthetic property examples', cards: fireCards, answers: ['yes', 'no', 'unsure', 'yes'] },
    { projectId: 'catalog', projectName: 'Catalog quality', batchId: 'attribute-check', name: 'Attribute check', description: 'Sample catalog extraction', cards: catalogCards, answers: ['yes', 'no'] },
  ];
  for (const batch of batches) {
    await store.createBatch(batch);
    await store.importCards(batch);
    for (const [index, answer] of batch.answers.entries()) {
      await store.storeResult({
        ...batch,
        payload: {
          eventId: `web-demo-seed:${batch.projectId}:${index}`,
          cardId: batch.cards[index].cardId,
          reviewer: 'Davide',
          answer,
          correction: answer === 'no' ? { correctAnswer: batch.projectId === 'catalog' ? 'cotton blend' : 'The evidence does not establish the roof rating.', reasonTags: ['unsupported_claim'] } : null,
          notes: 'Sample label seeded for the demo.',
          durationMs: 9000 + index * 2500,
          clientGeneratedAt: new Date(Date.now() - (6 - index) * 60000).toISOString(),
        },
      });
    }
  }
  await fs.writeFile(marker, '1\n');
}

export async function startWebDemo(options = {}) {
  const dataDir = path.resolve(options.dataDir ?? process.env.MEDIEVAL_WEB_DEMO_DATA_DIR ?? path.join(repoRoot, '.runtime', 'web-demo'));
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const explicitPort = options.port ?? process.env.PORT ?? process.env.MEDIEVAL_WEB_DEMO_PORT;
  let port = Number(explicitPort ?? 5182);
  const store = new EvalFileStore({ dataDir });
  await seedWebDemo(store);
  const apiServer = createEvalApiServer({ store });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/review')) {
        const page = url.pathname === '/review'
          ? renderDemoReviewer()
          : renderDashboardPage({ defaultProjectId: demoContext.projectId, defaultBatchId: demoContext.batchId, defaultReviewer: demoContext.reviewer, reviewEnabled: true });
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(page);
      }
      if (req.method === 'GET' && url.pathname === '/demo/logo.png') {
        const logo = await fs.readFile(new URL('../ios/Art/Generated/Logo/medieval-logo-transparent-v1.png', import.meta.url));
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
        return res.end(logo);
      }
      const samples = { '/demo/myfire-rating.csv': 'myfire-rating.csv', '/demo/cards.jsonl': 'cards.jsonl' };
      if (req.method === 'GET' && samples[url.pathname]) {
        const name = samples[url.pathname];
        const body = await fs.readFile(new URL('../examples/' + name, import.meta.url));
        res.writeHead(200, { 'content-type': name.endsWith('.csv') ? 'text/csv' : 'application/x-ndjson', 'content-disposition': `attachment; filename="${name}"` });
        return res.end(body);
      }
      apiServer.emit('request', req, res);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
  });
  for (let attempt = 0; ; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => { server.off('listening', onListening); reject(error); };
        const onListening = () => { server.off('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
      break;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || explicitPort !== undefined || attempt >= 19) throw error;
      port += 1;
    }
  }
  return { server, store, port: server.address().port, host, dataDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const demo = await startWebDemo();
    console.log(`MediEval web demo: http://${demo.host}:${demo.port}`);
    console.log(`Review cards: http://${demo.host}:${demo.port}/review`);
    console.log(`Demo data: ${demo.dataDir}`);
    console.log('iOS: use this eval URL, reviewer Davide, project myfire-rating, batch property-review; leave the token empty.');
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => { demo.server.close(() => process.exit(0)); demo.server.closeIdleConnections(); });
    }
  } catch (error) {
    console.error(`Could not start MediEval web demo: ${error.message}`);
    process.exitCode = 1;
  }
}
