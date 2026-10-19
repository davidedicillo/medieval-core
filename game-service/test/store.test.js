import assert from 'node:assert/strict';
import test from 'node:test';
import { activeDay } from '../src/scoring.js';
import { createPostgresStore } from '../src/store.js';

test('Postgres leaderboard includes today quest progress', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [{
          reviewer_key: 'davide',
          display_name: 'Davide',
          xp: 320,
          gold: 91,
          streak_days: 4,
          total_verdicts: 28,
          correction_count: 6,
          yes_count: 18,
          no_count: 7,
          unsure_count: 3,
          bad_question_count: 0,
          skip_count: 0,
          updated_at: '2026-06-23T17:00:00.000Z',
          verdicts_today: 10,
          corrections_today: 2,
          low_confidence_today: 5,
        }],
      };
    },
  };

  const leaderboard = await createPostgresStore(pool).leaderboard(10);

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /COUNT\(\*\)::int AS verdicts_today/i);
  assert.match(calls[0].sql, /WHERE active_day = \$2::date/i);
  assert.deepEqual(calls[0].params, [10, activeDay()]);
  assert.equal(leaderboard[0].today.verdicts, 10);
  assert.equal(leaderboard[0].today.corrections, 2);
  assert.equal(leaderboard[0].today.lowConfidence, 5);
  assert.deepEqual(leaderboard[0].dailyQuests.map((quest) => [quest.key, quest.progress]), [
    ['torch_lit', 10],
    ['dungeon_of_doubt', 5],
    ['careful_review', 5],
  ]);
});

test('Postgres verdict insert receives sanitized occurred_at for malformed client timestamps', async () => {
  const calls = [];
  const profileRow = {
    reviewer_key: 'davide',
    display_name: 'Davide',
    xp: 27,
    gold: 5,
    streak_days: 1,
    total_verdicts: 1,
    correction_count: 1,
    yes_count: 0,
    no_count: 1,
    unsure_count: 0,
    bad_question_count: 0,
    skip_count: 0,
    updated_at: '2026-06-23T17:00:00.000Z',
    verdicts_today: 1,
    corrections_today: 1,
    low_confidence_today: 1,
  };
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/INSERT INTO reviewers/i.test(sql)) {
        return { rows: [{ id: 7, reviewer_key: 'davide', display_name: 'Davide' }], rowCount: 1 };
      }
      if (/INSERT INTO verdict_events/i.test(sql)) {
        return { rows: [{ id: 11 }], rowCount: 1 };
      }
      if (/SELECT \* FROM reviewer_progress/i.test(sql)) {
        return { rows: [{ last_active_day: null, streak_days: 0 }], rowCount: 1 };
      }
      if (/FROM reviewers r/i.test(sql)) {
        return { rows: [profileRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    },
  };

  await createPostgresStore(pool).recordVerdict({
    eventId: 'bad-date-event',
    reviewer: 'Davide',
    cardId: 'card-1',
    answer: 'no',
    correction: { correctAnswer: 'Truth', reasonTags: ['wrong_item'] },
    priority: 'high',
    confidence: 0.2,
    clientGeneratedAt: 'not-a-date',
  });

  const verdictInsert = calls.find((call) => /INSERT INTO verdict_events/i.test(call.sql));
  assert.ok(verdictInsert, 'expected verdict insert call');
  const occurredAt = verdictInsert.params[12];
  assert.notEqual(occurredAt, 'not-a-date');
  assert.ok(Number.isFinite(new Date(occurredAt).getTime()), 'occurred_at should be a valid timestamp');
  assert.equal(verdictInsert.params[13], activeDay(occurredAt));
});

test('Postgres verdict insert uses card fallback priority and confidence consistently', async () => {
  const calls = [];
  const profileRow = {
    reviewer_key: 'davide',
    display_name: 'Davide',
    xp: 19,
    gold: 3,
    streak_days: 1,
    total_verdicts: 1,
    correction_count: 0,
    yes_count: 1,
    no_count: 0,
    unsure_count: 0,
    bad_question_count: 0,
    skip_count: 0,
    updated_at: '2026-06-23T17:00:00.000Z',
    verdicts_today: 1,
    corrections_today: 0,
    low_confidence_today: 1,
  };
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/INSERT INTO reviewers/i.test(sql)) {
        return { rows: [{ id: 7, reviewer_key: 'davide', display_name: 'Davide' }], rowCount: 1 };
      }
      if (/INSERT INTO verdict_events/i.test(sql)) {
        return { rows: [{ id: 12 }], rowCount: 1 };
      }
      if (/SELECT \* FROM reviewer_progress/i.test(sql)) {
        return { rows: [{ last_active_day: null, streak_days: 0 }], rowCount: 1 };
      }
      if (/FROM reviewers r/i.test(sql)) {
        return { rows: [profileRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    },
  };

  const result = await createPostgresStore(pool).recordVerdict({
    eventId: 'card-fallback-event',
    reviewer: 'Davide',
    cardId: 'card-2',
    answer: 'yes',
    card: {
      priority: 'high',
      confidence: 0.2,
      sourceKey: 'dailySale:demo',
      claimTemplate: 'component_title_or_label',
    },
    clientGeneratedAt: '2026-06-23T20:00:00.000Z',
  });

  const verdictInsert = calls.find((call) => /INSERT INTO verdict_events/i.test(call.sql));
  assert.ok(verdictInsert, 'expected verdict insert call');
  assert.equal(verdictInsert.params[6], 'high');
  assert.equal(verdictInsert.params[7], 0.2);
  assert.equal(verdictInsert.params[10], 5);
  assert.equal(result.awarded.xp, 5);
});
