# mediatracker

Media monitoring tool for tracking mentions of **BioMar** (and parent
**Schouw & Co**) across news and trade press, with AI-assisted analysis and
scheduled reporting.

This is a phased build. Phases 1–5 are listed below; only Phase 1 is
implemented so far.

## Phases

| Phase | What | Status |
| ----- | ---- | ------ |
| 1 | Scaffolding, SQLite schema, RSS ingestion (Google News + trade press) | done |
| 2 | Per-article AI analysis (Haiku 4.5, structured output) | pending |
| 3 | Story clustering / dedup across syndicated pickups | pending |
| 4 | Next.js dashboard | pending |
| 5 | Scheduled email digests (Sonnet 4.6) | pending |

## What's in here

```
mediatracker/
├── mediatracker/          Python package
│   ├── config.py          .env loading
│   ├── db.py              SQLite connect / schema init
│   ├── schema.sql         mentions, analyses, api_calls
│   ├── feeds.py           keywords + feed registry (edit me)
│   ├── ingest.py          `python -m mediatracker.ingest`
│   └── sources/
│       ├── base.py        RawMention dataclass
│       ├── rss.py         generic RSS / Atom fetcher (httpx + feedparser)
│       └── google_news.py Google News URL builder
├── pyproject.toml
├── .env.example
└── README.md
```

The SQLite file lives at `data/mediatracker.db` (configurable via
`MEDIATRACKER_DB`). The whole `data/` directory is gitignored.

## Setup

Requires Python 3.11+.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
# edit .env — Anthropic key not strictly needed yet, but add it now
```

## Phase 1: ingestion

Run:

```bash
python -m mediatracker.ingest
```

What this does:

1. Creates `data/mediatracker.db` and applies the schema if needed.
2. For each feed in `mediatracker/feeds.py`:
   - **Google News**: builds an RSS query URL per locale (en/da/no/es) for
     each keyword group (BioMar primary, Schouw parent, named execs).
   - **Trade press**: fetches direct RSS from IntraFish, Undercurrent News,
     SalmonBusiness, Fish Farming Expert, and Hatchery International, then
     filters client-side to keep only items mentioning brand keywords.
3. Applies a noise filter that drops `biomarker` / `biomarkers` /
   `bio-marine` false positives even if they slipped through the search query.
4. Inserts new entries into `mentions`. Dedupe is on `url` UNIQUE — running
   twice is safe.

### Tuning what's tracked

Edit `mediatracker/feeds.py`:

- `PRIMARY_VARIATIONS`, `PRIMARY_EXCLUDE` — BioMar variants and noise terms
- `PARENT_VARIATIONS` — Schouw & Co variants
- `EXEC_QUERIES` — named executives; `context` AND-ANDs a brand term to
  disambiguate common names (e.g. "Carlos Diaz" AND "BioMar")
- `GOOGLE_NEWS_LOCALES` — add or drop language/country pairs
- `TRADE_PRESS_FEEDS` — RSS URLs and per-feed keyword filters

> **Trade press URLs** are best-effort defaults. If a feed 404s the ingest
> logs a warning and continues. Verify URLs at first run and update.

### CLI flags

```bash
python -m mediatracker.ingest --only google_news    # debug a single source type
python -m mediatracker.ingest --only trade_press
python -m mediatracker.ingest -v                    # debug logging
```

### Inspecting the DB

```bash
sqlite3 data/mediatracker.db
sqlite> SELECT source_name, language, COUNT(*) FROM mentions
        GROUP BY source_name, language;
sqlite> SELECT title, url FROM mentions ORDER BY fetched_at DESC LIMIT 20;
```

## Schema (Phase 1)

- `mentions` — raw RSS entries. `processed=0` means awaiting Phase 2 analysis.
  `cluster_id` is reserved for Phase 3.
- `analyses` — one row per analyzed mention (Phase 2).
- `api_calls` — Anthropic API call ledger for cost tracking (Phase 2+).

See `mediatracker/schema.sql` for full DDL.

## Conventions

- All datetimes stored as ISO 8601 UTC strings.
- All Anthropic API calls (Phase 2+) will go through one wrapper that logs
  to `api_calls`.
- Secrets in `.env`. Never commit credentials.

## Next

Phase 2 (analyzer) is unblocked once Phase 1 has been run a few times and
there's a real corpus to look at. Run ingest a few times over a couple of
days, eyeball the results, then we'll wire up the analyzer and tune the
prompt against ~20 articles before scaling up.
