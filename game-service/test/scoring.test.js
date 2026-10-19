import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dailyQuests,
  nextStreak,
  occurredAtForVerdict,
  rankForXp,
  rankProgress,
  scoreVerdict,
  validateVerdictEvent,
} from '../src/scoring.js';

test('a correction receives participation rewards without a correctness bonus', () => {
  const score = scoreVerdict({
    answer: 'no',
    correction: { correctAnswer: 'Charging cable', reasonTags: ['wrong_item'] },
    priority: 'high',
    confidence: 0.2,
  });

  assert.deepEqual(score, {
    answer: 'no',
    xp: 5,
    gold: 1,
    correction: true,
  });
});

test('scoreVerdict matches the iOS local reward fixtures', () => {
  const fixtures = [
    { event: { answer: 'yes', priority: 'high', confidence: 0.2 }, expected: { answer: 'yes', xp: 5, gold: 1, correction: false } },
    { event: { answer: 'yes', priority: 'medium', confidence: 0.5 }, expected: { answer: 'yes', xp: 5, gold: 1, correction: false } },
    { event: { answer: 'yes', priority: 'low', confidence: 0.65 }, expected: { answer: 'yes', xp: 5, gold: 1, correction: false } },
    { event: { answer: 'no', correction: { correctAnswer: 'Charging cable', reasonTags: ['wrong_item'] }, priority: 'high', confidence: 0.2 }, expected: { answer: 'no', xp: 5, gold: 1, correction: true } },
    { event: { answer: 'no', correction: { correctAnswer: '  ', reasonTags: ['wrong_item'] }, priority: 'medium' }, expected: { answer: 'no', xp: 5, gold: 1, correction: true } },
    { event: { answer: 'no', correction: { correctAnswer: '  ', reasonTags: ['  '] }, priority: 'low', confidence: 0.9 }, expected: { answer: 'no', xp: 5, gold: 1, correction: false } },
    { event: { answer: 'unsure', confidence: 0.34 }, expected: { answer: 'unsure', xp: 5, gold: 1, correction: false } },
    { event: { answer: 'bad_question', priority: 'medium', confidence: 0.5 }, expected: { answer: 'bad_question', xp: 5, gold: 1, correction: false } },
    { event: { answer: 'skip' }, expected: { answer: 'skip', xp: 0, gold: 0, correction: false } },
    { event: { answer: 'skip', priority: 'high', confidence: 0.2 }, expected: { answer: 'skip', xp: 0, gold: 0, correction: false } },
  ];

  for (const fixture of fixtures) {
    assert.deepEqual(scoreVerdict(fixture.event), fixture.expected);
  }
});

test('model priority and confidence do not increase participation rewards', () => {
  const score = scoreVerdict({
    answer: 'yes',
    card: {
      priority: 'high',
      confidence: 0.2,
    },
  });

  assert.deepEqual(score, {
    answer: 'yes',
    xp: 5,
    gold: 1,
    correction: false,
  });
});

test('validateVerdictEvent rejects invalid card fallback confidence', () => {
  assert.throws(
    () => validateVerdictEvent({
      reviewer: 'Davide',
      cardId: 'card-1',
      answer: 'yes',
      card: { confidence: 4 },
    }),
    /Invalid confidence/,
  );
});

test('occurredAtForVerdict normalizes valid timestamps and falls back from malformed values', () => {
  assert.equal(
    occurredAtForVerdict({ clientGeneratedAt: '2026-06-23T20:00:00-04:00' }),
    '2026-06-24T00:00:00.000Z',
  );
  assert.equal(
    occurredAtForVerdict({ clientGeneratedAt: 'not-a-date' }, new Date('2026-06-23T12:34:56.000Z')),
    '2026-06-23T12:34:56.000Z',
  );
});

test('nextStreak increments consecutive days and resets gaps', () => {
  assert.equal(nextStreak('', '2026-06-23', 0), 1);
  assert.equal(nextStreak('2026-06-22', '2026-06-23', 4), 5);
  assert.equal(nextStreak('2026-06-21', '2026-06-23', 4), 1);
  assert.equal(nextStreak('2026-06-23', '2026-06-23', 4), 4);
});

test('rank helpers expose rank title and progress', () => {
  assert.equal(rankForXp(0).title, 'Page');
  assert.equal(rankForXp(250).title, 'Squire');
  assert.equal(rankForXp(1000).title, 'Knight');
  assert.equal(rankForXp(3000).title, 'Guild Scribe');
  assert.equal(rankProgress(125), 0.5);
});

test('dailyQuests calculates progress caps', () => {
  const quests = dailyQuests({
    verdictsToday: 12,
    correctionsToday: 1,
    lowConfidenceToday: 8,
  });

  assert.deepEqual(quests.map((quest) => [quest.key, quest.progress, quest.complete]), [
    ['torch_lit', 10, true],
    ['dungeon_of_doubt', 5, true],
    ['careful_review', 5, true],
  ]);
});
