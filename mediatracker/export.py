"""Phase 4 bridge: SQLite → dashboard JSON.

  python -m mediatracker.export
  python -m mediatracker.export --out dashboard/lib/seed.json

Reads ``mentions`` joined to ``analyses``, groups by ``cluster_id`` into
"stories", and writes a JSON file the Next.js dashboard imports at build
time. Schema mirrors the TypeScript types in ``dashboard/lib/data.ts``.

If a mention is not yet analyzed (still ``processed = 0``) we still emit
it with placeholder analysis fields so the dashboard renders something
useful during the gap between ingest and analyzer runs.
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import REPO_ROOT, load_config
from .db import connect, init_schema

log = logging.getLogger("mediatracker.export")


SELECT_ROWS = """
SELECT
    m.id, m.url, m.title, m.source_name, m.source_type, m.matched_keyword,
    m.language, m.published_at, m.fetched_at, m.summary AS rss_summary,
    m.cluster_id,
    a.is_about_target_brand,
    a.sentiment, a.sentiment_confidence, a.prominence, a.angle,
    a.key_claims, a.people_quoted, a.risk_flags,
    a.summary AS analysis_summary
FROM mentions m
LEFT JOIN analyses a ON a.mention_id = m.id
"""


def _iso_week(iso: str) -> str:
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    year, week, _ = d.isocalendar()
    return f"{year}-W{week:02d}"


def build_share_of_voice(mentions: list[dict]) -> dict:
    """Bucket mentions by company × ISO week for the time-series chart,
    and also produce period totals for the pie chart."""
    from .feeds import KEYWORD_TO_COMPANY

    # By week, by company
    weeks: dict[str, dict[str, int]] = {}
    totals: dict[str, int] = {}
    for m in mentions:
        company = m.get("company", "Other")
        if not m["published_at"]:
            continue
        week = _iso_week(m["published_at"])
        weeks.setdefault(week, {})
        weeks[week][company] = weeks[week].get(company, 0) + 1
        totals[company] = totals.get(company, 0) + 1

    series_companies = sorted(set(KEYWORD_TO_COMPANY.values()) | set(totals.keys()))

    timeseries = []
    for week in sorted(weeks.keys()):
        row: dict[str, int | str] = {"week": week}
        for c in series_companies:
            row[c] = weeks[week].get(c, 0)
        timeseries.append(row)

    return {
        "companies": series_companies,
        "timeseries": timeseries,
        "totals": [{"company": c, "count": totals.get(c, 0)} for c in series_companies],
    }


def _parse_json_field(s: str | None, default: Any) -> Any:
    if not s:
        return default
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return default


def _row_to_mention(row: sqlite3.Row) -> dict[str, Any]:
    from .feeds import keyword_to_company

    risk_flags = _parse_json_field(row["risk_flags"], ["none"])
    if not risk_flags:
        risk_flags = ["none"]

    # NULL means unanalyzed → assume on-topic (innocent until judged otherwise)
    relevance_raw = row["is_about_target_brand"]
    is_about_target_brand = bool(relevance_raw) if relevance_raw is not None else True

    return {
        "id": row["id"],
        "story_id": row["cluster_id"] or row["id"],  # un-clustered → its own story
        "url": row["url"],
        "title": row["title"],
        "source_name": row["source_name"],
        "language": row["language"] or "en",
        "published_at": row["published_at"] or row["fetched_at"],
        "matched_keyword": row["matched_keyword"],
        "company": keyword_to_company(row["matched_keyword"]),
        "is_about_target_brand": is_about_target_brand,
        "sentiment": row["sentiment"] or "neutral",
        "sentiment_confidence": row["sentiment_confidence"] or 0.0,
        "prominence": row["prominence"] or "passing",
        "angle": row["angle"] or "",
        "key_claims": _parse_json_field(row["key_claims"], []),
        "people_quoted": _parse_json_field(row["people_quoted"], []),
        "risk_flags": risk_flags,
        "summary": row["analysis_summary"] or row["rss_summary"] or "",
    }


def _sentiment_priority(s: str) -> int:
    return {"negative": 0, "neutral": 1, "positive": 2}.get(s, 1)


def _story_company(mentions: list[dict[str, Any]]) -> str:
    """One company per story: pick the most frequent."""
    counts: dict[str, int] = {}
    for m in mentions:
        counts[m["company"]] = counts.get(m["company"], 0) + 1
    return max(counts, key=counts.get) if counts else "Other"


def _build_story(cluster_id: int, mentions: list[dict[str, Any]]) -> dict[str, Any]:
    # Pick the primary mention: prefer prominence=primary, then most recent
    def sort_key(m: dict[str, Any]) -> tuple[int, str]:
        prom_rank = {"primary": 0, "secondary": 1, "passing": 2}.get(m["prominence"], 3)
        return (prom_rank, m["published_at"] or "")

    mentions_sorted = sorted(mentions, key=sort_key)
    primary = mentions_sorted[0]

    publish_dates = [m["published_at"] for m in mentions if m["published_at"]]
    first_seen = min(publish_dates) if publish_dates else primary["published_at"]
    last_seen = max(publish_dates) if publish_dates else primary["published_at"]

    sentiments = [m["sentiment"] for m in mentions]
    primary_sentiment = min(sentiments, key=_sentiment_priority)

    risk_flags: set[str] = set()
    for m in mentions:
        for f in m["risk_flags"]:
            if f != "none":
                risk_flags.add(f)
    risk_list = sorted(risk_flags) if risk_flags else ["none"]

    summary = primary["summary"] or ""

    is_about_target_brand = any(m["is_about_target_brand"] for m in mentions)

    return {
        "id": cluster_id,
        "headline": primary["title"],
        "story_summary": summary,
        "first_seen": first_seen,
        "last_seen": last_seen,
        "primary_sentiment": primary_sentiment,
        "risk_flags": risk_list,
        "pickup_count": len(mentions),
        "is_about_target_brand": is_about_target_brand,
        "company": _story_company(mentions),
    }


def build_payload(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = conn.execute(SELECT_ROWS).fetchall()
    mentions = [_row_to_mention(r) for r in rows]

    by_cluster: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for m in mentions:
        by_cluster[m["story_id"]].append(m)

    stories = [_build_story(cid, ms) for cid, ms in by_cluster.items()]
    stories.sort(key=lambda s: s["last_seen"] or "", reverse=True)

    outlets = sorted({m["source_name"] for m in mentions})

    off_topic_stories = sum(1 for s in stories if not s["is_about_target_brand"])
    off_topic_mentions = sum(1 for m in mentions if not m["is_about_target_brand"])

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stats": {
            "mention_count": len(mentions),
            "story_count": len(stories),
            "analyzed_count": sum(1 for m in mentions if m["sentiment_confidence"] > 0),
            "off_topic_mentions": off_topic_mentions,
            "off_topic_stories": off_topic_stories,
        },
        "outlets": outlets,
        "stories": stories,
        "mentions": mentions,
        "share_of_voice": build_share_of_voice(mentions),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mediatracker.export")
    parser.add_argument(
        "--out",
        default="dashboard/lib/seed.json",
        help="Path to write the JSON snapshot (default: dashboard/lib/seed.json).",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    cfg = load_config()
    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = REPO_ROOT / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)

    conn = connect(cfg.db_path)
    try:
        init_schema(conn)
        payload = build_payload(conn)
    finally:
        conn.close()

    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(
        "wrote %s mentions=%d stories=%d analyzed=%d → %s",
        out_path.name,
        payload["stats"]["mention_count"],
        payload["stats"]["story_count"],
        payload["stats"]["analyzed_count"],
        out_path,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
