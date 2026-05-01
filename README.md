# mediatracker

Media monitoring tool for tracking mentions of **BioMar** (and parent
**Schouw & Co**) across news and trade press, with AI-assisted analysis
and a public dashboard. Designed to run unattended on GitHub Actions —
no laptop, no server, just a repo and an Anthropic API key.

Live dashboard (after first scheduled run):
**https://nerea-clemente.github.io/mediatracker/**

## How it works

```
   ┌──── every 6 hours, in GitHub Actions ────────────────────┐
   │                                                          │
   │  ingest ─▶ analyze ─▶ cluster ─▶ export ─▶ commit ─▶ build │
   │     │         │          │          │                    │
   │   Google    Haiku 4.5  fuzzy-     dashboard/lib/         │
   │   News +   structured  match      seed.json              │
   │   trade    JSON via    on title                          │
   │   press    SDK         + dates                           │
   │                                                          │
   └──── deploys to GitHub Pages ─────────────────────────────┘
```

State (`state/mediatracker.db`) and the dashboard snapshot
(`dashboard/lib/seed.json`) are committed back to the repo on each run,
so the database persists across runs and the static site picks up the
latest data automatically. Runs are idempotent — re-running ingest
doesn't duplicate mentions, re-running the analyzer skips
already-analyzed mentions.

## Phases

| Phase | What | Status |
| ----- | ---- | ------ |
| 1 | RSS ingestion (Google News + trade press) into SQLite | done |
| 2 | Per-article AI analysis (Haiku 4.5, structured output) | done |
| 3 | Story clustering (fuzzy title match within date window) | done |
| 4 | Next.js dashboard, static export to GitHub Pages | done |
| 5 | Scheduled email digests (Sonnet 4.6) | pending |

## What's in here

```
mediatracker/                  Python package
├── config.py                  .env loading
├── db.py                      SQLite connect + schema init
├── schema.sql                 mentions, analyses, api_calls
├── feeds.py                   keywords + feed registry (edit me)
├── ingest.py                  Phase 1 entrypoint
├── cluster.py                 Phase 3 entrypoint
├── export.py                  Phase 4 bridge: SQLite → seed.json
├── sources/                   RSS adapters
│   ├── base.py
│   ├── rss.py                 generic RSS / Atom (httpx + feedparser)
│   └── google_news.py         Google News URL builder
└── analysis/                  Phase 2
    ├── client.py              Anthropic SDK wrapper + cost ledger
    ├── prompts.py             system prompt for the analyzer
    ├── schema.py              Pydantic schema for the JSON output
    └── analyzer.py            Phase 2 entrypoint

dashboard/                     Next.js (App Router) + Tailwind + Recharts
├── app/page.tsx               single-page dashboard
├── components/charts.tsx      volume / sentiment / top-outlets charts
└── lib/
    ├── data.ts                types + dispatch (real seed vs fallback mock)
    └── seed.json              regenerated on every refresh

state/mediatracker.db          committed binary, persisted across runs
tests/test_analysis_schema.py  Pydantic validation tests for the analyzer
.github/workflows/refresh.yml  scheduled job: ingest → analyze → cluster → export → commit → build → deploy
```

## Cloud setup (recommended — no laptop needed)

1. Add `ANTHROPIC_API_KEY` to repo Settings → Secrets and variables → Actions
2. Repo Settings → Pages → Source: **GitHub Actions**
3. Wait for the cron trigger, or hit **Run workflow** under Actions → "Refresh BioMar coverage and deploy"

That's it. The first run takes ~3 minutes (ingest + analyze + build); subsequent runs are usually under 90 s.

### What the run does

- **Ingest** — pulls every feed in `mediatracker/feeds.py` into SQLite. Idempotent on URL.
- **Analyze** — sends each unprocessed mention to `claude-haiku-4-5` with a structured-output schema
  (`mediatracker.analysis.schema.ArticleAnalysis`). Successful analyses are written to the
  `analyses` table; failures are logged in `api_calls` and retried next run.
- **Cluster** — for each unclustered mention, fuzzy-matches its title against the prior
  5 days' clustered mentions with the same matched keyword. Matches above 0.62 join the
  existing cluster; otherwise a new cluster is created.
- **Export** — joins `mentions` + `analyses`, groups by `cluster_id`, writes
  `dashboard/lib/seed.json`.
- **Commit** — pushes `state/mediatracker.db` and `dashboard/lib/seed.json` back to the branch.
- **Build & deploy** — Next.js static export → Pages.

## Cost expectation

Per article: ~800 input + ~250 output tokens on Haiku 4.5 ≈ $0.0021. At BioMar coverage
volume, expect well under **$5/month**. The `api_calls` table logs every call (success
*and* failure) — query for a running total:

```bash
sqlite3 state/mediatracker.db \
  "SELECT printf('%.4f USD', SUM(cost_usd)) FROM api_calls WHERE ok=1;"
```

## Local dev

Optional — only needed if you want to tune the analyzer prompt or feeds offline.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # add ANTHROPIC_API_KEY for analysis

python -m mediatracker.ingest -v
python -m mediatracker.analysis.analyzer --limit 20
python -m mediatracker.cluster
python -m mediatracker.export

cd dashboard && npm install && npm run dev   # http://localhost:3000
```

Local dev uses `data/mediatracker.db` (gitignored) so it doesn't fight with CI state.

## Tuning

- **Keywords / feeds** — `mediatracker/feeds.py`. Add new exec names, swap trade-press URLs
  if any 404, change Google News locales, etc.
- **Cluster threshold** — `mediatracker/cluster.py:SIMILARITY_THRESHOLD` (default 0.62).
  Lower = more aggressive grouping (fewer stories, more pickups each).
- **Analyzer prompt** — `mediatracker/analysis/prompts.py`. After tuning, run
  `python -m mediatracker.cluster --reset && python -m mediatracker.analysis.analyzer
  --limit 1000` to re-process from scratch (will incur API cost).
- **Schedule** — `.github/workflows/refresh.yml` cron line.

## Inspecting the DB

```bash
sqlite3 state/mediatracker.db
sqlite> .tables
sqlite> SELECT source_name, language, COUNT(*) FROM mentions GROUP BY 1, 2;
sqlite> SELECT sentiment, COUNT(*) FROM analyses GROUP BY 1;
sqlite> SELECT model, SUM(input_tokens), SUM(output_tokens),
                printf('%.4f', SUM(cost_usd)) AS usd
        FROM api_calls WHERE ok=1 GROUP BY model;
```

## What's next

Phase 5: scheduled email digests using Sonnet 4.6 (executive summary, top-3 stories,
sentiment trend vs prior period, recommended actions). Needs an email-sending decision
(Resend vs Gmail SMTP) before being wired up.
