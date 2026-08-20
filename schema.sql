-- Measurement submissions. This table is a queue, not the catalogue.
--
-- A row here is one person's month, which is a sample of one. Figures move into
-- data/providers/ by pull request once several independent submissions agree,
-- so the review step is deliberate rather than a bottleneck to remove later.

CREATE TABLE IF NOT EXISTS measurements (
  id            TEXT PRIMARY KEY,
  plan_id       TEXT NOT NULL,
  agent         TEXT NOT NULL,          -- claude-code | codex
  window_hours  REAL,                   -- the metering window measured
  days          INTEGER NOT NULL,
  turns         INTEGER NOT NULL,
  active_windows INTEGER,

  -- Priced at the vendor's own list API rates, in USD.
  usd_total     REAL NOT NULL,
  usd_window_median REAL,
  usd_window_p90    REAL,
  usd_window_max    REAL,

  tokens_input      INTEGER NOT NULL DEFAULT 0,
  tokens_cache_write INTEGER NOT NULL DEFAULT 0,
  tokens_cache_read  INTEGER NOT NULL DEFAULT 0,
  tokens_output     INTEGER NOT NULL DEFAULT 0,

  -- Did the submitter actually reach the cap? A submitter who never hits the
  -- limit measures a floor, so this decides whether the row can inform a ceiling.
  hit_cap       TEXT,                   -- yes | no | unsure
  models_json   TEXT,                   -- per-model token breakdown
  probe_version TEXT,
  note          TEXT,

  received_at   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'  -- pending | accepted | rejected
);

CREATE INDEX IF NOT EXISTS idx_measurements_plan ON measurements(plan_id, status);
CREATE INDEX IF NOT EXISTS idx_measurements_received ON measurements(received_at);
