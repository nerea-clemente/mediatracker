"""Phase 3: cluster mentions into stories.

  python -m mediatracker.cluster

A "story" is a group of mentions covering the same underlying news event
(e.g. the same syndicated press release picked up by several outlets).
We use a simple offline algorithm:

    For each unclustered mention M (oldest first):
        Look at mentions in the prior 5 days that share M's matched_keyword
        and already have a cluster_id.
        Compute title similarity (difflib.SequenceMatcher.ratio()) against
        each candidate's title.
        If max similarity > THRESHOLD: assign M to that cluster.
        Else: start a new cluster with M as the seed.

This is good enough to deduplicate wire-service pickups, and it ships with
the stdlib (no embedding API calls). When volume justifies it we can swap
in a Voyage embedding job that updates this same column.
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

from .config import load_config
from .db import connect, init_schema, transaction

log = logging.getLogger("mediatracker.cluster")

WINDOW_DAYS = 5
SIMILARITY_THRESHOLD = 0.62


def _normalize(title: str) -> str:
    return " ".join(title.lower().split())


def title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize(a), _normalize(b)).ratio()


def _parse_dt(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None


def _candidates(
    conn: sqlite3.Connection,
    *,
    matched_keyword: str,
    published_at: str | None,
    self_id: int,
) -> list[sqlite3.Row]:
    """Mentions in the prior WINDOW_DAYS days, same keyword, already clustered."""
    pub = _parse_dt(published_at) or datetime.now(timezone.utc)
    lower = (pub - timedelta(days=WINDOW_DAYS)).isoformat()
    upper = (pub + timedelta(days=WINDOW_DAYS)).isoformat()
    return conn.execute(
        """
        SELECT id, title, cluster_id
        FROM mentions
        WHERE cluster_id IS NOT NULL
          AND matched_keyword = ?
          AND id != ?
          AND (published_at IS NULL OR (published_at >= ? AND published_at <= ?))
        """,
        (matched_keyword, self_id, lower, upper),
    ).fetchall()


def _next_cluster_id(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COALESCE(MAX(cluster_id), 0) + 1 AS next FROM mentions").fetchone()
    return int(row["next"])


def cluster_unclustered(conn: sqlite3.Connection, *, threshold: float = SIMILARITY_THRESHOLD) -> dict[str, int]:
    rows = conn.execute(
        """
        SELECT id, title, matched_keyword, published_at
        FROM mentions
        WHERE cluster_id IS NULL
        ORDER BY published_at IS NULL, published_at ASC, id ASC
        """
    ).fetchall()

    assigned_existing = 0
    new_clusters = 0

    with transaction(conn):
        for row in rows:
            cands = _candidates(
                conn,
                matched_keyword=row["matched_keyword"],
                published_at=row["published_at"],
                self_id=row["id"],
            )

            best_score = 0.0
            best_cluster: int | None = None
            for c in cands:
                score = title_similarity(row["title"], c["title"])
                if score > best_score:
                    best_score = score
                    best_cluster = int(c["cluster_id"])

            if best_cluster is not None and best_score >= threshold:
                cluster_id = best_cluster
                assigned_existing += 1
            else:
                cluster_id = _next_cluster_id(conn)
                new_clusters += 1

            conn.execute(
                "UPDATE mentions SET cluster_id = ? WHERE id = ?",
                (cluster_id, row["id"]),
            )

    return {
        "considered": len(rows),
        "assigned_existing": assigned_existing,
        "new_clusters": new_clusters,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mediatracker.cluster")
    parser.add_argument(
        "--threshold", type=float, default=SIMILARITY_THRESHOLD,
        help=f"Title-similarity threshold (default: {SIMILARITY_THRESHOLD}).",
    )
    parser.add_argument(
        "--reset", action="store_true",
        help="Wipe all cluster_id values first and recluster from scratch.",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    cfg = load_config()
    conn = connect(cfg.db_path)
    try:
        init_schema(conn)
        if args.reset:
            conn.execute("UPDATE mentions SET cluster_id = NULL")
            log.info("reset all cluster_ids")

        stats = cluster_unclustered(conn, threshold=args.threshold)
        log.info(
            "cluster done considered=%d assigned_existing=%d new_clusters=%d",
            stats["considered"],
            stats["assigned_existing"],
            stats["new_clusters"],
        )
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
