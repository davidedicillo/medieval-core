import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { evalAnswerValues, normalizeEvalCard, normalizeReviewer, text, validateEvalCard } from '../../packages/schema/index.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const identity = (row) => normalizeReviewer(row.userId || row.reviewer);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const productionCards = (cards, state) => {
  const sources = new Set(state.references.map((r) => r.card.sourceKey));
  return cards.filter((c) => !sources.has(c.sourceKey));
};
const defaults = {
  mode: 'solo', calibration: 'optional', rubricVersion: '1', rubric: '', expertReviewers: [],
  minReviews: 2, consensusThreshold: 1, qualificationCount: 30, passRate: 0.9,
  checkEvery: 10, consistencyEvery: 0,
};

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) fail(400, `${label} must be an integer from ${min} to ${max}.`);
  return value;
}

function settingsFor(input) {
  const settings = { ...defaults, ...input };
  if (!['solo', 'team'].includes(settings.mode)) fail(400, 'Choose solo or team review.');
  if (!['off', 'optional', 'required'].includes(settings.calibration)) fail(400, 'Choose off, optional, or required calibration.');
  if (typeof settings.rubricVersion !== 'string' || !text(settings.rubricVersion) || text(settings.rubricVersion).length > 100) fail(400, 'A rubric version string is required.');
  settings.rubricVersion = text(settings.rubricVersion);
  if (typeof settings.rubric !== 'string' || settings.rubric.length > 20000) fail(400, 'The rubric must contain at most 20,000 characters.');
  if (!Array.isArray(settings.expertReviewers) || settings.expertReviewers.some((r) => typeof r !== 'string' || !text(r))) fail(400, 'Expert reviewers must be reviewer identities.');
  settings.expertReviewers = [...new Set(settings.expertReviewers.map(normalizeReviewer))];
  integer(settings.minReviews, 2, 20, 'Independent reviews');
  integer(settings.qualificationCount, 1, 500, 'Qualification size');
  integer(settings.checkEvery, 0, 1000, 'Check interval');
  integer(settings.consistencyEvery, 0, 1000, 'Consistency interval');
  for (const key of ['passRate', 'consensusThreshold']) {
    if (typeof settings[key] !== 'number' || !Number.isFinite(settings[key]) || settings[key] <= 0.5 || settings[key] > 1) fail(400, `${key} must be greater than 0.5 and at most 1.`);
  }
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, settings[key]]));
}

// Each reviewer contributes at most one current-rubric vote. Original events remain untouched.
export function resolveLabels(cards, results, settings, adjudications = []) {
  return cards.map((card) => {
    const relevant = results.filter((r) => r.cardId === card.cardId && (r.rubricVersion || '1') === settings.rubricVersion);
    const latest = [...new Map(relevant.map((r) => [identity(r), r])).values()];
    const votes = Object.fromEntries(evalAnswerValues.map((answer) => [answer, latest.filter((r) => r.answer === answer).length]));
    const substantive = latest.filter((r) => ['yes', 'no'].includes(r.answer));
    const winner = votes.yes > votes.no ? 'yes' : votes.no > votes.yes ? 'no' : null;
    const agreement = winner && substantive.length ? votes[winner] / substantive.length : null;
    const correctedValues = new Set(latest.filter((r) => r.answer === 'no').map((r) => text(r.correction?.correctAnswer)).filter(Boolean));
    const expert = latest.find((r) => settings.expertReviewers.includes(identity(r)) && ['yes', 'no', 'bad_question'].includes(r.answer));
    const basis = relevant.map((r) => r.eventId);
    const adjudication = adjudications.filter((a) => a.cardId === card.cardId && a.rubricVersion === settings.rubricVersion && JSON.stringify(a.basisEventIds) === JSON.stringify(basis)).at(-1) ?? null;
    let status = 'pending';
    let resolvedAnswer = null;
    if (latest.length) status = 'reviewed';
    if (settings.mode === 'solo' && expert) { status = 'expert_reviewed'; resolvedAnswer = expert.answer; }
    if (settings.mode === 'team' && latest.length) {
      const abstentions = votes.unsure + votes.bad_question + votes.skip;
      if (abstentions || (votes.yes && votes.no) || correctedValues.size > 1) status = 'needs_adjudication';
      else if (substantive.length < settings.minReviews) status = 'awaiting_reviews';
      if (!abstentions && correctedValues.size <= 1 && substantive.length >= settings.minReviews && winner && agreement >= settings.consensusThreshold) {
        status = 'consensus'; resolvedAnswer = winner;
      }
    }
    if (adjudication) { status = 'adjudicated'; resolvedAnswer = adjudication.answer; }
    return {
      cardId: card.cardId, sourceKey: card.sourceKey, question: card.question, card,
      rubricVersion: settings.rubricVersion, status, resolvedAnswer,
      reviewerCount: latest.length, votes, agreement, basisEventIds: basis,
      correctionDisagreement: correctedValues.size > 1,
      judgments: latest, adjudication,
    };
  });
}

export class QualityWorkflow {
  constructor(store) { this.store = store; this.locks = new Map(); }

  file(ctx) { return path.join(this.store.batchDir(ctx.projectId, ctx.batchId || ctx.runId), 'quality.json'); }

  async read(ctx) {
    try { return JSON.parse(await fs.readFile(this.file(ctx), 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { settings: { ...defaults }, settingsHistory: [], references: [], assignments: [], attempts: [], adjudications: [] };
    }
  }

  async locked(ctx, operation) {
    const key = this.file(ctx);
    const previous = this.locks.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.locks.set(key, next);
    try { return await next; }
    finally { if (this.locks.get(key) === next) this.locks.delete(key); }
  }

  async mutate(ctx, operation) {
    return this.locked(ctx, async () => {
      const state = await this.read(ctx);
      const result = await operation(state);
      const file = this.file(ctx);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temporary, JSON.stringify(state), 'utf8'); await fs.rename(temporary, file); }
      finally { await fs.rm(temporary, { force: true }); }
      return result;
    });
  }

  async configure(ctx, input, actor) {
    return this.mutate(ctx, (state) => {
      const settings = settingsFor({ ...state.settings, ...input });
      if (settings.calibration === 'required' && !text(settings.rubric)) fail(400, 'Write a rubric before requiring qualification.');
      if (settings.rubric !== state.settings.rubric && settings.rubricVersion === state.settings.rubricVersion && state.settings.rubric) fail(400, 'Use a new rubric version when changing its text.');
      if (settings.rubricVersion !== state.settings.rubricVersion && state.settingsHistory.some((r) => r.settings.rubricVersion === settings.rubricVersion)) fail(400, 'Rubric versions cannot be reused.');
      const available = state.references.filter((r) => r.rubricVersion === settings.rubricVersion && r.kind === 'qualification' && !r.retired);
      if (settings.calibration === 'required' && available.length < settings.qualificationCount) fail(400, `Add ${settings.qualificationCount} qualification references for this rubric before requiring calibration.`);
      state.settingsHistory.push({ settings: state.settings, actor, at: new Date().toISOString() });
      state.settings = settings;
      return { ok: true, settings };
    });
  }

  async addReference(ctx, input, actor) {
    return this.mutate(ctx, async (state) => {
      if (!['practice', 'qualification', 'check'].includes(input.kind)) fail(400, 'Choose practice, qualification, or check.');
      if (!evalAnswerValues.includes(input.answer) || input.answer === 'skip') fail(400, 'A reference answer is required; skip cannot be a reference.');
      if (typeof input.explanation !== 'string' || !text(input.explanation) || input.explanation.length > 20000) fail(400, 'Explain the reference answer in at most 20,000 characters.');
      const cards = await this.store.listCards(ctx);
      const card = normalizeEvalCard(input.card || cards.find((r) => r.cardId === input.cardId), ctx);
      const errors = validateEvalCard(card);
      if (errors.length) fail(400, errors.join('; '));
      if (card.cardId.startsWith('quality:')) fail(400, 'Reference IDs cannot use the quality: prefix.');
      const version = state.settings.rubricVersion;
      if (state.references.some((r) => !r.retired && r.rubricVersion === version && (r.card.cardId === card.cardId || r.card.sourceKey === card.sourceKey))) fail(409, 'Use a distinct source for each reference; practice and scored sets must not overlap.');
      const reference = {
        id: randomUUID(), kind: input.kind, card, answer: input.answer,
        explanation: text(input.explanation), author: actor, rubricVersion: version,
        createdAt: new Date().toISOString(), retired: false,
      };
      state.references.push(reference);
      return { ok: true, reference };
    });
  }

  async retireReference(ctx, id) {
    return this.mutate(ctx, (state) => {
      const ref = state.references.find((r) => r.id === id);
      if (!ref) fail(404, 'Reference not found.');
      ref.retired = true;
      // Retiring a reference immediately invalidates qualification based on that item.
      return { ok: true };
    });
  }

  qualification(state, reviewer) {
    const settings = state.settings;
    const refs = state.references.filter((r) => !r.retired && r.kind === 'qualification' && r.rubricVersion === settings.rubricVersion && r.author !== reviewer);
    const ids = new Set(refs.map((r) => r.id));
    const attempts = state.attempts.filter((r) => r.reviewer === reviewer && ids.has(r.referenceId));
    const correct = attempts.filter((r) => r.matchesReference).length;
    const count = attempts.length;
    const complete = count >= settings.qualificationCount;
    return { attempted: count, required: settings.qualificationCount, available: refs.length,
      correct: complete ? correct : null, accuracy: complete && count ? correct / count : null,
      status: complete ? (correct / count >= settings.passRate ? 'passed' : 'needs_practice') : 'incomplete' };
  }

  async requireQualified(ctx, reviewer, state = null) {
    state ??= await this.read(ctx);
    if (state.settings.calibration === 'required' && !state.settings.expertReviewers.includes(reviewer) && this.qualification(state, reviewer).status !== 'passed') fail(403, 'Complete qualification in Training Grounds before reviewing this batch.');
  }

  publicAssignment(assignment) {
    const fields = ['schemaVersion', 'cardType', 'question', 'claim', 'sourceKey', 'priority', 'confidence', 'subject', 'listing', 'images', 'media', 'analysisContext', 'evidence'];
    const card = Object.fromEntries(fields.filter((key) => assignment.card[key] !== undefined).map((key) => [key, assignment.card[key]]));
    return { ...card, cardId: `quality:${assignment.id}`,
      quality: { assignmentId: assignment.id, kind: assignment.kind, rubricVersion: assignment.rubricVersion, rubric: assignment.rubric } };
  }

  async deck(ctx, kind = 'practice', automatic = false) {
    if (!['practice', 'qualification', 'check', 'consistency'].includes(kind)) fail(400, 'Unknown quality quest type.');
    return this.mutate(ctx, async (state) => {
      const reviewer = normalizeReviewer(ctx.reviewer);
      const settings = state.settings;
      if (kind !== 'consistency' && settings.calibration === 'off') return { ok: true, cards: [] };
      const pending = state.assignments.find((a) => a.reviewer === reviewer && a.kind === kind && a.rubricVersion === settings.rubricVersion && !state.attempts.some((t) => t.assignmentId === a.id) && (!a.referenceId || state.references.some((r) => r.id === a.referenceId && !r.retired)));
      if (pending) return { ok: true, cards: [this.publicAssignment(pending)] };
      if (kind === 'qualification' && this.qualification(state, reviewer).attempted >= settings.qualificationCount) return { ok: true, cards: [] };
      const used = new Set(state.assignments.filter((a) => a.reviewer === reviewer && a.rubricVersion === settings.rubricVersion).map((a) => a.referenceId || a.previousEventId));
      let selected;
      if (kind === 'consistency') {
        const results = await this.store.listResults(ctx);
        const cards = await this.store.listCards(ctx);
        const latest = [...new Map(results.filter((r) => identity(r) === reviewer && (r.rubricVersion || '1') === settings.rubricVersion).map((r) => [r.cardId, r])).values()];
        const previous = latest.find((r) => !used.has(r.eventId) && r.answer !== 'skip' && cards.some((c) => c.cardId === r.cardId));
        if (previous) selected = { card: cards.find((c) => c.cardId === previous.cardId), previousAnswer: previous.answer, previousEventId: previous.eventId };
      } else {
        const priorResults = await this.store.listResults(ctx);
        const knownCardIds = new Set(priorResults.filter((r) => identity(r) === reviewer).map((r) => r.cardId));
        const knownSources = new Set((await this.store.listCards(ctx)).filter((c) => knownCardIds.has(c.cardId)).map((c) => c.sourceKey));
        for (const prior of state.assignments.filter((a) => a.reviewer === reviewer)) knownSources.add(prior.card.sourceKey);
        // Expert authors never qualify themselves against their own reference answers.
        const candidates = state.references.filter((r) => !r.retired && r.kind === kind && r.rubricVersion === settings.rubricVersion && (kind === 'practice' || (r.author !== reviewer && !knownSources.has(r.card.sourceKey))));
        const completedPractice = state.attempts.filter((a) => a.reviewer === reviewer && a.kind === 'practice' && a.rubricVersion === settings.rubricVersion).length;
        const ref = candidates.find((r) => !used.has(r.id)) || (kind === 'practice' ? candidates[completedPractice % candidates.length] : null);
        if (ref) selected = { card: ref.card, referenceId: ref.id, expectedAnswer: ref.answer, explanation: ref.explanation, referenceAuthor: ref.author };
      }
      if (!selected) return { ok: true, cards: [] };
      const assignment = { id: randomUUID(), reviewer, kind, rubricVersion: settings.rubricVersion, rubric: settings.rubric, automatic, ...selected, createdAt: new Date().toISOString() };
      state.assignments.push(assignment);
      return { ok: true, cards: [this.publicAssignment(assignment)] };
    });
  }

  async automaticCard(ctx, productionCount) {
    const state = await this.read(ctx);
    const reviewer = normalizeReviewer(ctx.reviewer);
    for (const kind of ['check', 'consistency']) {
      const every = kind === 'check' ? (state.settings.calibration !== 'off' ? state.settings.checkEvery : 0) : state.settings.consistencyEvery;
      if (!every) continue;
      const assignments = state.assignments.filter((a) => a.reviewer === reviewer && a.kind === kind && a.automatic && a.rubricVersion === state.settings.rubricVersion);
      const pending = assignments.find((a) => !state.attempts.some((t) => t.assignmentId === a.id) && (!a.referenceId || state.references.some((r) => r.id === a.referenceId && !r.retired)));
      if (pending) return this.publicAssignment(pending);
      if (productionCount && Math.floor(productionCount / every) > assignments.length) {
        const deck = await this.deck(ctx, kind, true);
        if (deck.cards.length) return deck.cards[0];
      }
    }
    return null;
  }

  async submit(ctx, payload) {
    return this.mutate(ctx, (state) => {
      const reviewer = normalizeReviewer(payload.userId || ctx.reviewer || payload.reviewer);
      const assignment = state.assignments.find((a) => `quality:${a.id}` === payload.cardId && a.reviewer === reviewer);
      if (!assignment) fail(404, 'Quality quest not found for this reviewer.');
      const existing = state.attempts.find((a) => a.assignmentId === assignment.id);
      if (existing) return this.attemptResponse(state, existing, true);
      if (assignment.rubricVersion !== state.settings.rubricVersion || (assignment.referenceId && !state.references.some((r) => r.id === assignment.referenceId && !r.retired))) fail(409, 'This quest was retired. Refresh Training Grounds.');
      if (!evalAnswerValues.includes(payload.answer)) fail(400, 'Invalid answer.');
      const attempt = { id: randomUUID(), assignmentId: assignment.id, eventId: text(payload.eventId), reviewer, kind: assignment.kind,
        referenceId: assignment.referenceId || null, rubricVersion: assignment.rubricVersion, cardId: assignment.card.cardId,
        answer: payload.answer, notes: text(payload.notes), correction: payload.correction || null,
        matchesReference: assignment.expectedAnswer ? payload.answer === assignment.expectedAnswer : null,
        consistent: assignment.previousAnswer ? payload.answer === assignment.previousAnswer : null,
        serverReceivedAt: new Date().toISOString() };
      state.attempts.push(attempt);
      const qualified = this.qualification(state, reviewer);
      attempt.verifiedQualityBonus = attempt.kind === 'check' && attempt.matchesReference ? 5
        : attempt.kind === 'qualification' && qualified.status === 'passed' && qualified.attempted === qualified.required ? 20 : 0;
      return this.attemptResponse(state, attempt, false);
    });
  }

  attemptResponse(state, attempt, duplicate) {
    const assignment = state.assignments.find((a) => a.id === attempt.assignmentId);
    const qualification = this.qualification(state, attempt.reviewer);
    const reveal = attempt.kind !== 'qualification' || qualification.status !== 'incomplete';
    return { ok: true, stored: true, duplicate, qualityFeedback: {
      cardId: attempt.cardId, answer: attempt.answer, rubricVersion: attempt.rubricVersion,
      kind: attempt.kind, matchesReference: reveal ? attempt.matchesReference : null,
      expectedAnswer: reveal ? assignment.expectedAnswer || null : null,
      explanation: reveal ? assignment.explanation || null : null,
      consistent: attempt.consistent, previousAnswer: assignment.previousAnswer || null,
      qualification, verifiedQualityBonus: duplicate ? 0 : attempt.verifiedQualityBonus || 0,
    } };
  }

  async snapshot(ctx, manage = false) {
    const state = await this.read(ctx);
    const reviewer = normalizeReviewer(ctx.reviewer);
    const own = state.attempts.filter((a) => a.reviewer === reviewer && a.rubricVersion === state.settings.rubricVersion);
    const checks = own.filter((a) => a.kind === 'check');
    const consistency = own.filter((a) => a.kind === 'consistency');
    const refs = state.references.filter((r) => !r.retired && r.rubricVersion === state.settings.rubricVersion);
    const snapshot = { ok: true, canManage: manage, reviewer,
      isProjectExpert: state.settings.expertReviewers.includes(reviewer),
      qualificationRequired: state.settings.calibration === 'required' && !state.settings.expertReviewers.includes(reviewer),
      settings: manage ? state.settings : { ...state.settings, expertReviewers: [] },
      qualification: this.qualification(state, reviewer),
      referenceCounts: Object.fromEntries(['practice', 'qualification', 'check'].map((k) => [k, refs.filter((r) => r.kind === k).length])),
      checks: { count: checks.length, matched: checks.filter((a) => a.matchesReference).length },
      consistency: { count: consistency.length, matched: consistency.filter((a) => a.consistent).length },
      qualityXP: own.reduce((total, a) => total + (a.verifiedQualityBonus || 0), 0),
      feedback: own.slice(-20).map((a) => this.attemptResponse(state, a, false).qualityFeedback),
    };
    if (manage) {
      const cards = await this.store.listCards(ctx);
      const results = await this.store.listResults(ctx);
      snapshot.references = state.references;
      snapshot.cards = cards;
      snapshot.labels = resolveLabels(productionCards(cards, state), results, state.settings, state.adjudications);
      snapshot.adjudications = state.adjudications;
      snapshot.settingsHistory = state.settingsHistory;
      snapshot.reviewerQuality = [...new Set(state.attempts.map((a) => a.reviewer))].map((r) => ({ reviewer: r, qualification: this.qualification(state, r) }));
    }
    return snapshot;
  }

  async adjudicate(ctx, input, actor) {
    return this.mutate(ctx, async (state) => {
      if (!['yes', 'no', 'unsure', 'bad_question'].includes(input.answer) || typeof input.rationale !== 'string' || !text(input.rationale) || input.rationale.length > 20000) fail(400, 'Provide a resolved answer and rationale of at most 20,000 characters.');
      const results = await this.store.listResults(ctx);
      const cards = await this.store.listCards(ctx);
      const label = resolveLabels(productionCards(cards, state), results, state.settings).find((r) => r.cardId === input.cardId);
      if (!label) fail(404, 'Card not found.');
      if (!label.basisEventIds.length) fail(409, 'Review this card before adjudicating it.');
      if (!Array.isArray(input.basisEventIds) || digest(input.basisEventIds) !== digest(label.basisEventIds)) fail(409, 'Judgments changed. Reload the evidence before adjudicating.');
      const record = { id: randomUUID(), cardId: input.cardId, answer: input.answer, correction: input.correction || null,
        rationale: text(input.rationale), adjudicator: actor, rubricVersion: state.settings.rubricVersion,
        basisEventIds: label.basisEventIds, independent: !label.judgments.some((r) => identity(r) === actor),
        createdAt: new Date().toISOString() };
      state.adjudications.push(record);
      return { ok: true, adjudication: record };
    });
  }

  async labels(ctx) {
    const state = await this.read(ctx);
    return resolveLabels(productionCards(await this.store.listCards(ctx), state), await this.store.listResults(ctx), state.settings, state.adjudications);
  }

  async enrichResults(ctx, results) {
    const labels = new Map((await this.labels(ctx)).map((r) => [r.cardId, r]));
    return results.map((r) => {
      const label = labels.get(r.cardId);
      return { ...r, quality: label ? { ...label, card: undefined, judgments: undefined, question: undefined, sourceKey: undefined } : null };
    });
  }
}
