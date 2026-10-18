import {
  activeDay,
  effectiveConfidence,
  eventIdForVerdict,
  nextStreak,
  occurredAtForVerdict,
  normalizeAnswer,
  normalizeReviewer,
  publicProfile,
  scoreVerdict,
  validateVerdictEvent,
} from './scoring.js';

function blankProgress(reviewer) {
  return {
    reviewerKey: normalizeReviewer(reviewer).toLowerCase(),
    displayName: normalizeReviewer(reviewer),
    xp: 0,
    gold: 0,
    streakDays: 0,
    totalVerdicts: 0,
    correctionCount: 0,
    yesCount: 0,
    noCount: 0,
    unsureCount: 0,
    badQuestionCount: 0,
    skipCount: 0,
    verdictsToday: 0,
    correctionsToday: 0,
    lowConfidenceToday: 0,
    updatedAt: null,
    lastActiveDay: null,
  };
}

export function createMemoryStore() {
  const profiles = new Map();
  const events = new Set();

  function profileFor(reviewer) {
    const key = normalizeReviewer(reviewer).toLowerCase();
    if (!profiles.has(key)) profiles.set(key, blankProgress(reviewer));
    return profiles.get(key);
  }

  return {
    async health() {
      return { ok: true, database: 'memory' };
    },

    async getProfile(reviewer) {
      return publicProfile(profileFor(reviewer));
    },

    async recordVerdict(event) {
      validateVerdictEvent(event);
      const profile = profileFor(event.reviewer);
      const eventId = eventIdForVerdict(event);
      if (events.has(eventId)) {
        return { duplicate: true, eventId, awarded: { xp: 0, gold: 0 }, profile: publicProfile(profile) };
      }
      events.add(eventId);
      const answer = normalizeAnswer(event.answer);
      const score = scoreVerdict(event);
      const occurredAt = occurredAtForVerdict(event);
      const day = activeDay(occurredAt);
      profile.xp += score.xp;
      profile.gold += score.gold;
      profile.streakDays = nextStreak(profile.lastActiveDay, day, profile.streakDays);
      profile.lastActiveDay = day;
      profile.totalVerdicts += 1;
      profile.verdictsToday += day === activeDay() ? 1 : 0;
      profile.correctionCount += score.correction ? 1 : 0;
      profile.correctionsToday += score.correction && day === activeDay() ? 1 : 0;
      const confidence = effectiveConfidence(event);
      profile.lowConfidenceToday += confidence !== null && confidence < 0.65 && day === activeDay() ? 1 : 0;
      profile.updatedAt = new Date().toISOString();
      if (answer === 'bad_question') profile.badQuestionCount += 1;
      else profile[`${answer}Count`] += 1;
      return { duplicate: false, eventId, awarded: { xp: score.xp, gold: score.gold }, profile: publicProfile(profile) };
    },

    async leaderboard(limit = 25) {
      return [...profiles.values()]
        .sort((a, b) => b.xp - a.xp || b.gold - a.gold || b.totalVerdicts - a.totalVerdicts || a.displayName.localeCompare(b.displayName))
        .slice(0, Math.max(1, Math.min(100, Number(limit) || 25)))
        .map((profile, index) => ({ place: index + 1, ...publicProfile(profile) }));
    },
  };
}
