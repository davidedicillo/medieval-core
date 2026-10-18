#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startWebDemo, seedWebDemo, demoContext } from './web-demo.mjs';
import { renderDashboardPage } from '../services/eval-api/dashboard.mjs';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'medieval-web-demo-'));
let demo;
async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  });
}

try {
  demo = await startWebDemo({ port: 0, host: '127.0.0.1', dataDir });
  let baseUrl = `http://127.0.0.1:${demo.port}`;
  async function api(route, body) {
    const response = await fetch(baseUrl + route, body ? {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    } : {});
    assert.equal(response.status, 200);
    return response.json();
  }
  const query = new URLSearchParams(demoContext);
  const dashboard = await fetch(baseUrl).then((response) => response.text());
  assert.match(dashboard, /Review Cards/);
  assert.doesNotMatch(renderDashboardPage(), /id="reviewLink"/);
  const reviewer = await fetch(baseUrl + '/review').then((response) => response.text());
  assert.match(reviewer, /data-answer="no"/);
  assert.match(reviewer, /Correction \(optional\)/);
  new Function(reviewer.match(/<script>([\s\S]*?)<\/script>/)[1]);
  const logo = await fetch(baseUrl + '/demo/logo.png');
  assert.equal(logo.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await logo.arrayBuffer()).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const csv = await fetch(baseUrl + '/demo/myfire-rating.csv').then((response) => response.text());
  assert.match(csv, /fireRiskRating/);
  const projects = (await api('/api/eval/projects')).projects;
  assert.equal(projects.length, 2);
  assert.equal(projects.find((project) => project.projectId === 'myfire-rating').name, 'MyFireRating');
  assert.equal(projects.find((project) => project.projectId === 'catalog').name, 'Catalog quality');
  let detail = await api('/api/eval/batches/detail?' + query);
  assert.equal(detail.metrics.totalCards, 9);
  assert.equal(detail.metrics.totalResultRows, 4);
  const deck = await api('/api/mobile/eval/cards?' + query);
  assert.equal(deck.total, 5);
  const payload = {
    ...demoContext, cardId: deck.cards[0].cardId, eventId: 'web-demo-smoke:correction',
    answer: 'no', correction: { correctAnswer: 'Smoke-test correction' }, notes: 'Browser-shaped verdict', durationMs: 7000,
  };
  const accepted = await api('/api/mobile/eval/results?' + query, payload);
  assert.equal(accepted.stored, true);
  assert.equal(accepted.duplicate, false);
  assert.equal((await api('/api/mobile/eval/results?' + query, payload)).duplicate, true);
  assert.equal((await api('/api/mobile/eval/cards?' + query)).total, 4);
  detail = await api('/api/eval/batches/detail?' + query);
  assert.equal(detail.metrics.totalResultRows, 5);
  assert.equal(detail.metrics.correctionCount, 2);
  assert.equal(detail.cards.find((card) => card.cardId === payload.cardId).latestResult.notes, payload.notes);
  for (const format of ['jsonl', 'csv']) {
    const response = await fetch(baseUrl + '/api/eval/results/export?' + query + '&format=' + format);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), new RegExp('results\\.' + format));
    const exported = await response.text();
    assert.match(exported, /Smoke-test correction/);
    assert.match(exported, /web-demo-smoke:correction/);
  }
  await seedWebDemo(demo.store);
  assert.equal((await api('/api/eval/batches/detail?' + query)).metrics.totalResultRows, 5);
  assert.equal((await api('/api/eval/projects')).projects.find((project) => project.projectId === 'myfire-rating').name, 'MyFireRating');
  await close(demo.server);
  demo = await startWebDemo({ port: 0, host: '127.0.0.1', dataDir });
  baseUrl = `http://127.0.0.1:${demo.port}`;
  assert.equal((await api('/api/mobile/eval/cards?' + query)).total, 4);
  assert.equal((await api('/api/eval/batches/detail?' + query)).metrics.totalResultRows, 5);
  const pending = (await api('/api/mobile/eval/cards?' + query)).cards;
  for (const card of pending) {
    await api('/api/mobile/eval/results?' + query, { ...demoContext, cardId: card.cardId, eventId: `complete:${card.cardId}`, answer: 'yes' });
  }
  assert.equal((await api('/api/mobile/eval/cards?' + query)).total, 0);
  assert.equal((await api('/api/eval/batches/detail?' + query)).metrics.reviewedCards, 9);
  console.log('MediEval web demo smoke passed: seed, verdicts, corrections, deduplication, exports, restart, completion.');
} finally {
  if (demo?.server.listening) await close(demo.server);
  await fs.rm(dataDir, { recursive: true, force: true });
}
