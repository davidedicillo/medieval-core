#!/usr/bin/env node

import assert from 'node:assert/strict';

const evalBackendBaseUrl = String(
  process.env.MEDIEVAL_DASHBOARD_BASE_URL
    ?? process.env.EVAL_MOBILE_BASE_URL
    ?? process.env.DASHBOARD_BASE_URL
    ?? '',
).replace(/\/+$/, '');
const evalBackendToken = String(process.env.EVAL_MOBILE_TOKEN ?? process.env.MEDIEVAL_DASHBOARD_TOKEN ?? '').trim();
const gameBaseUrl = String(process.env.MEDIEVAL_GAME_BASE_URL ?? '').replace(/\/+$/, '');
const gameToken = String(process.env.MEDIEVAL_GAME_TOKEN ?? '').trim();
const reviewer = String(
  process.env.MEDIEVAL_EVAL_REVIEWER
    ?? process.env.MEDIEVAL_GAME_REVIEWER
    ?? `MediEval Live Smoke ${Date.now()}`,
).trim() || `MediEval Live Smoke ${Date.now()}`;
const limit = Math.max(1, Math.min(20, Number(process.env.MEDIEVAL_EVAL_CARD_LIMIT ?? 10) || 10));
const writeSmoke = /^(1|true|yes)$/i.test(String(process.env.MEDIEVAL_LIVE_WRITE_SMOKE ?? ''));
const requireCards = writeSmoke || /^(1|true|yes)$/i.test(String(process.env.MEDIEVAL_REQUIRE_PENDING_CARDS ?? ''));
const writeAnswer = String(process.env.MEDIEVAL_LIVE_WRITE_ANSWER ?? 'skip').trim().toLowerCase();
const allowedAnswers = new Set(['yes', 'no', 'unsure', 'bad_question', 'skip']);

function requireEnv() {
  if (!evalBackendBaseUrl) throw new Error('Set MEDIEVAL_DASHBOARD_BASE_URL to the eval backend URL.');
  if (!evalBackendToken) throw new Error('Set EVAL_MOBILE_TOKEN to the eval backend mobile token.');
  if (!gameBaseUrl) throw new Error('Set MEDIEVAL_GAME_BASE_URL to the deployed game-service URL.');
  if (!gameToken) throw new Error('Set MEDIEVAL_GAME_TOKEN to the shared game-service token.');
  if (!allowedAnswers.has(writeAnswer)) {
    throw new Error('MEDIEVAL_LIVE_WRITE_ANSWER must be one of yes, no, unsure, bad_question, or skip.');
  }
}

async function readJsonResponse(label, response) {
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${label} returned non-JSON body: ${text.slice(0, 200)}`);
    }
  }
  return body;
}

async function request(baseUrl, token, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await readJsonResponse(path, response);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function evalRequest(path, options = {}) {
  return request(evalBackendBaseUrl, evalBackendToken, path, options);
}

function gameRequest(path, options = {}) {
  return request(gameBaseUrl, gameToken, path, options);
}

function assertObject(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
}

function assertString(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string.`);
}

function assertNumber(value, label) {
  assert.equal(typeof value, 'number', `${label} must be a number.`);
  assert.ok(Number.isFinite(value), `${label} must be finite.`);
}

function assertNullableNumber(value, label) {
  assert.ok(value === null || typeof value === 'number', `${label} must be null or a number.`);
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${label} must be finite.`);
}

function assertNullableString(value, label) {
  assert.ok(value === null || typeof value === 'string', `${label} must be null or a string.`);
}

function validateSummary(summary) {
  assertObject(summary.summary, 'summary.summary');
  assertString(summary.summary.runId, 'summary.runId');
  assertString(summary.summary.reviewer, 'summary.reviewer');
  assertNumber(summary.summary.totalCards, 'summary.totalCards');
  assertNumber(summary.summary.reviewedCards, 'summary.reviewedCards');
  assertNumber(summary.summary.pendingCards, 'summary.pendingCards');
  assertNumber(summary.summary.totalResultRows, 'summary.totalResultRows');
  assertNullableString(summary.summary.lastReviewedAt, 'summary.lastReviewedAt');
  assertObject(summary.summary.byPriority, 'summary.byPriority');
}

function validateCard(card, label = 'card') {
  assertString(card.cardId, `${label}.cardId`);
  assertString(card.cardType, `${label}.cardType`);
  assertString(card.question, `${label}.question`);
  assertString(card.priority, `${label}.priority`);
  assertNullableNumber(card.confidence, `${label}.confidence`);
  assertString(card.sourceKey, `${label}.sourceKey`);
  assertString(card.claim?.template, `${label}.claim.template`);
  assertString(card.claim?.path, `${label}.claim.path`);
  assertString(card.claim?.value, `${label}.claim.value`);
  assertString(card.listing?.title, `${label}.listing.title`);
  assert.ok(Array.isArray(card.images), `${label}.images must be an array.`);
}

function validateDeck(deck) {
  assert.equal(deck.ok, true);
  assert.ok(Array.isArray(deck.cards), 'deck.cards must be an array.');
  assertNumber(deck.page, 'deck.page');
  assertNumber(deck.pageSize, 'deck.pageSize');
  assertNumber(deck.pageCount, 'deck.pageCount');
  assertNumber(deck.total, 'deck.total');
  assertNumber(deck.unfilteredTotal, 'deck.unfilteredTotal');
  assertString(deck.reviewer, 'deck.reviewer');
  assertString(deck.reviewState, 'deck.reviewState');
  deck.cards.forEach((card, index) => validateCard(card, `deck.cards[${index}]`));
}

function validateQuest(quest, label) {
  assertString(quest.key, `${label}.key`);
  assertString(quest.title, `${label}.title`);
  assertString(quest.detail, `${label}.detail`);
  assertNumber(quest.progress, `${label}.progress`);
  assertNumber(quest.target, `${label}.target`);
  assert.equal(typeof quest.complete, 'boolean', `${label}.complete must be boolean.`);
}

function validateProfile(profile, label = 'profile') {
  assertString(profile.reviewer, `${label}.reviewer`);
  assertString(profile.reviewerKey, `${label}.reviewerKey`);
  assertString(profile.rank, `${label}.rank`);
  assertNumber(profile.rankProgress, `${label}.rankProgress`);
  assertNumber(profile.xp, `${label}.xp`);
  assertNumber(profile.gold, `${label}.gold`);
  assertNumber(profile.streakDays, `${label}.streakDays`);
  assertNumber(profile.totalVerdicts, `${label}.totalVerdicts`);
  assertNumber(profile.correctionCount, `${label}.correctionCount`);
  assertObject(profile.answerCounts, `${label}.answerCounts`);
  for (const key of ['yes', 'no', 'unsure', 'badQuestion', 'skip']) {
    assertNumber(profile.answerCounts[key], `${label}.answerCounts.${key}`);
  }
  assertObject(profile.today, `${label}.today`);
  for (const key of ['verdicts', 'corrections', 'lowConfidence']) {
    assertNumber(profile.today[key], `${label}.today.${key}`);
  }
  assert.ok(Array.isArray(profile.dailyQuests), `${label}.dailyQuests must be an array.`);
  profile.dailyQuests.forEach((quest, index) => validateQuest(quest, `${label}.dailyQuests[${index}]`));
}

function validateLeaderboard(body) {
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.leaderboard), 'leaderboard must be an array.');
  body.leaderboard.forEach((entry, index) => {
    assertNumber(entry.place, `leaderboard[${index}].place`);
    validateProfile(entry, `leaderboard[${index}]`);
  });
}

function correctionFor(answer) {
  if (answer !== 'no') return null;
  return {
    correctAnswer: String(process.env.MEDIEVAL_LIVE_CORRECT_ANSWER ?? 'MediEval live smoke correction').trim(),
    reasonTags: String(process.env.MEDIEVAL_LIVE_REASON_TAGS ?? 'wrong_item')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

async function assertGameAuthIsEnforced() {
  const response = await fetch(`${gameBaseUrl}/api/game/profile?reviewer=${encodeURIComponent(reviewer)}`, {
    headers: { accept: 'application/json' },
  });
  const body = await readJsonResponse('/api/game/profile unauthenticated check', response);
  assert.equal(response.status, 401, `unauthenticated game profile should return 401, got ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.ok, false);
  return true;
}

async function main() {
  requireEnv();

  const reviewerQuery = encodeURIComponent(reviewer);
  const evalSummary = await evalRequest(`/api/mobile/eval/summary?reviewer=${reviewerQuery}`);
  assert.equal(evalSummary.ok, true);
  validateSummary(evalSummary);

  const deckReviewState = writeSmoke ? 'all' : 'unreviewed';
  const deck = await evalRequest(`/api/mobile/eval/cards?reviewer=${reviewerQuery}&limit=${limit}&reviewState=${deckReviewState}`);
  validateDeck(deck);
  if (requireCards) {
    assert.ok(deck.cards.length > 0, `live smoke requires at least one eval card in ${deckReviewState} state.`);
  }
  const firstCard = deck.cards[0] ?? null;

  const ready = await gameRequest('/ready');
  assert.equal(ready.ok, true);
  assert.ok(
    ['medieval-game-service', 'medieval-demo-server'].includes(ready.service),
    `unexpected game readiness service: ${ready.service}`,
  );
  if (ready.service === 'medieval-game-service') {
    assertString(ready.version, 'ready.version');
  }
  const authEnforced = await assertGameAuthIsEnforced();
  const initialProfile = await gameRequest(`/api/game/profile?reviewer=${reviewerQuery}`);
  assert.equal(initialProfile.ok, true);
  validateProfile(initialProfile.profile, 'initialProfile.profile');
  const initialLeaderboard = await gameRequest('/api/game/leaderboard?limit=10');
  validateLeaderboard(initialLeaderboard);

  let writeResult = null;
  let duplicateEvalResult = null;
  let gameVerdict = null;
  let duplicateGameVerdict = null;
  let postWriteDeck = null;
  let postWriteProfile = null;

  if (writeSmoke && firstCard) {
    const eventId = String(process.env.MEDIEVAL_LIVE_EVENT_ID ?? `medieval-live-smoke:${Date.now()}`).trim();
    const correction = correctionFor(writeAnswer);
    const evalPayload = {
      eventId,
      cardId: firstCard.cardId,
      reviewer,
      answer: writeAnswer,
      correction,
      notes: 'MediEval live integration smoke',
      durationMs: 0,
      clientGeneratedAt: new Date().toISOString(),
    };
    writeResult = await evalRequest('/api/mobile/eval/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(evalPayload),
    });
    assert.equal(writeResult.ok, true);
    assertObject(writeResult.result, 'writeResult.result');
    assert.equal(writeResult.result.duplicate, false);

    duplicateEvalResult = await evalRequest('/api/mobile/eval/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(evalPayload),
    });
    assert.equal(duplicateEvalResult.ok, true);
    assertObject(duplicateEvalResult.result, 'duplicateEvalResult.result');
    assert.equal(duplicateEvalResult.result.duplicate, true);

    postWriteDeck = await evalRequest(`/api/mobile/eval/cards?reviewer=${reviewerQuery}&limit=${Math.max(limit, 20)}&reviewState=unreviewed`);
    validateDeck(postWriteDeck);
    assert.ok(
      !postWriteDeck.cards.some((card) => card.cardId === firstCard.cardId),
      `written card ${firstCard.cardId} should not reappear in the live unreviewed deck for ${reviewer}.`,
    );

    const gamePayload = {
      eventId: `game:${eventId}`,
      reviewer,
      cardId: firstCard.cardId,
      answer: writeAnswer,
      correction,
      priority: firstCard.priority,
      confidence: firstCard.confidence,
      sourceKey: firstCard.sourceKey,
      claimTemplate: firstCard.claim.template,
      durationMs: 0,
      clientGeneratedAt: evalPayload.clientGeneratedAt,
    };
    gameVerdict = await gameRequest('/api/game/verdicts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gamePayload),
    });
    assert.equal(gameVerdict.ok, true);
    assert.equal(gameVerdict.duplicate, false);
    assert.ok(gameVerdict.awarded.xp > 0);
    validateProfile(gameVerdict.profile, 'gameVerdict.profile');

    duplicateGameVerdict = await gameRequest('/api/game/verdicts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gamePayload),
    });
    assert.equal(duplicateGameVerdict.ok, true);
    assert.equal(duplicateGameVerdict.duplicate, true);
    assert.equal(duplicateGameVerdict.awarded.xp, 0);
    validateProfile(duplicateGameVerdict.profile, 'duplicateGameVerdict.profile');

    postWriteProfile = await gameRequest(`/api/game/profile?reviewer=${reviewerQuery}`);
    assert.equal(postWriteProfile.ok, true);
    validateProfile(postWriteProfile.profile, 'postWriteProfile.profile');
  }

  console.log(JSON.stringify({
    ok: true,
    reviewer,
    evalBackend: {
      service: evalBackendBaseUrl,
      pendingCards: evalSummary.summary.pendingCards,
      reviewedCards: evalSummary.summary.reviewedCards,
      returnedCards: deck.cards.length,
      reviewState: deckReviewState,
      firstCard: firstCard ? {
        cardId: firstCard.cardId,
        template: firstCard.claim.template,
        priority: firstCard.priority,
        confidence: firstCard.confidence,
      } : null,
    },
    game: {
      service: gameBaseUrl,
      database: ready.database ?? 'unknown',
      authEnforced,
      leaderboardSize: initialLeaderboard.leaderboard.length,
    },
    writeSmoke: writeResult ? {
      answer: writeResult.result.answer,
      cardId: writeResult.result.cardId,
      evalDuplicateProtected: duplicateEvalResult.result.duplicate,
      repeatedInUnreviewedDeck: postWriteDeck.cards.some((card) => card.cardId === writeResult.result.cardId),
      awardedXp: gameVerdict.awarded.xp,
      gameDuplicateProtected: duplicateGameVerdict.duplicate,
      profileVerdicts: postWriteProfile.profile.totalVerdicts,
    } : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
