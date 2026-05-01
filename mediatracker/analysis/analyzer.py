"""Phase 2: per-article analyser.

  python -m mediatracker.analysis.analyzer

Selects mentions where ``processed = 0``, sends each one to
``claude-haiku-4-5`` with a structured-output schema, writes the result
into the ``analyses`` table, and flips ``processed = 1``.

Failed analyses (API error, validation error) leave ``processed = 0`` so
the next run retries them. Repeated failures appear in ``api_calls``.
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys

from ..config import load_config
from ..db import connect, init_schema, transaction
from ..sources.base import now_utc_iso
from .client import call_structured, make_client
from .prompts import SYSTEM_PROMPT, render_user_prompt
from .schema import ArticleAnalysis

log = logging.getLogger("mediatracker.analyzer")

MODEL = "claude-haiku-4-5"
PURPOSE = "analysis"
MAX_TOKENS = 1024


SELECT_UNPROCESSED = """
SELECT id, title, source_name, language, published_at, summary, matched_keyword
FROM mentions
WHERE processed = 0
ORDER BY published_at IS NULL, published_at DESC, id DESC
LIMIT ?
"""

INSERT_ANALYSIS = """
INSERT OR REPLACE INTO analyses (
    mention_id, sentiment, sentiment_confidence, prominence, angle,
    key_claims, people_quoted, risk_flags, summary,
    model, input_tokens, output_tokens, cost_usd, created_at
) VALUES (
    :mention_id, :sentiment, :sentiment_confidence, :prominence, :angle,
    :key_claims, :people_quoted, :risk_flags, :summary,
    :model, :input_tokens, :output_tokens, :cost_usd, :created_at
)
"""

MARK_PROCESSED = "UPDATE mentions SET processed = 1 WHERE id = ?"


def analyze_one(client, conn: sqlite3.Connection, row: sqlite3.Row) -> bool:
    user_prompt = render_user_prompt(
        title=row["title"],
        source_name=row["source_name"],
        language=row["language"],
        published_at=row["published_at"],
        summary=row["summary"],
        matched_keyword=row["matched_keyword"],
    )

    result = call_structured(
        client,
        model=MODEL,
        system=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        output_format=ArticleAnalysis,
        max_tokens=MAX_TOKENS,
        purpose=PURPOSE,
        conn=conn,
        mention_id=row["id"],
    )

    if not result.ok or result.parsed is None:
        log.warning("analyze fail mention_id=%s err=%s", row["id"], result.error)
        return False

    analysis: ArticleAnalysis = result.parsed  # type: ignore[assignment]

    with transaction(conn):
        conn.execute(
            INSERT_ANALYSIS,
            {
                "mention_id": row["id"],
                "sentiment": analysis.sentiment,
                "sentiment_confidence": analysis.sentiment_confidence,
                "prominence": analysis.prominence,
                "angle": analysis.angle,
                "key_claims": json.dumps(analysis.key_claims, ensure_ascii=False),
                "people_quoted": json.dumps(
                    [p.model_dump() for p in analysis.people_quoted],
                    ensure_ascii=False,
                ),
                "risk_flags": json.dumps(analysis.risk_flags),
                "summary": analysis.summary,
                "model": result.model,
                "input_tokens": result.input_tokens,
                "output_tokens": result.output_tokens,
                "cost_usd": result.cost_usd,
                "created_at": now_utc_iso(),
            },
        )
        conn.execute(MARK_PROCESSED, (row["id"],))

    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mediatracker.analysis.analyzer")
    parser.add_argument(
        "--limit", type=int, default=50,
        help="Max unprocessed mentions to handle this run (default: 50).",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    cfg = load_config()
    client = make_client(cfg.anthropic_api_key)

    conn = connect(cfg.db_path)
    try:
        init_schema(conn)
        rows = conn.execute(SELECT_UNPROCESSED, (args.limit,)).fetchall()
        log.info("analyzing %d unprocessed mention(s)", len(rows))

        success = 0
        fail = 0
        cost_total = 0.0
        for row in rows:
            ok = analyze_one(client, conn, row)
            if ok:
                success += 1
            else:
                fail += 1
            # cost is logged in api_calls; pull last row to surface a running total
            cost_row = conn.execute(
                "SELECT cost_usd FROM api_calls WHERE mention_id = ? ORDER BY id DESC LIMIT 1",
                (row["id"],),
            ).fetchone()
            if cost_row and cost_row["cost_usd"]:
                cost_total += float(cost_row["cost_usd"])

        log.info(
            "done success=%d fail=%d cost_usd≈%.4f", success, fail, cost_total
        )
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
