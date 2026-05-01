"""One-shot maintenance: re-derive source_name from raw_entry for existing rows.

Used when ``rss.py``'s publisher-extraction logic changes, so historical
``Google News (en)`` rows pick up their real publisher names without
having to refetch.

  python -m mediatracker.scripts.rederive_source_names
"""

from __future__ import annotations

import json
import logging
import sys
from urllib.parse import urlparse

from ..config import load_config
from ..db import connect, init_schema, transaction

log = logging.getLogger("rederive")


def derive(raw_entry_json: str | None, url: str) -> str | None:
    if raw_entry_json:
        try:
            raw = json.loads(raw_entry_json)
        except json.JSONDecodeError:
            raw = None
        if raw and isinstance(raw, dict):
            src = raw.get("source")
            if isinstance(src, dict):
                title = src.get("title")
                if title:
                    return str(title).strip()
    if url:
        host = urlparse(url).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        return host or None
    return None


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = load_config()
    conn = connect(cfg.db_path)
    try:
        init_schema(conn)
        rows = conn.execute(
            "SELECT id, url, source_name, raw_entry FROM mentions WHERE source_type = 'google_news'"
        ).fetchall()
        log.info("scanning %d google_news mentions", len(rows))

        updated = 0
        unchanged = 0
        no_publisher = 0
        with transaction(conn):
            for row in rows:
                publisher = derive(row["raw_entry"], row["url"])
                if not publisher:
                    no_publisher += 1
                    continue
                if publisher == row["source_name"]:
                    unchanged += 1
                    continue
                conn.execute(
                    "UPDATE mentions SET source_name = ? WHERE id = ?",
                    (publisher, row["id"]),
                )
                updated += 1

        log.info(
            "done updated=%d unchanged=%d no_publisher=%d",
            updated, unchanged, no_publisher,
        )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
