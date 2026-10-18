import {
  activeDay,
  effectiveConfidence,
  effectivePriority,
  eventIdForVerdict,
  nextStreak,
  occurredAtForVerdict,
  normalizeAnswer,
  normalizeReviewer,
  publicProfile,
  scoreVerdict,
  validateVerdictEvent,
} from './scoring.js';

function reviewerKey(reviewer) {
  return normalizeReviewer(reviewer).toLowerCase();
}

function toProfileRow(row = {}) {
  return {
    reviewerKey: row.reviewer_key,
    displayName: row.display_name,
    xp: row.xp,
    gold: row.gold,
    streakDays: row.streak_days,
    totalVerdicts: row.total_verdicts,
    correctionCount: row.correction_count,
    yesCount: row.yes_count,
    noCount: row.no_count,
    unsureCount: row.unsure_count,
    badQuestionCount: row.bad_question_count,
    skipCount: row.skip_count,
    verdictsToday: row.verdicts_today,
    correctionsToday: row.corrections_today,
    lowConfidenceToday: row.low_confidence_today,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at ?? null,
  };
}

export function createPostgresStore(pool) {
  async function ensureReviewer(client, reviewer) {
    const displayName = normalizeReviewer(reviewer);
    const key = reviewerKey(displayName);
    const result = await client.query(
      `INSERT INTO reviewers (reviewer_key, display_name)
       VALUES ($1, $2)
       ON CONFLICT (reviewer_key)
       DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
       RETURNING id, reviewer_key, display_name`,
      [key, displayName],
    );
    await client.query(
      `INSERT INTO reviewer_progress (reviewer_id)
       VALUES ($1)
       ON CONFLICT (reviewer_id) DO NOTHING`,
      [result.rows[0].id],
    );
    return result.rows[0];
  }

  async function profileByReviewerKey(client, key) {
    const today = activeDay();
    const result = await client.query(
      `SELECT
         r.reviewer_key,
         r.display_name,
         p.xp,
         p.gold,
         p.streak_days,
         p.total_verdicts,
         p.correction_count,
         p.yes_count,
         p.no_count,
         p.unsure_count,
         p.bad_question_count,
         p.skip_count,
         p.updated_at,
         COALESCE(today.verdicts_today, 0) AS verdicts_today,
         COALESCE(today.corrections_today, 0) AS corrections_today,
         COALESCE(today.low_confidence_today, 0) AS low_confidence_today
       FROM reviewers r
       JOIN reviewer_progress p ON p.reviewer_id = r.id
       LEFT JOIN (
         SELECT
           reviewer_id,
           COUNT(*)::int AS verdicts_today,
           COUNT(*) FILTER (WHERE correction_present)::int AS corrections_today,
           COUNT(*) FILTER (WHERE confidence IS NOT NULL AND confidence < 0.65)::int AS low_confidence_today
         FROM verdict_events
         WHERE active_day = $2::date
         GROUP BY reviewer_id
       ) today ON today.reviewer_id = r.id
       WHERE r.reviewer_key = $1`,
      [key, today],
    );
    return result.rows[0] ? publicProfile(toProfileRow(result.rows[0])) : null;
  }

  return {
    async health() {
      await pool.query('SELECT 1');
      return { ok: true, database: 'reachable' };
    },

    async getProfile(reviewer) {
      const client = await pool.connect();
      try {
        const ensured = await ensureReviewer(client, reviewer);
        return await profileByReviewerKey(client, ensured.reviewer_key);
      } finally {
        client.release();
      }
    },

    async recordVerdict(event) {
      validateVerdictEvent(event);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const reviewer = await ensureReviewer(client, event.reviewer);
        const answer = normalizeAnswer(event.answer);
        const score = scoreVerdict(event);
        const eventId = eventIdForVerdict(event);
        const occurredAt = occurredAtForVerdict(event);
        const day = activeDay(occurredAt);
        const cardId = String(event.cardId ?? '').trim();
        const insert = await client.query(
          `INSERT INTO verdict_events (
             event_id,
             reviewer_id,
             card_id,
             answer,
             source_key,
             claim_template,
             priority,
             confidence,
             correction_present,
             duration_ms,
             xp_awarded,
             gold_awarded,
             occurred_at,
             active_day,
             raw_payload
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::timestamptz, $14::date, $15::jsonb)
           ON CONFLICT (event_id) DO NOTHING
           RETURNING id`,
          [
            eventId,
            reviewer.id,
            cardId,
            answer,
            String(event.sourceKey ?? event.card?.sourceKey ?? ''),
            String(event.claimTemplate ?? event.card?.claimTemplate ?? ''),
            String(effectivePriority(event)),
            effectiveConfidence(event),
            score.correction,
            Number.isFinite(Number(event.durationMs)) ? Math.trunc(Number(event.durationMs)) : null,
            score.xp,
            score.gold,
            occurredAt,
            day,
            JSON.stringify(event),
          ],
        );
        const duplicate = insert.rowCount === 0;
        if (!duplicate) {
          const progressResult = await client.query(
            'SELECT * FROM reviewer_progress WHERE reviewer_id = $1 FOR UPDATE',
            [reviewer.id],
          );
          const progress = progressResult.rows[0];
          const streak = nextStreak(
            progress.last_active_day?.toISOString?.().slice(0, 10) ?? progress.last_active_day,
            day,
            progress.streak_days,
          );
          await client.query(
            `UPDATE reviewer_progress
             SET
               xp = xp + $2,
               gold = gold + $3,
               streak_days = $4,
               last_active_day = $5::date,
               total_verdicts = total_verdicts + 1,
               correction_count = correction_count + $6,
               yes_count = yes_count + $7,
               no_count = no_count + $8,
               unsure_count = unsure_count + $9,
               bad_question_count = bad_question_count + $10,
               skip_count = skip_count + $11,
               updated_at = now()
             WHERE reviewer_id = $1`,
            [
              reviewer.id,
              score.xp,
              score.gold,
              streak,
              day,
              score.correction ? 1 : 0,
              answer === 'yes' ? 1 : 0,
              answer === 'no' ? 1 : 0,
              answer === 'unsure' ? 1 : 0,
              answer === 'bad_question' ? 1 : 0,
              answer === 'skip' ? 1 : 0,
            ],
          );
        }
        const profile = await profileByReviewerKey(client, reviewer.reviewer_key);
        await client.query('COMMIT');
        return { duplicate, eventId, awarded: duplicate ? { xp: 0, gold: 0 } : { xp: score.xp, gold: score.gold }, profile };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async leaderboard(limit = 25) {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
      const today = activeDay();
      const result = await pool.query(
        `SELECT
           r.reviewer_key,
           r.display_name,
           p.xp,
           p.gold,
           p.streak_days,
           p.total_verdicts,
           p.correction_count,
           p.yes_count,
           p.no_count,
           p.unsure_count,
           p.bad_question_count,
           p.skip_count,
           p.updated_at,
           COALESCE(today.verdicts_today, 0) AS verdicts_today,
           COALESCE(today.corrections_today, 0) AS corrections_today,
           COALESCE(today.low_confidence_today, 0) AS low_confidence_today
         FROM reviewers r
         JOIN reviewer_progress p ON p.reviewer_id = r.id
         LEFT JOIN (
           SELECT
             reviewer_id,
             COUNT(*)::int AS verdicts_today,
             COUNT(*) FILTER (WHERE correction_present)::int AS corrections_today,
             COUNT(*) FILTER (WHERE confidence IS NOT NULL AND confidence < 0.65)::int AS low_confidence_today
           FROM verdict_events
           WHERE active_day = $2::date
           GROUP BY reviewer_id
         ) today ON today.reviewer_id = r.id
         ORDER BY p.xp DESC, p.gold DESC, p.total_verdicts DESC, r.display_name ASC
         LIMIT $1`,
        [safeLimit, today],
      );
      return result.rows.map((row, index) => ({
        place: index + 1,
        ...publicProfile(toProfileRow(row)),
      }));
    },
  };
}
