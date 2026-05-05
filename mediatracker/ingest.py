"""Phase 1 ingest entrypoint.

  python -m mediatracker.ingest

For each configured feed, fetches the latest entries, applies a noise filter
(drops biomarker / bio-marine false positives, and for trade-press feeds
drops items whose title+summary contain none of the brand keywords), and
inserts new rows into ``mentions``. Dedupe is on the ``url`` UNIQUE
constraint — re-running the command is safe.
"""

from __future__ import annotations

import argparse
import logging
import re
import sqlite3
import sys
from dataclasses import dataclass

from .config import Config, load_config
from .db import connect, init_schema, transaction
from .feeds import BIOMAR_KEYWORDS, FeedSpec, all_feeds
from .sources import google_news
from .sources.base import RawMention, asdict_safe, now_utc_iso
from .sources.rss import entries_to_mentions, fetch_feed

log = logging.getLogger("mediatracker.ingest")


# ---------------------------------------------------------------------------
# Noise filter
# ---------------------------------------------------------------------------

# "biomar" inside "biomarker(s)" / "bio-marker(s)" must not count as a hit.
# We treat a mention as noise if every occurrence of "biomar" in the
# title+summary is followed by 'k' (case-insensitive) — i.e. only
# "biomarker"-like matches, no clean "BioMar" hits.
_BIOMAR_RE = re.compile(r"biomar", re.IGNORECASE)
_BIOMARKER_RE = re.compile(r"biomar(?=k)", re.IGNORECASE)
_BIOMARINE_RE = re.compile(r"bio[\s-]?marine", re.IGNORECASE)


def is_biomar_false_positive(text: str) -> bool:
    """True if 'biomar' only ever appears as part of biomarker / bio-marine."""
    if not text:
        return False
    total = len(_BIOMAR_RE.findall(text))
    if total == 0:
        return False
    bad = len(_BIOMARKER_RE.findall(text)) + len(_BIOMARINE_RE.findall(text))
    return bad >= total


def matches_any_keyword(text: str, keywords: list[str]) -> bool:
    if not keywords:
        return True
    lower = text.lower()
    return any(k.lower() in lower for k in keywords)


def passes_filter(rm: RawMention, *, trade_keyword_filter: list[str] | None) -> bool:
    haystack = f"{rm.title}\n{rm.summary or ''}"

    if trade_keyword_filter is not None:
        if not matches_any_keyword(haystack, trade_keyword_filter):
            return False

    if is_biomar_false_positive(haystack):
        return False

    return True


# ---------------------------------------------------------------------------
# DB insertion
# ---------------------------------------------------------------------------

INSERT_SQL = """
INSERT OR IGNORE INTO mentions (
    url, title, source_type, source_name, feed_query, matched_keyword,
    language, author, published_at, fetched_at, summary, raw_entry,
    processed, country
) VALUES (
    :url, :title, :source_type, :source_name, :feed_query, :matched_keyword,
    :language, :author, :published_at, :fetched_at, :summary, :raw_entry,
    :processed, :country
)
"""


def insert_mentions(conn: sqlite3.Connection, mentions: list[RawMention]) -> int:
    if not mentions:
        return 0
    fetched_at = now_utc_iso()
    rows = []
    for m in mentions:
        d = asdict_safe(m)
        d["fetched_at"] = fetched_at
        # Competitor mentions are counted but not sent to the analyzer —
        # mark them processed at ingest so they're excluded from the
        # analyzer's pending queue.
        d["processed"] = 0 if m.matched_keyword in BIOMAR_KEYWORDS else 1
        rows.append(d)

    inserted = 0
    with transaction(conn):
        for row in rows:
            cur = conn.execute(INSERT_SQL, row)
            inserted += cur.rowcount  # 0 if URL already existed
    return inserted


# ---------------------------------------------------------------------------
# Per-feed fetcher
# ---------------------------------------------------------------------------

@dataclass
class FeedResult:
    spec: FeedSpec
    fetched: int
    inserted: int
    skipped_filter: int
    error: str | None = None


def run_feed(spec: FeedSpec, cfg: Config, conn: sqlite3.Connection) -> FeedResult:
    try:
        if spec.source_type == "google_news":
            assert spec.locale is not None
            entries = list(
                google_news.fetch(
                    query=spec.feed_query,
                    locale=spec.locale,
                    matched_keyword=spec.matched_keyword,
                    user_agent=cfg.user_agent,
                    timeout=cfg.http_timeout,
                )
            )
            keyword_filter = None  # Google News query already narrows scope
        elif spec.source_type == "trade_press":
            assert spec.trade_feed is not None
            parsed = fetch_feed(
                spec.trade_feed.url,
                user_agent=cfg.user_agent,
                timeout=cfg.http_timeout,
            )
            if parsed is None:
                return FeedResult(spec, 0, 0, 0, error="fetch_failed")
            entries = list(
                entries_to_mentions(
                    parsed,
                    source_type="trade_press",
                    source_name=spec.source_name,
                    feed_query=spec.feed_query,
                    matched_keyword=spec.matched_keyword,
                    language=spec.language,
                )
            )
            keyword_filter = spec.trade_feed.keyword_filter
        else:
            return FeedResult(spec, 0, 0, 0, error=f"unknown_source_type:{spec.source_type}")
    except Exception as exc:  # noqa: BLE001
        log.exception("feed crashed source=%s", spec.source_name)
        return FeedResult(spec, 0, 0, 0, error=str(exc))

    fetched = len(entries)
    kept = [e for e in entries if passes_filter(e, trade_keyword_filter=keyword_filter)]
    skipped = fetched - len(kept)
    inserted = insert_mentions(conn, kept)
    return FeedResult(spec, fetched=fetched, inserted=inserted, skipped_filter=skipped)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mediatracker.ingest")
    parser.add_argument(
        "--only",
        choices=["google_news", "trade_press"],
        help="Limit ingest to one source type (useful for debugging).",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Debug logging."
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    cfg = load_config()
    log.info("db=%s", cfg.db_path)

    conn = connect(cfg.db_path)
    try:
        init_schema(conn)
        feeds = [f for f in all_feeds() if not args.only or f.source_type == args.only]
        log.info("running %d feed(s)", len(feeds))

        results: list[FeedResult] = []
        for spec in feeds:
            res = run_feed(spec, cfg, conn)
            results.append(res)
            tag = res.error or "ok"
            log.info(
                "feed source=%s keyword=%s lang=%s fetched=%d inserted=%d skipped=%d status=%s",
                res.spec.source_name,
                res.spec.matched_keyword,
                res.spec.language,
                res.fetched,
                res.inserted,
                res.skipped_filter,
                tag,
            )

        total_fetched = sum(r.fetched for r in results)
        total_inserted = sum(r.inserted for r in results)
        total_skipped = sum(r.skipped_filter for r in results)
        errors = [r for r in results if r.error]
        log.info(
            "done feeds=%d fetched=%d inserted=%d filtered_out=%d errors=%d",
            len(results), total_fetched, total_inserted, total_skipped, len(errors),
        )
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
