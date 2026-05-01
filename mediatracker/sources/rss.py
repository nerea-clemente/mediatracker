"""Generic RSS / Atom adapter.

Used directly for trade-press feeds, and as the underlying fetcher for the
Google News adapter (which only differs in URL construction).
"""

from __future__ import annotations

import logging
from typing import Iterable

import feedparser
import httpx

from .base import RawMention, parse_struct_time_to_iso

log = logging.getLogger(__name__)


def fetch_feed(
    url: str,
    *,
    user_agent: str,
    timeout: float,
) -> feedparser.FeedParserDict | None:
    """Fetch an RSS/Atom feed via httpx and parse with feedparser.

    Returns None on network error or non-2xx response.
    feedparser is tolerant of malformed feeds; it sets ``bozo`` but still
    returns entries — we log and continue.
    """
    try:
        resp = httpx.get(
            url,
            headers={"User-Agent": user_agent, "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8"},
            timeout=timeout,
            follow_redirects=True,
        )
    except httpx.HTTPError as exc:
        log.warning("fetch failed url=%s err=%s", url, exc)
        return None

    if resp.status_code >= 400:
        log.warning("fetch non-2xx url=%s status=%s", url, resp.status_code)
        return None

    parsed = feedparser.parse(resp.content)
    if parsed.bozo and not parsed.entries:
        log.warning("feed unparseable url=%s err=%s", url, parsed.bozo_exception)
        return None
    return parsed


def entries_to_mentions(
    parsed: feedparser.FeedParserDict,
    *,
    source_type: str,
    source_name: str,
    feed_query: str,
    matched_keyword: str,
    language: str | None,
) -> Iterable[RawMention]:
    for entry in parsed.entries:
        url = (entry.get("link") or "").strip()
        title = (entry.get("title") or "").strip()
        if not url or not title:
            continue

        published_iso = parse_struct_time_to_iso(
            entry.get("published_parsed") or entry.get("updated_parsed")
        )

        author = entry.get("author") or None
        summary = entry.get("summary") or None

        # feedparser's FeedParserDict isn't a plain dict; coerce just enough
        # to JSON-encode without losing the typical RSS fields.
        raw = {
            "id": entry.get("id"),
            "link": url,
            "title": title,
            "summary": summary,
            "author": author,
            "published": entry.get("published"),
            "updated": entry.get("updated"),
            "tags": [t.get("term") for t in entry.get("tags", []) if t.get("term")],
            "source": dict(entry.get("source", {})) if entry.get("source") else None,
        }

        yield RawMention(
            url=url,
            title=title,
            source_type=source_type,
            source_name=source_name,
            feed_query=feed_query,
            matched_keyword=matched_keyword,
            language=language,
            author=author,
            published_at=published_iso,
            summary=summary,
            raw_entry=raw,
        )
