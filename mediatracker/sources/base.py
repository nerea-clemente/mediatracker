from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass
class RawMention:
    """One RSS entry, normalized just enough to land in the DB."""

    url: str
    title: str
    source_type: str
    source_name: str
    feed_query: str
    matched_keyword: str
    language: str | None
    author: str | None
    published_at: str | None  # ISO 8601 UTC
    summary: str | None
    raw_entry: dict[str, Any]

    def raw_entry_json(self) -> str:
        return json.dumps(self.raw_entry, default=str, ensure_ascii=False)


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_struct_time_to_iso(struct_time) -> str | None:
    """feedparser returns time.struct_time in UTC for *_parsed fields."""
    if struct_time is None:
        return None
    try:
        dt = datetime(*struct_time[:6], tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None
    return dt.isoformat(timespec="seconds")


def asdict_safe(rm: RawMention) -> dict[str, Any]:
    d = asdict(rm)
    d["raw_entry"] = rm.raw_entry_json()
    return d
