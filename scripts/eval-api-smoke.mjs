#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createEvalApiServer } from '../services/eval-api/server.mjs';
import { EvalFileStore } from '../services/eval-api/store.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'medieval-eval-api-'));
const token = 'smoke-token';
const store = new EvalFileStore({ dataDir });
const server = createEvalApiServer({ store, token, defaultReviewer: 'Smoke Reviewer' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const body = text && contentType.includes('application/json') ? JSON.parse(text) : text;
  if (!response.ok) {
    throw new Error(typeof body === 'string' ? body : JSON.stringify(body));
  }
  return body;
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(process.execPath, ['packages/cli/medieval-eval.mjs', ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (status) => {
      if (status === 0) resolve(output);
      else reject(new Error(output || `CLI exited with status ${status}`));
    });
  });
}

try {
  const dashboardHtml = await fetch(baseUrl).then((response) => response.text());
  assert.match(dashboardHtml, /MediEval Core/);
  assert.match(dashboardHtml, /Create Batch/);
  assert.match(dashboardHtml, /Batch Detail/);

  const project = await api('/api/eval/projects', {
    method: 'POST',
    body: JSON.stringify({
      projectId: 'personal',
      name: 'Personal Fire Reviews',
      description: 'Smoke-test project',
    }),
  });
  assert.equal(project.ok, true);
  assert.equal(project.project.projectId, 'personal');

  const batch = await api('/api/eval/batches', {
    method: 'POST',
    body: JSON.stringify({
      projectId: 'personal',
      batchId: 'fire-risk-june',
      name: 'Fire Risk June',
      description: 'Generated from MyFireRating CSV',
      projectName: 'Personal Fire Reviews',
    }),
  });
  assert.equal(batch.ok, true);
  assert.equal(batch.batch.batchId, 'fire-risk-june');

  const sourceCsv = await fs.readFile(new URL('../examples/myfire-rating.csv', import.meta.url), 'utf8');
  const preview = await api('/api/eval/cards/preview', {
    method: 'POST',
    body: JSON.stringify({
      projectId: 'personal',
      batchId: 'fire-risk-june',
      adapter: 'myfire-rating',
      format: 'csv',
      raw: sourceCsv,
    }),
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.adapter, 'myfire-rating');
  assert.equal(preview.recordCount, 3);
  assert.equal(preview.cardCount, 9);
  assert.equal(preview.warnings.length, 0);
  assert.ok(preview.cards.some((card) => card.claim.template === 'myfire_risk_rating'));
  assert.ok(preview.cards.some((card) => card.claim.template === 'myfire_evidence_support'));
  assert.ok(preview.cards.some((card) => card.claim.template === 'myfire_mitigation_recommendation'));

  const imported = await api('/api/eval/cards/import', {
    method: 'POST',
    body: JSON.stringify({
      projectId: 'personal',
      projectName: 'Personal Fire Reviews',
      batchId: 'fire-risk-june',
      name: 'Fire Risk June',
      description: 'Generated from MyFireRating CSV',
      replace: true,
      cards: preview.cards,
    }),
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.batchId, 'fire-risk-june');
  assert.equal(imported.runId, 'fire-risk-june');
  assert.equal(imported.totalCards, 9);

  const projects = await api('/api/eval/projects');
  assert.equal(projects.ok, true);
  assert.ok(projects.projects.some((row) => row.projectId === 'personal' && row.totalBatches === 1));

  const batches = await api('/api/eval/batches?projectId=personal&reviewer=Davide');
  assert.equal(batches.ok, true);
  assert.ok(batches.batches.some((row) => row.batchId === 'fire-risk-june' && row.metrics.totalCards === 9));

  const deck = await api('/api/mobile/eval/cards?projectId=personal&batchId=fire-risk-june&reviewer=Davide&limit=20');
  assert.equal(deck.ok, true);
  assert.equal(deck.cards.length, 9);
  const reviewedCardId = deck.cards[0].cardId;

  const payload = {
    eventId: 'smoke-event-1',
    batchId: 'fire-risk-june',
    cardId: reviewedCardId,
    reviewer: 'Davide',
    answer: 'no',
    correction: { correctAnswer: 'moderate', reasonTags: ['overstated_fire_risk'] },
    durationMs: 1200,
    clientGeneratedAt: '2026-06-25T12:00:00.000Z',
  };
  const stored = await api('/api/mobile/eval/results?projectId=personal&batchId=fire-risk-june', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(stored.ok, true);
  assert.equal(stored.duplicate, false);
  assert.equal(stored.totalResultRows, 1);

  const duplicate = await api('/api/mobile/eval/results?projectId=personal&batchId=fire-risk-june', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.totalResultRows, 1);

  const pending = await api('/api/mobile/eval/cards?projectId=personal&batchId=fire-risk-june&reviewer=Davide&limit=20');
  assert.equal(pending.cards.length, 8);
  assert.notEqual(pending.cards[0].cardId, reviewedCardId);

  const summary = await api('/api/mobile/eval/summary?projectId=personal&batchId=fire-risk-june&reviewer=Davide');
  assert.equal(summary.ok, true);
  assert.equal(summary.summary.batchId, 'fire-risk-june');
  assert.equal(summary.summary.runId, 'fire-risk-june');
  assert.equal(summary.summary.totalCards, 9);
  assert.equal(summary.summary.reviewedCards, 1);
  assert.equal(summary.summary.pendingCards, 8);

  const detail = await api('/api/eval/batches/detail?projectId=personal&batchId=fire-risk-june&reviewer=Davide');
  assert.equal(detail.ok, true);
  assert.equal(detail.metrics.totalCards, 9);
  assert.equal(detail.metrics.reviewedCards, 1);
  assert.equal(detail.metrics.pendingCards, 8);
  assert.equal(detail.metrics.answerDistribution.no, 1);
  assert.equal(detail.metrics.correctionCount, 1);
  assert.equal(detail.reviewerBreakdown[0].reviewer, 'Davide');
  assert.equal(detail.recentResults[0].eventId, 'smoke-event-1');
  assert.equal(detail.recentResults[0].duplicateStatus, 'accepted');
  assert.equal(detail.cards.find((card) => card.cardId === reviewedCardId).latestResult.eventId, 'smoke-event-1');

  const jsonl = await api('/api/eval/results/export?projectId=personal&batchId=fire-risk-june&reviewer=Davide&format=jsonl');
  assert.match(jsonl, /"eventId":"smoke-event-1"/);
  assert.match(jsonl, /"batchId":"fire-risk-june"/);
  const csv = await api('/api/eval/results/export?projectId=personal&batchId=fire-risk-june&reviewer=Davide&format=csv');
  assert.match(csv, /^eventId,projectId,batchId,runId,/);

  const state = await api('/api/eval/dashboard/state?projectId=personal&batchId=fire-risk-june&reviewer=Davide');
  assert.equal(state.ok, true);
  assert.equal(state.batchId, 'fire-risk-june');
  assert.equal(state.projects.length, 1);
  assert.ok(state.batches.some((row) => row.batchId === 'fire-risk-june'));
  assert.equal(state.metrics.answerDistribution.no, 1);
  assert.equal(state.recentResults.length, 1);
  assert.equal(state.recentActivity.length, 1);

  const legacyDeck = await api('/api/mobile/eval/cards?projectId=personal&runId=fire-risk-june&reviewer=Davide&reviewState=all&limit=20');
  assert.equal(legacyDeck.ok, true);
  assert.equal(legacyDeck.cards.length, 9);

  await runCli([
    'import',
    '--base-url', baseUrl,
    '--token', token,
    '--project', 'cli',
    '--batch', 'cli-batch',
    '--replace',
    '--file', 'examples/cards.jsonl',
  ]);
  await api('/api/mobile/eval/results?projectId=cli&batchId=cli-batch', {
    method: 'POST',
    body: JSON.stringify({
      eventId: 'cli-event-1',
      batchId: 'cli-batch',
      cardId: 'sample:material',
      reviewer: 'CLI Reviewer',
      answer: 'yes',
      durationMs: 900,
      clientGeneratedAt: '2026-06-25T12:01:00.000Z',
    }),
  });
  const cliOut = path.join(dataDir, 'cli-results.jsonl');
  await runCli([
    'export',
    '--base-url', baseUrl,
    '--token', token,
    '--project', 'cli',
    '--batch', 'cli-batch',
    '--reviewer', 'CLI Reviewer',
    '--format', 'jsonl',
    '--out', cliOut,
  ]);
  assert.match(await fs.readFile(cliOut, 'utf8'), /"eventId":"cli-event-1"/);

  console.log('MediEval eval API smoke passed.');
} finally {
  server.close();
  await fs.rm(dataDir, { recursive: true, force: true });
}
