#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EvalFileStore } from '../services/eval-api/store.mjs';
import { createEvalApiServer } from '../services/eval-api/server.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'medieval-quality-'));
let server;
try {
  const store = new EvalFileStore({ dataDir: root });
  const ctx = { projectId: 'quality', batchId: 'pilot' };
  const card = (id) => ({ schemaVersion: 'eval-card.v1', cardId: id, cardType: 'binary_claim', question: `Is ${id} supported?`,
    claim: { template: 'support', path: 'answer', value: id }, sourceKey: `source:${id}`, priority: 'medium', confidence: 0.5,
    evidence: [{ source: 'record', detail: 'Source evidence' }] });
  await store.importCards({ ...ctx, cards: [card('a'), card('b'), card('c')] });
  const review = (reviewer, cardId, answer, extra = {}) => store.storeResult({ ...ctx, payload: { eventId: `${reviewer}:${cardId}:${extra.suffix || answer}`, cardId, reviewer, answer, ...extra } });
  const ref = (id, kind, author = 'expert', answer = 'yes') => store.quality.addReference(ctx, { card: card(id), kind, answer, explanation: `Expert explanation for ${id}` }, author);
  const answerQuest = (reviewer, quest, answer = 'yes') => store.storeResult({ ...ctx, payload: { reviewer, cardId: quest.cardId, eventId: `attempt:${quest.cardId}`, answer } });
  const quest = async (reviewer, kind) => (await store.quality.deck({ ...ctx, reviewer }, kind)).cards[0];

  // Solo review starts without references or a qualification gate.
  assert.equal((await store.mobileDeck({ ...ctx, reviewer: 'expert' })).cards.length, 3);
  await store.quality.configure(ctx, { expertReviewers: ['expert'], rubric: 'Judge only what the evidence supports.' }, 'expert');
  const accepted = await review('expert', 'a', 'yes');
  assert.equal(accepted.result.reviewerRole, 'expert');
  assert.equal((await store.quality.labels(ctx))[0].status, 'expert_reviewed');
  assert.equal((await store.quality.labels(ctx))[0].resolvedAnswer, 'yes');
  assert.equal((await store.quality.snapshot({ ...ctx, reviewer: 'expert' })).qualification.status, 'incomplete');
  await assert.rejects(store.importCards({ ...ctx, cards: [card('quality:forged')] }), { status: 400 });

  // Replays remain idempotent, including simultaneous requests.
  const replay = await review('expert', 'a', 'yes');
  assert.equal(replay.duplicate, true);
  await Promise.all([review('expert', 'b', 'no'), review('expert', 'b', 'no')]);
  assert.equal((await store.listResults(ctx)).length, 2);

  // Consistency compares only the same person's previous decision and never overwrites it.
  const consistency = await quest('expert', 'consistency');
  assert(consistency);
  assert.equal(JSON.stringify(consistency).includes('previousAnswer'), false);
  const consistencyResult = await answerQuest('expert', consistency, 'no');
  assert.equal(consistencyResult.qualityFeedback.consistent, false);
  assert.equal(consistencyResult.qualityFeedback.verifiedQualityBonus, 0);
  assert.equal((await store.listResults(ctx))[0].answer, 'yes');
  await assert.rejects(answerQuest('intruder', consistency), { status: 404 });

  await ref('practice', 'practice');
  await ref('q1', 'qualification');
  await ref('q2', 'qualification');
  await ref('check', 'check');
  await assert.rejects(ref('practice', 'qualification'), { status: 409 });
  const practice = await quest('novice', 'practice');
  assert.equal(JSON.stringify(practice).includes('expectedAnswer'), false);
  assert.equal(JSON.stringify(practice).includes('Expert explanation'), false);
  const practiced = await answerQuest('novice', practice);
  assert.equal(practiced.qualityFeedback.matchesReference, true);
  assert.equal(practiced.qualityFeedback.explanation, 'Expert explanation for practice');
  assert.equal(practiced.qualityFeedback.verifiedQualityBonus, 0);
  assert(await quest('novice', 'practice'), 'practice can be repeated without scoring credit');

  await store.quality.configure(ctx, { calibration: 'required', qualificationCount: 2, passRate: 1 }, 'expert');
  await assert.rejects(store.mobileDeck({ ...ctx, reviewer: 'novice' }), { status: 403 });
  await assert.rejects(review('novice', 'c', 'yes'), { status: 403 });
  assert.equal((await store.mobileDeck({ ...ctx, reviewer: 'expert' })).cards.length, 1);
  // The reference author cannot earn qualification from their own answers.
  assert.equal(await quest('expert', 'qualification'), undefined);
  const first = await quest('novice', 'qualification');
  assert.equal((await quest('novice', 'qualification')).cardId, first.cardId);
  const partial = await answerQuest('novice', first);
  assert.equal(partial.qualityFeedback.matchesReference, null);
  assert.equal(partial.qualityFeedback.expectedAnswer, null);
  assert.equal(partial.qualityFeedback.qualification.correct, null);
  assert.equal((await answerQuest('novice', first)).duplicate, true);
  const second = await quest('novice', 'qualification');
  const passed = await answerQuest('novice', second);
  assert.equal(passed.qualityFeedback.qualification.status, 'passed');
  assert.equal(passed.qualityFeedback.verifiedQualityBonus, 20);
  assert.equal((await answerQuest('novice', second)).qualityFeedback.verifiedQualityBonus, 0);
  assert.equal(await quest('novice', 'qualification'), undefined);
  assert((await store.mobileDeck({ ...ctx, reviewer: 'novice' })).cards.length);
  const publicState = await store.quality.snapshot({ ...ctx, reviewer: 'novice' });
  assert.equal(publicState.references, undefined);
  assert.equal(publicState.labels, undefined);
  assert.equal(publicState.qualityXP, 20);
  assert.equal((await store.listResults(ctx)).length, 2, 'training attempts never become production labels');
  const staleQuest = await quest('stale', 'qualification');

  // An unsuccessful qualification stays blocked, with no correctness credit.
  const failedOne = await quest('failed', 'qualification');
  await answerQuest('failed', failedOne, 'no');
  const failedTwo = await quest('failed', 'qualification');
  const failed = await answerQuest('failed', failedTwo, 'no');
  assert.equal(failed.qualityFeedback.qualification.status, 'needs_practice');
  assert.equal(failed.qualityFeedback.verifiedQualityBonus, 0);
  await assert.rejects(review('failed', 'c', 'yes'), { status: 403 });

  // Checks are scheduled into the normal deck, sealed until answered, and awarded once.
  await store.quality.configure(ctx, { checkEvery: 1 }, 'expert');
  await review('novice', 'a', 'yes');
  const mixed = await store.mobileDeck({ ...ctx, reviewer: 'novice' });
  assert.equal(mixed.cards[0].quality.kind, 'check');
  assert.equal((await store.mobileDeck({ ...ctx, reviewer: 'novice' })).cards[0].cardId, mixed.cards[0].cardId);
  const checked = await answerQuest('novice', mixed.cards[0]);
  assert.equal(checked.qualityFeedback.verifiedQualityBonus, 5);
  await answerQuest('novice', mixed.cards[0]);
  assert.equal((await store.quality.snapshot({ ...ctx, reviewer: 'novice' })).qualityXP, 25);

  // Independent reviews and abstentions have distinct, transparent outcomes.
  await store.quality.configure(ctx, { mode: 'team', calibration: 'optional', checkEvery: 0 }, 'expert');
  let labels = await store.quality.labels(ctx);
  assert.equal(labels.find((r) => r.cardId === 'a').status, 'consensus');
  assert.equal(labels.find((r) => r.cardId === 'a').reviewerCount, 2);
  await review('expert', 'b', 'no', { suffix: 'correction', correction: { correctAnswer: 'one' } });
  await review('novice', 'b', 'no', { correction: { correctAnswer: 'two' } });
  labels = await store.quality.labels(ctx);
  const disputed = labels.find((r) => r.cardId === 'b');
  assert.equal(disputed.status, 'needs_adjudication');
  assert.equal(disputed.correctionDisagreement, true);
  await review('novice', 'c', 'unsure');
  assert.equal((await store.quality.labels(ctx)).find((r) => r.cardId === 'c').status, 'needs_adjudication');
  // A changed answer by one reviewer is still one vote.
  assert.equal(disputed.reviewerCount, 2);
  await assert.rejects(store.quality.adjudicate(ctx, { cardId: 'b', answer: 'no', rationale: 'Evidence', basisEventIds: [] }, 'judge'), { status: 409 });
  const resolution = await store.quality.adjudicate(ctx, { cardId: 'b', answer: 'no', rationale: 'Source confirms two.', correction: { correctAnswer: 'two' }, basisEventIds: disputed.basisEventIds }, 'judge');
  assert.equal(resolution.adjudication.independent, true);
  assert.equal((await store.quality.labels(ctx)).find((r) => r.cardId === 'b').status, 'adjudicated');
  const exported = (await store.exportResults(ctx)).trim().split('\n').map(JSON.parse);
  assert.equal(exported.find((r) => r.cardId === 'b').quality.adjudication.rationale, 'Source confirms two.');
  assert.match(await store.exportResults({ ...ctx, format: 'csv' }), /rubricVersion,reviewerRole,quality/);
  await review('third', 'b', 'yes');
  assert.equal((await store.quality.labels(ctx)).find((r) => r.cardId === 'b').status, 'needs_adjudication', 'new evidence invalidates the old adjudication');

  // New rubric versions invalidate old qualification and old production resolutions.
  await assert.rejects(store.quality.configure(ctx, { rubric: 'Changed silently' }, 'expert'), { status: 400 });
  await store.quality.configure(ctx, { rubricVersion: '2', rubric: 'Revised rubric.' }, 'expert');
  await assert.rejects(answerQuest('stale', staleQuest), { status: 409 });
  await assert.rejects(store.quality.configure(ctx, { rubricVersion: '1', rubric: 'Reused rubric' }, 'expert'), { status: 400 });
  await assert.rejects(store.quality.configure(ctx, { rubricVersion: 3 }, 'expert'), { status: 400 });
  assert.equal((await store.quality.snapshot({ ...ctx, reviewer: 'novice' })).qualification.status, 'incomplete');
  assert.equal((await store.quality.labels(ctx)).find((r) => r.cardId === 'a').status, 'pending');
  await assert.rejects(review('expert', 'c', 'yes', { suffix: 'stale', rubricVersion: '1' }), { status: 409 });
  assert((await store.mobileDeck({ ...ctx, reviewer: 'expert' })).cards.some((c) => c.cardId === 'a'));
  const restarted = new EvalFileStore({ dataDir: root });
  const restored = await restarted.quality.snapshot({ ...ctx, reviewer: 'novice' }, true);
  assert.equal(restored.settings.rubricVersion, '2');
  assert.equal(restored.adjudications.length, 1);
  assert.equal(restored.settingsHistory.length > 0, true);

  // Reserving and retiring a formerly reviewed source never inflate production progress.
  const reserve = await store.quality.addReference(ctx, { cardId: 'a', kind: 'practice', answer: 'yes', explanation: 'Reserved as an anchor.' }, 'expert');
  await store.quality.retireReference(ctx, reserve.reference.id);
  const productionSummary = (await store.summary({ ...ctx, reviewer: 'expert' })).summary;
  assert.equal(productionSummary.totalCards, 2);
  assert.equal(productionSummary.reviewedCards, 0);
  assert.equal((await store.mobileDeck({ ...ctx, reviewer: 'expert' })).cards.some((c) => c.cardId === 'a'), false);

  // HTTP routes preserve authentication and return actual usable page/scripts and exports.
  server = createEvalApiServer({ store: restarted, token: 'test-token' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const query = new URLSearchParams({ ...ctx, reviewer: 'expert' });
  const request = async (route, body, authenticated = true) => fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: 'Bearer test-token' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await request('/api/eval/quality?' + query, null, false)).status, 401);
  const page = await (await request('/quality')).text();
  assert.match(page, /Training Grounds/);
  new Function(page.match(/<script>([\s\S]*?)<\/script>/)[1]);
  const remote = await (await request('/api/eval/quality?' + query)).json();
  assert.equal(remote.canManage, true);
  const mobile = await (await request('/api/mobile/eval/quality?' + query)).json();
  assert.equal(mobile.canManage, false);
  assert.equal(mobile.references, undefined);
  assert.equal((await request('/api/eval/quality/settings?' + query, { qualificationCount: 0 })).status, 400);
  const resolved = await (await request('/api/eval/quality/export?' + query)).text();
  assert.equal(JSON.parse(resolved.split('\n')[0]).rubricVersion, '2');
  console.log('Quality smoke passed: optional solo review, reference secrecy, qualification, retries, cadence, independent votes, corrections, adjudication, exports, rubric versions, and restart.');
} finally {
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeIdleConnections(); });
  await fs.rm(root, { recursive: true, force: true });
}
