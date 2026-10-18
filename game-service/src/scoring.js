const ANSWERS = new Set(['yes', 'no', 'unsure', 'bad_question', 'skip']);

const BASE_REWARDS = {
  yes: { xp: 10, gold: 3 },
  no: { xp: 10, gold: 3 },
  unsure: { xp: 6, gold: 1 },
  bad_question: { xp: 8, gold: 1 },
  skip: { xp: 2, gold: 0 },
};

const RANKS = [
  { title: 'Page', minXp: 0, nextXp: 250 },
  { title: 'Squire', minXp: 250, nextXp: 1000 },
  { title: 'Knight', minXp: 1000, nextXp: 3000 },
  { title: 'Guild Scribe', minXp: 3000, nextXp: null },
];

export function normalizeReviewer(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned || 'anonymous';
}

export function normalizeAnswer(value) {
  const answer = String(value ?? '').trim().toLowerCase();
  if (!ANSWERS.has(answer)) {
    throw new Error(`Invalid answer: ${answer || '(empty)'}`);
  }
  return answer;
}

export function activeDay(date = new Date()) {
  const actual = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(actual.getTime())) return activeDay(new Date());
  return actual.toISOString().slice(0, 10);
}

export function occurredAtForVerdict(event = {}, fallbackDate = new Date()) {
  const rawValue = event.clientGeneratedAt ?? event.occurredAt;
  const candidate = rawValue instanceof Date
    ? rawValue
    : new Date(String(rawValue ?? '').trim());
  if (!Number.isNaN(candidate.getTime())) return candidate.toISOString();

  const fallback = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString();
  return new Date().toISOString();
}

export function nextStreak(lastActiveDay, currentDay = activeDay(), currentStreak = 0) {
  if (!lastActiveDay) return 1;
  if (lastActiveDay === currentDay) return Math.max(1, Number(currentStreak) || 1);
  const yesterday = new Date(`${currentDay}T00:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return lastActiveDay === activeDay(yesterday)
    ? Math.max(1, (Number(currentStreak) || 0) + 1)
    : 1;
}

export function confidenceBonus(confidence) {
  if (confidence === null || confidence === undefined || confidence === '') return 0;
  const value = Number(confidence);
  if (!Number.isFinite(value)) return 0;
  if (value < 0.35) return 5;
  if (value < 0.65) return 2;
  return 0;
}

export function effectiveConfidence(event = {}) {
  const rawValue = event.confidence ?? event.card?.confidence;
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function effectivePriority(event = {}) {
  return event.priority ?? event.card?.priority ?? '';
}

export function priorityBonus(priority) {
  switch (String(priority ?? '').trim().toLowerCase()) {
  case 'high': return 4;
  case 'medium': return 2;
  default: return 0;
  }
}

export function hasCorrection(correction) {
  if (!correction || typeof correction !== 'object') return false;
  if (String(correction.correctAnswer ?? '').trim()) return true;
  return Array.isArray(correction.reasonTags)
    && correction.reasonTags.some((tag) => String(tag ?? '').trim());
}

export function scoreVerdict(event = {}) {
  const answer = normalizeAnswer(event.answer);
  const base = BASE_REWARDS[answer];
  const correction = answer === 'no' && hasCorrection(event.correction);
  const xp = base.xp
    + priorityBonus(effectivePriority(event))
    + confidenceBonus(effectiveConfidence(event))
    + (correction ? 8 : 0);
  const gold = base.gold + (correction ? 2 : 0);
  return {
    answer,
    xp,
    gold,
    correction,
  };
}

export function rankForXp(xpValue) {
  const xp = Number(xpValue) || 0;
  return [...RANKS].reverse().find((rank) => xp >= rank.minXp) ?? RANKS[0];
}

export function rankProgress(xpValue) {
  const xp = Number(xpValue) || 0;
  const rank = rankForXp(xp);
  if (rank.nextXp === null) return 1;
  return Math.max(0, Math.min(1, (xp - rank.minXp) / (rank.nextXp - rank.minXp)));
}

export function dailyQuests(profile = {}) {
  const verdictsToday = Number(profile.verdictsToday ?? 0) || 0;
  const correctionsToday = Number(profile.correctionsToday ?? 0) || 0;
  const lowConfidenceToday = Number(profile.lowConfidenceToday ?? 0) || 0;
  return [
    {
      key: 'torch_lit',
      title: 'Keep the torch lit',
      detail: 'Judge 10 claims today',
      progress: Math.min(verdictsToday, 10),
      target: 10,
      complete: verdictsToday >= 10,
    },
    {
      key: 'dungeon_of_doubt',
      title: 'Dungeon of Doubt',
      detail: 'Judge 5 low-confidence claims',
      progress: Math.min(lowConfidenceToday, 5),
      target: 5,
      complete: lowConfidenceToday >= 5,
    },
    {
      key: 'scribe_truth',
      title: 'Scribe the Truth',
      detail: 'Correct 3 wrong claims',
      progress: Math.min(correctionsToday, 3),
      target: 3,
      complete: correctionsToday >= 3,
    },
  ];
}

export function publicProfile(row = {}) {
  const xp = Number(row.xp ?? 0) || 0;
  const rank = rankForXp(xp);
  return {
    reviewer: row.displayName ?? row.reviewerKey ?? 'anonymous',
    reviewerKey: row.reviewerKey ?? 'anonymous',
    rank: rank.title,
    rankProgress: rankProgress(xp),
    xp,
    gold: Number(row.gold ?? 0) || 0,
    streakDays: Number(row.streakDays ?? 0) || 0,
    totalVerdicts: Number(row.totalVerdicts ?? 0) || 0,
    correctionCount: Number(row.correctionCount ?? 0) || 0,
    answerCounts: {
      yes: Number(row.yesCount ?? 0) || 0,
      no: Number(row.noCount ?? 0) || 0,
      unsure: Number(row.unsureCount ?? 0) || 0,
      badQuestion: Number(row.badQuestionCount ?? 0) || 0,
      skip: Number(row.skipCount ?? 0) || 0,
    },
    today: {
      verdicts: Number(row.verdictsToday ?? 0) || 0,
      corrections: Number(row.correctionsToday ?? 0) || 0,
      lowConfidence: Number(row.lowConfidenceToday ?? 0) || 0,
    },
    dailyQuests: dailyQuests(row),
    updatedAt: row.updatedAt ?? null,
  };
}

export function eventIdForVerdict(event = {}) {
  const reviewer = normalizeReviewer(event.reviewer).toLowerCase();
  const cardId = String(event.cardId ?? '').trim();
  const generatedAt = String(event.clientGeneratedAt ?? event.occurredAt ?? '').trim();
  if (!cardId) throw new Error('Missing cardId.');
  return String(event.eventId ?? '').trim() || `${reviewer}:${cardId}:${generatedAt || 'unspecified-time'}`;
}

export function validateVerdictEvent(event = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('Verdict event must be an object.');
  }
  normalizeAnswer(event.answer);
  if (!String(event.cardId ?? '').trim()) throw new Error('Missing cardId.');
  if (event.durationMs !== null && event.durationMs !== undefined) {
    const duration = Number(event.durationMs);
    if (!Number.isFinite(duration) || duration < 0) throw new Error('Invalid durationMs.');
  }
  const confidence = effectiveConfidence(event);
  if (confidence !== null) {
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Invalid confidence.');
  }
  if (event.correction !== null && event.correction !== undefined && typeof event.correction !== 'object') {
    throw new Error('Invalid correction.');
  }
  return true;
}
