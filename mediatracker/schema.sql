-- Mediatracker SQLite schema. Idempotent: safe to run repeatedly.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS mentions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    url             TEXT    NOT NULL UNIQUE,
    title           TEXT    NOT NULL,
    source_type     TEXT    NOT NULL,   -- 'google_news' | 'trade_press'
    source_name     TEXT    NOT NULL,   -- e.g. 'Google News (en)', 'Undercurrent News'
    feed_query      TEXT,               -- the query string or feed slug that surfaced it
    matched_keyword TEXT,               -- 'BioMar' | 'Schouw' | exec name | etc.
    language        TEXT,               -- 'en' | 'da' | 'no' | 'es' | NULL if unknown
    author          TEXT,
    published_at    TEXT,               -- ISO 8601 UTC, may be NULL
    fetched_at      TEXT    NOT NULL,   -- ISO 8601 UTC
    summary         TEXT,               -- RSS-provided summary/description
    raw_entry       TEXT,               -- full RSS entry serialized as JSON
    processed       INTEGER NOT NULL DEFAULT 0, -- 0 = needs analysis, 1 = analyzed
    cluster_id      INTEGER             -- populated in Phase 3
);

CREATE INDEX IF NOT EXISTS idx_mentions_published    ON mentions(published_at);
CREATE INDEX IF NOT EXISTS idx_mentions_processed    ON mentions(processed);
CREATE INDEX IF NOT EXISTS idx_mentions_cluster      ON mentions(cluster_id);
CREATE INDEX IF NOT EXISTS idx_mentions_source_type  ON mentions(source_type);

CREATE TABLE IF NOT EXISTS analyses (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    mention_id             INTEGER NOT NULL UNIQUE REFERENCES mentions(id) ON DELETE CASCADE,
    is_about_target_brand  INTEGER NOT NULL DEFAULT 1, -- 0 = wrong namesake, 1 = real BioMar
    sentiment              TEXT,        -- 'positive' | 'neutral' | 'negative'
    sentiment_confidence   REAL,
    prominence           TEXT,        -- 'primary' | 'secondary' | 'passing'
    angle                TEXT,
    key_claims           TEXT,        -- JSON array
    people_quoted        TEXT,        -- JSON array of {name, affiliation, quote_summary}
    risk_flags           TEXT,        -- JSON array
    summary              TEXT,
    model                TEXT,
    input_tokens         INTEGER,
    output_tokens        INTEGER,
    cost_usd             REAL,
    created_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analyses_sentiment ON analyses(sentiment);

-- Cost / call ledger. One row per Anthropic API call (success or failure).
CREATE TABLE IF NOT EXISTS api_calls (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at             TEXT NOT NULL,
    model                  TEXT NOT NULL,
    purpose                TEXT NOT NULL,   -- 'analysis' | 'report' | 'embedding' | etc.
    input_tokens           INTEGER,
    output_tokens          INTEGER,
    cache_read_tokens      INTEGER,
    cache_creation_tokens  INTEGER,
    cost_usd               REAL,
    mention_id             INTEGER,
    ok                     INTEGER NOT NULL,
    error                  TEXT
);

-- Stories table is added in Phase 3. Reserved here for visibility.
-- CREATE TABLE stories (...)
