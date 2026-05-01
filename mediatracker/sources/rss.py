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


# Outlet name normalization. Same publisher sometimes shows up as bare
# domain (when <source> is missing) and as a clean brand name; merge them.
PUBLISHER_ALIASES: dict[str, str] = {
    "intrafish.com":           "IntraFish",
    "Intrafish":               "IntraFish",
    "undercurrentnews.com":    "Undercurrent News",
    "salmonbusiness.com":      "SalmonBusiness",
    "fishfarmingexpert.com":   "Fish Farming Expert",
    "Fishfarming expert":      "Fish Farming Expert",
    "hatcheryinternational.com": "Hatchery International",
    "thefishsite.com":         "The Fish Site",
    "seafoodsource.com":       "SeafoodSource",
    "ilaks.no":                "iLaks",
    "kyst.no":                 "Kyst.no",
    "salmonexpert.no":         "Salmonexpert",
    "salmonexpert.cl":         "Salmonexpert",
    "aquafeed.com":            "Aquafeed.com",
}


def _publisher_from_entry(entry, fallback_url: str) -> str | None:
    """Best-effort extraction of the actual publisher from an RSS entry.

    Google News RSS wraps each item with a ``<source>`` element naming the
    real publisher (Reuters, IntraFish, Bloomberg, …). feedparser exposes
    that as ``entry.source.title`` or sometimes ``entry.source['title']``.
    Falls back to the link domain if the source field is missing. The
    result is normalized through ``PUBLISHER_ALIASES`` so domain and
    brand-name forms collapse into one bucket.
    """
    name: str | None = None
    src = entry.get("source")
    if src:
        title = src.get("title") if isinstance(src, dict) else getattr(src, "title", None)
        if title:
            name = str(title).strip()
    if not name and fallback_url:
        from urllib.parse import urlparse

        host = urlparse(fallback_url).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        name = host or None
    if not name:
        return None
    return PUBLISHER_ALIASES.get(name, name)


def entries_to_mentions(
    parsed: feedparser.FeedParserDict,
    *,
    source_type: str,
    source_name: str,
    feed_query: str,
    matched_keyword: str,
    language: str | None,
    use_per_entry_publisher: bool = False,
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

        entry_source_name = source_name
        if use_per_entry_publisher:
            publisher = _publisher_from_entry(entry, url)
            if publisher:
                entry_source_name = publisher

        yield RawMention(
            url=url,
            title=title,
            source_type=source_type,
            source_name=entry_source_name,
            feed_query=feed_query,
            matched_keyword=matched_keyword,
            language=language,
            author=author,
            published_at=published_iso,
            summary=summary,
            raw_entry=raw,
        )
