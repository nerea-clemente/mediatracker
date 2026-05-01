"""One-shot maintenance: re-detect language for every mention based on
URL + title + summary, instead of feed-locale.

  python -m mediatracker.scripts.redetect_languages
"""

from __future__ import annotations

import json
import logging
import sys

from ..config import load_config
from ..db import connect, init_schema, transaction
from ..sources.rss import _detect_language

log = logging.getLogger("redetect")


def _publisher_url_from_raw(raw_entry: str | None) -> str | None:
    if not raw_entry:
        return None
    try:
        data = json.loads(raw_entry)
    except json.JSONDecodeError:
        return None
    src = data.get("source")
    if isinstance(src, dict):
        return src.get("href") or src.get("url")
    return None


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = load_config()
    conn = connect(cfg.db_path)
    try:
        init_schema(conn)
        rows = conn.execute(
            "SELECT id, url, raw_entry, language FROM mentions"
        ).fetchall()
        log.info("scanning %d mentions", len(rows))

        changes = 0
        with transaction(conn):
            for row in rows:
                publisher_url = _publisher_url_from_raw(row["raw_entry"])
                detected = _detect_language(
                    publisher_url, row["url"], default=row["language"] or "en"
                )
                if detected != row["language"]:
                    conn.execute(
                        "UPDATE mentions SET language = ? WHERE id = ?",
                        (detected, row["id"]),
                    )
                    changes += 1

        log.info("done updated=%d", changes)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
