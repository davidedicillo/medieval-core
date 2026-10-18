#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const configuredBaseUrl = String(process.env.MEDIEVAL_DEMO_BASE_URL ?? '').trim();
let baseUrl = configuredBaseUrl.replace(/\/+$/, '');
const token = String(process.env.MEDIEVAL_DEMO_TOKEN ?? 'demo-token');
const reviewer = String(process.env.MEDIEVAL_DEMO_REVIEWER ?? `Smoke ${Date.now()}`);
let spawnedServer = null;
let spawnedServerExit = null;
let spawnedServerOutput = '';

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Could not allocate a local demo smoke port.'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForBundledDemoServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (spawnedServerExit !== null) {
      throw new Error(`Demo server exited before smoke test completed: ${spawnedServerOutput.trim()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until the spawned demo server finishes binding the port.
    }
    await sleep(100);
  }
  throw new Error(`Demo server did not become ready at ${baseUrl}: ${spawnedServerOutput.trim()}`);
}

async function startBundledDemoServerIfNeeded() {
  if (baseUrl) return;
  const port = await findOpenPort();
  baseUrl = `http://127.0.0.1:${port}`;
  spawnedServer = spawn(process.execPath, [fileURLToPath(new URL('./demo-server.mjs', import.meta.url))], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      MEDIEVAL_DEMO_TOKEN: token,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  spawnedServer.stdout.on('data', (chunk) => { spawnedServerOutput += chunk.toString(); });
  spawnedServer.stderr.on('data', (chunk) => { spawnedServerOutput += chunk.toString(); });
  spawnedServer.on('close', (code) => { spawnedServerExit = code; });
  await waitForBundledDemoServer();
}

async function stopBundledDemoServer() {
  if (!spawnedServer || spawnedServerExit !== null) return;
  spawnedServer.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => { spawnedServer.once('close', resolve); }),
    sleep(2_000).then(() => {
      if (spawnedServerExit === null) spawnedServer.kill('SIGKILL');
    }),
  ]);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = {};
  if (text) body = JSON.parse(text);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function assertString(value, label) {
  assert.equal(typeof value, 'string', label);
}

function assertNumber(value, label) {
  assert.equal(typeof value, 'number', label);
  assert.ok(Number.isFinite(value), `${label} should be finite`);
}

function assertNullableString(value, label) {
  assert.ok(value === null || typeof value === 'string', label);
}

function assertNullableNumber(value, label) {
  assert.ok(value === null || typeof value === 'number', label);
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${label} should be finite`);
}

function assertStringArray(value, label) {
  assert.ok(Array.isArray(value), label);
  value.forEach((item, index) => assertString(item, `${label}[${index}]`));
}

function assertCard(card, label) {
  assertString(card.schemaVersion, `${label}.schemaVersion`);
  assertString(card.cardId, `${label}.cardId`);
  assertString(card.cardType, `${label}.cardType`);
  assertString(card.question, `${label}.question`);
  assertString(card.sourceKey, `${label}.sourceKey`);
  assertString(card.priority, `${label}.priority`);
  assertNullableNumber(card.confidence, `${label}.confidence`);
  assertString(card.claim?.template, `${label}.claim.template`);
  assertString(card.claim?.path, `${label}.claim.path`);
  assertString(card.claim?.value, `${label}.claim.value`);
  assert.ok(card.subject || card.listing, `${label} should include subject or legacy listing`);
  if (card.subject) {
    assertString(card.subject.title, `${label}.subject.title`);
    if (card.subject.subtitle !== undefined) assertString(card.subject.subtitle, `${label}.subject.subtitle`);
    if (card.subject.url !== undefined) assertString(card.subject.url, `${label}.subject.url`);
    if (card.subject.source !== undefined) assertString(card.subject.source, `${label}.subject.source`);
    if (card.subject.metadata !== undefined) assert.equal(typeof card.subject.metadata, 'object', `${label}.subject.metadata`);
  }
  if (card.listing) {
    assertString(card.listing.title, `${label}.listing.title`);
    assertString(card.listing.url, `${label}.listing.url`);
    assertString(card.listing.price, `${label}.listing.price`);
    assertString(card.listing.marketplace, `${label}.listing.marketplace`);
  }
  assert.ok(Array.isArray(card.images), `${label}.images`);
  card.images.forEach((image, index) => {
    assertString(image.url, `${label}.images[${index}].url`);
    assertNumber(image.position, `${label}.images[${index}].position`);
    assertString(image.source, `${label}.images[${index}].source`);
  });
  if (card.media !== undefined) {
    assert.ok(Array.isArray(card.media), `${label}.media`);
    card.media.forEach((item, index) => {
      assertString(item.url, `${label}.media[${index}].url`);
      if (item.type !== undefined) assertString(item.type, `${label}.media[${index}].type`);
      if (item.label !== undefined) assertString(item.label, `${label}.media[${index}].label`);
      if (item.position !== undefined) assertNumber(item.position, `${label}.media[${index}].position`);
      if (item.source !== undefined) assertString(item.source, `${label}.media[${index}].source`);
    });
  }
  assertString(card.analysisContext?.summary, `${label}.analysisContext.summary`);
  assertString(card.analysisContext?.model, `${label}.analysisContext.model`);
  assertString(card.analysisContext?.provider, `${label}.analysisContext.provider`);
  assertString(card.analysisContext?.analysisStage, `${label}.analysisContext.analysisStage`);
  assertStringArray(card.analysisContext?.warnings, `${label}.analysisContext.warnings`);
  assert.ok(Array.isArray(card.evidence), `${label}.evidence`);
  card.evidence.forEach((evidence, index) => {
    assertString(evidence.source, `${label}.evidence[${index}].source`);
    assertString(evidence.detail, `${label}.evidence[${index}].detail`);
    assertNullableNumber(evidence.confidence, `${label}.evidence[${index}].confidence`);
    assertStringArray(evidence.imagePositions, `${label}.evidence[${index}].imagePositions`);
  });
}

function assertSummary(summary, label) {
  assertString(summary.runId, `${label}.runId`);
  assertString(summary.reviewer, `${label}.reviewer`);
  assertNumber(summary.totalCards, `${label}.totalCards`);
  assertNumber(summary.reviewedCards, `${label}.reviewedCards`);
  assertNumber(summary.pendingCards, `${label}.pendingCards`);
  assertNumber(summary.totalResultRows, `${label}.totalResultRows`);
  assertNullableString(summary.lastReviewedAt, `${label}.lastReviewedAt`);
  assert.equal(typeof summary.byPriority, 'object', `${label}.byPriority`);
  for (const [priority, bucket] of Object.entries(summary.byPriority)) {
    assertString(priority, `${label}.byPriority key`);
    assertNumber(bucket.total, `${label}.byPriority.${priority}.total`);
    assertNumber(bucket.reviewed, `${label}.byPriority.${priority}.reviewed`);
    assertNumber(bucket.pending, `${label}.byPriority.${priority}.pending`);
  }
}

function assertProfile(profile, label) {
  assertString(profile.reviewer, `${label}.reviewer`);
  assertString(profile.reviewerKey, `${label}.reviewerKey`);
  assertString(profile.rank, `${label}.rank`);
  assertNumber(profile.rankProgress, `${label}.rankProgress`);
  assertNumber(profile.xp, `${label}.xp`);
  assertNumber(profile.gold, `${label}.gold`);
  assertNumber(profile.streakDays, `${label}.streakDays`);
  assertNumber(profile.totalVerdicts, `${label}.totalVerdicts`);
  assertNumber(profile.correctionCount, `${label}.correctionCount`);
  for (const key of ['yes', 'no', 'unsure', 'badQuestion', 'skip']) {
    assertNumber(profile.answerCounts?.[key], `${label}.answerCounts.${key}`);
  }
  for (const key of ['verdicts', 'corrections', 'lowConfidence']) {
    assertNumber(profile.today?.[key], `${label}.today.${key}`);
  }
  assert.ok(Array.isArray(profile.dailyQuests), `${label}.dailyQuests`);
  profile.dailyQuests.forEach((quest, index) => {
    assertString(quest.key, `${label}.dailyQuests[${index}].key`);
    assertString(quest.title, `${label}.dailyQuests[${index}].title`);
    assertString(quest.detail, `${label}.dailyQuests[${index}].detail`);
    assertNumber(quest.progress, `${label}.dailyQuests[${index}].progress`);
    assertNumber(quest.target, `${label}.dailyQuests[${index}].target`);
    assert.equal(typeof quest.complete, 'boolean', `${label}.dailyQuests[${index}].complete`);
  });
  assertNullableString(profile.updatedAt, `${label}.updatedAt`);
}

function hasCorrection(correction) {
  if (!correction || typeof correction !== 'object') return false;
  if (String(correction.correctAnswer ?? '').trim()) return true;
  return Array.isArray(correction.reasonTags) && correction.reasonTags.length > 0;
}

function priorityBonus(priority) {
  switch (String(priority ?? '').trim().toLowerCase()) {
  case 'high': return 4;
  case 'medium': return 2;
  default: return 0;
  }
}

function confidenceBonus(confidence) {
  if (confidence === null || confidence === undefined || confidence === '') return 0;
  const value = Number(confidence);
  if (!Number.isFinite(value)) return 0;
  if (value < 0.35) return 5;
  if (value < 0.65) return 2;
  return 0;
}

function expectedAward(payload) {
  const base = {
    yes: { xp: 10, gold: 3 },
    no: { xp: 10, gold: 3 },
    unsure: { xp: 6, gold: 1 },
    bad_question: { xp: 8, gold: 1 },
    skip: { xp: 2, gold: 0 },
  }[payload.answer];
  const correctionPresent = payload.answer === 'no' && hasCorrection(payload.correction);
  return {
    xp: base.xp + priorityBonus(payload.priority) + confidenceBonus(payload.confidence) + (correctionPresent ? 8 : 0),
    gold: base.gold + (correctionPresent ? 2 : 0),
  };
}

await startBundledDemoServerIfNeeded();

try {
const ready = await request('/ready');
assert.equal(ready.ok, true);

const initialDeck = await request(`/api/mobile/eval/cards?reviewer=${encodeURIComponent(reviewer)}&limit=10`);
assert.equal(initialDeck.ok, true);
assertNumber(initialDeck.page, 'deck.page');
assertNumber(initialDeck.pageSize, 'deck.pageSize');
assertNumber(initialDeck.pageCount, 'deck.pageCount');
assertNumber(initialDeck.total, 'deck.total');
assertNumber(initialDeck.unfilteredTotal, 'deck.unfilteredTotal');
assertString(initialDeck.reviewer, 'deck.reviewer');
assertString(initialDeck.reviewState, 'deck.reviewState');
assert.ok(initialDeck.cards.length >= 3, 'demo deck should include multiple card types');
initialDeck.cards.forEach((item, index) => assertCard(item, `deck.cards[${index}]`));
assert.ok(initialDeck.cards.some((card) => card.claim.template === 'variant_signal'), 'demo deck should include a variant card');
assert.ok(initialDeck.cards.some((card) => card.claim.template === 'component_title_or_label'), 'demo deck should include an item card');
assert.ok(initialDeck.cards.some((card) => card.claim.template === 'component_game_title'), 'demo deck should include a game-title card');
assert.ok(initialDeck.cards.some((card) => card.subject), 'demo deck should include generic subject cards');
assert.ok(initialDeck.cards.some((card) => card.listing), 'demo deck should include a legacy listing adapter card');
assert.ok(initialDeck.cards.every((card) => card.images.length > 0), 'every demo card should include an image');

const card = initialDeck.cards[0];
const imageUrl = new URL(card.images[0].url);
const imageResponse = await fetch(imageUrl);
assert.equal(imageResponse.ok, true);
assert.equal(imageResponse.headers.get('content-type'), 'image/png');
const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
assert.deepEqual([...imageBytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'image should be a PNG');

const resultPayload = {
  eventId: `eval-demo-smoke-${Date.now()}`,
  cardId: card.cardId,
  reviewer,
  answer: 'no',
  correction: {
    correctAnswer: 'Demo correction',
    reasonTags: ['wrong_item'],
  },
  notes: '',
  durationMs: 1200,
  clientGeneratedAt: new Date().toISOString(),
};
const result = await request('/api/mobile/eval/results', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(resultPayload),
});
assert.equal(result.ok, true);
assert.equal(result.duplicate, false);

const duplicateResult = await request('/api/mobile/eval/results', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(resultPayload),
});
assert.equal(duplicateResult.ok, true);
assert.equal(duplicateResult.duplicate, true);
assert.equal(duplicateResult.totalResultRows, result.totalResultRows);

const summary = await request(`/api/mobile/eval/summary?reviewer=${encodeURIComponent(reviewer)}`);
assert.equal(summary.ok, true);
assertSummary(summary.summary, 'summary.summary');
assert.equal(summary.summary.reviewedCards, 1);
assert.equal(summary.summary.pendingCards, Math.max(0, initialDeck.total - 1));

const postWriteDeck = await request(`/api/mobile/eval/cards?reviewer=${encodeURIComponent(reviewer)}&limit=10`);
assert.equal(postWriteDeck.ok, true);
assert.equal(postWriteDeck.reviewState, 'pending');
postWriteDeck.cards.forEach((item, index) => assertCard(item, `postWriteDeck.cards[${index}]`));
assert.equal(postWriteDeck.total, Math.max(0, initialDeck.total - 1));
assert.ok(
  !postWriteDeck.cards.some((pendingCard) => pendingCard.cardId === card.cardId),
  `reviewed card ${card.cardId} should not reappear in the pending demo deck.`,
);

const gamePayload = {
  eventId: `demo-smoke-${Date.now()}`,
  reviewer,
  cardId: card.cardId,
  answer: 'no',
  correction: resultPayload.correction,
  priority: card.priority,
  confidence: card.confidence,
  sourceKey: card.sourceKey,
  claimTemplate: card.claim.template,
  durationMs: 1200,
  clientGeneratedAt: new Date().toISOString(),
};

const initialProfile = await request(`/api/game/profile?reviewer=${encodeURIComponent(reviewer)}`);
assert.equal(initialProfile.ok, true);
assertProfile(initialProfile.profile, 'initialProfile.profile');

const verdict = await request('/api/game/verdicts', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(gamePayload),
});
assert.equal(verdict.ok, true);
assert.equal(verdict.duplicate, false);
assert.deepEqual(verdict.awarded, expectedAward(gamePayload));
assertProfile(verdict.profile, 'verdict.profile');

const updatedProfile = await request(`/api/game/profile?reviewer=${encodeURIComponent(reviewer)}`);
assert.equal(updatedProfile.ok, true);
assertProfile(updatedProfile.profile, 'updatedProfile.profile');
assert.equal(updatedProfile.profile.totalVerdicts, verdict.profile.totalVerdicts);
assert.equal(updatedProfile.profile.xp, verdict.profile.xp);

const duplicate = await request('/api/game/verdicts', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(gamePayload),
});
assert.equal(duplicate.ok, true);
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.awarded.xp, 0);

const leaderboard = await request('/api/game/leaderboard?limit=10');
assert.equal(leaderboard.ok, true);
assert.ok(leaderboard.leaderboard.some((entry) => entry.reviewer === reviewer));
leaderboard.leaderboard.forEach((entry, index) => assertProfile(entry, `leaderboard[${index}]`));

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  reviewer,
  cards: initialDeck.cards.length,
  reviewedCards: summary.summary.reviewedCards,
  awardedXp: verdict.awarded.xp,
  leaderboardSize: leaderboard.leaderboard.length,
}, null, 2));
} finally {
  await stopBundledDemoServer();
}
