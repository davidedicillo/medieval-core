export const evalCardSchemaVersion = 'eval-card.v1';
export const evalAnswerValues = Object.freeze(['yes', 'no', 'unsure', 'bad_question', 'skip']);
export const defaultProjectId = 'default';
export const defaultBatchId = 'default';
export const defaultRunId = defaultBatchId;

export function text(value, fallback = '') {
  const cleaned = String(value ?? '').trim();
  return cleaned || fallback;
}

export function slug(value, fallback) {
  return text(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

export function normalizeProjectId(value) {
  return slug(value, defaultProjectId);
}

export function normalizeBatchId(value) {
  return slug(value, defaultBatchId);
}

export function normalizeRunId(value) {
  return normalizeBatchId(value);
}

export function batchIdFrom(value = {}, fallback = undefined) {
  return normalizeBatchId(value?.batchId ?? value?.runId ?? fallback);
}

export function normalizeReviewer(value) {
  return text(value, 'anonymous');
}

export function normalizeAnswer(value) {
  const answer = text(value).toLowerCase();
  return evalAnswerValues.includes(answer) ? answer : '';
}

export function resultIdempotencyKey(payload) {
  const eventId = text(payload?.eventId);
  if (eventId) return eventId;
  const reviewer = normalizeReviewer(payload?.reviewer);
  const cardId = text(payload?.cardId);
  const generatedAt = text(payload?.clientGeneratedAt);
  return [reviewer, cardId, generatedAt].filter(Boolean).join(':');
}

export function cardReviewerKey(reviewer, cardId) {
  return `${normalizeReviewer(reviewer)}\n${text(cardId)}`;
}

export function validateEvalCard(card) {
  const errors = [];
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    return ['card must be an object'];
  }
  if (!text(card.schemaVersion)) errors.push('schemaVersion is required');
  if (!text(card.cardId)) errors.push('cardId is required');
  if (!text(card.cardType)) errors.push('cardType is required');
  if (!text(card.question)) errors.push('question is required');
  if (!text(card.sourceKey)) errors.push('sourceKey is required');
  if (!card.claim || typeof card.claim !== 'object' || Array.isArray(card.claim)) {
    errors.push('claim is required');
  } else {
    if (!text(card.claim.template)) errors.push('claim.template is required');
    if (!text(card.claim.path)) errors.push('claim.path is required');
    if (!text(card.claim.value)) errors.push('claim.value is required');
  }
  if (card.confidence !== undefined && card.confidence !== null) {
    const value = Number(card.confidence);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      errors.push('confidence must be a number from 0 to 1');
    }
  }
  return errors;
}

export function validateEvalResult(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['result payload must be an object'];
  }
  if (!text(payload.cardId)) errors.push('cardId is required');
  if (!text(payload.reviewer)) errors.push('reviewer is required');
  if (!normalizeAnswer(payload.answer)) {
    errors.push(`answer must be one of: ${evalAnswerValues.join(', ')}`);
  }
  if (payload.durationMs !== undefined && payload.durationMs !== null) {
    const value = Number(payload.durationMs);
    if (!Number.isFinite(value) || value < 0) errors.push('durationMs must be a non-negative number');
  }
  return errors;
}

export function normalizeEvalCard(card, defaults = {}) {
  const normalized = {
    ...card,
    schemaVersion: text(card?.schemaVersion, evalCardSchemaVersion),
    cardId: text(card?.cardId),
    cardType: text(card?.cardType, 'binary_claim'),
    question: text(card?.question),
    claim: {
      template: text(card?.claim?.template),
      path: text(card?.claim?.path),
      value: text(card?.claim?.value),
    },
    sourceKey: text(card?.sourceKey, text(card?.cardId)),
    priority: text(card?.priority, 'medium'),
    confidence: card?.confidence === undefined ? null : card.confidence,
    subject: card?.subject ?? null,
    listing: card?.listing ?? null,
    images: Array.isArray(card?.images) ? card.images : [],
    media: Array.isArray(card?.media) ? card.media : [],
    analysisContext: card?.analysisContext ?? {},
    evidence: Array.isArray(card?.evidence) ? card.evidence : [],
  };
  if (defaults.projectId) normalized.projectId = normalizeProjectId(defaults.projectId);
  if (defaults.batchId || defaults.runId) {
    normalized.batchId = batchIdFrom(defaults);
    normalized.runId = normalized.batchId;
  }
  return normalized;
}

export function normalizeEvalResult(payload, options = {}) {
  const serverReceivedAt = text(options.serverReceivedAt, new Date().toISOString());
  const projectId = normalizeProjectId(payload?.projectId ?? options.projectId);
  const batchId = batchIdFrom(payload, options.batchId ?? options.runId);
  const eventId = resultIdempotencyKey(payload);
  return {
    eventId,
    projectId,
    batchId,
    runId: batchId,
    cardId: text(payload?.cardId),
    reviewer: normalizeReviewer(payload?.reviewer),
    ...(payload?.userId ? { userId: text(payload.userId), reviewerName: text(payload.reviewerName), workspaceId: text(payload.workspaceId) } : {}),
    answer: normalizeAnswer(payload?.answer),
    correction: payload?.correction ?? null,
    notes: text(payload?.notes),
    durationMs: payload?.durationMs === undefined || payload?.durationMs === null ? null : Number(payload.durationMs),
    clientGeneratedAt: text(payload?.clientGeneratedAt) || null,
    serverReceivedAt,
    sourceKey: text(options.sourceKey),
  };
}

export function reviewedCardIdsForReviewer(results, reviewer) {
  const reviewed = new Set();
  const reviewerName = normalizeReviewer(reviewer);
  for (const result of results) {
    if (normalizeReviewer(result.reviewer) === reviewerName && text(result.cardId)) {
      reviewed.add(text(result.cardId));
    }
  }
  return reviewed;
}

export function summarizeEvalBatch(cards, results, options = {}) {
  const reviewer = normalizeReviewer(options.reviewer);
  const batchId = batchIdFrom(options);
  const reviewed = reviewedCardIdsForReviewer(results, reviewer);
  const byPriority = {};
  for (const card of cards) {
    const priority = text(card.priority, 'medium');
    byPriority[priority] ??= { total: 0, reviewed: 0, pending: 0 };
    byPriority[priority].total += 1;
    if (reviewed.has(text(card.cardId))) byPriority[priority].reviewed += 1;
    else byPriority[priority].pending += 1;
  }
  const reviewerResults = results.filter((result) => normalizeReviewer(result.reviewer) === reviewer);
  const lastReviewedAt = reviewerResults
    .map((result) => text(result.serverReceivedAt || result.receivedAt))
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  return {
    batchId,
    runId: batchId,
    reviewer,
    totalCards: cards.length,
    reviewedCards: reviewed.size,
    pendingCards: Math.max(0, cards.length - reviewed.size),
    totalResultRows: results.length,
    lastReviewedAt,
    byPriority,
  };
}

export function summarizeEvalRun(cards, results, options = {}) {
  return summarizeEvalBatch(cards, results, options);
}
