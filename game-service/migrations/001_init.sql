CREATE TABLE IF NOT EXISTS reviewers (
  id BIGSERIAL PRIMARY KEY,
  reviewer_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviewer_progress (
  reviewer_id BIGINT PRIMARY KEY REFERENCES reviewers(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0,
  gold INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_active_day DATE,
  total_verdicts INTEGER NOT NULL DEFAULT 0,
  correction_count INTEGER NOT NULL DEFAULT 0,
  yes_count INTEGER NOT NULL DEFAULT 0,
  no_count INTEGER NOT NULL DEFAULT 0,
  unsure_count INTEGER NOT NULL DEFAULT 0,
  bad_question_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verdict_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  reviewer_id BIGINT NOT NULL REFERENCES reviewers(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  answer TEXT NOT NULL CHECK (answer IN ('yes', 'no', 'unsure', 'bad_question', 'skip')),
  source_key TEXT NOT NULL DEFAULT '',
  claim_template TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT '',
  confidence NUMERIC CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  correction_present BOOLEAN NOT NULL DEFAULT false,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  gold_awarded INTEGER NOT NULL DEFAULT 0 CHECK (gold_awarded >= 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_day DATE NOT NULL DEFAULT CURRENT_DATE,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verdict_events_reviewer_day_idx
  ON verdict_events (reviewer_id, active_day);

CREATE INDEX IF NOT EXISTS reviewer_progress_leaderboard_idx
  ON reviewer_progress (xp DESC, gold DESC, total_verdicts DESC);
