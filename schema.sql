-- Measurement submissions. This table is a queue, not the catalogue.
--
-- A row here is one person's month, which is a sample of one. Figures move into
-- data/providers/ by pull request once several independent submissions agree,
-- so the review step is deliberate rather than a bottleneck to remove later.

CREATE TABLE IF NOT EXISTS measurements (
  id            TEXT PRIMARY KEY,
  plan_id       TEXT NOT NULL,
  agent         TEXT NOT NULL,          -- claude-code | codex | grok-cli
  window_hours  REAL,
  days          INTEGER NOT NULL,
  turns         INTEGER NOT NULL,
  active_windows INTEGER,

  usd_total     REAL NOT NULL,
  usd_window_median REAL,
  usd_window_p90    REAL,
  usd_window_max    REAL,

  tokens_input      INTEGER NOT NULL DEFAULT 0,
  tokens_cache_write INTEGER NOT NULL DEFAULT 0,
  tokens_cache_read  INTEGER NOT NULL DEFAULT 0,
  tokens_output     INTEGER NOT NULL DEFAULT 0,

  hit_cap       TEXT,                   -- yes | no | unsure
  models_json   TEXT,
  probe_version TEXT,
  note          TEXT,

  received_at   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_measurements_plan ON measurements(plan_id, status);
CREATE INDEX IF NOT EXISTS idx_measurements_received ON measurements(received_at);

-- Visits. Aggregate counters only, no per-request log and no cookie.
--
-- The unique key is a daily salted hash of IP and user agent. It cannot be
-- reversed to an address, it cannot be joined across days, and it is stored as
-- a count rather than a row per person. That is enough to answer "how many
-- people" without holding anything worth leaking.
CREATE TABLE IF NOT EXISTS visits (
  day       TEXT NOT NULL,
  path      TEXT NOT NULL,
  country   TEXT NOT NULL DEFAULT '??',
  referrer  TEXT NOT NULL DEFAULT '',
  hits      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path, country, referrer)
);

CREATE TABLE IF NOT EXISTS visitors_daily (
  day     TEXT NOT NULL,
  visitor TEXT NOT NULL,               -- daily salted hash, not reversible
  PRIMARY KEY (day, visitor)
);

CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day);

-- Requests. What people want added, corrected or built.
CREATE TABLE IF NOT EXISTS requests (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,            -- vendor | plan | correction | feature
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  source_url TEXT,                     -- a first-party link, if they have one
  votes      INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'open',   -- open | done | declined
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status, votes DESC);

CREATE TABLE IF NOT EXISTS request_votes (
  request_id TEXT NOT NULL,
  voter      TEXT NOT NULL,            -- same daily hash, one vote per person per day
  PRIMARY KEY (request_id, voter)
);

-- Donations, recorded only so the site can show a running total. No name, no
-- email, no card data: Stripe holds all of that and this holds none of it.
CREATE TABLE IF NOT EXISTS donations (
  id         TEXT PRIMARY KEY,         -- stripe payment intent id
  amount     INTEGER NOT NULL,         -- minor units
  currency   TEXT NOT NULL,
  status     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
