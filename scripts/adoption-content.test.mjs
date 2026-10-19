import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { previewCardsFromText } from '../packages/schema/card-generator.mjs';
import { validateEvalCard, validateEvalResult } from '../packages/schema/index.mjs';
import { createEvalApiServer } from '../services/eval-api/server.mjs';
import { EvalFileStore } from '../services/eval-api/store.mjs';

const fixture = await readFile(new URL('../examples/answer-grounding.csv', import.meta.url), 'utf8');
const context = { projectId: 'website-sample', batchId: 'answer-grounding' };
const guide = await readFile(new URL('../docs/ANSWER_GROUNDING.md', import.meta.url), 'utf8');

test('license is the complete canonical Apache-2.0 text', async () => {
  const license = await readFile(new URL('../LICENSE', import.meta.url));
  assert.equal(createHash('sha256').update(license).digest('hex'), 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30');
});

test('published CSV makes meaningful cards with stable documented IDs', () => {
  const preview = previewCardsFromText(fixture, { ...context, adapter: 'generic', format: 'csv' });
  assert.equal(preview.cards.length, 3);
  assert.equal(preview.warnings.length, 0);
  assert.ok(preview.cards.every((card) => validateEvalCard(card).length === 0));
  const notebook = preview.cards[1];
  assert.equal(notebook.cardId, 'website-sample:answer-grounding:sample-002:claim');
  assert.match(notebook.claim.value, /waterproof/);
  assert.match(notebook.evidence[0].detail, /not waterproof/);
  assert.ok(guide.includes(notebook.cardId));
  assert.ok(guide.includes(notebook.evidence[0].detail));
});

test('example imports, accepts canonical results, deduplicates, and exports actual stored labels', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'medieval-grounding-'));
  const store = new EvalFileStore({ dataDir });
  const server = createEvalApiServer({ store, token: 'test-only-token' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function api(route, body) {
    const response = await fetch(base + route, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: 'Bearer test-only-token', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    assert.equal(response.status, 200, text);
    return response.headers.get('content-type').includes('application/json') ? JSON.parse(text) : text;
  }
  try {
    const preview = await api('/api/eval/cards/preview', { ...context, adapter: 'generic', format: 'csv', raw: fixture });
    assert.equal(preview.cardCount, 3);
    await api('/api/eval/cards/import', { ...context, cards: preview.cards });
    const payload = {
      ...context, eventId: randomUUID(), cardId: preview.cards[1].cardId,
      reviewer: 'reviewer-1', answer: 'no', correction: null,
      notes: 'The source says not waterproof.', durationMs: 1200,
      clientGeneratedAt: new Date().toISOString(),
    };
    assert.deepEqual(validateEvalResult(payload), []);
    const query = new URLSearchParams(context).toString();
    assert.equal((await api('/api/mobile/eval/results?' + query, payload)).duplicate, false);
    assert.equal((await api('/api/mobile/eval/results?' + query, payload)).duplicate, true);
    const exported = await api('/api/eval/results/export?' + query + '&format=jsonl');
    const rows = exported.trim().split('\n').map(JSON.parse);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].answer, 'no');
    assert.equal(rows[0].notes, payload.notes);
    assert.equal(rows[0].eventId, payload.eventId);
    assert.equal(rows[0].sourceKey, 'sample-002');
    assert.ok(rows[0].serverReceivedAt);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});
